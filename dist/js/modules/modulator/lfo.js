/**
 * lfo.js
 * Web Synth - LFO（エンベロープ・LFO タイプ）
 * 低周波オシレータ。同じ段の音源・エフェクトのパラメータに接続可能。
 * 窓に LFO 波形と現在位置を表示。
 */

import { formatParamValue, formatParamValueFreq } from '../base.js';
import { ensureAudioContext } from '../../audio-core.js';
import { createOutputJack } from '../../cables.js';

const WAVE_TYPES = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Tri' },
  { value: 'square', label: 'Square' },
  { value: 'sawtooth', label: 'Saw' },
];

/** 波形タイプと位相(0..2π)から値(-1..1)を返す */
function waveValueAt(type, phase) {
  const t = phase / (2 * Math.PI);
  switch (type) {
    case 'sine':
      return Math.sin(phase);
    case 'triangle':
      return t < 0.25 ? t * 4 : t < 0.75 ? 2 - t * 4 : t * 4 - 4;
    case 'square':
      return phase < Math.PI ? 1 : -1;
    case 'sawtooth':
      return t * 2 - 1;
    default:
      return Math.sin(phase);
  }
}

/**
 * LFO 専用ビジュアライザ: 1周期の波形を描画し、現在位置を軌跡＋マーカーで表示
 */
function attachLfoViz(container, getWaveType, getFreqHz) {
  const wrapper = document.createElement('div');
  wrapper.className = 'synth-module__waveform-viz synth-module__waveform-viz--lfo';
  const canvas = document.createElement('canvas');
  canvas.className = 'synth-module__waveform-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  wrapper.appendChild(canvas);
  container.insertBefore(wrapper, container.firstChild);

  const dpr = window.devicePixelRatio || 1;
  let rafId = null;
  let phase = 0;
  let lastTime = performance.now() / 1000;

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

    const toX = (t) => padding + t * graphW;
    const toY = (v) => baseY - v * scaleY;

    const waveType = getWaveType();
    const freqHz = Math.max(0.1, getFreqHz());

    const now = performance.now() / 1000;
    const dt = Math.min(0.1, now - lastTime);
    lastTime = now;
    phase += 2 * Math.PI * freqHz * dt;
    if (phase >= 2 * Math.PI) phase -= 2 * Math.PI;
    if (phase < 0) phase += 2 * Math.PI;

    const steps = 64;
    cctx.strokeStyle = 'rgba(98, 136, 120, 0.35)';
    cctx.lineWidth = 1.5;
    cctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const p = (i / steps) * 2 * Math.PI;
      const v = waveValueAt(waveType, p);
      const x = toX(i / steps);
      const y = toY(v);
      if (i === 0) cctx.moveTo(x, y);
      else cctx.lineTo(x, y);
    }
    cctx.stroke();

    const phaseNorm = phase / (2 * Math.PI);
    const currentVal = waveValueAt(waveType, phase);

    cctx.strokeStyle = '#628878';
    cctx.lineWidth = 2;
    cctx.beginPath();
    for (let i = 0; i <= steps * phaseNorm; i++) {
      const p = (i / steps) * 2 * Math.PI;
      const v = waveValueAt(waveType, p);
      const x = toX(i / steps);
      const y = toY(v);
      if (i === 0) cctx.moveTo(x, y);
      else cctx.lineTo(x, y);
    }
    cctx.lineTo(toX(phaseNorm), toY(currentVal));
    cctx.stroke();

    cctx.fillStyle = '#628878';
    cctx.beginPath();
    cctx.arc(toX(phaseNorm), toY(currentVal), 3, 0, Math.PI * 2);
    cctx.fill();
    cctx.strokeStyle = 'rgba(255,255,255,0.8)';
    cctx.lineWidth = 1;
    cctx.stroke();

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
export const lfoModule = {
  meta: {
    id: 'lfo',
    name: 'LFO',
    kind: 'modulator',
    description: 'LFO (connect to params via cable)',
  },

  create(instanceId) {
    const ctx = ensureAudioContext();
    const osc = ctx.createOscillator();
    const depthGain = ctx.createGain();
    depthGain.gain.value = 0;
    osc.connect(depthGain);
    osc.type = 'sine';
    osc.frequency.value = 2;
    osc.start(ctx.currentTime);

    const root = document.createElement('div');
    root.className = 'synth-module synth-module--modulator';
    root.dataset.moduleId = instanceId;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'LFO');

    const header = document.createElement('div');
    header.className = 'synth-module__header';
    const title = document.createElement('span');
    title.className = 'synth-module__title';
    title.textContent = lfoModule.meta.name;
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
    const waveRow = document.createElement('div');
    waveRow.className = 'synth-module__row';
    waveRow.innerHTML = '<label class="synth-module__label">Wave</label><select class="synth-module__select" data-param="type"></select>';
    const typeSelect = waveRow.querySelector('[data-param="type"]');
    WAVE_TYPES.forEach((w) => {
      const opt = document.createElement('option');
      opt.value = w.value;
      opt.textContent = w.label;
      typeSelect.appendChild(opt);
    });
    body.appendChild(waveRow);
    const freqRow = document.createElement('div');
    freqRow.className = 'synth-module__row';
    freqRow.innerHTML = '<label class="synth-module__label">Rate</label><input type="range" class="synth-module__slider" data-param="freq" min="0.1" max="20" step="0.1" value="2"><span class="synth-module__value">2 Hz</span>';
    body.appendChild(freqRow);
    const depthRow = document.createElement('div');
    depthRow.className = 'synth-module__row';
    depthRow.innerHTML = '<label class="synth-module__label">Depth</label><input type="range" class="synth-module__slider" data-param="depth" min="0" max="100" value="0"><span class="synth-module__value">0 %</span>';
    body.appendChild(depthRow);
    root.appendChild(body);

    const freqInput = body.querySelector('[data-param="freq"]');
    const freqValue = body.querySelectorAll('.synth-module__value')[0];
    const depthInput = body.querySelector('[data-param="depth"]');
    const depthValue = body.querySelectorAll('.synth-module__value')[1];

    typeSelect.addEventListener('change', () => {
      osc.type = typeSelect.value;
    });
    freqInput.addEventListener('input', () => {
      osc.frequency.setTargetAtTime(Number(freqInput.value), ctx.currentTime, 0.01);
      freqValue.textContent = `${formatParamValueFreq(freqInput.value)} Hz`;
    });
    depthInput.addEventListener('input', () => {
      const v = Number(depthInput.value) / 100;
      depthGain.gain.setTargetAtTime(v, ctx.currentTime, 0.01);
      depthValue.textContent = `${formatParamValue(depthInput.value)} %`;
    });
    freqValue.textContent = `${formatParamValueFreq(freqInput.value)} Hz`;
    depthValue.textContent = `${formatParamValue(depthInput.value)} %`;

    const viz = attachLfoViz(body, () => typeSelect.value, () => Number(freqInput.value) || 2);

    return {
      element: root,
      getModulationOutput() {
        return depthGain;
      },
      destroy() {
        viz.destroy();
        try {
          osc.stop();
          osc.disconnect();
          depthGain.disconnect();
        } catch (_) {}
      },
    };
  },
};
