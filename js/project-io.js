/**
 * プロジェクト JSON の保存・読み込み、モジュール UI 状態の収集・復元。
 */

import { clearAllConnections, addConnectionFromLoad, getConnections, redrawCables } from './cables.js';
import { resumeContext } from './audio-core.js';
import { resetConnectionRuntimeState, applyPanConnectionsForRow } from './connection-runtime.js';
import { clearMasterSyncSubscriptions } from './master-sync.js';
import {
  MODULATOR_ROW,
  clearRack,
  addSourceRow,
  addEffectToRow,
  addModulator,
  getRegisteredModules,
  getRows,
  getModulatorSlots,
  getSlotIndex,
  getSlotInstanceId,
  setRowName,
  setRowPan,
  setRowMute,
  setRowSolo,
} from './rack.js';

function getModuleRootForState(slotOrInstance) {
  const instance = slotOrInstance.instance ?? slotOrInstance;
  const raw = slotOrInstance.element ?? instance?.element;
  if (!raw || !raw.querySelector) return null;
  return raw.classList.contains('synth-module') ? raw : raw.querySelector('.synth-module') || raw;
}

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
  const root = instance?.element
    ? (instance.element.classList.contains('synth-module')
        ? instance.element
        : instance.element.querySelector('.synth-module') || instance.element)
    : null;
  if (root) restoreStateToElement(root, state);
  if (typeof instance.restoreState === 'function') instance.restoreState(state);
}

export function saveProject() {
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

/**
 * @param {File} file
 * @param {{ connectRowToMaster: (rowIndex: number) => Promise<void>; applyAllRowGains: () => void; updateRowSelects: () => void }} audioHooks
 */
export async function loadProject(file, audioHooks) {
  const { connectRowToMaster, applyAllRowGains, updateRowSelects } = audioHooks;
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
  resetConnectionRuntimeState();
  clearMasterSyncSubscriptions();
  clearRack();

  await resumeContext();
  const resolveTypeId = (id) => (id === 'sequencer-64' ? 'sequencer-32' : id);
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
  const rowsAfter = getRows();
  for (let ri = 0; ri < rowsAfter.length; ri++) {
    applyPanConnectionsForRow(ri);
  }
  applyAllRowGains();
  updateRowSelects();
  redrawCables();
}
