/**
 * random-lfo.js
 * Web Synth - Random LFO（サンプル＆ホールド風）
 * 一定間隔で新しいランダム値に切り替え。パラメータにケーブル接続可能。
 * 窓にステップ状の波形と現在位置を表示。
 */

import { formatParamValue, formatParamValueFreq } from '../base.js';
import { ensureAudioContext } from '../../audio-core.js';
import { createOutputJack } from '../../cables.js';

/** -1 〜 1 のバイポーラ乱数 */
function randomBipolar() {
  return Math.random() * 2 - 1;
}

const RANDOM_LFO_HISTORY_LENGTH = 80;

/**
 * Random LFO 専用ビジュアライザ: 過去の値をステップ状に描画し、現在位置を右端に表示
 */
function attachRandomLfoViz(container, getHistory, getValue) {
  const wrapper = document.createElement('div');
  wrapper.className = 'synth-module__waveform-viz synth-module__waveform-viz--random-lfo';
  const canvas = document.createElement('canvas');
  canvas.className = 'synth-module__waveform-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  wrapper.appendChild(canvas);
  container.insertBefore(wrapper, container.firstChild);

  const dpr = window.devicePixelRatio || 1;
  let rafId = null;

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) {
      rafId = requestAnimationFrame(draw);
      return;
    }
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const cctx = canvas.getContext('2d');
    if (!cctx) {
      rafId = requestAnimationFrame(draw);
      return;
    }
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cctx.clearRect(0, 0, w, h);

    const padding = 2;
    const graphW = w - padding * 2;
    const graphH = h - padding * 2;
    const baseY = padding + graphH / 2;
    const scaleY = graphH / 2;
    const toY = (v) => baseY - v * scaleY;

    const history = getHistory();
    const currentVal = getValue();
    const len = history.length;

    if (len > 0) {
      const maxLen = RANDOM_LFO_HISTORY_LENGTH;
      cctx.strokeStyle = 'rgba(98, 136, 120, 0.35)';
      cctx.lineWidth = 1.5;
      cctx.beginPath();
      for (let i = 0; i < len; i++) {
        const x = padding + (i / maxLen) * graphW;
        const v = history[i];
        const y = toY(v);
        if (i === 0) cctx.moveTo(x, y);
        else cctx.lineTo(x, y);
        if (i < len - 1) {
          const nextX = padding + ((i + 1) / maxLen) * graphW;
          cctx.lineTo(nextX, y);
        }
      }
      cctx.stroke();

      cctx.strokeStyle = '#628878';
      cctx.lineWidth = 2;
      cctx.beginPath();
      for (let i = 0; i < len; i++) {
        const x = padding + (i / maxLen) * graphW;
        const v = history[i];
        const y = toY(v);
        if (i === 0) cctx.moveTo(x, y);
        else cctx.lineTo(x, y);
        if (i < len - 1) {
          const nextX = padding + ((i + 1) / maxLen) * graphW;
          cctx.lineTo(nextX, y);
        }
      }
      cctx.stroke();

      const curX = padding + ((len - 1) / maxLen) * graphW;
      const curY = toY(currentVal);
      cctx.fillStyle = '#628878';
      cctx.beginPath();
      cctx.arc(curX, curY, 3, 0, Math.PI * 2);
      cctx.fill();
      cctx.strokeStyle = 'rgba(255,255,255,0.8)';
      cctx.lineWidth = 1;
      cctx.stroke();
    }

    rafId = requestAnimationFrame(draw);
  }

  rafId = requestAnimationFrame(draw);

  return {
    destroy() {
      if (rafId != null) cancelAnimationFrame(rafId);
      wrapper.remove();
    },
  };
}

/** @type {import('../base.js').ModuleFactory} */
export const randomLfoModule = {
  meta: {
    id: 'random-lfo',
    name: 'Random LFO',
    kind: 'modulator',
    description: 'Sample & hold style random LFO (Rate, Depth)',
  },

  create(instanceId) {
    const ctx = ensureAudioContext();
    const constantSource = ctx.createConstantSource();
    constantSource.offset.value = 0;
    constantSource.start(ctx.currentTime);

    const depthGain = ctx.createGain();
    depthGain.gain.value = 0;
    constantSource.connect(depthGain);

    const root = document.createElement('div');
    root.className = 'synth-module synth-module--modulator';
    root.dataset.moduleId = instanceId;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Random LFO');

    const header = document.createElement('div');
    header.className = 'synth-module__header';
    const title = document.createElement('span');
    title.className = 'synth-module__title';
    title.textContent = randomLfoModule.meta.name;
    header.appendChild(title);
    const headerJacks = document.createElement('div');
    headerJacks.className = 'synth-module__header-jacks';
    createOutputJack(headerJacks);
    header.appendChild(headerJacks);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'synth-module__remove';
    removeBtn.title = 'Remove';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', 'Remove module');
    header.appendChild(removeBtn);
    root.appendChild(header);

    const body = document.createElement('div');
    body.className = 'synth-module__body synth-module__body--controls';

    const rateRow = document.createElement('div');
    rateRow.className = 'synth-module__row';
    rateRow.innerHTML = `
      <label class="synth-module__label">Rate</label>
      <input type="range" class="synth-module__slider" data-param="rate" min="0.1" max="20" step="0.1" value="2">
      <span class="synth-module__value">2 Hz</span>
    `;
    body.appendChild(rateRow);

    const depthRow = document.createElement('div');
    depthRow.className = 'synth-module__row';
    depthRow.innerHTML = `
      <label class="synth-module__label">Depth</label>
      <input type="range" class="synth-module__slider" data-param="depth" min="0" max="100" value="0">
      <span class="synth-module__value">0 %</span>
    `;
    body.appendChild(depthRow);

    root.appendChild(body);

    const rateInput = body.querySelector('[data-param="rate"]');
    const rateValue = rateRow.querySelector('.synth-module__value');
    const depthInput = body.querySelector('[data-param="depth"]');
    const depthValue = depthRow.querySelector('.synth-module__value');

    let intervalId = null;
    let currentValue = 0;
    const history = [];

    function scheduleNext() {
      currentValue = randomBipolar();
      constantSource.offset.setTargetAtTime(currentValue, ctx.currentTime, 0.005);
      history.push(currentValue);
      if (history.length > RANDOM_LFO_HISTORY_LENGTH) history.shift();
    }

    function startInterval() {
      if (intervalId != null) clearInterval(intervalId);
      const rateHz = Math.max(0.1, Math.min(20, Number(rateInput.value) || 2));
      const periodMs = 1000 / rateHz;
      scheduleNext();
      intervalId = setInterval(scheduleNext, periodMs);
    }

    rateInput.addEventListener('input', () => {
      rateValue.textContent = `${formatParamValueFreq(rateInput.value)} Hz`;
      startInterval();
    });
    depthInput.addEventListener('input', () => {
      const v = Number(depthInput.value) / 100;
      depthGain.gain.setTargetAtTime(v, ctx.currentTime, 0.01);
      depthValue.textContent = `${formatParamValue(depthInput.value)} %`;
    });

    rateValue.textContent = `${formatParamValueFreq(rateInput.value)} Hz`;
    depthValue.textContent = `${formatParamValue(depthInput.value)} %`;

    startInterval();

    const viz = attachRandomLfoViz(
      body,
      () => [...history],
      () => currentValue
    );

    return {
      element: root,
      getModulationOutput() {
        return depthGain;
      },
      destroy() {
        if (intervalId != null) {
          clearInterval(intervalId);
          intervalId = null;
        }
        viz.destroy();
        try {
          constantSource.stop();
          constantSource.disconnect();
          depthGain.disconnect();
        } catch (_) {}
      },
    };
  },
};
