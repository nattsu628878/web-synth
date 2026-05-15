/**
 * audio-core.js
 * Web Synth - 音声入出力の基本機能を提供するモジュール
 * AudioContext、マスター出力、Gain などの共通 API をまとめる
 */

let audioContext = null;
/** @type {GainNode|null} */
let masterGain = null;
/** @type {AnalyserNode|null} */
let masterAnalyser = null;
/** @type {ChannelSplitterNode|null} */
let masterChannelSplitter = null;
/** @type {AnalyserNode|null} */
let masterAnalyserL = null;
/** @type {AnalyserNode|null} */
let masterAnalyserR = null;
/** @type {BiquadFilterNode|null} */
let masterDcFilter = null;
/** @type {DynamicsCompressorNode|null} */
let masterCompressor = null;
/** @type {DynamicsCompressorNode|null} */
let masterLimiter = null;
/** @type {GainNode|null} */
let masterMonoGain = null;

/**
 * AudioContext を取得する。未初期化の場合は null。
 * @returns {AudioContext|null}
 */
export function getAudioContext() {
  return audioContext;
}

/**
 * AudioContext を取得し、未作成なら作成する。
 * ユーザージェスチャー後に呼ぶこと（resume は内部で行う）。
 * @returns {AudioContext}
 */
export function ensureAudioContext() {
  if (audioContext) return audioContext;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('Web Audio API がサポートされていません');
  audioContext = new Ctx();
  return audioContext;
}

/**
 * コンテキストを再開（ブラウザの自動再生ポリシー対応）
 * @returns {Promise<void>}
 */
export async function resumeContext() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') await ctx.resume();
}

/**
 * マスター入力（音源モジュールをここに接続する GainNode）
 * @returns {GainNode}
 */
export function getMasterInput() {
  if (masterGain) return masterGain;
  const ctx = ensureAudioContext();
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.25;

  masterDcFilter = ctx.createBiquadFilter();
  masterDcFilter.type = 'highpass';
  masterDcFilter.frequency.value = 20;
  masterDcFilter.Q.value = 0.7;

  masterCompressor = ctx.createDynamicsCompressor();
  masterCompressor.threshold.value = 0;
  masterCompressor.ratio.value = 1;
  masterCompressor.knee.value = 40;
  masterCompressor.attack.value = 0.25;
  masterCompressor.release.value = 1;

  masterLimiter = ctx.createDynamicsCompressor();
  masterLimiter.threshold.value = 0;
  masterLimiter.ratio.value = 1;
  masterLimiter.knee.value = 0;
  masterLimiter.attack.value = 0.001;
  masterLimiter.release.value = 0.1;

  masterMonoGain = ctx.createGain();
  masterMonoGain.channelCount = 1;
  masterMonoGain.channelCountMode = 'explicit';
  masterMonoGain.channelInterpretation = 'speakers';

  masterGain.connect(masterDcFilter);
  masterDcFilter.connect(masterCompressor);
  masterCompressor.connect(masterLimiter);
  masterLimiter.connect(ctx.destination);

  masterAnalyser = ctx.createAnalyser();
  masterAnalyser.fftSize = 1024;
  masterAnalyser.smoothingTimeConstant = 0.6;
  masterGain.connect(masterAnalyser);
  masterChannelSplitter = ctx.createChannelSplitter(2);
  masterGain.connect(masterChannelSplitter);
  masterAnalyserL = ctx.createAnalyser();
  masterAnalyserL.fftSize = 1024;
  masterChannelSplitter.connect(masterAnalyserL, 0, 0);
  masterAnalyserR = ctx.createAnalyser();
  masterAnalyserR.fftSize = 1024;
  masterChannelSplitter.connect(masterAnalyserR, 1, 0);
  return masterGain;
}

/**
 * マスター出力のレベル計測用 AnalyserNode（音量メーター用）
 * getMasterInput() 呼び出し後に有効
 * @returns {AnalyserNode|null}
 */
export function getMasterAnalyser() {
  return masterAnalyser;
}

/**
 * ゴニオメーター用 L チャンネル AnalyserNode
 * @returns {AnalyserNode|null}
 */
export function getMasterAnalyserL() {
  return masterAnalyserL;
}

/**
 * ゴニオメーター用 R チャンネル AnalyserNode
 * @returns {AnalyserNode|null}
 */
export function getMasterAnalyserR() {
  return masterAnalyserR;
}

/** @returns {BiquadFilterNode|null} */
export function getMasterDcFilter() { return masterDcFilter; }

/** @returns {DynamicsCompressorNode|null} */
export function getMasterCompressor() { return masterCompressor; }

/** @returns {DynamicsCompressorNode|null} */
export function getMasterLimiter() { return masterLimiter; }

/**
 * モノラルチェックモードの切り替え。masterLimiter の出力を 1ch GainNode 経由にすることで L+R をモノに変換する。
 * @param {boolean} enabled
 */
export function setMonoCheck(enabled) {
  if (!masterLimiter || !masterMonoGain) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (enabled) {
    try { masterLimiter.disconnect(ctx.destination); } catch (_) {}
    masterLimiter.connect(masterMonoGain);
    masterMonoGain.connect(ctx.destination);
  } else {
    try {
      masterLimiter.disconnect(masterMonoGain);
      masterMonoGain.disconnect(ctx.destination);
    } catch (_) {}
    masterLimiter.connect(ctx.destination);
  }
}

/** @type {Promise<void>|null} */
let lpfWorkletPromise = null;
/** @type {Promise<void>|null} */
let hpfWorkletPromise = null;
/** @type {Promise<void>|null} */
let pwmWorkletPromise = null;
/** @type {Promise<void>|null} */
let pluckWorkletPromise = null;

/** 環境に依存しない Worklet スクリプトの絶対 URL を返す */
function getWorkletUrl(relativePath) {
  if (typeof document !== 'undefined' && document.baseURI) {
    return new URL(relativePath, document.baseURI).href;
  }
  if (typeof window !== 'undefined' && window.location?.href) {
    return new URL(relativePath, window.location.href).href;
  }
  return relativePath;
}

/**
 * 1次CR LPF 用 AudioWorklet を読み込む（LPF モジュール追加前に呼ぶ）
 * @returns {Promise<void>}
 */
export function ensureLpfWorklet() {
  const ctx = getAudioContext();
  if (!ctx) return Promise.reject(new Error('AudioContext がありません'));
  if (lpfWorkletPromise) return lpfWorkletPromise;
  lpfWorkletPromise = Promise.all([
    ctx.audioWorklet.addModule(getWorkletUrl('js/processors/one-pole-lpf-processor.js')),
    ctx.audioWorklet.addModule(getWorkletUrl('js/processors/two-pole-lpf-processor.js')),
    ctx.audioWorklet.addModule(getWorkletUrl('js/processors/four-pole-lpf-processor.js')),
  ]).then(() => {});
  return lpfWorkletPromise;
}

/**
 * 1次CR / 2次CR / 4次CR HPF 用 AudioWorklet を読み込む（HPF モジュール追加前に呼ぶ）
 * @returns {Promise<void>}
 */
export function ensureHpfWorklet() {
  const ctx = getAudioContext();
  if (!ctx) return Promise.reject(new Error('AudioContext がありません'));
  if (hpfWorkletPromise) return hpfWorkletPromise;
  hpfWorkletPromise = Promise.all([
    ctx.audioWorklet.addModule(getWorkletUrl('js/processors/one-pole-hpf-processor.js')),
    ctx.audioWorklet.addModule(getWorkletUrl('js/processors/two-pole-hpf-processor.js')),
    ctx.audioWorklet.addModule(getWorkletUrl('js/processors/four-pole-hpf-processor.js')),
  ]).then(() => {});
  return hpfWorkletPromise;
}

/**
 * PWM オシレーター用 AudioWorklet を読み込む（PWM モジュール追加前に呼ぶ）
 * @returns {Promise<void>}
 */
export function ensurePwmWorklet() {
  const ctx = getAudioContext();
  if (!ctx) return Promise.reject(new Error('AudioContext がありません'));
  if (pwmWorkletPromise) return pwmWorkletPromise;
  pwmWorkletPromise = ctx.audioWorklet
    .addModule(getWorkletUrl('js/processors/pwm-oscillator-processor.js'))
    .then(() => {});
  return pwmWorkletPromise;
}

/**
 * Pluck (Karplus–Strong) 用 AudioWorklet を読み込む（Pluck モジュール追加前に呼ぶ）
 * @returns {Promise<void>}
 */
export function ensurePluckWorklet() {
  const ctx = getAudioContext();
  if (!ctx) return Promise.reject(new Error('AudioContext がありません'));
  if (pluckWorkletPromise) return pluckWorkletPromise;
  pluckWorkletPromise = ctx.audioWorklet
    .addModule(getWorkletUrl('js/processors/pluck-processor.js'))
    .then(() => {});
  return pluckWorkletPromise;
}
