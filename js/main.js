/**
 * main.js
 * Web Synth - エントリポイント
 * 行単位ラック（音源 | エフェクト | モジュレータ）、接続・モジュレーション
 */

import {
  registerModule,
  getRegisteredModules,
  getModuleFactory,
  replaceSlidersWithBars,
  addSourceRow,
  addEffectToRow,
  addModulatorToRow,
  setRackContainer,
  setOnChainChange,
  setOnPanChange,
  setOnMuteSoloChange,
  setRowName,
  setRowPan,
  setRowMute,
  setRowSolo,
  getSlotIndex,
  getSlotInstanceId,
  clearRack,
  getRows,
} from './rack.js';
import { resumeContext, getMasterInput, getMasterAnalyser, getMasterAnalyserL, getMasterAnalyserR, ensureAudioContext } from './audio-core.js';
import { sampleModule } from './modules/source/sample-module.js';
import { waveformGeneratorModule } from './modules/source/waveform-generator.js';
import { fmSynthModule } from './modules/source/fm-synth.js';
import { wavetableModule } from './modules/source/wavetable.js';
import { noiseModule } from './modules/source/noise.js';
import { pwmModule } from './modules/source/pwm.js';
import { reverbModule } from './modules/effect/reverb.js';
import { eq8Module } from './modules/effect/eq8.js';
import { lpfModule } from './modules/effect/lpf.js';
import { hpfModule } from './modules/effect/hpf.js';
import { lpfResModule } from './modules/effect/lpf-res.js';
import { hpfResModule } from './modules/effect/hpf-res.js';
import { lfoModule } from './modules/modulator/lfo.js';
import { envelopeModule } from './modules/modulator/envelope.js';
import { sequencer8Module, sequencer16Module, sequencer64Module } from './modules/modulator/sequencer.js';
import { initCables, redrawCables, getConnections, addConnectionFromLoad, clearAllConnections, createOutputJack, setCableDroop, getCableDroop } from './cables.js';

// ---------- モジュール登録 ----------
registerModule(sampleModule);
registerModule(waveformGeneratorModule);
registerModule(fmSynthModule);
registerModule(wavetableModule);
registerModule(noiseModule);
registerModule(pwmModule);
registerModule(reverbModule);
registerModule(eq8Module);
registerModule(lpfModule);
registerModule(hpfModule);
registerModule(lpfResModule);
registerModule(hpfResModule);
registerModule(lfoModule);
registerModule(envelopeModule);
registerModule(sequencer8Module);
registerModule(sequencer16Module);
registerModule(sequencer64Module);

// ---------- DOM ----------
const rackContainer = document.getElementById('rackContainer');
const themeToggle = document.getElementById('themeToggle');
const themeIcon = themeToggle?.querySelector('.theme-icon');
const themeText = themeToggle?.querySelector('.theme-toggle-text');
const pickerSources = document.getElementById('pickerSources');
const pickerEffects = document.getElementById('pickerEffects');
const pickerModulators = document.getElementById('pickerModulators');
const rowSelectForEffect = document.getElementById('rowSelectForEffect');
const rowSelectForModulator = document.getElementById('rowSelectForModulator');
const saveProjectBtn = document.getElementById('saveProjectBtn');
const loadProjectInput = document.getElementById('loadProjectInput');
const modulePreviewInner = document.getElementById('modulePreviewInner');
const modulePreview = document.getElementById('modulePreview');

setRackContainer(rackContainer);

// ---------- モジュールプレビュー（ピッカー項目ホバーで右側に拡大縮小表示） ----------
function showModulePreview(typeId) {
  if (!modulePreviewInner || !modulePreview) return;
  const factory = getModuleFactory(typeId);
  if (!factory) return;
  try {
    const instance = factory.create(`preview-${typeId}-${Date.now()}`);
    if (!instance?.element) return;
    const clone = instance.element.cloneNode(true);
    clone.classList.add('synth-module--preview');
    replaceSlidersWithBars(clone);
    modulePreviewInner.innerHTML = '';
    modulePreviewInner.appendChild(clone);
    modulePreview.classList.add('module-preview--active');
    modulePreviewInner.style.width = '';
    modulePreviewInner.style.height = '';
    modulePreviewInner.style.transform = '';
    requestAnimationFrame(() => {
      const boxW = Math.max(0, modulePreview.clientWidth - 16);
      const boxH = Math.max(0, modulePreview.clientHeight - 16);
      const w = clone.offsetWidth || 1;
      const h = clone.offsetHeight || 1;
      const scale = (boxW > 0 && boxH > 0)
        ? Math.min(boxW / w, boxH / h, 2)
        : 1;
      modulePreviewInner.style.width = `${w}px`;
      modulePreviewInner.style.height = `${h}px`;
      modulePreviewInner.style.transform = `scale(${scale})`;
    });
  } catch (_) {
    modulePreviewInner.innerHTML = '';
    modulePreview.classList.remove('module-preview--active');
  }
}

function clearModulePreview() {
  if (modulePreview) modulePreview.classList.remove('module-preview--active');
  if (modulePreviewInner) {
    modulePreviewInner.innerHTML = '';
    modulePreviewInner.style.width = '';
    modulePreviewInner.style.height = '';
    modulePreviewInner.style.transform = '';
  }
}

function bindModulePreviewToPicker(container) {
  if (!container) return;
  container.querySelectorAll('.synth-picker__item').forEach((btn) => {
    const typeId = btn.dataset.typeId;
    if (!typeId) return;
    btn.addEventListener('mouseenter', () => showModulePreview(typeId));
    btn.addEventListener('mouseleave', () => clearModulePreview());
  });
}

// ---------- 数値表示ホバー＋スクロールで無段階変更 ----------
// ラック内の .synth-module__value にホバーしながらホイールで対応スライダーを無段階変更
const SCROLL_SENSITIVITY = 0.004; // レンジ幅に対する割合（1スクロールあたり・ゆっくり）
rackContainer.addEventListener('wheel', (e) => {
  const valueEl = e.target.closest('.synth-module__value');
  if (!valueEl) return;
  if (valueEl.classList.contains('synth-module__step-pitch-value')) return;
  const row = valueEl.closest('.synth-module__row');
  if (!row) return;
  const input = row.querySelector('input[type="range"]');
  if (!input) return;
  e.preventDefault();
  const min = parseFloat(input.min) || 0;
  const max = parseFloat(input.max) || 100;
  const range = max - min;
  if (range <= 0) return;
  let current = parseFloat(input.value) || min;
  const delta = -e.deltaY * range * SCROLL_SENSITIVITY;
  const next = Math.max(min, Math.min(max, current + delta));
  if (next === current) return;
  input.setAttribute('step', 'any');
  input.value = String(next);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}, { passive: false });

setOnChainChange(async (rowIndex) => {
  await connectRowToMaster(rowIndex);
});
setOnPanChange((rowIndex, panValue) => {
  const ctx = ensureAudioContext();
  const panner = rowTailToMaster.get(rowIndex);
  if (panner && typeof panner.pan !== 'undefined') {
    panner.pan.setTargetAtTime(panValue, ctx.currentTime, 0.01);
  }
});

/** 行ごとのミュート/ソロ用 GainNode（tail → gain → panner → master） */
const rowGainNodes = new Map();

function computeRowGain(rowIndex) {
  const rows = getRows();
  const row = rows[rowIndex];
  if (!row) return 1;
  const anySolo = rows.some((r) => r.solo);
  if (anySolo) return row.solo ? 1 : 0;
  return row.mute ? 0 : 1;
}

function applyAllRowGains() {
  const ctx = ensureAudioContext();
  for (const [rowIndex, gainNode] of rowGainNodes) {
    gainNode.gain.setTargetAtTime(computeRowGain(rowIndex), ctx.currentTime, 0.01);
  }
}

setOnMuteSoloChange(applyAllRowGains);
getMasterInput();

/** 行・スロットから slot オブジェクトを取得 */
function getSlotAt(rowIndex, instanceId) {
  const rows = getRows();
  const row = rows[rowIndex];
  if (!row) return null;
  if (row.source?.instanceId === instanceId) return row.source;
  return row.chain.find((s) => s.instanceId === instanceId) ?? null;
}

/** 接続ごとのスケール用 GainNode（周波数など大きな値のパラメータ用） */
const modulationScaleNodes = new Map();

/** Gate → Trigger 接続時のコールバック管理（切断時に removeGateListener する用） */
const triggerConnections = new Map();

/** マスター Sync の購読者（advanceStep を tick で呼ぶ）。key: `${toRow}-${toSlotId}` */
const masterSyncReceivers = new Set();
const masterSyncConnectionKeys = new Map();

function connectionKey(fromRow, fromSlotId, toRow, toSlotId, toParamId) {
  return `${fromRow}:${fromSlotId}:${toRow}:${toSlotId}:${toParamId}`;
}

function triggerConnectionKey(fromRow, fromSlotId, fromOutputId, toRow, toSlotId, toParamId) {
  return `${fromRow}:${fromSlotId}:${fromOutputId}:${toRow}:${toSlotId}:${toParamId}`;
}

/** ケーブル接続時: モジュレータ出力 → ターゲットの AudioParam、または Gate → Trigger、または Pan、または Master Sync → Sequencer Sync In */
async function handleCableConnect(fromRow, fromSlotId, toRow, toSlotId, toParamId, fromOutputId) {
  // Master Sync Out → Sequencer Sync In: マスター BPM の tick でシーケンサを進行
  if (fromRow === -1 && fromSlotId === 'master' && fromOutputId === 'sync' && toParamId === 'syncIn') {
    const toSlot = getSlotAt(toRow, toSlotId);
    if (toSlot?.instance?.advanceStep && typeof toSlot.instance.setSyncConnected === 'function') {
      toSlot.instance.setSyncConnected(true, masterTick);
      masterSyncReceivers.add(toSlot.instance.advanceStep);
      masterSyncConnectionKeys.set(`${toRow}-${toSlotId}`, toSlot.instance.advanceStep);
    }
    return;
  }

  const fromSlot = getSlotAt(fromRow, fromSlotId);
  if (!fromSlot?.instance) return;

  // Pan: モジュレータ出力をその行のパンナーに接続（-1〜1 で L〜R）
  if (toParamId === 'pan' && toSlotId === 'pan') {
    if (!fromSlot.instance.getModulationOutput) return;
    const out = fromSlot.instance.getModulationOutput(fromOutputId);
    if (!out) return;
    try {
      await resumeContext();
      const panner = rowTailToMaster.get(toRow);
      if (panner && typeof panner.pan !== 'undefined') {
        out.connect(panner.pan);
      }
    } catch (_) {}
    return;
  }

  const toSlot = getSlotAt(toRow, toSlotId);

  // Gate → Trigger: シーケンサの Gate 出力をエンベロープの Trigger に接続
  if (toParamId === 'trigger' && fromOutputId === 'gate') {
    if (fromSlot.instance.addGateListener && toSlot?.instance?.trigger) {
      const cb = () => toSlot.instance.trigger();
      fromSlot.instance.addGateListener(cb);
      triggerConnections.set(triggerConnectionKey(fromRow, fromSlotId, fromOutputId, toRow, toSlotId, toParamId), cb);
    }
    return;
  }

  if (!fromSlot.instance.getModulationOutput) return;
  const out = fromSlot.instance.getModulationOutput(fromOutputId);
  if (!out) return;
  const params = toSlot?.instance.getModulatableParams?.();
  if (!params?.length) return;
  const entry = params.find((p) => p.id === toParamId);
  if (!entry) return;
  try {
    await resumeContext();
    const scale = entry.modulationScale ?? 1;
    if (scale !== 1) {
      const ctx = ensureAudioContext();
      const gainNode = ctx.createGain();
      gainNode.gain.value = scale;
      out.connect(gainNode);
      gainNode.connect(entry.param);
      modulationScaleNodes.set(connectionKey(fromRow, fromSlotId, toRow, toSlotId, toParamId), gainNode);
    } else {
      out.connect(entry.param);
    }
  } catch (_) {}
}

/** ケーブル切断時: 接続を解除 */
function handleCableDisconnect(fromRow, fromSlotId, toRow, toSlotId, toParamId, fromOutputId) {
  if (fromRow === -1 && fromSlotId === 'master' && fromOutputId === 'sync' && toParamId === 'syncIn') {
    const key = `${toRow}-${toSlotId}`;
    const advanceStepFn = masterSyncConnectionKeys.get(key);
    if (advanceStepFn) {
      masterSyncReceivers.delete(advanceStepFn);
      masterSyncConnectionKeys.delete(key);
    }
    const toSlot = getSlotAt(toRow, toSlotId);
    if (toSlot?.instance?.setSyncConnected) toSlot.instance.setSyncConnected(false);
    return;
  }

  const fromSlot = getSlotAt(fromRow, fromSlotId);

  if (toParamId === 'pan' && toSlotId === 'pan') {
    if (!fromSlot?.instance.getModulationOutput) return;
    const out = fromSlot.instance.getModulationOutput(fromOutputId);
    if (!out) return;
    const panner = rowTailToMaster.get(toRow);
    if (panner && typeof panner.pan !== 'undefined') {
      try {
        out.disconnect(panner.pan);
      } catch (_) {}
    }
    return;
  }

  const toSlot = getSlotAt(toRow, toSlotId);

  if (toParamId === 'trigger' && fromOutputId === 'gate') {
    const key = triggerConnectionKey(fromRow, fromSlotId, fromOutputId, toRow, toSlotId, toParamId);
    const cb = triggerConnections.get(key);
    if (cb && fromSlot?.instance?.removeGateListener) {
      fromSlot.instance.removeGateListener(cb);
      triggerConnections.delete(key);
    }
    return;
  }

  if (!fromSlot?.instance.getModulationOutput) return;
  const out = fromSlot.instance.getModulationOutput(fromOutputId);
  if (!out) return;
  const params = toSlot?.instance.getModulatableParams?.();
  if (!params?.length) return;
  const entry = params.find((p) => p.id === toParamId);
  if (!entry) return;
  try {
    const key = connectionKey(fromRow, fromSlotId, toRow, toSlotId, toParamId);
    const scaleNode = modulationScaleNodes.get(key);
    if (scaleNode) {
      out.disconnect(scaleNode);
      scaleNode.disconnect(entry.param);
      modulationScaleNodes.delete(key);
    } else {
      out.disconnect(entry.param);
    }
  } catch (_) {}
}

const synthRackArea = rackContainer?.parentElement;
if (synthRackArea) {
  initCables(synthRackArea, getRows, handleCableConnect, handleCableDisconnect);
  rackContainer.addEventListener('scroll', redrawCables);
}

const cableDroopInput = document.getElementById('cableDroopInput');
const cableDroopValue = document.getElementById('cableDroopValue');
if (cableDroopInput && cableDroopValue) {
  cableDroopInput.value = String(getCableDroop());
  cableDroopValue.textContent = String(getCableDroop());
  cableDroopInput.addEventListener('input', () => {
    setCableDroop(cableDroopInput.value);
    cableDroopValue.textContent = String(getCableDroop());
    redrawCables();
  });
}

// ---------- マスター BPM / Sync ----------
let masterBPM = 120;
let masterSyncIntervalId = null;

const masterSyncLamp = document.getElementById('masterSyncLamp');
const LAMP_FLASH_MS = 80;
/** マスターが管理するグローバル tick（16分音符ごとに 1 増加、0,1,2,...）。各 Seq は tick % stepCount でステップに変換 */
let masterTick = 0;

function startMasterSyncInterval() {
  if (masterSyncIntervalId) clearInterval(masterSyncIntervalId);
  masterTick = 0;
  const stepMs = (60 * 1000) / masterBPM / 4;
  masterSyncIntervalId = setInterval(() => {
    masterTick += 1;
    if (masterSyncLamp && masterTick % 4 === 0) {
      masterSyncLamp.classList.add('synth-master-sync__lamp--on');
      setTimeout(() => masterSyncLamp.classList.remove('synth-master-sync__lamp--on'), LAMP_FLASH_MS);
    }
    for (const advanceStep of masterSyncReceivers) {
      try {
        advanceStep(masterTick);
      } catch (_) {}
    }
  }, stepMs);
}

const masterBpmSlider = document.getElementById('masterBpm');
const masterBpmValue = document.getElementById('masterBpmValue');
const masterBpmBarFill = document.getElementById('masterBpmBarFill');
const MASTER_BPM_MIN = 40;
const MASTER_BPM_MAX = 240;

function updateMasterBpmBar() {
  if (!masterBpmSlider || !masterBpmBarFill) return;
  const v = Number(masterBpmSlider.value);
  const pct = ((v - MASTER_BPM_MIN) / (MASTER_BPM_MAX - MASTER_BPM_MIN)) * 100;
  masterBpmBarFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

if (masterBpmSlider && masterBpmValue) {
  masterBpmSlider.addEventListener('input', () => {
    masterBPM = Math.max(MASTER_BPM_MIN, Math.min(MASTER_BPM_MAX, Number(masterBpmSlider.value)));
    masterBpmValue.textContent = String(Math.floor(masterBPM));
    updateMasterBpmBar();
    startMasterSyncInterval();
  });
  masterBpmValue.textContent = String(masterBPM);
  updateMasterBpmBar();
}
startMasterSyncInterval();

const masterSyncOutContainer = document.getElementById('masterSyncOutContainer');
if (masterSyncOutContainer) {
  createOutputJack(masterSyncOutContainer, 'sync');
}

const masterVolumeSlider = document.getElementById('masterVolume');
const masterVolumeValue = document.getElementById('masterVolumeValue');
const masterMeterSegmentsL = document.getElementById('masterMeterSegmentsL');
const masterMeterSegmentsR = document.getElementById('masterMeterSegmentsR');
const masterWaveformCanvas = document.getElementById('masterWaveformCanvas');
const masterSpectrumCanvas = document.getElementById('masterSpectrumCanvas');
const masterSpectrogramCanvas = document.getElementById('masterSpectrogramCanvas');
const masterGoniometerCanvas = document.getElementById('masterGoniometerCanvas');
const WAVEFORM_COLOR = '#628878';

/** スペクトログラム用オフスクリーンバッファ（スクロール用） */
let spectrogramBuffer = null;
let spectrogramBufferW = 0;
let spectrogramBufferH = 0;

/** 0–255 をスペクトログラム用の色に（暗→アクセント→明） */
function spectrogramColor(value) {
  const t = value / 255;
  if (t <= 0) return 'rgb(10, 10, 18)';
  if (t <= 0.4) {
    const s = t / 0.4;
    return `rgb(${Math.round(10 + s * 50)}, ${Math.round(30 + s * 70)}, ${Math.round(40 + s * 60)})`;
  }
  if (t <= 0.8) {
    const s = (t - 0.4) / 0.4;
    return `rgb(${Math.round(60 + s * 40)}, ${Math.round(100 + s * 36)}, ${Math.round(100 + s * 20)})`;
  }
  const s = (t - 0.8) / 0.2;
  return `rgb(${Math.round(100 + s * 155)}, ${Math.round(136 + s * 119)}, ${Math.round(120 + s * 135)})`;
}

const masterVolumeBarFill = document.getElementById('masterVolumeBarFill');

function updateMasterVolumeBar() {
  if (!masterVolumeSlider || !masterVolumeBarFill) return;
  const pct = Number(masterVolumeSlider.value);
  masterVolumeBarFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

if (masterVolumeSlider && masterVolumeValue) {
  masterVolumeSlider.addEventListener('input', () => {
    const v = Number(masterVolumeSlider.value) / 100;
    getMasterInput().gain.setTargetAtTime(v, getMasterInput().context.currentTime, 0.01);
    masterVolumeValue.textContent = v.toFixed(2);
    updateMasterVolumeBar();
  });
  masterVolumeValue.textContent = (Number(masterVolumeSlider?.value ?? 25) / 100).toFixed(2);
  updateMasterVolumeBar();
}

const masterPanel = document.querySelector('.synth-master-panel');
const SCROLL_SENSITIVITY_MASTER = 0.004;
if (masterPanel) {
  masterPanel.addEventListener('wheel', (e) => {
    const valueEl = e.target.closest('.synth-master-sync__value--editable, .synth-master-volume__value--editable');
    if (!valueEl) return;
    e.preventDefault();
    if (valueEl.id === 'masterBpmValue' && masterBpmSlider) {
      const min = MASTER_BPM_MIN;
      const max = MASTER_BPM_MAX;
      const range = max - min;
      let current = parseFloat(masterBpmSlider.value) || min;
      const delta = -e.deltaY * range * SCROLL_SENSITIVITY_MASTER;
      const next = Math.max(min, Math.min(max, current + delta));
      if (next === current) return;
      masterBpmSlider.value = String(next);
      masterBpmSlider.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (valueEl.id === 'masterVolumeValue' && masterVolumeSlider) {
      const min = 0;
      const max = 100;
      const range = max - min;
      let current = parseFloat(masterVolumeSlider.value) || min;
      const delta = -e.deltaY * range * SCROLL_SENSITIVITY_MASTER;
      const next = Math.max(min, Math.min(max, current + delta));
      if (next === current) return;
      masterVolumeSlider.value = String(next);
      masterVolumeSlider.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, { passive: false });
}

let analyserDataArray = null;
let analyserFrequencyData = null;
let analyserLDataArray = null;
let analyserRDataArray = null;
function updateMeterAndWaveform() {
  const analyser = getMasterAnalyser();
  if (!analyser) {
    requestAnimationFrame(updateMeterAndWaveform);
    return;
  }
  if (!analyserDataArray || analyserDataArray.length !== analyser.fftSize) {
    analyserDataArray = new Uint8Array(analyser.fftSize);
  }
  if (!analyserFrequencyData || analyserFrequencyData.length !== analyser.frequencyBinCount) {
    analyserFrequencyData = new Uint8Array(analyser.frequencyBinCount);
  }
  analyser.getByteTimeDomainData(analyserDataArray);
  analyser.getByteFrequencyData(analyserFrequencyData);
  const analyserL = getMasterAnalyserL();
  const analyserR = getMasterAnalyserR();
  if (analyserL && analyserR) {
    if (!analyserLDataArray || analyserLDataArray.length !== analyserL.fftSize) {
      analyserLDataArray = new Uint8Array(analyserL.fftSize);
    }
    if (!analyserRDataArray || analyserRDataArray.length !== analyserR.fftSize) {
      analyserRDataArray = new Uint8Array(analyserR.fftSize);
    }
    analyserL.getByteTimeDomainData(analyserLDataArray);
    analyserR.getByteTimeDomainData(analyserRDataArray);
  }
  const segmentCount = 24;
  const dbMin = -42;
  const dbMax = 0;
  function rmsToDbAndActive(rms) {
    const db = rms <= 0 ? -Infinity : 20 * Math.log10(Math.min(1, rms));
    const dbText = db === -Infinity || db < -60 ? '-∞' : Math.round(db);
    const normalized = db === -Infinity || db < dbMin ? 0 : Math.min(1, (db - dbMin) / (dbMax - dbMin));
    const activeCount = Math.min(segmentCount, Math.round(normalized * segmentCount));
    return { dbText, activeCount };
  }
  if (analyserLDataArray && analyserRDataArray && (masterMeterSegmentsL || masterMeterSegmentsR)) {
    let sumL = 0;
    let sumR = 0;
    for (let i = 0; i < analyserLDataArray.length; i++) {
      const nL = (analyserLDataArray[i] - 128) / 128;
      sumL += nL * nL;
    }
    for (let i = 0; i < analyserRDataArray.length; i++) {
      const nR = (analyserRDataArray[i] - 128) / 128;
      sumR += nR * nR;
    }
    const rmsL = Math.sqrt(sumL / analyserLDataArray.length);
    const rmsR = Math.sqrt(sumR / analyserRDataArray.length);
    const { activeCount: activeCountL } = rmsToDbAndActive(rmsL);
    const { activeCount: activeCountR } = rmsToDbAndActive(rmsR);
    if (masterMeterSegmentsL) {
      const segments = masterMeterSegmentsL.querySelectorAll('.synth-master-meter__segment');
      segments.forEach((seg, i) => seg.classList.toggle('synth-master-meter__segment--on', i < activeCountL));
    }
    if (masterMeterSegmentsR) {
      const segments = masterMeterSegmentsR.querySelectorAll('.synth-master-meter__segment');
      segments.forEach((seg, i) => seg.classList.toggle('synth-master-meter__segment--on', i < activeCountR));
    }
  }
  if (masterWaveformCanvas && analyserDataArray) {
    const wrap = masterWaveformCanvas.parentElement;
    const w = wrap ? wrap.clientWidth : 0;
    const h = wrap ? wrap.clientHeight : 0;
    if (w > 0 && h > 0) {
      const dpr = window.devicePixelRatio || 1;
      if (masterWaveformCanvas.width !== w * dpr || masterWaveformCanvas.height !== h * dpr) {
        masterWaveformCanvas.width = w * dpr;
        masterWaveformCanvas.height = h * dpr;
      }
      const ctx = masterWaveformCanvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const centerY = h / 2;
        ctx.strokeStyle = WAVEFORM_COLOR;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < analyserDataArray.length; i++) {
          const x = (i / analyserDataArray.length) * w;
          const y = centerY + ((analyserDataArray[i] - 128) / 128) * (centerY - 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  }
  if (masterSpectrumCanvas && analyserFrequencyData) {
    const wrap = masterSpectrumCanvas.parentElement;
    const w = wrap ? wrap.clientWidth : 0;
    const h = wrap ? wrap.clientHeight : 0;
    if (w > 0 && h > 0) {
      const dpr = window.devicePixelRatio || 1;
      if (masterSpectrumCanvas.width !== w * dpr || masterSpectrumCanvas.height !== h * dpr) {
        masterSpectrumCanvas.width = w * dpr;
        masterSpectrumCanvas.height = h * dpr;
      }
      const ctx = masterSpectrumCanvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const binCount = analyserFrequencyData.length;
        const barW = Math.max(1, (w / binCount) - 0.5);
        for (let i = 0; i < binCount; i++) {
          const v = analyserFrequencyData[i] / 255;
          const barH = Math.max(0, v * h * 0.95);
          const x = (i / binCount) * w;
          const y = h - barH;
          ctx.fillStyle = WAVEFORM_COLOR;
          ctx.fillRect(x, y, barW, barH);
        }
      }
    }
  }
  if (masterSpectrogramCanvas && analyserFrequencyData) {
    const wrap = masterSpectrogramCanvas.parentElement;
    const w = wrap ? wrap.clientWidth : 0;
    const h = wrap ? wrap.clientHeight : 0;
    if (w > 0 && h > 0) {
      const dpr = window.devicePixelRatio || 1;
      if (masterSpectrogramCanvas.width !== w * dpr || masterSpectrogramCanvas.height !== h * dpr) {
        masterSpectrogramCanvas.width = w * dpr;
        masterSpectrogramCanvas.height = h * dpr;
      }
      if (!spectrogramBuffer || spectrogramBufferW !== w || spectrogramBufferH !== h) {
        spectrogramBuffer = document.createElement('canvas');
        spectrogramBuffer.width = w;
        spectrogramBuffer.height = h;
        spectrogramBufferW = w;
        spectrogramBufferH = h;
      }
      const bufCtx = spectrogramBuffer.getContext('2d');
      const binCount = analyserFrequencyData.length;
      if (bufCtx && w >= 2) {
        bufCtx.drawImage(spectrogramBuffer, 1, 0, w - 1, h, 0, 0, w - 1, h);
        const colX = w - 1;
        for (let py = 0; py < h; py++) {
          const bin = Math.min(binCount - 1, Math.floor((1 - py / h) * binCount));
          const value = analyserFrequencyData[bin];
          bufCtx.fillStyle = spectrogramColor(value);
          bufCtx.fillRect(colX, py, 1, 1);
        }
      }
      const dispCtx = masterSpectrogramCanvas.getContext('2d');
      if (dispCtx && spectrogramBuffer) {
        dispCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        dispCtx.drawImage(spectrogramBuffer, 0, 0, w, h, 0, 0, w, h);
      }
    }
  }
  if (masterGoniometerCanvas && analyserLDataArray && analyserRDataArray) {
    const wrap = masterGoniometerCanvas.parentElement;
    const w = wrap ? wrap.clientWidth : 0;
    const h = wrap ? wrap.clientHeight : 0;
    if (w > 0 && h > 0) {
      const dpr = window.devicePixelRatio || 1;
      if (masterGoniometerCanvas.width !== w * dpr || masterGoniometerCanvas.height !== h * dpr) {
        masterGoniometerCanvas.width = w * dpr;
        masterGoniometerCanvas.height = h * dpr;
      }
      const ctx = masterGoniometerCanvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        const cx = w / 2;
        const cy = h / 2;
        const scale = Math.min(w, h) * 0.85;
        const len = Math.min(analyserLDataArray.length, analyserRDataArray.length);
        ctx.strokeStyle = WAVEFORM_COLOR;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
          const l = (analyserLDataArray[i] - 128) / 128;
          const r = (analyserRDataArray[i] - 128) / 128;
          const x = cx + l * scale;
          const y = cy - r * scale;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  }
  requestAnimationFrame(updateMeterAndWaveform);
}
requestAnimationFrame(updateMeterAndWaveform);

/** 行ごとに master に接続しているノード（パンナー。再接続時に disconnect する用） */
const rowTailToMaster = new Map();
/** 行ごとにパンナーへ入力しているノード（再接続時に disconnect する用） */
const rowTailInput = new Map();

/** 行のオーディオチェーンを source → effects → gain(ミュート/ソロ) → panner → master に接続（既存接続は解除） */
async function connectRowToMaster(rowIndex) {
  const rows = getRows();
  const row = rows[rowIndex];
  if (!row?.source?.instance?.getAudioOutput) return;
  await resumeContext();
  const ctx = ensureAudioContext();
  const master = getMasterInput();
  const oldPanner = rowTailToMaster.get(rowIndex);
  const oldTailInput = rowTailInput.get(rowIndex);
  const oldGain = rowGainNodes.get(rowIndex);
  if (oldPanner) {
    try {
      if (oldTailInput) oldTailInput.disconnect(oldGain || oldPanner);
      if (oldGain) oldGain.disconnect(oldPanner);
      oldPanner.disconnect(master);
    } catch (_) {}
    rowTailToMaster.delete(rowIndex);
    rowTailInput.delete(rowIndex);
    rowGainNodes.delete(rowIndex);
  }
  try {
    // 既存チェーンがあるときだけ、source と各 effect の「出力」を切断してから繋ぎ直す。
    // ※ effect の getAudioInput().disconnect() は呼ばない。input は内部で filter 等に繋がっており、
    //    ここで disconnect するとエフェクト内部のルーティングが壊れて音が出なくなる。
    if (oldPanner) {
      try {
        row.source.instance.getAudioOutput().disconnect();
      } catch (_) {}
      for (const slot of row.chain) {
        if (slot.kind === 'effect' && slot.instance.getAudioOutput) {
          try {
            slot.instance.getAudioOutput().disconnect();
          } catch (_) {}
        }
      }
    }
    let tail = row.source.instance.getAudioOutput();
    for (const slot of row.chain) {
      if (slot.kind === 'effect' && slot.instance.getAudioInput && slot.instance.getAudioOutput) {
        tail.connect(slot.instance.getAudioInput());
        tail = slot.instance.getAudioOutput();
      }
    }
    const gainNode = ctx.createGain();
    gainNode.gain.value = computeRowGain(rowIndex);
    tail.connect(gainNode);
    rowGainNodes.set(rowIndex, gainNode);

    const panner = ctx.createStereoPanner();
    panner.pan.value = row.pan ?? 0;
    gainNode.connect(panner);
    panner.connect(master);
    rowTailToMaster.set(rowIndex, panner);
    rowTailInput.set(rowIndex, tail);
    applyPanConnectionsForRow(rowIndex);
    // oldPanner があったときは source.disconnect() で波形用 Analyser も外れているので再接続する
    if (oldPanner && row.source?.instance?.reconnectWaveformViz) row.source.instance.reconnectWaveformViz();
  } catch (_) {
    if (oldPanner && oldTailInput && oldGain) {
      try {
        oldTailInput.connect(oldGain);
        oldGain.connect(oldPanner);
        oldPanner.connect(master);
        rowTailToMaster.set(rowIndex, oldPanner);
        rowTailInput.set(rowIndex, oldTailInput);
        rowGainNodes.set(rowIndex, oldGain);
      } catch (_) {}
    }
  }
}

/** その行の Pan へのケーブル接続をパンナーに適用（接続後に呼ぶ） */
function applyPanConnectionsForRow(rowIndex) {
  const panner = rowTailToMaster.get(rowIndex);
  if (!panner || typeof panner.pan === 'undefined') return;
  const conns = getConnections();
  for (const c of conns) {
    if (c.toRow !== rowIndex || c.toSlotId !== 'pan' || c.toParamId !== 'pan') continue;
    const fromSlot = getSlotAt(c.fromRow, c.fromSlotId);
    if (!fromSlot?.instance.getModulationOutput) continue;
    const out = fromSlot.instance.getModulationOutput(c.fromOutputId);
    if (!out) continue;
    try {
      out.connect(panner.pan);
    } catch (_) {}
  }
}

/** 行選択の option を更新（選択した行は維持） */
function updateRowSelects() {
  const rows = getRows();
  const prevEffectRow = rowSelectForEffect?.value ?? '0';
  const prevModulatorRow = rowSelectForModulator?.value ?? '0';
  const options = rows.map((row, i) => `<option value="${i}">${i + 1}. ${escapeHtml(row.name || `Row ${i + 1}`)}</option>`).join('');
  const fallback = '<option value="0">(Add a row)</option>';
  if (rowSelectForEffect) {
    rowSelectForEffect.innerHTML = options || fallback;
    const effectIndex = parseInt(prevEffectRow, 10);
    if (effectIndex >= 0 && effectIndex < rows.length) {
      rowSelectForEffect.value = String(effectIndex);
    }
  }
  if (rowSelectForModulator) {
    rowSelectForModulator.innerHTML = options || fallback;
    const modulatorIndex = parseInt(prevModulatorRow, 10);
    if (modulatorIndex >= 0 && modulatorIndex < rows.length) {
      rowSelectForModulator.value = String(modulatorIndex);
    }
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ---------- 保存・読み込み ----------
function saveProject() {
  const rows = getRows();
  const conns = getConnections();
  const data = {
    version: 1,
    rows: rows.map((row) => {
      const r = {
        name: row.name,
        pan: row.pan ?? 0,
        mute: !!row.mute,
        solo: !!row.solo,
        source: row.source ? { typeId: row.source.typeId } : null,
        chain: row.chain.map((s) => ({ typeId: s.typeId })),
      };
      return r;
    }),
    connections: conns.map((c) => ({
      fromRow: c.fromRow,
      fromSlotIndex: getSlotIndex(c.fromRow, c.fromSlotId),
      fromOutputId: c.fromOutputId,
      toRow: c.toRow,
      toSlotIndex: getSlotIndex(c.toRow, c.toSlotId),
      toParamId: c.toParamId,
    })).filter((c) => c.fromSlotIndex >= 0 && c.toSlotIndex >= -1),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'web-synth-project.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function loadProject(file) {
  const text = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    alert('Failed to parse JSON');
    return;
  }
  if (!data.rows || !Array.isArray(data.rows)) {
    alert('Invalid project format');
    return;
  }
  clearAllConnections();
  modulationScaleNodes.clear();
  triggerConnections.clear();
  masterSyncReceivers.clear();
  masterSyncConnectionKeys.clear();
  clearRack();

  await resumeContext();
  for (let ri = 0; ri < data.rows.length; ri++) {
    const r = data.rows[ri];
    if (!r.source?.typeId) continue;
    const result = await addSourceRow(r.source.typeId);
    if (!result) continue;
    setRowName(result.rowIndex, r.name || `Row ${ri + 1}`);
    setRowPan(result.rowIndex, r.pan ?? 0);
    setRowMute(result.rowIndex, !!r.mute);
    setRowSolo(result.rowIndex, !!r.solo);
    if (result.slot.instance.getAudioOutput) {
      await connectRowToMaster(result.rowIndex);
    }
    const chain = r.chain || [];
    for (const slot of chain) {
      if (!slot.typeId) continue;
      const typeId = slot.typeId;
      const factory = getRegisteredModules().find((m) => m.id === typeId);
      if (!factory) continue;
      if (factory.kind === 'effect') {
        const s = await addEffectToRow(result.rowIndex, typeId);
        if (s) await connectRowToMaster(result.rowIndex);
      } else if (factory.kind === 'modulator') {
        addModulatorToRow(result.rowIndex, typeId);
      }
    }
  }
  const conns = data.connections || [];
  for (const c of conns) {
    const fromId = getSlotInstanceId(c.fromRow, c.fromSlotIndex);
    const toId = getSlotInstanceId(c.toRow, c.toSlotIndex);
    if (fromId && toId && c.toParamId) {
      addConnectionFromLoad(c.fromRow, fromId, c.toRow, toId, c.toParamId, c.fromOutputId);
    }
  }
  const rows = getRows();
  for (let ri = 0; ri < rows.length; ri++) {
    applyPanConnectionsForRow(ri);
  }
  applyAllRowGains();
  updateRowSelects();
  redrawCables();
}

if (saveProjectBtn) {
  saveProjectBtn.addEventListener('click', () => saveProject());
}
if (loadProjectInput) {
  loadProjectInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) loadProject(file);
    e.target.value = '';
  });
}

// ---------- ピッカー：音源（新規行追加） ----------
function renderSourcePicker() {
  if (!pickerSources) return;
  pickerSources.innerHTML = '';
  const list = getRegisteredModules('source');
  for (const m of list) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'synth-picker__item synth-picker__item--source';
    btn.textContent = m.name;
    btn.dataset.typeId = m.id;
    btn.addEventListener('click', async () => {
      const result = await addSourceRow(m.id);
      if (!result) return;
      const { rowIndex, slot } = result;
      if (slot.instance.getAudioOutput) {
        await resumeContext();
        connectRowToMaster(rowIndex);
      }
      updateRowSelects();
    });
    pickerSources.appendChild(btn);
  }
}

// ---------- ピッカー：エフェクト（行を選んで追加） ----------
function renderEffectPicker() {
  if (!pickerEffects) return;
  pickerEffects.innerHTML = '';
  const list = getRegisteredModules('effect');
  for (const m of list) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'synth-picker__item synth-picker__item--effect';
    btn.textContent = m.name;
    btn.dataset.typeId = m.id;
    btn.addEventListener('click', async () => {
      const rowIndex = parseInt(rowSelectForEffect?.value ?? '0', 10);
      const rows = getRows();
      if (rowIndex < 0 || rowIndex >= rows.length) return;
      const slot = await addEffectToRow(rowIndex, m.id);
      if (!slot) return;
      await connectRowToMaster(rowIndex);
      updateRowSelects();
    });
    pickerEffects.appendChild(btn);
  }
}

// ---------- ピッカー：エンベロープ/LFO（行を選んで追加） ----------
function renderModulatorPicker() {
  if (!pickerModulators) return;
  pickerModulators.innerHTML = '';
  const list = getRegisteredModules('modulator');
  for (const m of list) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'synth-picker__item synth-picker__item--modulator';
    btn.textContent = m.name;
    btn.dataset.typeId = m.id;
    btn.addEventListener('click', async () => {
      const rowIndex = parseInt(rowSelectForModulator?.value ?? '0', 10);
      const rows = getRows();
      if (rowIndex < 0 || rowIndex >= rows.length) return;
      const slot = addModulatorToRow(rowIndex, m.id);
      if (!slot) return;
      redrawCables();
      updateRowSelects();
    });
    pickerModulators.appendChild(btn);
  }
}

function renderModulePickers() {
  renderSourcePicker();
  renderEffectPicker();
  renderModulatorPicker();
  updateRowSelects();
  bindModulePreviewToPicker(document.getElementById('modulePicker'));
}
renderModulePickers();

// ---------- ダークモード ----------
function setTheme(isDark) {
  if (isDark) {
    document.documentElement.classList.add('dark-mode');
    if (themeIcon) themeIcon.textContent = '☀️';
    if (themeText) themeText.textContent = 'Light';
  } else {
    document.documentElement.classList.remove('dark-mode');
    if (themeIcon) themeIcon.textContent = '🌙';
    if (themeText) themeText.textContent = 'Dark';
  }
}
const savedTheme = localStorage.getItem('theme');
const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
if (savedTheme) setTheme(savedTheme === 'dark');
else setTheme(prefersDark);
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.classList.contains('dark-mode');
    setTheme(!isDark);
    localStorage.setItem('theme', !isDark ? 'dark' : 'light');
  });
}
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) setTheme(e.matches);
  });
}
