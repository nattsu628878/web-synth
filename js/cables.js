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

const CABLE_COLOR_MODULATION_FALLBACK = '#628878';
const CABLE_COLOR_PITCH_FALLBACK = '#2e6b7c';
const CABLE_COLOR_GATE_FALLBACK = '#b8860b';
const CABLE_COLOR_SYNC_FALLBACK = '#721721';

function getCssCableColor(name, fallback) {
  if (typeof document === 'undefined' || !document.documentElement) return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--cable-${name}`).trim();
  return v || fallback;
}

/** ケーブル色を CSS 変数から取得（接続種別と対応） */
function getCableColorModulation() {
  return getCssCableColor('modulation', CABLE_COLOR_MODULATION_FALLBACK);
}
function getCableColorPitch() {
  return getCssCableColor('pitch', CABLE_COLOR_PITCH_FALLBACK);
}
function getCableColorGate() {
  return getCssCableColor('gate', CABLE_COLOR_GATE_FALLBACK);
}
function getCableColorSync() {
  return getCssCableColor('sync', CABLE_COLOR_SYNC_FALLBACK);
}

/** ケーブルの弛み（px）。変更可能 */
let cableDroop = 40;

/**
 * ジャック要素から行・スロットIDを取得
 * @param {HTMLElement} jack
 * @returns {{ rowIndex: number, slotId: string }|null}
 */
function getJackPosition(jack) {
  if (jack.closest('.synth-master-panel')) {
    return { rowIndex: -1, slotId: 'master' };
  }
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
  updateInputJackDraggable(toRow, toSlotId, toParamId);
  drawCables();
}

function removeConnectionTo(toRow, toSlotId, toParamId) {
  const prev = connections.find(
    (c) => c.toRow === toRow && c.toSlotId === toSlotId && c.toParamId === toParamId
  );
  if (prev) {
    connections = connections.filter((c) => c !== prev);
    if (onDisconnectFn) onDisconnectFn(prev.fromRow, prev.fromSlotId, toRow, toSlotId, toParamId, prev.fromOutputId);
    updateInputJackDraggable(toRow, toSlotId, toParamId);
  }
}

/** 接続の有無に応じて入力ジャックの draggable を更新（接続先を掴んで外す用） */
function updateInputJackDraggable(toRow, toSlotId, toParamId) {
  const jack = getInputJackEl(toRow, toSlotId, toParamId);
  if (!jack) return;
  const hasConn = connections.some(
    (c) => c.toRow === toRow && c.toSlotId === toSlotId && c.toParamId === toParamId
  );
  jack.draggable = hasConn;
  const dropTitle =
    toParamId === 'syncIn' ? 'Sync In (from Master BPM)' :
    toParamId === 'trigger' ? 'Trigger (from Gate)' :
    'Drop to connect';
  jack.title = hasConn ? 'Drag away to disconnect' : dropTitle;
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
  if (rowIndex === -1 && slotId === 'master') {
    return document.querySelector('.synth-master-panel .synth-jack--output[data-output-id="sync"]') || null;
  }
  const slot = getSlotElement(rowIndex, slotId);
  if (!slot) return null;
  if (outputId && outputId !== 'default') {
    const jack = slot.querySelector(`.synth-jack--output[data-output-id="${outputId}"]`);
    if (jack) return jack;
  }
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
    wrapEl.style.transform = `translate(${-rackEl.scrollLeft}px, ${-rackEl.scrollTop}px)`;
  }
  svgEl.setAttribute('viewBox', `0 0 ${scrollW} ${scrollH}`);

  function getCableStroke(c) {
    if (c.fromRow === -1 && c.fromSlotId === 'master' && c.fromOutputId === 'sync') return getCableColorSync();
    const outId = c.fromOutputId || 'default';
    if (outId === 'pitch') return getCableColorPitch();
    if (outId === 'gate') return getCableColorGate();
    return getCableColorModulation();
  }

  for (const c of connections) {
    const fromJack = getOutputJackEl(c.fromRow, c.fromSlotId, c.fromOutputId);
    const toJack = getInputJackEl(c.toRow, c.toSlotId, c.toParamId);
    if (!fromJack || !toJack) continue;

    const fromR = fromJack.getBoundingClientRect();
    const toR = toJack.getBoundingClientRect();
    const x1 = fromR.left - rackRect.left + (rackEl.scrollLeft || 0) + fromR.width / 2;
    const y1 = fromR.top - rackRect.top + (rackEl.scrollTop || 0) + fromR.height / 2;
    const x2 = toR.left - rackRect.left + (rackEl.scrollLeft || 0) + toR.width / 2;
    const y2 = toR.top - rackRect.top + (rackEl.scrollTop || 0) + toR.height / 2;

    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2 + cableDroop;
    const path = `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`;
    const stroke = getCableStroke(c);
    pathParts.push(`<path d="${path}" fill="none" stroke="${stroke}" stroke-width="3" class="synth-cable"/>`);
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
  wrapEl.style.inset = '0';
  wrapEl.style.zIndex = '10';
  wrapEl.style.pointerEvents = 'none'; // 常に透過＝ドロップは下のジャックで受け取る
  svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.setAttribute('class', 'synth-cables__svg');
  wrapEl.appendChild(svgEl);
  el.style.position = 'relative';
  el.appendChild(wrapEl);

  document.addEventListener('dragend', () => {
    rackEl?.querySelectorAll('.synth-jack--drag-over').forEach((j) => j.classList.remove('synth-jack--drag-over'));
  });

  document.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('application/json')) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });
  document.addEventListener('drop', (e) => {
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (data && data.type === 'disconnect' && typeof data.toRow === 'number' && data.toSlotId != null && data.toParamId != null) {
        removeConnectionTo(data.toRow, data.toSlotId, data.toParamId);
        drawCables();
        e.preventDefault();
      }
    } catch (_) {}
  });

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
  const typeClass =
    outputId === 'sync' ? 'synth-jack--sync' :
    outputId === 'pitch' ? 'synth-jack--pitch' :
    outputId === 'gate' ? 'synth-jack--gate' :
    'synth-jack--modulation';
  jack.className = `synth-jack synth-jack--output ${typeClass}`;
  if (outputId) jack.dataset.outputId = outputId;
  jack.setAttribute('draggable', 'true');
  const titles = {
    gate: 'Gate → Trigger (envelope)',
    pitch: 'Pitch → Freq',
    sync: 'Sync Out (drag to Sequencer Sync In)',
  };
  jack.title = titles[outputId] || 'Drag to connect to param';
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
/** Pitch 専用（Seq 出力先など）。ソースの周波数入力は modulation (#628878) */
const PITCH_PARAM_IDS = [];

export function createInputJack(container, paramId) {
  const jack = document.createElement('div');
  const typeClass =
    paramId === 'syncIn' ? 'synth-jack--sync' :
    paramId === 'trigger' ? 'synth-jack--gate' :
    PITCH_PARAM_IDS.includes(paramId) ? 'synth-jack--pitch' :
    'synth-jack--modulation';
  jack.className = `synth-jack synth-jack--input ${typeClass}`;
  jack.dataset.paramId = paramId;
  jack.draggable = false;
  const titles = {
    syncIn: 'Sync In (from Master BPM)',
    trigger: 'Trigger (from Gate)',
  };
  jack.title = titles[paramId] || 'Drop to connect';
  jack.setAttribute('aria-label', `Input jack ${paramId}`);

  jack.addEventListener('dragstart', (e) => {
    const pos = getJackPosition(jack);
    if (!pos) return;
    const hasConn = connections.some(
      (c) => c.toRow === pos.rowIndex && c.toSlotId === pos.slotId && c.toParamId === paramId
    );
    if (!hasConn) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'disconnect',
      toRow: pos.rowIndex,
      toSlotId: pos.slotId,
      toParamId: paramId,
    }));
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setDragImage(jack, 0, 0);
    } catch (_) {}
    jack.classList.add('synth-jack--dragging');
  });
  jack.addEventListener('dragend', () => jack.classList.remove('synth-jack--dragging'));

  jack.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'link';
    jack.classList.add('synth-jack--drag-over');
  });
  jack.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const raw = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
    let data;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (_) {
      data = null;
    }
    e.dataTransfer.dropEffect = (data && data.type === 'disconnect') ? 'move' : 'link';
    jack.classList.add('synth-jack--drag-over');
  });
  jack.addEventListener('dragleave', (e) => {
    if (!jack.contains(e.relatedTarget)) jack.classList.remove('synth-jack--drag-over');
  });
  jack.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    jack.classList.remove('synth-jack--drag-over');
    const raw = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
    let data;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (_) {
      data = null;
    }
    if (data && data.type === 'disconnect') {
      removeConnectionTo(data.toRow, data.toSlotId, data.toParamId);
      drawCables();
      return;
    }
    const from = data;
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
  updateInputJackDraggable(toRow, toSlotId, toParamId);
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
    updateInputJackDraggable(c.toRow, c.toSlotId, c.toParamId);
  }
  drawCables();
}

/**
 * ケーブルを再描画（スクロール・リサイズ時に外部から呼ぶ場合）
 */
export function redrawCables() {
  drawCables();
}

/** ケーブルの弛み（px）を取得 */
export function getCableDroop() {
  return cableDroop;
}

/** ケーブルの弛み（px）を設定。0〜100 程度を推奨 */
export function setCableDroop(value) {
  cableDroop = Math.max(0, Math.min(150, Number(value) || 0));
}
