/**
 * Master Sync / Gate / Pan / 変調ケーブルを AudioNode と RAF 駆動に結びつける。
 */

import { resumeContext, ensureAudioContext } from './audio-core.js';
import {
  subscribeSequencerMasterSync,
  unsubscribeSequencerMasterSync,
} from './master-sync.js';
import { normToParam, paramToNorm, clampNorm } from './param-utils.js';
import { getConnections } from './cables.js';
import { updateParamDisplayFromValue } from './rack.js';

/** @typedef {{ getSlotAt: Function; getRowTailPanner: Function }} ConnectionRuntimeDeps */

/** @type {ConnectionRuntimeDeps} */
let runtimeDeps = {
  getSlotAt: () => null,
  getRowTailPanner: () => undefined,
};

/**
 * @param {ConnectionRuntimeDeps} deps
 */
export function wireConnectionRuntime(deps) {
  runtimeDeps = deps;
}

function getSlotAt(rowIndex, instanceId) {
  return runtimeDeps.getSlotAt(rowIndex, instanceId);
}

function getRowTailPanner(rowIndex) {
  return runtimeDeps.getRowTailPanner(rowIndex);
}

/** 変調駆動用: 接続先パラメータごとに1つの ConstantSource */
const modulationDriveNodes = new Map();

/** 変調の逆探知用 */
const modulationConnections = new Map();

/** Gate → Trigger */
const triggerConnections = new Map();

function triggerConnectionKey(fromRow, fromSlotId, fromOutputId, toRow, toSlotId, toParamId) {
  return `${fromRow}:${fromSlotId}:${fromOutputId}:${toRow}:${toSlotId}:${toParamId}`;
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

/** ケーブル接続時 */
export async function handleCableConnect(fromRow, fromSlotId, toRow, toSlotId, toParamId, fromOutputId) {
  if (fromRow === -1 && fromSlotId === 'master' && fromOutputId === 'sync' && toParamId === 'syncIn') {
    const toSlot = getSlotAt(toRow, toSlotId);
    if (toSlot?.instance) {
      subscribeSequencerMasterSync(toRow, toSlotId, toSlot.instance);
    }
    return;
  }

  const fromSlot = getSlotAt(fromRow, fromSlotId);
  if (!fromSlot?.instance) return;

  if (toParamId === 'pan' && toSlotId === 'pan') {
    if (!fromSlot.instance.getModulationOutput) return;
    const out = fromSlot.instance.getModulationOutput(fromOutputId);
    if (!out) return;
    try {
      await resumeContext();
      const panner = getRowTailPanner(toRow);
      if (panner && typeof panner.pan !== 'undefined') {
        out.connect(panner.pan);
      }
    } catch (_) {}
    return;
  }

  const toSlot = getSlotAt(toRow, toSlotId);

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

export function handleCableDisconnect(fromRow, fromSlotId, toRow, toSlotId, toParamId, fromOutputId) {
  if (fromRow === -1 && fromSlotId === 'master' && fromOutputId === 'sync' && toParamId === 'syncIn') {
    const toSlot = getSlotAt(toRow, toSlotId);
    unsubscribeSequencerMasterSync(toRow, toSlotId, toSlot?.instance);
    return;
  }

  const fromSlot = getSlotAt(fromRow, fromSlotId);

  if (toParamId === 'pan' && toSlotId === 'pan') {
    if (!fromSlot?.instance.getModulationOutput) return;
    const out = fromSlot.instance.getModulationOutput(fromOutputId);
    if (!out) return;
    const panner = getRowTailPanner(toRow);
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

/** load などで状態を初期化する */
export function resetConnectionRuntimeState() {
  for (const node of modulationDriveNodes.values()) {
    try {
      node.stop();
    } catch (_) {}
  }
  modulationDriveNodes.clear();
  modulationConnections.clear();
  triggerConnections.clear();
  stopModulationFeedbackLoop();
}

/** その行の Pan へのケーブル接続をパンナーに適用（接続後に呼ぶ） */
export function applyPanConnectionsForRow(rowIndex) {
  const panner = getRowTailPanner(rowIndex);
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
