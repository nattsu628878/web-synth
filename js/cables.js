/**
 * cables.js
 * Web Synth - モジュラー式ケーブル接続（垂れ下がりケーブル表現）
 * 出力ジャック・入力ジャックの作成、接続の追加・解除、ケーブル描画
 */

/** @typedef {{ fromRow: number, fromSlotId: string, fromOutputId?: string, toRow: number, toSlotId: string, toParamId: string }} Connection */

/** @type {Connection[]} */
let connections = [];

/** @type {HTMLElement|null} */
let rackEl = null;

/** @type {() => import('./rack.js').RackRow[]} */
let getRowsFn = null;

/** @type {(fromRow: number, fromSlotId: string, toRow: number, toSlotId: string, toParamId: string) => void} */
let onConnectFn = null;

/** @type {(fromRow: number, fromSlotId: string, toRow: number, toSlotId: string, toParamId: string) => void} */
let onDisconnectFn = null;

/** @type {SVGSVGElement|null} */
let svgEl = null;

/** @type {HTMLElement|null} */
let wrapEl = null;

const CABLE_COLOR = '#628878';
const CABLE_DROOP = 40;

/**
 * ジャック要素から行・スロットIDを取得
 * @param {HTMLElement} jack
 * @returns {{ rowIndex: number, slotId: string }|null}
 */
function getJackPosition(jack) {
  const slot = jack.closest('.synth-rack__slot');
  const row = jack.closest('.synth-rack__row');
  if (!slot || !row) return null;
  const rowIndex = parseInt(row.dataset.rowIndex ?? '-1', 10);
  const slotId = slot.dataset.instanceId ?? '';
  if (slotId === '' || rowIndex < 0) return null;
  return { rowIndex, slotId };
}

/**
 * 接続先の既存接続を解除してから新規接続
 * @param {string} [fromOutputId] - シーケンサ等の複数出力時（'pitch'|'gate' など）
 */
function addConnection(fromRow, fromSlotId, toRow, toSlotId, toParamId, fromOutputId) {
  removeConnectionTo(toRow, toSlotId, toParamId);
  connections.push({ fromRow, fromSlotId, fromOutputId: fromOutputId || undefined, toRow, toSlotId, toParamId });
  if (onConnectFn) onConnectFn(fromRow, fromSlotId, toRow, toSlotId, toParamId, fromOutputId);
  drawCables();
}

function removeConnectionTo(toRow, toSlotId, toParamId) {
  const prev = connections.find(
    (c) => c.toRow === toRow && c.toSlotId === toSlotId && c.toParamId === toParamId
  );
  if (prev) {
    connections = connections.filter((c) => c !== prev);
    if (onDisconnectFn) onDisconnectFn(prev.fromRow, prev.fromSlotId, toRow, toSlotId, toParamId, prev.fromOutputId);
  }
}

/**
 * スロット要素を取得（行インデックスと instanceId から）
 */
function getSlotElement(rowIndex, instanceId) {
  if (!getRowsFn) return null;
  const rows = getRowsFn();
  const row = rows[rowIndex];
  if (!row?._rowEl) return null;
  return row._rowEl.querySelector(`.synth-rack__slot[data-instance-id="${instanceId}"]`);
}

/**
 * 出力ジャック要素を取得
 * @param {string} [outputId] - 複数出力時（'pitch'|'gate' など）。省略時は最初の出力ジャック
 */
function getOutputJackEl(rowIndex, slotId, outputId) {
  const slot = getSlotElement(rowIndex, slotId);
  if (!slot) return null;
  if (outputId) return slot.querySelector(`.synth-jack--output[data-output-id="${outputId}"]`);
  return slot.querySelector('.synth-jack--output');
}

/**
 * 入力ジャック要素を取得
 */
function getInputJackEl(rowIndex, slotId, paramId) {
  const slot = getSlotElement(rowIndex, slotId);
  return slot?.querySelector(`.synth-jack--input[data-param-id="${paramId}"]`);
}

/**
 * ケーブルを描画（垂れ下がり曲線）
 */
function drawCables() {
  if (!svgEl || !rackEl || !getRowsFn) return;
  const rackRect = rackEl.getBoundingClientRect();
  const pathParts = [];

  const scrollW = rackEl.scrollWidth || rackRect.width;
  const scrollH = rackEl.scrollHeight || rackRect.height;
  if (wrapEl) {
    wrapEl.style.width = `${scrollW}px`;
    wrapEl.style.height = `${scrollH}px`;
  }
  svgEl.setAttribute('viewBox', `0 0 ${scrollW} ${scrollH}`);

  for (const c of connections) {
    const fromJack = getOutputJackEl(c.fromRow, c.fromSlotId, c.fromOutputId);
    const toJack = getInputJackEl(c.toRow, c.toSlotId, c.toParamId);
    if (!fromJack || !toJack) continue;

    const fromR = fromJack.getBoundingClientRect();
    const toR = toJack.getBoundingClientRect();
    const x1 = fromR.left - rackRect.left + rackEl.scrollLeft + fromR.width / 2;
    const y1 = fromR.top - rackRect.top + rackEl.scrollTop + fromR.height / 2;
    const x2 = toR.left - rackRect.left + rackEl.scrollLeft + toR.width / 2;
    const y2 = toR.top - rackRect.top + rackEl.scrollTop + toR.height / 2;

    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2 + CABLE_DROOP;
    const path = `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`;
    pathParts.push(`<path d="${path}" fill="none" stroke="${CABLE_COLOR}" stroke-width="3" class="synth-cable"/>`);
  }

  svgEl.innerHTML = pathParts.join('');
}

/**
 * ケーブルレイヤーを初期化
 * @param {HTMLElement} el - ラックコンテナ（position: relative 推奨）
 * @param {() => import('./rack.js').RackRow[]} getRows
 * @param {(fromRow: number, fromSlotId: string, toRow: number, toSlotId: string, toParamId: string) => void} onConnect
 * @param {(fromRow: number, fromSlotId: string, toRow: number, toSlotId: string, toParamId: string) => void} onDisconnect
 */
export function initCables(el, getRows, onConnect, onDisconnect) {
  rackEl = el;
  getRowsFn = getRows;
  onConnectFn = onConnect;
  onDisconnectFn = onDisconnect;

  wrapEl = document.createElement('div');
  wrapEl.className = 'synth-cables';
  wrapEl.setAttribute('aria-hidden', 'true');
  wrapEl.style.position = 'absolute';
  wrapEl.style.left = '0';
  wrapEl.style.top = '0';
  wrapEl.style.zIndex = '10';
  wrapEl.style.pointerEvents = 'none';
  svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.setAttribute('class', 'synth-cables__svg');
  wrapEl.appendChild(svgEl);
  el.style.position = 'relative';
  el.appendChild(wrapEl);

  const resizeObserver = new ResizeObserver(() => drawCables());
  resizeObserver.observe(el);
  el.addEventListener('scroll', drawCables);
  window.addEventListener('resize', drawCables);
  drawCables();
}

/**
 * 出力ジャック（モジュレータ用）を追加。ドラッグで接続元になる。
 * @param {HTMLElement} container - ジャックを入れる親要素
 * @param {string} [outputId] - 複数出力時（'pitch'|'gate' など）
 * @returns {HTMLElement}
 */
export function createOutputJack(container, outputId) {
  const jack = document.createElement('div');
  jack.className = 'synth-jack synth-jack--output';
  if (outputId) jack.dataset.outputId = outputId;
  jack.setAttribute('draggable', 'true');
  jack.title = outputId === 'gate' ? 'Drag to Trigger (envelope)' : 'Drag to connect to param';
  jack.setAttribute('aria-label', outputId ? `Output jack ${outputId}` : 'Output jack');

  jack.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    const pos = getJackPosition(jack);
    if (!pos) return;
    const payload = JSON.stringify({
      rowIndex: pos.rowIndex,
      slotId: pos.slotId,
      outputId: jack.dataset.outputId || 'default',
    });
    e.dataTransfer.setData('application/json', payload);
    e.dataTransfer.setData('text/plain', payload);
    e.dataTransfer.effectAllowed = 'link';
    try {
      e.dataTransfer.setDragImage(jack, 0, 0);
    } catch (_) {}
    jack.classList.add('synth-jack--dragging');
  });
  jack.addEventListener('dragend', () => jack.classList.remove('synth-jack--dragging'));

  container.appendChild(jack);
  return jack;
}

/**
 * 入力ジャック（パラメータ用）を追加。ここにドロップで接続。
 * @param {HTMLElement} container - ジャックを入れる親要素（パラメータ行など）
 * @param {string} paramId - getModulatableParams の id と一致させる
 * @returns {HTMLElement}
 */
export function createInputJack(container, paramId) {
  const jack = document.createElement('div');
  jack.className = 'synth-jack synth-jack--input';
  jack.dataset.paramId = paramId;
  jack.title = 'Drop to connect';
  jack.setAttribute('aria-label', `Input jack ${paramId}`);

  jack.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'link';
    jack.classList.add('synth-jack--drag-over');
  });
  jack.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'link';
    jack.classList.add('synth-jack--drag-over');
  });
  jack.addEventListener('dragleave', (e) => {
    if (!jack.contains(e.relatedTarget)) jack.classList.remove('synth-jack--drag-over');
  });
  jack.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    jack.classList.remove('synth-jack--drag-over');
    let raw = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
    let from;
    try {
      from = JSON.parse(raw);
    } catch (_) {
      return;
    }
    if (from == null || typeof from.rowIndex !== 'number' || typeof from.slotId !== 'string') return;
    const to = getJackPosition(jack);
    if (!to) return;
    addConnection(from.rowIndex, from.slotId, to.rowIndex, to.slotId, paramId, from.outputId);
  });

  container.appendChild(jack);
  return jack;
}

/**
 * 接続一覧を取得
 * @returns {Connection[]}
 */
export function getConnections() {
  return [...connections];
}

/**
 * 接続を追加（読み込み時など）。onConnect を呼び、ケーブルを描画
 * @param {string} [fromOutputId] - シーケンサ等の複数出力時（'pitch'|'gate' など）
 */
export function addConnectionFromLoad(fromRow, fromSlotId, toRow, toSlotId, toParamId, fromOutputId) {
  removeConnectionTo(toRow, toSlotId, toParamId);
  connections.push({ fromRow, fromSlotId, fromOutputId: fromOutputId || undefined, toRow, toSlotId, toParamId });
  if (onConnectFn) onConnectFn(fromRow, fromSlotId, toRow, toSlotId, toParamId, fromOutputId);
  drawCables();
}

/**
 * 全接続を解除（onDisconnect を各接続に対して呼ぶ）
 */
export function clearAllConnections() {
  const list = [...connections];
  connections.length = 0;
  for (const c of list) {
    if (onDisconnectFn) onDisconnectFn(c.fromRow, c.fromSlotId, c.toRow, c.toSlotId, c.toParamId, c.fromOutputId);
  }
  drawCables();
}

/**
 * 指定入力への接続を解除
 */
export function disconnectParam(toRow, toSlotId, toParamId) {
  removeConnectionTo(toRow, toSlotId, toParamId);
  drawCables();
}

/**
 * 指定スロットに関わる全接続を解除（モジュール削除時）
 * @param {number} rowIndex
 * @param {string} slotId
 */
export function removeConnectionsBySlot(rowIndex, slotId) {
  const toRemove = connections.filter(
    (c) =>
      (c.fromRow === rowIndex && c.fromSlotId === slotId) ||
      (c.toRow === rowIndex && c.toSlotId === slotId)
  );
  for (const c of toRemove) {
    connections = connections.filter((x) => x !== c);
    if (onDisconnectFn) onDisconnectFn(c.fromRow, c.fromSlotId, c.toRow, c.toSlotId, c.toParamId, c.fromOutputId);
  }
  drawCables();
}

/**
 * ケーブルを再描画（スクロール・リサイズ時に外部から呼ぶ場合）
 */
export function redrawCables() {
  drawCables();
}
