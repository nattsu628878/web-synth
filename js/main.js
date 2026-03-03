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
  updateParamDisplayFromValue,
  addSourceRow,
  addEffectToRow,
  addModulator,
  getModulatorSlots,
  getSlotIndex,
  getSlotInstanceId,
  MODULATOR_ROW,
  setRackContainer,
  setOnChainChange,
  setOnPanChange,
  setOnMuteSoloChange,
  setRowName,
  setRowPan,
  setRowMute,
  setRowSolo,
  clearRack,
  getRows,
} from './rack.js';
import { bindModulePreviewToPicker } from './module-preview.js';
import { resumeContext, getMasterInput, getMasterAnalyser, getMasterAnalyserL, getMasterAnalyserR, ensureAudioContext } from './audio-core.js';
import { sampleModule } from './modules/source/sample-module.js';
import { waveformGeneratorModule } from './modules/source/waveform-generator.js';
import { fmSynthModule } from './modules/source/fm-synth.js';
import { wavetableModule } from './modules/source/wavetable.js';
import { noiseModule } from './modules/source/noise.js';
import { pwmModule } from './modules/source/pwm.js';
import { pluckModule } from './modules/source/pluck.js';
import { ffOscModule } from './modules/source/ff-osc.js';
import { ffWavetableModule } from './modules/source/ff-wavetable.js';
import { reverbModule } from './modules/effect/reverb.js';
import { delayModule } from './modules/effect/delay.js';
import { eq8Module } from './modules/effect/eq8.js';
import { lpfModule } from './modules/effect/lpf.js';
import { hpfModule } from './modules/effect/hpf.js';
import { lpfResModule } from './modules/effect/lpf-res.js';
import { hpfResModule } from './modules/effect/hpf-res.js';
import { lfoModule } from './modules/modulator/lfo.js';
import { randomLfoModule } from './modules/modulator/random-lfo.js';
import { envelopeModule } from './modules/modulator/envelope.js';
import { adEnvelopeModule } from './modules/modulator/ad-envelope.js';
import { sequencer8Module, sequencer16Module, sequencer32Module } from './modules/modulator/sequencer.js';
import { initCables, redrawCables, scheduleRedrawCables, getConnections, addConnectionFromLoad, clearAllConnections, createOutputJack, setCableDroop, getCableDroop } from './cables.js';
import { normToParam, paramToNorm, clampNorm } from './param-utils.js';

// ---------- モジュール登録 ----------
registerModule(sampleModule);
registerModule(waveformGeneratorModule);
registerModule(fmSynthModule);
registerModule(wavetableModule);
registerModule(noiseModule);
registerModule(pwmModule);
registerModule(pluckModule);
registerModule(ffOscModule);
registerModule(ffWavetableModule);
registerModule(reverbModule);
registerModule(delayModule);
registerModule(eq8Module);
registerModule(lpfModule);
registerModule(hpfModule);
registerModule(lpfResModule);
registerModule(hpfResModule);
registerModule(lfoModule);
registerModule(randomLfoModule);
registerModule(envelopeModule);
registerModule(adEnvelopeModule);
registerModule(sequencer8Module);
registerModule(sequencer16Module);
registerModule(sequencer32Module);

// ---------- DOM ----------
const rackContainer = document.getElementById('rackContainer');
const themeToggle = document.getElementById('themeToggle');
const themeIcon = themeToggle?.querySelector('.theme-icon');
const themeText = themeToggle?.querySelector('.theme-toggle-text');
const pickerSources = document.getElementById('pickerSources');
const pickerEffects = document.getElementById('pickerEffects');
const pickerModulators = document.getElementById('pickerModulators');
const rowSelectForEffect = document.getElementById('rowSelectForEffect');
const saveProjectBtn = document.getElementById('saveProjectBtn');
const loadProjectInput = document.getElementById('loadProjectInput');

setRackContainer(rackContainer);

// ---------- 数値表示ホバー＋スクロールで無段階変更 ----------
// ラックおよび Modulators パネル内の .synth-module__value にホバーしながらホイールで対応スライダーを無段階変更。パンは .synth-rack__slot--pan 上でスクロール対応。
const SCROLL_SENSITIVITY = 0.004; // レンジ幅に対する割合（1スクロールあたり・ゆっくり）
function handleParamValueWheel(e) {
  // パン: 行のパン列（ノブやジャック付近）にホバー中にスクロールで 0–100 変更
  const panSlot = e.target.closest('.synth-rack__slot--pan');
  if (panSlot) {
    const input = panSlot.querySelector('input[type="range"]');
    if (!input || input.disabled) return;
    e.preventDefault();
    const min = 0;
    const max = 100;
    const range = max - min;
    let current = parseFloat(input.value);
    if (Number.isNaN(current)) current = 50;
    const delta = -e.deltaY * range * SCROLL_SENSITIVITY;
    const next = Math.max(min, Math.min(max, current + delta));
    if (next === current) return;
    input.setAttribute('step', 'any');
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  const valueEl = e.target.closest('.synth-module__value');
  if (!valueEl) return;
  if (valueEl.classList.contains('synth-module__step-pitch-value')) return;
  const row = valueEl.closest('.synth-module__row');
  if (!row) return;
  const input = row.querySelector('input[type="range"]');
  if (!input) return;
  if (input.disabled) return; /* SYNC 接続時など変更不可の場合は無視 */
  e.preventDefault();
  const min = parseFloat(input.min) || 0;
  const max = parseFloat(input.max) || 100;
  const range = max - min;
  if (range <= 0) return;
  const parsed = parseFloat(input.value);
  const current = Number.isNaN(parsed) ? min : parsed;
  const delta = -e.deltaY * range * SCROLL_SENSITIVITY;
  const next = Math.max(min, Math.min(max, current + delta));
  if (next === current) return;
  input.setAttribute('step', 'any');
  input.value = String(next);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

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

/** 変調駆動用: 接続先パラメータごとに1つの ConstantSource。紫のバー通りに実際の値を駆動。key: `${toRow}:${toSlotId}:${toParamId}` */
const modulationDriveNodes = new Map();

/** 変調の逆探知用: 接続先パラメータごとのモジュレータ一覧。key: `${toRow}:${toSlotId}:${toParamId}` */
const modulationConnections = new Map();

/** Gate → Trigger 接続時のコールバック管理（切断時に removeGateListener する用） */
const triggerConnections = new Map();

/** マスター Sync の購読者（advanceStep を tick で呼ぶ）。key: `${toRow}-${toSlotId}` */
const masterSyncReceivers = new Set();
const masterSyncConnectionKeys = new Map();
const masterSyncSequencerInstances = new Set();

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
      toSlot.instance.setSyncConnected(true, masterTick, masterBPM);
      masterSyncReceivers.add(toSlot.instance.advanceStep);
      masterSyncConnectionKeys.set(`${toRow}-${toSlotId}`, toSlot.instance.advanceStep);
      if (masterSyncSequencerInstances) masterSyncSequencerInstances.add(toSlot.instance);
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
    const connKey = `${toRow}:${toSlot.instanceId}:${toParamId}`;
    let list = modulationConnections.get(connKey);
    if (!list) {
      list = [];
      modulationConnections.set(connKey, list);
    }
    list.push({ fromRow, fromSlotId: fromSlot.instanceId, fromOutputId });
    if (list.length === 1) {
      const ctx = ensureAudioContext();
      const constantSource = ctx.createConstantSource();
      constantSource.offset.value = 0;
      constantSource.connect(entry.param);
      constantSource.start(ctx.currentTime);
      modulationDriveNodes.set(connKey, constantSource);
    }
    startModulationFeedbackLoop();
  } catch (_) {}
}

/** getModulatableParams の id を HTML の data-param に変換 */
function getInputParamId(paramId) {
  const m = String(paramId).match(/^(freq|gain|q)(\d+)$/);
  if (m) return m[1];
  const map = {
    frequency: 'freq',
    damping: 'decay',
    wet: 'mix',
    carrierFreq: 'carrier',
    modFreq: 'modFreq',
    q: 'res',
  };
  return map[paramId] ?? paramId;
}

/** パラメータ ID に応じたデフォルトの表示フォーマット */
function defaultModulationFormatDisplay(paramId) {
  const id = (paramId || '').toLowerCase();
  if (id.includes('freq') || id === 'carrier' || id === 'modfreq') return (v) => `${Math.round(v)} Hz`;
  if (id.includes('gain') && !id.includes('gain1')) return (v) => `${(Math.round(v * 10) / 10).toFixed(1)} dB`;
  if (id.includes('q') || id.includes('res')) return (v) => String(Math.round(v * 100) / 100);
  if (id.includes('mix') || id.includes('pulse') || id.includes('morph')) return (v) => `${Math.round(v)} %`;
  if (id.includes('time')) return (v) => `${Math.round(v * 1000)} ms`;
  if (id.includes('index')) return (v) => `${Math.round(v)} —`;
  return (v) => String(Math.round(v * 10) / 10);
}

/** 変調の逆探知＋実際の値の駆動: 紫のバー通りに AudioParam を駆動し、表示も更新 */
function tickModulationFeedback() {
  for (const [key, list] of modulationConnections.entries()) {
    if (!list.length) continue;
    const parts = key.split(':');
    if (parts.length < 3) continue;
    const toRow = parseInt(parts[0], 10);
    const toSlotId = parts[1];
    const toParamId = parts.slice(2).join(':');
    const slot = getSlotAt(toRow, toSlotId);
    if (!slot?.instance?.element) continue;
    const params = slot.instance.getModulatableParams?.();
    if (!params?.length) continue;
    const entry = params.find((p) => p.id === toParamId);
    if (!entry) continue;
    const inputParamId = getInputParamId(toParamId);
    const input = slot.instance.element.querySelector(`input[data-param="${inputParamId}"]`);
    const inputMin = input ? parseFloat(input.min) : 0;
    const inputMax = input ? parseFloat(input.max) : 100;
    const sliderValue = input
      ? (Number.isNaN(parseFloat(input.value)) ? inputMin : parseFloat(input.value))
      : inputMin;

    const useParamMeta = Array.isArray(entry.range) && entry.range.length >= 2;
    const displayRange = useParamMeta ? (entry.displayRange ?? entry.range) : [inputMin, inputMax];
    const paramRange = useParamMeta ? entry.range : [inputMin, inputMax];

    const baseNormFromModule = slot.instance.getParamBaseNorm?.(toParamId);
    const baseNorm =
      typeof baseNormFromModule === 'number' && !Number.isNaN(baseNormFromModule)
        ? baseNormFromModule
        : typeof entry.displayToNorm === 'function'
          ? entry.displayToNorm(sliderValue)
          : paramToNorm(sliderValue, displayRange);

    let leftOffset = 0;
    let rightOffset = 0;
    let modulationSum = 0;
    let hasRangeFromModulator = false;
    for (const conn of list) {
      const fromSlot = getSlotAt(conn.fromRow, conn.fromSlotId);
      const getPercent = fromSlot?.instance?.getModulationRangePercent;
      const getValue = fromSlot?.instance?.getModulationValue;
      if (getPercent && typeof getPercent === 'function') {
        const r = getPercent(conn.fromOutputId);
        if (r && typeof r.leftOffset === 'number' && typeof r.rightOffset === 'number') {
          hasRangeFromModulator = true;
          leftOffset = Math.min(leftOffset, r.leftOffset);
          rightOffset = Math.max(rightOffset, r.rightOffset);
        }
      }
      if (getValue) {
        const modVal = typeof getValue === 'function' ? getValue(conn.fromOutputId) : 0;
        modulationSum += modVal;
      }
    }
    // getModulationRangePercent を実装していないモジュレータ用のフォールバック（depth 0 の 0,0 は上書きしない）
    if (list.length > 0 && !hasRangeFromModulator) {
      leftOffset = -50;
      rightOffset = 50;
    }
    const effectiveNorm = clampNorm(baseNorm + modulationSum);

    const baseParamValue =
      typeof entry.toParamValue === 'function'
        ? entry.toParamValue(baseNorm)
        : normToParam(baseNorm, paramRange);
    const effectiveParamValue =
      typeof entry.toParamValue === 'function'
        ? entry.toParamValue(effectiveNorm)
        : normToParam(effectiveNorm, paramRange);
    const offsetAmount = effectiveParamValue - baseParamValue;

    const driveNode = modulationDriveNodes.get(key);
    if (driveNode && typeof driveNode.offset !== 'undefined') {
      driveNode.offset.setTargetAtTime(offsetAmount, ensureAudioContext().currentTime, 0.01);
    }

    const formatDisplay = entry.format ?? entry.formatDisplay ?? defaultModulationFormatDisplay(toParamId);
    const modRangeOffset =
      leftOffset !== 0 || rightOffset !== 0 ? { leftOffset, rightOffset } : undefined;
    const displayValueFromModule = slot.instance.getParamDisplayValue?.(toParamId);
    const displayValueForNumber =
      typeof displayValueFromModule === 'number' && !Number.isNaN(displayValueFromModule)
        ? displayValueFromModule
        : typeof entry.normToDisplayValue === 'function'
          ? entry.normToDisplayValue(baseNorm)
          : sliderValue;
    if (slot.instance.shouldUpdateParamDisplay?.(toParamId) !== false) {
      updateParamDisplayFromValue(slot.instance.element, inputParamId, baseNorm, displayValueForNumber, formatDisplay, modRangeOffset);
    }
  }
  if (modulationConnections.size > 0) modulationFeedbackRafId = requestAnimationFrame(tickModulationFeedback);
  else modulationFeedbackRafId = 0;
}
let modulationFeedbackRafId = 0;
function startModulationFeedbackLoop() {
  if (modulationFeedbackRafId) return;
  modulationFeedbackRafId = requestAnimationFrame(tickModulationFeedback);
}
function stopModulationFeedbackLoop() {
  if (modulationFeedbackRafId) {
    cancelAnimationFrame(modulationFeedbackRafId);
    modulationFeedbackRafId = 0;
  }
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
    if (toSlot?.instance) {
      if (masterSyncSequencerInstances) masterSyncSequencerInstances.delete(toSlot.instance);
      if (toSlot.instance.setSyncConnected) toSlot.instance.setSyncConnected(false);
    }
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
  const params = toSlot?.instance.getModulatableParams?.();
  if (!params?.length) return;
  const entry = params.find((p) => p.id === toParamId);
  if (!entry) return;
  const connKey = `${toRow}:${toSlot.instanceId}:${toParamId}`;
  const connList = modulationConnections.get(connKey);
  if (connList) {
    const idx = connList.findIndex(
      (c) => c.fromRow === fromRow && c.fromSlotId === fromSlot.instanceId && c.fromOutputId === fromOutputId
    );
    if (idx !== -1) connList.splice(idx, 1);
    if (connList.length === 0) {
      modulationConnections.delete(connKey);
      const driveNode = modulationDriveNodes.get(connKey);
      if (driveNode) {
        try {
          driveNode.disconnect(entry.param);
          driveNode.stop();
        } catch (_) {}
        modulationDriveNodes.delete(connKey);
        const inputParamId = getInputParamId(toParamId);
        const input = toSlot.instance.element?.querySelector(`input[data-param="${inputParamId}"]`);
        let baseVal = input
          ? (Number.isNaN(parseFloat(input.value)) ? parseFloat(input.min) || 0 : parseFloat(input.value))
          : 0;
        const displayValueFromModule = toSlot.instance.getParamDisplayValue?.(toParamId);
        if (typeof displayValueFromModule === 'number' && !Number.isNaN(displayValueFromModule)) {
          baseVal = displayValueFromModule;
        } else if (typeof entry.toParamValue === 'function' && input) {
          const norm = typeof entry.displayToNorm === 'function'
            ? entry.displayToNorm(baseVal)
            : (parseFloat(input.min) || 0) === 0 && (parseFloat(input.max) || 100) === 100
              ? baseVal / 100
              : paramToNorm(baseVal, entry.displayRange ?? entry.range);
          baseVal = entry.toParamValue(norm);
        } else if (Array.isArray(entry.range) && entry.range.length >= 2 && input) {
          const displayRange = entry.displayRange ?? entry.range;
          const norm = paramToNorm(baseVal, displayRange);
          baseVal = normToParam(norm, entry.range);
        } else if (typeof entry.paramMin === 'number' && typeof entry.paramMax === 'number' && input) {
          const smin = parseFloat(input.min) || 0;
          const smax = parseFloat(input.max) || 100;
          const srange = smax - smin;
          const prange = entry.paramMax - entry.paramMin;
          if (srange > 0 && prange !== 0) {
            baseVal = entry.paramMin + ((baseVal - smin) / srange) * prange;
          }
        }
        entry.param.setTargetAtTime(baseVal, ensureAudioContext().currentTime, 0.01);
      }
      const inputParamId = getInputParamId(toParamId);
      const input = toSlot.instance.element?.querySelector(`input[data-param="${inputParamId}"]`);
      if (input) {
        const formatDisplay = entry.format ?? entry.formatDisplay ?? defaultModulationFormatDisplay(toParamId);
        const val = Number.isNaN(parseFloat(input.value)) ? (parseFloat(input.min) || 0) : parseFloat(input.value);
        const baseNormFromModule = toSlot.instance.getParamBaseNorm?.(toParamId);
        const baseNormDisconnect =
          typeof baseNormFromModule === 'number' && !Number.isNaN(baseNormFromModule)
            ? baseNormFromModule
            : typeof entry.displayToNorm === 'function'
              ? entry.displayToNorm(val)
              : (Array.isArray(entry.range) ? paramToNorm(val, entry.displayRange ?? entry.range) : (val - (parseFloat(input.min) || 0)) / ((parseFloat(input.max) || 100) - (parseFloat(input.min) || 0) || 1));
        const displayVal = toSlot.instance.getParamDisplayValue?.(toParamId);
        const displayValueForDisconnect = (typeof displayVal === 'number' && !Number.isNaN(displayVal)) ? displayVal : val;
        updateParamDisplayFromValue(toSlot.instance.element, inputParamId, baseNormDisconnect, displayValueForDisconnect, formatDisplay, undefined);
      }
    }
  }
}

const synthRackArea = rackContainer?.parentElement;
if (synthRackArea) {
  initCables(synthRackArea, getRows, handleCableConnect, handleCableDisconnect);
  const rackScroll = rackContainer?.querySelector('.synth-rack__scroll');
  if (rackScroll) rackScroll.addEventListener('scroll', scheduleRedrawCables);
  synthRackArea.addEventListener('wheel', handleParamValueWheel, { passive: false });
  const modulatorsRow = document.getElementById('modulatorsRow');
  if (modulatorsRow) modulatorsRow.addEventListener('scroll', scheduleRedrawCables);
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
    masterSyncSequencerInstances.forEach((inst) => {
      if (typeof inst.setMasterBpm === 'function') inst.setMasterBpm(masterBPM);
    });
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
const masterCorrelationFill = document.getElementById('masterCorrelationFill');
const masterWaveformCanvas = document.getElementById('masterWaveformCanvas');
const masterSpectrumCanvas = document.getElementById('masterSpectrumCanvas');
const masterSpectrogramCanvas = document.getElementById('masterSpectrogramCanvas');
const masterGoniometerCanvas = document.getElementById('masterGoniometerCanvas');
const WAVEFORM_COLOR = '#628878';

/** グラフ表示オプション（描画時に参照） */
let masterGraphLevel = 1;
let masterGraphSmoothing = 0.6;
let masterSpectrogramDecay = 0;
let masterWaveLineWidth = 1;
let masterFftSize = 1024;
let masterSpectrogramColorTheme = 'default';
let masterGoniometerGrid = false;

/** パネル内のスライダーをグローバル変数に合わせて同期（開いたときに正しいバーを表示） */
function syncPanelSlidersFromGlobals(panel) {
  if (!panel) return;
  panel.querySelectorAll('input[type="range"].synth-master-graph-opts__slider').forEach((slider) => {
    const opt = slider.dataset.opt;
    let val = 0;
    if (opt === 'level') val = masterGraphLevel * 100;
    else if (opt === 'smoothing') val = masterGraphSmoothing * 100;
    else if (opt === 'waveLineWidth') val = masterWaveLineWidth;
    else if (opt === 'spectrogramDecay') val = masterSpectrogramDecay * 100;
    else return;
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    slider.value = String(Math.max(min, Math.min(max, val)));
    updateGraphOptBarFill(slider);
  });
  panel.querySelectorAll('[data-opt-value]').forEach((el) => {
    const opt = el.getAttribute('data-opt-value');
    if (opt === 'level') el.textContent = `${Math.round(masterGraphLevel * 100)}%`;
    else if (opt === 'smoothing') el.textContent = `${Math.round(masterGraphSmoothing * 100)}%`;
    else if (opt === 'waveLineWidth') el.textContent = `${masterWaveLineWidth}px`;
    else if (opt === 'spectrogramDecay') el.textContent = `${Math.round(masterSpectrogramDecay * 100)}%`;
  });
}

/** 各グラフブロックの設定パネル開閉（スライドアニメーションは CSS で実施） */
document.querySelectorAll('.synth-master-graph-block').forEach((block) => {
  const trigger = block.querySelector('.synth-master-graph-block__trigger');
  const settings = block.querySelector('.synth-master-graph-block__settings');
  if (!trigger || !settings) return;
  trigger.addEventListener('click', () => {
    const open = !block.classList.contains('synth-master-graph-block--settings-open');
    block.classList.toggle('synth-master-graph-block--settings-open', open);
    trigger.setAttribute('aria-expanded', String(open));
    if (open) syncPanelSlidersFromGlobals(settings);
  });
});

/** 設定パネル内のコントロールをグローバル変数と同期（表示＋スライダー・バーも同期） */
function syncGraphOptDisplay(optName, value) {
  document.querySelectorAll(`[data-opt-value="${optName}"]`).forEach((el) => {
    if (optName === 'level') el.textContent = `${Math.round(value * 100)}%`;
    else if (optName === 'smoothing') el.textContent = `${Math.round(value * 100)}%`;
    else if (optName === 'waveLineWidth') el.textContent = `${value}px`;
    else if (optName === 'spectrogramDecay') el.textContent = `${Math.round(value * 100)}%`;
  });
  const sliders = document.querySelectorAll(`.synth-master-graph-opts__slider[data-opt="${optName}"]`);
  let sliderValue = value;
  if (optName === 'level') sliderValue = Math.round(value * 100);
  else if (optName === 'smoothing') sliderValue = Math.round(value * 100);
  else if (optName === 'spectrogramDecay') sliderValue = Math.round(value * 100);
  sliders.forEach((slider) => {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const clamped = Math.max(min, Math.min(max, sliderValue));
    slider.value = String(clamped);
    updateGraphOptBarFill(slider);
  });
}

/** スライダーに対応するバー fill の幅を更新（モジュールのバー同様） */
function updateGraphOptBarFill(slider) {
  const bar = slider.previousElementSibling;
  if (!bar || !bar.classList.contains('synth-master-graph-opts__bar')) return;
  const fill = bar.querySelector('.synth-master-graph-opts__bar-fill');
  if (!fill) return;
  const min = parseFloat(slider.min) || 0;
  const max = parseFloat(slider.max) || 100;
  const val = parseFloat(slider.value) || min;
  const range = max - min;
  const pct = range <= 0 ? 0 : Math.max(0, Math.min(100, ((val - min) / range) * 100));
  fill.style.width = `${pct}%`;
}

/** グラフ設定のスライダー行でホイール・バークリックで値を変更 */
function bindGraphOptSliders(panel) {
  panel.querySelectorAll('input[type="range"].synth-master-graph-opts__slider').forEach((slider) => {
    updateGraphOptBarFill(slider);
    slider.addEventListener('input', () => updateGraphOptBarFill(slider));
    const valueEl = slider.nextElementSibling;
    if (valueEl && valueEl.classList.contains('synth-master-graph-opts__value')) {
      valueEl.addEventListener('wheel', (e) => {
        e.preventDefault();
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const step = parseFloat(slider.step) || 1;
        let v = parseFloat(slider.value) + (e.deltaY > 0 ? -step : step);
        v = Math.max(min, Math.min(max, v));
        slider.value = String(v);
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      }, { passive: false });
    }
    const bar = slider.previousElementSibling;
    if (bar && bar.classList.contains('synth-master-graph-opts__bar')) {
      bar.addEventListener('click', (e) => {
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const ratio = Math.max(0, Math.min(1, e.offsetX / bar.clientWidth));
        const v = min + ratio * (max - min);
        const step = parseFloat(slider.step) || 1;
        const stepped = Math.round((v - min) / step) * step + min;
        slider.value = String(Math.max(min, Math.min(max, stepped)));
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      });
      bar.style.cursor = 'pointer';
    }
  });
}

document.querySelectorAll('.synth-master-graph-block__settings').forEach((panel) => {
  bindGraphOptSliders(panel);
  panel.addEventListener('input', (e) => {
    const slider = e.target.closest('input[type="range"]');
    const select = e.target.closest('select');
    const check = e.target.closest('input[type="checkbox"]');
    if (slider) {
      updateGraphOptBarFill(slider);
      const opt = slider.dataset.opt;
      const val = Number(slider.value);
      if (opt === 'level') { masterGraphLevel = val / 100; syncGraphOptDisplay('level', masterGraphLevel); }
      else if (opt === 'smoothing') { masterGraphSmoothing = val / 100; syncGraphOptDisplay('smoothing', masterGraphSmoothing); }
      else if (opt === 'waveLineWidth') { masterWaveLineWidth = val; syncGraphOptDisplay('waveLineWidth', masterWaveLineWidth); }
      else if (opt === 'spectrogramDecay') { masterSpectrogramDecay = val / 100; syncGraphOptDisplay('spectrogramDecay', masterSpectrogramDecay); }
    }
    if (select) {
      const opt = select.dataset.opt;
      const val = select.value;
      if (opt === 'fftSize') masterFftSize = Number(val);
      else if (opt === 'spectrogramColor') masterSpectrogramColorTheme = val;
    }
  });
  panel.addEventListener('change', (e) => {
    const check = e.target.closest('input[type="checkbox"]');
    if (check && check.dataset.opt === 'goniometerGrid') masterGoniometerGrid = check.checked;
  });
});

/** 初期表示の同期 */
document.querySelectorAll('[data-opt-value="level"]').forEach((el) => { el.textContent = '100%'; });
document.querySelectorAll('[data-opt-value="smoothing"]').forEach((el) => { el.textContent = '60%'; });
document.querySelectorAll('[data-opt-value="waveLineWidth"]').forEach((el) => { el.textContent = '1px'; });
document.querySelectorAll('[data-opt-value="spectrogramDecay"]').forEach((el) => { el.textContent = '0%'; });

/** スペクトログラム用オフスクリーンバッファ（スクロール用） */
let spectrogramBuffer = null;
let spectrogramBufferW = 0;
let spectrogramBufferH = 0;

/** 0–255 をスペクトログラム用の色に（テーマ: default / hot / cool） */
function spectrogramColor(value) {
  const t = value / 255;
  if (t <= 0) {
    if (masterSpectrogramColorTheme === 'hot') return 'rgb(20, 5, 5)';
    if (masterSpectrogramColorTheme === 'cool') return 'rgb(5, 10, 20)';
    return 'rgb(10, 10, 18)';
  }
  if (masterSpectrogramColorTheme === 'hot') {
    if (t <= 0.5) return `rgb(${Math.round(40 + t * 120)}, ${Math.round(10 + t * 30)}, ${Math.round(5 + t * 15)})`;
    return `rgb(${Math.round(160 + (t - 0.5) * 190)}, ${Math.round(40 + (t - 0.5) * 120)}, ${Math.round(20 + (t - 0.5) * 60)})`;
  }
  if (masterSpectrogramColorTheme === 'cool') {
    if (t <= 0.5) return `rgb(${Math.round(5 + t * 20)}, ${Math.round(20 + t * 80)}, ${Math.round(40 + t * 120)})`;
    return `rgb(${Math.round(25 + (t - 0.5) * 100)}, ${Math.round(100 + (t - 0.5) * 155)}, ${Math.round(160 + (t - 0.5) * 95)})`;
  }
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
  analyser.smoothingTimeConstant = masterGraphSmoothing;
  analyser.fftSize = masterFftSize;
  const aL = getMasterAnalyserL();
  const aR = getMasterAnalyserR();
  if (aL) { aL.smoothingTimeConstant = masterGraphSmoothing; aL.fftSize = masterFftSize; }
  if (aR) { aR.smoothingTimeConstant = masterGraphSmoothing; aR.fftSize = masterFftSize; }
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
    if (masterCorrelationFill) {
      let sumLR = 0;
      let sumL2 = 0;
      let sumR2 = 0;
      const len = Math.min(analyserLDataArray.length, analyserRDataArray.length);
      for (let i = 0; i < len; i++) {
        const nL = (analyserLDataArray[i] - 128) / 128;
        const nR = (analyserRDataArray[i] - 128) / 128;
        sumLR += nL * nR;
        sumL2 += nL * nL;
        sumR2 += nR * nR;
      }
      const denom = Math.sqrt(sumL2 * sumR2);
      const correlation = denom <= 0 ? 0 : Math.max(-1, Math.min(1, sumLR / denom));
      const pct = Math.abs(correlation) * 50;
      if (correlation >= 0) {
        masterCorrelationFill.style.left = '50%';
        masterCorrelationFill.style.width = `${pct}%`;
      } else {
        masterCorrelationFill.style.left = `${50 - pct}%`;
        masterCorrelationFill.style.width = `${pct}%`;
      }
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
        const amp = centerY - 2;
        ctx.strokeStyle = WAVEFORM_COLOR;
        ctx.lineWidth = Math.max(1, Math.min(3, masterWaveLineWidth));
        ctx.beginPath();
        for (let i = 0; i < analyserDataArray.length; i++) {
          const x = (i / analyserDataArray.length) * w;
          const normalized = Math.max(-1, Math.min(1, ((analyserDataArray[i] - 128) / 128) * masterGraphLevel));
          const y = centerY + normalized * amp;
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
      const analyser = getMasterAnalyser();
      if (ctx && analyser) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const binCount = analyserFrequencyData.length;
        const sampleRate = analyser.context.sampleRate;
        const fMin = 20;
        const fMax = Math.min(sampleRate / 2, 20000);
        const logMin = Math.log(fMin);
        const logMax = Math.log(fMax);
        const numPoints = Math.min(512, Math.max(64, Math.floor(w / 2)));
        const amp = h * 0.95;
        const points = [];
        for (let j = 0; j <= numPoints; j++) {
          const t = j / numPoints;
          const x = t * w;
          const freq = Math.exp(logMin + t * (logMax - logMin));
          const bin = (freq / sampleRate) * analyser.fftSize;
          const binIdx = Math.min(binCount - 1, Math.max(0, Math.floor(bin)));
          const v = Math.min(1, (analyserFrequencyData[binIdx] / 255) * masterGraphLevel);
          const y = h - v * amp;
          points.push({ x, y });
        }
        ctx.beginPath();
        ctx.moveTo(0, h);
        points.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = WAVEFORM_COLOR;
        ctx.globalAlpha = 0.25;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = WAVEFORM_COLOR;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let k = 1; k < points.length; k++) ctx.lineTo(points[k].x, points[k].y);
        ctx.stroke();
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
        if (masterSpectrogramDecay > 0) {
          bufCtx.globalAlpha = masterSpectrogramDecay;
          bufCtx.drawImage(spectrogramBuffer, 1, 0, w - 1, h, 0, 0, w - 1, h);
          bufCtx.globalAlpha = 1;
        } else {
          bufCtx.drawImage(spectrogramBuffer, 1, 0, w - 1, h, 0, 0, w - 1, h);
        }
        const colX = w - 1;
        for (let py = 0; py < h; py++) {
          const bin = Math.min(binCount - 1, Math.floor((1 - py / h) * binCount));
          const value = Math.min(255, Math.round((analyserFrequencyData[bin] / 255) * masterGraphLevel * 255));
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
        if (masterGoniometerGrid) {
          ctx.strokeStyle = 'rgba(255,255,255,0.15)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
          ctx.moveTo(0, cy); ctx.lineTo(w, cy);
          const r = scale * 0.5;
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.arc(cx, cy, scale, 0, Math.PI * 2);
          ctx.stroke();
        }
        const len = Math.min(analyserLDataArray.length, analyserRDataArray.length);
        ctx.strokeStyle = WAVEFORM_COLOR;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
          const l = Math.max(-1, Math.min(1, ((analyserLDataArray[i] - 128) / 128) * masterGraphLevel));
          const r = Math.max(-1, Math.min(1, ((analyserRDataArray[i] - 128) / 128) * masterGraphLevel));
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
  const options = rows.map((row, i) => `<option value="${i}">${i + 1}</option>`).join('');
  const fallback = '<option value="0">1</option>';
  if (rowSelectForEffect) {
    rowSelectForEffect.innerHTML = options || fallback;
    const effectIndex = parseInt(prevEffectRow, 10);
    if (effectIndex >= 0 && effectIndex < rows.length) {
      rowSelectForEffect.value = String(effectIndex);
    }
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ---------- 保存・読み込み（パラメータ状態の収集・復元） ----------
/** 収集対象のモジュールルートを取得（スロットの場合は内側の .synth-module を返す） */
function getModuleRootForState(slotOrInstance) {
  const instance = slotOrInstance.instance ?? slotOrInstance;
  const raw = slotOrInstance.element ?? instance?.element;
  if (!raw || !raw.querySelector) return null;
  return raw.classList.contains('synth-module') ? raw : raw.querySelector('.synth-module') || raw;
}

/** モジュール要素から data-param 付き入力・select と Seq の gate を漏れなく収集（非表示スライダー含む） */
function collectParamsFromElement(element) {
  if (!element || !element.querySelectorAll) return {};
  const state = {};
  const inputs = element.querySelectorAll(
    'input[data-param], select[data-param], input.synth-module__slider, select.synth-module__select'
  );
  inputs.forEach((el) => {
    const param = el.getAttribute('data-param');
    if (!param) return;
    const step = el.dataset.step;
    const bandFromParent = el.closest('[data-band]')?.getAttribute('data-band');
    const suffix = step !== undefined ? `_${step}` : bandFromParent !== undefined ? `_${bandFromParent}` : '';
    const key = param + suffix;
    state[key] = el.type === 'checkbox' ? el.checked : el.value;
  });
  element.querySelectorAll('.synth-module__sequencer-viz-overlay-cell[data-step]').forEach((cell) => {
    const step = cell.getAttribute('data-step');
    state[`gate_${step}`] = cell.classList.contains('synth-module__step-pitch-cell--gate-on');
  });
  return state;
}

function findElementForParamKey(element, key) {
  if (key.startsWith('gate_')) return null;
  const lastUnderscore = key.lastIndexOf('_');
  const suffix = lastUnderscore >= 0 && /^\d+$/.test(key.slice(lastUnderscore + 1)) ? key.slice(lastUnderscore + 1) : null;
  const param = suffix !== null ? key.slice(0, lastUnderscore) : key;
  if (suffix !== null) {
    const byStep = element.querySelector(`[data-param="${param}"][data-step="${suffix}"]`);
    if (byStep) return byStep;
    const byBand = element.querySelector(`[data-band="${suffix}"] [data-param="${param}"]`);
    if (byBand) return byBand;
  }
  return element.querySelector(`[data-param="${param}"]`);
}

function restoreStateToElement(element, state) {
  for (const [key, value] of Object.entries(state)) {
    if (key.startsWith('gate_')) continue;
    const el = findElementForParamKey(element, key);
    if (el && (el.value !== undefined || el.checked !== undefined)) {
      if (typeof el.checked === 'boolean') el.checked = !!value;
      else el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}

/** スロットまたはインスタンスから保存用状態を取得。モジュールルートから漏れなく収集し、getSerializableState があればマージ */
function getModuleState(slotOrInstance) {
  const instance = slotOrInstance.instance ?? slotOrInstance;
  const root = getModuleRootForState(slotOrInstance);
  if (!root) return {};
  const fromEl = collectParamsFromElement(root);
  const fromInstance = typeof instance?.getSerializableState === 'function' ? instance.getSerializableState() : {};
  return { ...fromEl, ...fromInstance };
}

function restoreModuleState(instance, state) {
  if (!state || typeof state !== 'object') return;
  const root = instance?.element ? (instance.element.classList.contains('synth-module') ? instance.element : instance.element.querySelector('.synth-module') || instance.element) : null;
  if (root) restoreStateToElement(root, state);
  if (typeof instance.restoreState === 'function') instance.restoreState(state);
}

function saveProject() {
  const rows = getRows();
  const conns = getConnections();
  const data = {
    version: 1,
    rows: rows.filter((row) => row && row.rowIndex !== MODULATOR_ROW).map((row) => {
      const r = {
        name: row.name,
        pan: row.pan ?? 0,
        mute: !!row.mute,
        solo: !!row.solo,
        source: row.source
          ? { typeId: row.source.typeId, ...getModuleState(row.source) }
          : null,
        chain: row.chain.filter((s) => s.kind === 'effect').map((s) => ({ typeId: s.typeId, ...getModuleState(s) })),
      };
      return r;
    }),
    modulators: getModulatorSlots().map((s) => ({ typeId: s.typeId, ...getModuleState(s) })),
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
  for (const node of modulationDriveNodes.values()) {
    try { node.stop(); } catch (_) {}
  }
  modulationDriveNodes.clear();
  modulationConnections.clear();
  triggerConnections.clear();
  masterSyncReceivers.clear();
  masterSyncConnectionKeys.clear();
  masterSyncSequencerInstances.clear();
  stopModulationFeedbackLoop();
  clearRack();

  await resumeContext();
  /** 廃止モジュールの型を新 ID にマッピング（例: sequencer-64 → sequencer-32） */
  const resolveTypeId = (id) => (id === 'sequencer-64' ? 'sequencer-32' : id);
  /** 旧形式: チェーン内の modulator の (fromRow, fromSlotIndex) → 新形式の modulator セクション内の slotIndex */
  const oldModulatorSlotMap = {};
  for (let ri = 0; ri < data.rows.length; ri++) {
    const r = data.rows[ri];
    if (!r.source?.typeId) continue;
    const result = await addSourceRow(r.source.typeId);
    if (!result) continue;
    const { typeId: _t1, ...sourceState } = r.source || {};
    restoreModuleState(result.slot.instance, sourceState);
    setRowName(result.rowIndex, r.name || `Row ${ri + 1}`);
    setRowPan(result.rowIndex, r.pan ?? 0);
    setRowMute(result.rowIndex, !!r.mute);
    setRowSolo(result.rowIndex, !!r.solo);
    if (result.slot.instance.getAudioOutput) {
      await connectRowToMaster(result.rowIndex);
    }
    const chain = r.chain || [];
    let slotIndex = 1;
    for (const slot of chain) {
      if (!slot.typeId) continue;
      const typeId = resolveTypeId(slot.typeId);
      const factory = getRegisteredModules().find((m) => m.id === typeId);
      if (!factory) continue;
      if (factory.kind === 'effect') {
        const effectSlot = await addEffectToRow(result.rowIndex, typeId);
        if (effectSlot) {
          const { typeId: _t2, ...effectState } = slot;
          restoreModuleState(effectSlot.instance, effectState);
          await connectRowToMaster(result.rowIndex);
        }
      } else if (factory.kind === 'modulator') {
        const added = addModulator(typeId);
        if (added) oldModulatorSlotMap[`${ri},${slotIndex}`] = getSlotIndex(MODULATOR_ROW, added.instanceId);
      }
      slotIndex++;
    }
  }
  for (const m of data.modulators || []) {
    if (!m?.typeId) continue;
    const added = addModulator(resolveTypeId(m.typeId));
    if (added) {
      const { typeId: _t3, ...modState } = m;
      restoreModuleState(added.instance, modState);
    }
  }
  const conns = data.connections || [];
  for (const c of conns) {
    let fromRow = c.fromRow;
    let fromSlotIndex = c.fromSlotIndex;
    const oldKey = `${fromRow},${fromSlotIndex}`;
    if (oldModulatorSlotMap[oldKey] !== undefined) {
      fromRow = MODULATOR_ROW;
      fromSlotIndex = oldModulatorSlotMap[oldKey];
    }
    const fromId = getSlotInstanceId(fromRow, fromSlotIndex);
    const toId = getSlotInstanceId(c.toRow, c.toSlotIndex);
    if (fromId && toId && c.toParamId) {
      addConnectionFromLoad(fromRow, fromId, c.toRow, toId, c.toParamId, c.fromOutputId);
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
      const slot = addModulator(m.id);
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
