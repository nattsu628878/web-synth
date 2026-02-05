/**
 * rack.js
 * Web Synth - 行単位ラック（音源 | チェーン）
 * 音源は左に縦並び。各行 = 音源 + チェーン（エフェクト・モジュレータを追加順に横に並べ、順番は自由に変更可能）。
 */

import { removeConnectionsBySlot, redrawCables, createInputJack } from './cables.js';

/** @typedef {'source'|'effect'|'modulator'} ModuleKind */

/** @typedef {{ typeId: string, instanceId: string, kind: ModuleKind, element: HTMLElement, instance: Object }} RackSlot */

/** @typedef {{ rowIndex: number, name: string, source: RackSlot|null, chain: RackSlot[], pan: number, mute: boolean, solo: boolean }} RackRow */

/** @type {Map<string, import('./modules/base.js').ModuleFactory>} */
const moduleRegistry = new Map();

/** @type {RackRow[]} */
let rows = [];

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

/** スライダーを非表示にし、値の割合を表示する小さなバーのみにする */
function updateParamBarFill(input, fillEl) {
  const min = parseFloat(input.min) || 0;
  const max = parseFloat(input.max) || 100;
  const val = parseFloat(input.value) || min;
  const range = max - min;
  const pct = range <= 0 ? 0 : Math.max(0, Math.min(100, ((val - min) / range) * 100));
  fillEl.style.width = `${pct}%`;
}

function replaceSlidersWithBars(moduleElement) {
  const inputs = moduleElement.querySelectorAll('input[type="range"].synth-module__slider');
  inputs.forEach((input) => {
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 100;
    const val = parseFloat(input.value) || min;
    const range = max - min;
    const pct = range <= 0 ? 0 : Math.max(0, Math.min(100, ((val - min) / range) * 100));

    const bar = document.createElement('div');
    bar.className = 'synth-module__param-bar';
    const fill = document.createElement('div');
    fill.className = 'synth-module__param-bar__fill';
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);

    input.parentNode.insertBefore(bar, input.nextSibling);
    input.classList.add('synth-module__slider--hidden');

    input.addEventListener('input', () => updateParamBarFill(input, fill));

    const wrap = input.closest('.synth-module__step-slider-wrap');
    if (wrap) wrap.classList.add('synth-module__param-bar-wrap--step');
  });
}

function createSlotWrapper(slot, factory) {
  const wrapper = document.createElement('div');
  wrapper.className = `synth-rack__slot synth-rack__slot--${factory.meta.kind}`;
  wrapper.dataset.instanceId = slot.instanceId;
  wrapper.dataset.typeId = slot.typeId;
  wrapper.dataset.kind = factory.meta.kind;
  wrapper.setAttribute('draggable', 'false');

  if (factory.meta.kind !== 'source') {
    const handle = document.createElement('div');
    handle.className = 'synth-rack__slot-handle';
    handle.setAttribute('draggable', 'true');
    handle.setAttribute('aria-label', 'Drag to reorder');
    handle.title = 'Drag to reorder';
    handle.textContent = '⋮⋮';
    wrapper.appendChild(handle);
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
}

/**
 * 行を追加（音源スロット1つのみ）。音源は一番左に縦に追加。
 * @param {string} typeId - 音源モジュールの id
 * @returns {{ rowIndex: number, slot: RackSlot }|null}
 */
export function addSourceRow(typeId) {
  const factory = moduleRegistry.get(typeId);
  if (!factory || factory.meta.kind !== 'source' || !rackContainerEl) return null;

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

  const nameCol = document.createElement('div');
  nameCol.className = 'synth-rack__col synth-rack__col--name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'synth-rack__row-name';
  nameInput.value = row.name;
  nameInput.setAttribute('aria-label', 'Row name');
  nameInput.title = 'Edit row name';
  nameInput.addEventListener('change', () => {
    row.name = nameInput.value.trim() || row.name;
    nameInput.value = row.name;
  });
  nameCol.appendChild(nameInput);
  rowEl.appendChild(nameCol);

  const panCol = document.createElement('div');
  panCol.className = 'synth-rack__col synth-rack__col--pan';
  panCol.title = 'Pan (L–R). Drop modulator for CV.';

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
  panSlider.className = 'synth-rack__pan';
  panSlider.min = '0';
  panSlider.max = '100';
  panSlider.value = '50';
  panSlider.setAttribute('aria-label', 'Pan');
  panSlider.addEventListener('input', () => {
    row.pan = (parseInt(panSlider.value, 10) - 50) / 50;
    if (onPanChange) onPanChange(row.rowIndex, row.pan);
  });
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
  chainCol.addEventListener('scroll', () => redrawCables());
  rowEl.appendChild(chainCol);

  row._rowEl = rowEl;
  row._chainCol = chainCol;
  row._nameInput = nameInput;
  row._muteBtn = muteBtn;
  row._soloBtn = soloBtn;

  const cablesLayer = rackContainerEl.querySelector('.synth-cables');
  if (cablesLayer) rackContainerEl.insertBefore(rowEl, cablesLayer);
  else rackContainerEl.appendChild(rowEl);
  return { rowIndex: row.rowIndex, slot };
}

/**
 * 指定行のチェーン末尾にエフェクトを追加（横に並ぶ・順番は自由に変更可）
 * @param {number} rowIndex
 * @param {string} typeId
 * @returns {RackSlot|null}
 */
export function addEffectToRow(rowIndex, typeId) {
  const factory = moduleRegistry.get(typeId);
  if (!factory || factory.meta.kind !== 'effect') return null;
  const row = rows[rowIndex];
  if (!row || !row._chainCol) return null;

  const instanceId = nextInstanceId(typeId);
  const instance = factory.create(instanceId);
  const slot = { typeId, instanceId, kind: 'effect', element: null, instance };
  slot.element = createSlotWrapper(slot, factory);
  bindSlotEvents(slot);

  row.chain.push(slot);
  row._chainCol.appendChild(slot.element);
  return slot;
}

/**
 * 指定行のチェーン末尾にモジュレータを追加（横に並ぶ・順番は自由に変更可）
 * @param {number} rowIndex
 * @param {string} typeId
 * @returns {RackSlot|null}
 */
export function addModulatorToRow(rowIndex, typeId) {
  const factory = moduleRegistry.get(typeId);
  if (!factory || factory.meta.kind !== 'modulator') return null;
  const row = rows[rowIndex];
  if (!row || !row._chainCol) return null;

  const instanceId = nextInstanceId(typeId);
  const instance = factory.create(instanceId);
  const slot = { typeId, instanceId, kind: 'modulator', element: null, instance };
  slot.element = createSlotWrapper(slot, factory);
  bindSlotEvents(slot);

  row.chain.push(slot);
  row._chainCol.appendChild(slot.element);
  return slot;
}

function findSlotByInstanceId(instanceId) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (row.source?.instanceId === instanceId) return { row, slot: row.source, rowIndex: r };
    const ch = row.chain.find((s) => s.instanceId === instanceId);
    if (ch) return { row, slot: ch, rowIndex: r };
  }
  return null;
}

function bindSlotEvents(slot) {
  const wrapper = slot.element;
  const handle = wrapper.querySelector('.synth-rack__slot-handle');
  if (handle && slot.kind !== 'source') {
    handle.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', slot.instanceId);
      e.dataTransfer.effectAllowed = 'move';
      wrapper.classList.add('synth-rack__slot--dragging');
    });
    handle.addEventListener('dragend', () => {
      wrapper.classList.remove('synth-rack__slot--dragging');
    });
    wrapper.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      wrapper.classList.add('synth-rack__slot--drag-over');
    });
    wrapper.addEventListener('dragleave', (e) => {
      if (!wrapper.contains(e.relatedTarget)) wrapper.classList.remove('synth-rack__slot--drag-over');
    });
    wrapper.addEventListener('drop', (e) => {
      e.preventDefault();
      wrapper.classList.remove('synth-rack__slot--drag-over');
      const fromId = e.dataTransfer.getData('text/plain');
      if (!fromId || fromId === slot.instanceId) return;
      moveSlotInChain(fromId, slot);
    });
  }

  const removeBtn = wrapper.querySelector('.synth-module__remove');
  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeModule(slot.instanceId);
    });
  }
}

/** チェーン内でスロットの順番を入れ替え（エフェクト・モジュレータ同一チェーン内で自由に並び替え） */
function moveSlotInChain(fromInstanceId, toSlot) {
  const fromInfo = findSlotByInstanceId(fromInstanceId);
  const toInfo = findSlotByInstanceId(toSlot.instanceId);
  if (!fromInfo || !toInfo || fromInfo.rowIndex !== toInfo.rowIndex) return;
  if (fromInfo.slot.kind === 'source' || toInfo.slot.kind === 'source') return;

  const row = fromInfo.row;
  const fromIdx = row.chain.findIndex((s) => s.instanceId === fromInstanceId);
  const toIdx = row.chain.findIndex((s) => s.instanceId === toSlot.instanceId);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

  const [removed] = row.chain.splice(fromIdx, 1);
  const newToIdx = row.chain.findIndex((s) => s.instanceId === toSlot.instanceId);
  row.chain.splice(newToIdx, 0, removed);
  row._chainCol.insertBefore(removed.element, row.chain[newToIdx + 1]?.element ?? null);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => redrawCables());
  });
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
    }
  } else {
    row.chain = row.chain.filter((s) => s.instanceId !== instanceId);
    if (onChainChange) onChainChange(rowIndex);
  }
}

/** 行の名前を設定 */
export function setRowName(rowIndex, name) {
  const row = rows[rowIndex];
  if (!row) return;
  row.name = String(name).trim() || row.name;
  if (row._nameInput) row._nameInput.value = row.name;
}

/** 行のパンを設定（読み込み時など）。value は -1〜1 */
export function setRowPan(rowIndex, value) {
  const row = rows[rowIndex];
  if (!row) return;
  row.pan = Math.max(-1, Math.min(1, value));
  if (row._panSlider) row._panSlider.value = String(Math.round(row.pan * 50 + 50));
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

/** 行・スロットインデックスから instanceId を取得（0=source, 1=chain[0], ..., -1=pan）。rowIndex=-1, slotIndex=-1 はマスター Sync。 */
export function getSlotInstanceId(rowIndex, slotIndex) {
  if (rowIndex === -1 && slotIndex === -1) return 'master';
  const row = rows[rowIndex];
  if (!row) return null;
  if (slotIndex === -1) return 'pan';
  if (slotIndex === 0) return row.source?.instanceId ?? null;
  const ch = row.chain[slotIndex - 1];
  return ch?.instanceId ?? null;
}

/** instanceId からその行内のスロットインデックスを取得（0=source, 1=chain[0], ..., -1=pan）。rowIndex=-1 で instanceId='master' は -1。 */
export function getSlotIndex(rowIndex, instanceId) {
  if (rowIndex === -1 && instanceId === 'master') return -1;
  const row = rows[rowIndex];
  if (!row) return -2;
  if (instanceId === 'pan') return -1;
  if (row.source?.instanceId === instanceId) return 0;
  const idx = row.chain.findIndex((s) => s.instanceId === instanceId);
  return idx >= 0 ? idx + 1 : -2;
}

/** ラックを空にする（全行削除）。先に cables をクリアすること */
export function clearRack() {
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

/**
 * 行ごとの構成を取得（接続・モジュレーション用）
 * @returns {RackRow[]}
 */
export function getRows() {
  return rows;
}

export function getSlotOrder() {
  const order = [];
  rows.forEach((row, r) => {
    if (row.source) order.push({ rowIndex: r, kind: 'source', typeId: row.source.typeId, instanceId: row.source.instanceId });
    row.chain.forEach((s) => order.push({ rowIndex: r, kind: s.kind, typeId: s.typeId, instanceId: s.instanceId }));
  });
  return order;
}
