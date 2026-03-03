/**
 * module-preview.js
 * モジュールプレビュー：ピッカー項目ホバー時に実際のモジュール（クローン）をそのまま表示し、
 * 枠に収まるよう大きさを自動調節する。実装はこのファイルに集約。
 */

import { getModuleFactory, replaceSlidersWithBars } from './rack.js';

const ID_INNER = 'modulePreviewInner';
const ID_PREVIEW = 'modulePreview';
const ID_DESCRIPTION = 'modulePreviewDescription';

let measurementBox = null;
let currentResizeObserver = null;

function getMeasurementBox() {
  if (!measurementBox) {
    measurementBox = document.createElement('div');
    measurementBox.className = 'module-preview-measurement';
    measurementBox.setAttribute('aria-hidden', 'true');
    measurementBox.style.cssText =
      'position:fixed;left:-9999px;top:0;width:600px;height:500px;pointer-events:none;visibility:hidden;';
    document.body.appendChild(measurementBox);
  }
  return measurementBox;
}

function getPreviewElements() {
  return {
    inner: document.getElementById(ID_INNER),
    preview: document.getElementById(ID_PREVIEW),
    description: document.getElementById(ID_DESCRIPTION),
  };
}

/**
 * プレビュー用コンテナの利用可能サイズを取得する
 */
function getPreviewContentSize() {
  const { inner, description } = getPreviewElements();
  const contentEl = inner?.parentElement;
  const boxW = Math.max(0, (contentEl?.clientWidth ?? 0) - 16);
  const boxH = Math.max(0, (contentEl?.clientHeight ?? 0) - (description?.offsetHeight ?? 72) - 16);
  return { boxW, boxH };
}

/**
 * クローンをプレビュー内に配置し、枠に収まるようスケールを適用する
 */
function placeAndScaleClone(clone, naturalW, naturalH) {
  const { inner } = getPreviewElements();
  if (!inner) return;

  const { boxW, boxH } = getPreviewContentSize();
  const scale =
    boxW > 0 && boxH > 0 ? Math.min(boxW / naturalW, boxH / naturalH, 2) : 1;

  inner.style.position = 'relative';
  inner.style.width = `${scale * naturalW}px`;
  inner.style.height = `${scale * naturalH}px`;

  clone.style.position = 'absolute';
  clone.style.left = '0';
  clone.style.top = '0';
  clone.style.width = `${naturalW}px`;
  clone.style.height = `${naturalH}px`;
  clone.style.transform = `scale(${scale})`;
  clone.style.transformOrigin = '0 0';

  drawSequencerPreviewCanvasIfAny(clone);
}

/**
 * シーケンサークローン内の canvas にプレビュー用の静的なグリッドを1回描画する。
 * cloneNode では canvas のビットマップはコピーされないため、クローン側は空なのでここで描き直す。
 */
function drawSequencerPreviewCanvasIfAny(clone) {
  const viz = clone.querySelector('.synth-module__waveform-viz--sequencer');
  if (!viz) return;
  const canvas = viz.querySelector('.synth-module__waveform-canvas');
  if (!canvas || !canvas.getContext) return;

  let stepCount = 0;
  let rows = 1;
  if (clone.classList.contains('synth-module--sequencer-8')) {
    stepCount = 8;
    rows = 1;
  } else if (clone.classList.contains('synth-module--sequencer-16')) {
    stepCount = 16;
    rows = 2;
  } else if (clone.classList.contains('synth-module--sequencer-32')) {
    stepCount = 32;
    rows = 4;
  } else {
    return;
  }

  const wrapper = canvas.parentElement;
  const w = wrapper ? wrapper.offsetWidth : 200;
  const h = wrapper ? wrapper.offsetHeight : 72;
  if (w <= 0 || h <= 0) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const cols = rows > 1 ? stepCount / rows : stepCount;
  const padding = 2;
  const innerW = w - padding * 2;
  const innerH = h - padding * 2;
  const colW = innerW / cols;
  const rowH = innerH / rows;
  const barColor = 'rgba(98, 136, 120, 0.5)';

  const depthPct = 100;
  const depthLineY = padding + innerH * (1 - depthPct / 100);
  ctx.strokeStyle = '#628878';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padding, depthLineY);
  ctx.lineTo(w - padding, depthLineY);
  ctx.stroke();

  for (let i = 0; i < stepCount; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = padding + col * colW;
    const y = padding + row * rowH;
    const pct = i === 0 ? 0.5 : 0;
    const barH = Math.max(2, rowH * pct);
    ctx.fillStyle = barColor;
    ctx.fillRect(x + 1, y + rowH - barH, colW - 2, barH);
  }
}

/**
 * 指定 typeId のモジュールプレビューを表示する。
 * 実際のモジュールを create してその element をクローンし、そのままプレビューに貼り付けて表示する。
 * 表示サイズはプレビュー枠に収まるよう自動で調節する。
 */
export function showModulePreview(typeId) {
  const { inner, preview, description } = getPreviewElements();
  if (!inner || !preview) return;

  const factory = getModuleFactory(typeId);
  if (!factory) return;

  try {
    const instance = factory.create(`preview-${typeId}-${Date.now()}`);
    if (!instance?.element) return;

    const clone = instance.element.cloneNode(true);
    clone.classList.add('synth-module--preview');
    replaceSlidersWithBars(clone);

    const box = getMeasurementBox();
    box.innerHTML = '';
    box.appendChild(clone);

    inner.innerHTML = '';
    preview.classList.add('module-preview--active');

    const desc = factory.meta.previewDescription ?? factory.meta.description ?? '';
    if (description) description.textContent = desc;

    inner.style.position = '';
    inner.style.width = '';
    inner.style.height = '';
    inner.style.transform = '';

    requestAnimationFrame(() => {
      const w = clone.offsetWidth || 1;
      const h = clone.offsetHeight || 1;
      box.removeChild(clone);
      inner.appendChild(clone);
      placeAndScaleClone(clone, w, h);

      const contentEl = inner.parentElement;
      if (contentEl && typeof ResizeObserver !== 'undefined') {
        if (currentResizeObserver) currentResizeObserver.disconnect();
        currentResizeObserver = new ResizeObserver(() => placeAndScaleClone(clone, w, h));
        currentResizeObserver.observe(contentEl);
      }
    });
  } catch (_) {
    inner.innerHTML = '';
    preview.classList.remove('module-preview--active');
  }
}

/**
 * プレビューをクリアする
 */
export function clearModulePreview() {
  const { inner, preview, description } = getPreviewElements();
  if (preview) preview.classList.remove('module-preview--active');
  if (description) description.textContent = '';
  if (inner) {
    if (currentResizeObserver) {
      currentResizeObserver.disconnect();
      currentResizeObserver = null;
    }
    inner.innerHTML = '';
    inner.style.width = '';
    inner.style.height = '';
    inner.style.position = '';
  }
}

/**
 * ピッカーコンテナ内の .synth-picker__item にホバーでプレビュー表示・非表示をバインドする
 */
export function bindModulePreviewToPicker(container) {
  if (!container) return;
  container.querySelectorAll('.synth-picker__item').forEach((btn) => {
    const typeId = btn.dataset.typeId;
    if (!typeId) return;
    btn.addEventListener('mouseenter', () => showModulePreview(typeId));
    btn.addEventListener('mouseleave', () => clearModulePreview());
  });
}
