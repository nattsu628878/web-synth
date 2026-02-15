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
 * マスター出力（Destination）を取得
 * @returns {AudioDestinationNode}
 */
export function getDestination() {
  const ctx = ensureAudioContext();
  return ctx.destination;
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
  masterGain.connect(ctx.destination);
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

/**
 * GainNode を新規作成
 * @param {number} [gain=1]
 * @returns {GainNode}
 */
export function createGain(gain = 1) {
  const ctx = ensureAudioContext();
  const node = ctx.createGain();
  node.gain.value = gain;
  return node;
}

/**
 * サンプルレートを取得
 * @returns {number}
 */
export function getSampleRate() {
  const ctx = getAudioContext();
  return ctx ? ctx.sampleRate : 44100;
}

/**
 * 現在時刻（再生時間）を取得
 * @returns {number}
 */
export function getCurrentTime() {
  const ctx = getAudioContext();
  return ctx ? ctx.currentTime : 0;
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
