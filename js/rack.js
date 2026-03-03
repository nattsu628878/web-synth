/**
 * rack.js
 * Web Synth - 行単位ラック（音源 | チェーン）
 * 音源は左に縦並び。各行 = 音源 + チェーン（エフェクト・モジュレータを追加順に横に並べ、順番は自由に変更可能）。
 */

import { removeConnectionsBySlot, redrawCables, scheduleRedrawCables, createInputJack } from './cables.js';
import { ensureAudioContext, ensureLpfWorklet, ensureHpfWorklet, ensurePwmWorklet, ensurePluckWorklet } from './audio-core.js';

/** @typedef {'source'|'effect'|'modulator'} ModuleKind */

/** @typedef {{ typeId: string, instanceId: string, kind: ModuleKind, element: HTMLElement, instance: Object }} RackSlot */

/** @typedef {{ rowIndex: number, name: string, source: RackSlot|null, chain: RackSlot[], pan: number, mute: boolean, solo: boolean }} RackRow */

/** @type {Map<string, import('./modules/base.js').ModuleFactory>} */
const moduleRegistry = new Map();

/** モジュレータ専用ラインの行インデックス（getSlotAt / ケーブルで使用） */
export const MODULATOR_ROW = -2;

/** @type {RackRow[]} */
let rows = [];

/** @type {RackSlot[]} モジュレータ専用ラインに並ぶスロット */
let modulatorSlots = [];

/** モジュレータ行（getRows()[MODULATOR_ROW] で参照。source は null、chain は modulatorSlots） */
const modulatorRow = { rowIndex: MODULATOR_ROW, _rowEl: null, source: null, get chain() { return modulatorSlots; } };

/** @type {HTMLElement|null} */
let rackContainerEl = null;

/** @type {((rowIndex: number) => void)|null} */
let onChainChange = null;

/** @type {((rowIndex: number, panValue: number) => void)|null} */
let onPanChange = null;

/** @type {(() => void)|null} */
let onMuteSoloChange = null;

/** @type {number} */
let instanceCounter = 0;

/** チェーン変更時（エフェクト/モジュレータ削除など）のコールバックを登録 */
export function setOnChainChange(fn) {
  onChainChange = fn;
}

/** 行のパン変更時のコールバックを登録（panValue: -1〜1） */
export function setOnPanChange(fn) {
  onPanChange = fn;
}

/** ミュート/ソロ変更時のコールバックを登録（全行のゲイン更新用） */
export function setOnMuteSoloChange(fn) {
  onMuteSoloChange = fn;
}

function nextInstanceId(typeId) {
  instanceCounter += 1;
  return `${typeId}-${instanceCounter}`;
}

/** 紫バーの left/width を補間するための現在値（modFill 要素ごと） */
const modLineSmoothed = new WeakMap();

/** 補間係数（1に近いほど即追従、0.2 前後でなめらかに追従） */
const MOD_LINE_LERP = 0.22;

function lerpModLine(current, target) {
  if (current === target) return target;
  const d = target - current;
  return Math.abs(d) < 0.3 ? target : current + d * MOD_LINE_LERP;
}

/**
 * 緑・紫バー表示の唯一の更新入口（案B）。
 * 緑＝baseNorm(0-1)、紫＝ケーブル接続時のみ baseNorm 起点で modRangeOffset 表示。数値は displayValue を formatDisplay で表示。
 */
function applyParamBarState(moduleElement, paramId, baseNorm, displayValue, formatDisplay, modRangeOffset) {
  const input = moduleElement.querySelector(`input[data-param="${paramId}"]`);
  if (!input) return;
  const norm = Number(baseNorm);
  const basePercent = (Number.isNaN(norm) ? 0 : Math.max(0, Math.min(1, norm))) * 100;
  const row = input.closest('.synth-module__row');
  if (row && formatDisplay != null) {
    const valueSpan = row.querySelector('.synth-module__value');
    if (valueSpan) valueSpan.textContent = formatDisplay(displayValue);
  }
  // コンテナ取得: 行内の data-param 一致 → モジュール全体 → input の次
  let container =
    row?.querySelector(`.synth-module__param-bar-container[data-param="${paramId}"]`) ??
    moduleElement.querySelector(`.synth-module__param-bar-container[data-param="${paramId}"]`) ??
    (input.nextElementSibling?.classList?.contains('synth-module__param-bar-container') ? input.nextElementSibling : null);
  if (!container || !container.classList.contains('synth-module__param-bar-container')) return;
  const bar = container.querySelector('.synth-module__param-bar');
  if (bar) {
    const fill = bar.querySelector('.synth-module__param-bar__fill');
    if (fill) fill.style.width = `${basePercent}%`;
  }
  const needModLine =
    moduleElement.classList.contains('synth-module--source') ||
    moduleElement.classList.contains('synth-module--effect');
  let modLine = container.querySelector('.synth-module__param-bar-mod-line');
  if (!modLine && needModLine) {
    modLine = document.createElement('div');
    modLine.className = 'synth-module__param-bar-mod-line';
    const modLineFill = document.createElement('div');
    modLineFill.className = 'synth-module__param-bar-mod-line__fill';
    modLineFill.style.width = '0';
    modLineFill.style.left = '0';
    modLine.appendChild(modLineFill);
    container.appendChild(modLine);
  }
  if (modLine) {
    const modFill = modLine.querySelector('.synth-module__param-bar-mod-line__fill');
    if (modFill) {
      const showPurple =
        needModLine &&
        modRangeOffset &&
        (Number(modRangeOffset.leftOffset) !== 0 || Number(modRangeOffset.rightOffset) !== 0);
      if (showPurple) {
        const targetLeft = Math.max(0, Math.min(100, basePercent + Number(modRangeOffset.leftOffset)));
        const targetRight = Math.max(0, Math.min(100, basePercent + Number(modRangeOffset.rightOffset)));
        const targetWidth = Math.max(0, targetRight - targetLeft);
        const prev = modLineSmoothed.get(modFill) ?? { left: targetLeft, width: targetWidth };
        const left = lerpModLine(prev.left, targetLeft);
        const width = lerpModLine(prev.width, targetWidth);
        modLineSmoothed.set(modFill, { left, width });
        modFill.style.left = `${left}%`;
        modFill.style.width = `${width}%`;
        modLine.classList.add('synth-module__param-bar-mod-line--visible');
      } else {
        modLineSmoothed.delete(modFill);
        modFill.style.left = '0';
        modFill.style.width = '0';
        modLine.classList.remove('synth-module__param-bar-mod-line--visible');
      }
    }
  }
}

/** スライダーを非表示にして値バーだけ表示。全スライダーに緑バー＋紫用の線を追加（表示は applyParamBarState で一元管理） */
export function replaceSlidersWithBars(moduleElement) {
  const inputs = moduleElement.querySelectorAll('input[type="range"].synth-module__slider');
  inputs.forEach((input) => {
    const dataParam = input.getAttribute('data-param');
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 100;
    const parsed = parseFloat(input.value);
    const val = Number.isNaN(parsed) ? min : parsed;
    const range = max - min;
    const pct = range <= 0 ? 0 : Math.max(0, Math.min(100, ((val - min) / range) * 100));

    const container = document.createElement('div');
    container.className = 'synth-module__param-bar-container';
    if (dataParam) container.setAttribute('data-param', dataParam);

    const bar = document.createElement('div');
    bar.className = 'synth-module__param-bar';
    const fill = document.createElement('div');
    fill.className = 'synth-module__param-bar__fill';
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);
    container.appendChild(bar);

    // 紫バー用の要素は source/effect のみに追加（modulators には不要）
    const isSourceOrEffect =
      moduleElement.classList.contains('synth-module--source') ||
      moduleElement.classList.contains('synth-module--effect');
    if (isSourceOrEffect) {
      const modLine = document.createElement('div');
      modLine.className = 'synth-module__param-bar-mod-line';
      const modLineFill = document.createElement('div');
      modLineFill.className = 'synth-module__param-bar-mod-line__fill';
      modLineFill.style.width = '0';
      modLineFill.style.left = '0';
      modLine.appendChild(modLineFill);
      container.appendChild(modLine);
    }

    input.parentNode.insertBefore(container, input.nextSibling);
    input.classList.add('synth-module__slider--hidden');

    input.addEventListener('input', () => {
      const mod = input.closest('.synth-module');
      const pid = input.getAttribute('data-param');
      if (mod && pid) {
        const mn = parseFloat(input.min) || 0;
        const mx = parseFloat(input.max) || 100;
        const v = Number.isNaN(parseFloat(input.value)) ? mn : parseFloat(input.value);
        const r = mx - mn;
        const baseNorm = r <= 0 ? 0 : (v - mn) / r;
        applyParamBarState(mod, pid, baseNorm, v, null, undefined);
      } else {
        const r = max - min;
        fill.style.width = `${r <= 0 ? 0 : Math.max(0, Math.min(100, ((Number(input.value) - min) / r) * 100))}%`;
      }
    });

    const wrap = input.closest('.synth-module__step-slider-wrap');
    if (wrap) wrap.classList.add('synth-module__param-bar-wrap--step');
  });
}

/**
 * 案B: 緑・紫バー表示の唯一の公開API。緑＝baseNorm(0-1)、紫＝接続時のみ baseNorm 起点で表示。
 * 変調ループ・ケーブル切断・スライダー操作はすべてこの経路で applyParamBarState を呼ぶ。
 * @param {HTMLElement} moduleElement - モジュールルート
 * @param {string} paramId - input の data-param の値（例: 'freq', 'gain'）
 * @param {number} baseNorm - 緑バー用の現在値（0-1）
 * @param {number} displayValue - 数値表示用（formatDisplay に渡す）
 * @param {(value: number) => string} [formatDisplay] - 数値表示フォーマット。null のときは数値 span を更新しない
 * @param {{ leftOffset: number, rightOffset: number }} [modRangeOffset] - 紫の範囲（緑の先端からの％）。接続時のみ
 */
export function updateParamDisplayFromValue(moduleElement, paramId, baseNorm, displayValue, formatDisplay, modRangeOffset) {
  applyParamBarState(moduleElement, paramId, baseNorm, displayValue, formatDisplay ?? null, modRangeOffset ?? undefined);
}

function createSlotWrapper(slot, factory) {
  const wrapper = document.createElement('div');
  wrapper.className = `synth-rack__slot synth-rack__slot--${factory.meta.kind}`;
  wrapper.dataset.instanceId = slot.instanceId;
  wrapper.dataset.typeId = slot.typeId;
  wrapper.dataset.kind = factory.meta.kind;
  wrapper.setAttribute('draggable', 'false');

  if (factory.meta.kind !== 'source') {
    const arrows = document.createElement('div');
    arrows.className = 'synth-rack__slot-arrows';
    const btnLeft = document.createElement('button');
    btnLeft.type = 'button';
    btnLeft.className = 'synth-rack__slot-arrow synth-rack__slot-arrow--left';
    btnLeft.setAttribute('aria-label', 'Move left');
    btnLeft.title = 'Move left';
    btnLeft.textContent = '‹';
    const btnRight = document.createElement('button');
    btnRight.type = 'button';
    btnRight.className = 'synth-rack__slot-arrow synth-rack__slot-arrow--right';
    btnRight.setAttribute('aria-label', 'Move right');
    btnRight.title = 'Move right';
    btnRight.textContent = '›';
    arrows.appendChild(btnLeft);
    arrows.appendChild(btnRight);
    wrapper.appendChild(arrows);
  }
  wrapper.appendChild(slot.instance.element);
  replaceSlidersWithBars(slot.instance.element);
  return wrapper;
}

export function registerModule(factory) {
  if (!factory.meta?.id) throw new Error('Module must have meta.id');
  if (!factory.meta?.kind) throw new Error('Module must have meta.kind');
  moduleRegistry.set(factory.meta.id, factory);
}

/**
 * typeId に対応するモジュールファクトリを返す（プレビュー用）
 * @param {string} typeId
 * @returns {import('./modules/base.js').ModuleFactory|null}
 */
export function getModuleFactory(typeId) {
  return moduleRegistry.get(typeId) ?? null;
}

/**
 * 種別でフィルタしたモジュール一覧
 * @param {ModuleKind} [kind]
 */
export function getRegisteredModules(kind) {
  const list = Array.from(moduleRegistry.values()).map((f) => ({
    id: f.meta.id,
    name: f.meta.name,
    kind: f.meta.kind,
    description: f.meta.description,
  }));
  if (kind) return list.filter((m) => m.kind === kind);
  return list;
}

export function setRackContainer(el) {
  rackContainerEl = el;
  const area = el?.parentElement;
  modulatorRow._rowEl = area?.querySelector('#modulatorsRow') ?? null;
  modulatorRow._chainCol = modulatorRow._rowEl;
  rows[MODULATOR_ROW] = modulatorRow;
}

/** パン値 0–100 でノブの針の回転を更新（0 は左端のため || 50 は使わない） */
function updatePanKnobRotation(needleEl, value) {
  if (!needleEl) return;
  const parsed = parseFloat(value);
  const v = Math.max(0, Math.min(100, Number.isNaN(parsed) ? 50 : parsed));
  const deg = (v - 50) * 1.8;
  needleEl.style.transform = `rotate(${deg}deg)`;
}

/**
 * 行を追加（音源スロット1つのみ）。音源は一番左に縦に追加。
 * @param {string} typeId - 音源モジュールの id
 * @returns {Promise<{ rowIndex: number, slot: RackSlot }|null>}
 */
export async function addSourceRow(typeId) {
  const factory = moduleRegistry.get(typeId);
  if (!factory || factory.meta.kind !== 'source' || !rackContainerEl) return null;

  if (typeId === 'pwm') {
    try {
      ensureAudioContext();
      await ensurePwmWorklet();
    } catch (_) {
      return null;
    }
  }
  if (typeId === 'pluck') {
    try {
      ensureAudioContext();
      await ensurePluckWorklet();
    } catch (_) {
      return null;
    }
  }

  const instanceId = nextInstanceId(typeId);
  const instance = factory.create(instanceId);
  const slot = { typeId, instanceId, kind: 'source', element: null, instance };
  slot.element = createSlotWrapper(slot, factory);
  bindSlotEvents(slot);

  const rowNum = rows.length + 1;
  const row = { rowIndex: rows.length, name: `Row ${rowNum}`, source: slot, chain: [], pan: 0, mute: false, solo: false };
  rows.push(row);

  const rowEl = document.createElement('div');
  rowEl.className = 'synth-rack__row';
  rowEl.dataset.rowIndex = String(row.rowIndex);

  const panCol = document.createElement('div');
  panCol.className = 'synth-rack__col synth-rack__col--pan';
  panCol.title = 'Pan (L–R). Drop modulator for CV.';

  const rowNumSpan = document.createElement('span');
  rowNumSpan.className = 'synth-rack__row-num';
  rowNumSpan.textContent = String(row.rowIndex + 1);
  rowNumSpan.setAttribute('aria-label', `Row ${row.rowIndex + 1}`);
  panCol.appendChild(rowNumSpan);

  const muteSoloWrap = document.createElement('div');
  muteSoloWrap.className = 'synth-rack__mute-solo-wrap';
  const muteBtn = document.createElement('button');
  muteBtn.type = 'button';
  muteBtn.className = 'synth-rack__mute';
  muteBtn.textContent = 'M';
  muteBtn.title = 'Mute';
  muteBtn.setAttribute('aria-label', 'Mute row');
  muteBtn.addEventListener('click', () => {
    row.mute = !row.mute;
    muteBtn.classList.toggle('synth-rack__mute--on', row.mute);
    if (onMuteSoloChange) onMuteSoloChange();
  });
  const soloBtn = document.createElement('button');
  soloBtn.type = 'button';
  soloBtn.className = 'synth-rack__solo';
  soloBtn.textContent = 'S';
  soloBtn.title = 'Solo';
  soloBtn.setAttribute('aria-label', 'Solo row');
  soloBtn.addEventListener('click', () => {
    row.solo = !row.solo;
    soloBtn.classList.toggle('synth-rack__solo--on', row.solo);
    if (onMuteSoloChange) onMuteSoloChange();
  });
  muteSoloWrap.appendChild(muteBtn);
  muteSoloWrap.appendChild(soloBtn);
  panCol.appendChild(muteSoloWrap);

  const panSlot = document.createElement('div');
  panSlot.className = 'synth-rack__slot synth-rack__slot--pan';
  panSlot.dataset.instanceId = 'pan';

  const panSlider = document.createElement('input');
  panSlider.type = 'range';
  panSlider.className = 'synth-rack__pan synth-rack__pan--hidden';
  panSlider.min = '0';
  panSlider.max = '100';
  panSlider.value = '50';
  panSlider.setAttribute('aria-label', 'Pan');
  panSlider.addEventListener('input', () => {
    row.pan = (parseInt(panSlider.value, 10) - 50) / 50;
    if (onPanChange) onPanChange(row.rowIndex, row.pan);
    updatePanKnobRotation(panKnobNeedle, panSlider.value);
    panKnob.setAttribute('aria-valuenow', panSlider.value);
  });

  const panKnob = document.createElement('div');
  panKnob.className = 'synth-rack__pan-knob';
  panKnob.setAttribute('role', 'slider');
  panKnob.setAttribute('aria-label', 'Pan');
  panKnob.setAttribute('aria-valuemin', '0');
  panKnob.setAttribute('aria-valuemax', '100');
  panKnob.setAttribute('aria-valuenow', '50');
  const panKnobNeedle = document.createElement('div');
  panKnobNeedle.className = 'synth-rack__pan-knob-needle';
  panKnob.appendChild(panKnobNeedle);
  updatePanKnobRotation(panKnobNeedle, '50');

  panKnob.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startX = e.clientX;
    let startVal = parseFloat(panSlider.value);
    if (Number.isNaN(startVal)) startVal = 50;
    const move = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const delta = -dy * 0.8 + dx * 0.5;
      let next = Math.round(startVal + delta);
      next = Math.max(0, Math.min(100, next));
      panSlider.value = String(next);
      panSlider.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  });

  panSlot.appendChild(panKnob);
  panSlot.appendChild(panSlider);
  const panJackWrap = document.createElement('div');
  panJackWrap.className = 'synth-rack__pan-jack';
  createInputJack(panJackWrap, 'pan');
  panSlot.appendChild(panJackWrap);
  panCol.appendChild(panSlot);
  row._panSlider = panSlider;
  rowEl.appendChild(panCol);

  const sourceCol = document.createElement('div');
  sourceCol.className = 'synth-rack__col synth-rack__col--source';
  sourceCol.appendChild(slot.element);
  rowEl.appendChild(sourceCol);

  const chainCol = document.createElement('div');
  chainCol.className = 'synth-rack__col synth-rack__col--chain';
  chainCol.addEventListener('scroll', scheduleRedrawCables);
  rowEl.appendChild(chainCol);

  row._rowEl = rowEl;
  row._chainCol = chainCol;
  row._muteBtn = muteBtn;
  row._soloBtn = soloBtn;

  const scrollBody = rackContainerEl.querySelector('.synth-rack__scroll');
  if (scrollBody) scrollBody.appendChild(rowEl);
  else {
    const cablesLayer = rackContainerEl.querySelector('.synth-cables');
    if (cablesLayer) rackContainerEl.insertBefore(rowEl, cablesLayer);
    else rackContainerEl.appendChild(rowEl);
  }
  return { rowIndex: row.rowIndex, slot };
}

/**
 * 指定行のチェーン末尾にエフェクトを追加（横に並ぶ・順番は自由に変更可）
 * @param {number} rowIndex
 * @param {string} typeId
 * @returns {Promise<RackSlot|null>}
 */
export async function addEffectToRow(rowIndex, typeId) {
  const factory = moduleRegistry.get(typeId);
  if (!factory || factory.meta.kind !== 'effect') return null;
  const row = rows[rowIndex];
  if (!row || !row._chainCol) return null;

  if (typeId === 'lpf') {
    try {
      ensureAudioContext();
      await ensureLpfWorklet();
    } catch (_) {
      return null;
    }
  }
  if (typeId === 'hpf') {
    try {
      ensureAudioContext();
      await ensureHpfWorklet();
    } catch (_) {
      return null;
    }
  }

  try {
    const instanceId = nextInstanceId(typeId);
    const instance = factory.create(instanceId);
    if (!instance?.element) return null;
    const slot = { typeId, instanceId, kind: 'effect', element: null, instance };
    slot.element = createSlotWrapper(slot, factory);
    bindSlotEvents(slot);
    row.chain.push(slot);
    row._chainCol.appendChild(slot.element);
    updateChainMoveButtons(row);
    return slot;
  } catch (_) {
    return null;
  }
}

/**
 * モジュレータ専用ラインにモジュレータを追加（縦に並ぶ）
 * @param {string} typeId
 * @returns {RackSlot|null}
 */
export function addModulator(typeId) {
  const factory = moduleRegistry.get(typeId);
  if (!factory || factory.meta.kind !== 'modulator') return null;
  if (!modulatorRow._rowEl) return null;

  const instanceId = nextInstanceId(typeId);
  const instance = factory.create(instanceId);
  const slot = { typeId, instanceId, kind: 'modulator', element: null, instance };
  slot.element = createSlotWrapper(slot, factory);
  bindSlotEvents(slot);

  modulatorSlots.push(slot);
  modulatorRow._rowEl.appendChild(slot.element);
  updateChainMoveButtons(modulatorRow);
  scheduleRedrawCables();
  return slot;
}

/**
 * 指定行のチェーン末尾にモジュレータを追加（非推奨: 互換用。通常は addModulator を使用）
 * @param {number} rowIndex
 * @param {string} typeId
 * @returns {RackSlot|null}
 */
export function addModulatorToRow(rowIndex, typeId) {
  return addModulator(typeId);
}

function findSlotByInstanceId(instanceId) {
  const modSlot = modulatorSlots.find((s) => s.instanceId === instanceId);
  if (modSlot) return { row: modulatorRow, slot: modSlot, rowIndex: MODULATOR_ROW };
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (row.source?.instanceId === instanceId) return { row, slot: row.source, rowIndex: r };
    const ch = row.chain.find((s) => s.instanceId === instanceId);
    if (ch) return { row, slot: ch, rowIndex: r };
  }
  return null;
}

function updateChainMoveButtons(row) {
  if (!row?.chain?.length || !row._chainCol) return;
  row.chain.forEach((s, idx) => {
    const left = s.element?.querySelector('.synth-rack__slot-arrow--left');
    const right = s.element?.querySelector('.synth-rack__slot-arrow--right');
    const atStart = idx === 0;
    const atEnd = idx === row.chain.length - 1;
    if (left) {
      left.disabled = atStart;
      left.classList.toggle('synth-rack__slot-arrow--disabled', atStart);
    }
    if (right) {
      right.disabled = atEnd;
      right.classList.toggle('synth-rack__slot-arrow--disabled', atEnd);
    }
  });
}

async function moveSlotLeft(slot) {
  const info = findSlotByInstanceId(slot.instanceId);
  if (!info || info.slot.kind === 'source') return;
  const { row, rowIndex } = info;
  const idx = row.chain.findIndex((s) => s.instanceId === slot.instanceId);
  if (idx <= 0) return;
  const [removed] = row.chain.splice(idx, 1);
  row.chain.splice(idx - 1, 0, removed);
  // 並べ替え後、removed は idx-1 番目。その右隣（挿入の基準）は row.chain[idx]
  row._chainCol.insertBefore(removed.element, row.chain[idx]?.element ?? null);
  redrawCables();
  if (onChainChange) {
    const p = onChainChange(rowIndex);
    if (p && typeof p.then === 'function') await p;
  }
  updateChainMoveButtons(row);
}

async function moveSlotRight(slot) {
  const info = findSlotByInstanceId(slot.instanceId);
  if (!info || info.slot.kind === 'source') return;
  const { row, rowIndex } = info;
  const idx = row.chain.findIndex((s) => s.instanceId === slot.instanceId);
  if (idx < 0 || idx >= row.chain.length - 1) return;
  const [removed] = row.chain.splice(idx, 1);
  row.chain.splice(idx + 1, 0, removed);
  const nextEl = row.chain[idx + 2]?.element ?? null;
  if (nextEl) row._chainCol.insertBefore(removed.element, nextEl);
  else row._chainCol.appendChild(removed.element);
  redrawCables();
  if (onChainChange) {
    const p = onChainChange(rowIndex);
    if (p && typeof p.then === 'function') await p;
  }
  updateChainMoveButtons(row);
}

function bindSlotEvents(slot) {
  const wrapper = slot.element;
  const btnLeft = wrapper.querySelector('.synth-rack__slot-arrow--left');
  const btnRight = wrapper.querySelector('.synth-rack__slot-arrow--right');
  if (btnLeft && slot.kind !== 'source') {
    btnLeft.addEventListener('click', () => moveSlotLeft(slot));
  }
  if (btnRight && slot.kind !== 'source') {
    btnRight.addEventListener('click', () => moveSlotRight(slot));
  }

  const removeBtn = wrapper.querySelector('.synth-module__remove');
  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeModule(slot.instanceId);
    });
  }
}

export function removeModule(instanceId) {
  const info = findSlotByInstanceId(instanceId);
  if (!info) return;
  const { row, slot, rowIndex } = info;
  removeConnectionsBySlot(rowIndex, slot.instanceId);
  if (typeof slot.instance.destroy === 'function') slot.instance.destroy();
  slot.element.remove();

  if (slot.kind === 'source') {
    removeConnectionsBySlot(rowIndex, 'pan');
    row.chain.forEach((s) => { if (typeof s.instance.destroy === 'function') s.instance.destroy(); s.element.remove(); });
    row.source = null;
    row.chain = [];
    if (row._rowEl) {
      row._rowEl.remove();
      const idx = rows.indexOf(row);
      if (idx !== -1) rows.splice(idx, 1);
      rows.forEach((r, i) => {
        r.rowIndex = i;
        if (r._rowEl) {
          r._rowEl.dataset.rowIndex = String(i);
          const numEl = r._rowEl.querySelector('.synth-rack__row-num');
          if (numEl) numEl.textContent = String(i + 1);
        }
      });
    }
  } else {
    if (rowIndex === MODULATOR_ROW) {
      modulatorSlots = modulatorSlots.filter((s) => s.instanceId !== instanceId);
    } else {
      row.chain = row.chain.filter((s) => s.instanceId !== instanceId);
    }
    updateChainMoveButtons(row);
    if (onChainChange) onChainChange(rowIndex);
    redrawCables();
  }
}

/** 行の名前を設定 */
export function setRowName(rowIndex, name) {
  const row = rows[rowIndex];
  if (!row) return;
  row.name = String(name).trim() || row.name;
}

/** 行のパンを設定（読み込み時など）。value は -1〜1 */
export function setRowPan(rowIndex, value) {
  const row = rows[rowIndex];
  if (!row) return;
  row.pan = Math.max(-1, Math.min(1, value));
  const val100 = Math.round(row.pan * 50 + 50);
  if (row._panSlider) {
    row._panSlider.value = String(val100);
    const needle = row._rowEl?.querySelector('.synth-rack__pan-knob-needle');
    updatePanKnobRotation(needle, String(val100));
  }
}

/** 行のミュートを設定（読み込み時など） */
export function setRowMute(rowIndex, muted) {
  const row = rows[rowIndex];
  if (!row) return;
  row.mute = !!muted;
  if (row._muteBtn) row._muteBtn.classList.toggle('synth-rack__mute--on', row.mute);
}

/** 行のソロを設定（読み込み時など） */
export function setRowSolo(rowIndex, soloed) {
  const row = rows[rowIndex];
  if (!row) return;
  row.solo = !!soloed;
  if (row._soloBtn) row._soloBtn.classList.toggle('synth-rack__solo--on', row.solo);
}

/** 行・スロットインデックスから instanceId を取得（0=source, 1=chain[0], ..., -1=pan）。rowIndex=-2 は modulator 専用ライン（slotIndex 0,1,...=modulatorSlots）。 */
export function getSlotInstanceId(rowIndex, slotIndex) {
  if (rowIndex === -1 && slotIndex === -1) return 'master';
  if (rowIndex === MODULATOR_ROW) return modulatorSlots[slotIndex]?.instanceId ?? null;
  const row = rows[rowIndex];
  if (!row) return null;
  if (slotIndex === -1) return 'pan';
  if (slotIndex === 0) return row.source?.instanceId ?? null;
  const ch = row.chain[slotIndex - 1];
  return ch?.instanceId ?? null;
}

/** instanceId からその行内のスロットインデックスを取得（0=source, 1=chain[0], ..., -1=pan）。rowIndex=-2 は modulator 専用ライン。 */
export function getSlotIndex(rowIndex, instanceId) {
  if (rowIndex === -1 && instanceId === 'master') return -1;
  if (rowIndex === MODULATOR_ROW) return modulatorSlots.findIndex((s) => s.instanceId === instanceId);
  const row = rows[rowIndex];
  if (!row) return -2;
  if (instanceId === 'pan') return -1;
  if (row.source?.instanceId === instanceId) return 0;
  const idx = row.chain.findIndex((s) => s.instanceId === instanceId);
  return idx >= 0 ? idx + 1 : -2;
}

/** ラックを空にする（全行削除）。先に cables をクリアすること */
export function clearRack() {
  for (const s of modulatorSlots) {
    if (typeof s.instance.destroy === 'function') s.instance.destroy();
    s.element.remove();
  }
  modulatorSlots = [];
  const toRemove = [...rows];
  for (const row of toRemove) {
    if (row.source) {
      if (typeof row.source.instance.destroy === 'function') row.source.instance.destroy();
      row.source.element.remove();
    }
    for (const s of row.chain) {
      if (typeof s.instance.destroy === 'function') s.instance.destroy();
      s.element.remove();
    }
    if (row._rowEl) row._rowEl.remove();
  }
  rows.length = 0;
}

/** 行ごとの構成を取得（接続・モジュレーション用） */
export function getRows() {
  return rows;
}

/** モジュレータ専用ラインのスロット一覧（保存用） */
export function getModulatorSlots() {
  return modulatorSlots;
}
