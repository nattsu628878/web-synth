/**
 * lpf-res.js
 * Web Synth - LPF Res（レゾナンス付きローパスフィルタ）
 * BiquadFilterNode lowpass。Freq とレゾナンス強度（Q）を変更可能。
 */

import { createModuleRoot, createModuleHeader } from '../base.js';
import { ensureAudioContext } from '../../audio-core.js';
import { attachFilterResponseViz } from '../../filter-response-viz.js';
import { createInputJack } from '../../cables.js';
import { paramToNorm, normToParam, PARAM_DEFS } from '../../param-utils.js';

const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const Q_MIN = 0.1;
const Q_MAX = 10;

function valueToFreq(v) {
  const x = Math.max(0, Math.min(100, Number(v))) / 100;
  return FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, x);
}
function freqToValue(hz) {
  const x = Math.log(Math.max(FREQ_MIN, Math.min(FREQ_MAX, hz)) / FREQ_MIN) / Math.log(FREQ_MAX / FREQ_MIN);
  return Math.round(x * 100);
}
function formatFreq(hz) {
  if (hz >= 1000) return `${(hz / 1000).toFixed(2)} kHz`;
  return `${Math.round(hz)} Hz`;
}
/** Hz → 0–1 対数 norm（バー表示をスライダーと統一） */
function freqToNorm01(hz) {
  const h = Math.max(FREQ_MIN, Math.min(FREQ_MAX, hz));
  return Math.log(h / FREQ_MIN) / Math.log(FREQ_MAX / FREQ_MIN);
}
/** 0–1 対数 norm → Hz */
function normToFreq(norm) {
  const n = Math.max(0, Math.min(1, norm));
  return FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, n);
}
function formatQ(q) {
  return q === 0 ? '0' : Number(q).toFixed(2);
}

/** @type {import('../base.js').ModuleFactory} */
export const lpfResModule = {
  meta: {
    id: 'lpf-res',
    name: 'LPF Res',
    kind: 'effect',
    description: 'Low-pass filter with resonance (Freq, Res)',
    previewDescription: 'Signal: audio in/out.\nResonant LPF; cutoff and Q.',
  },

  create(instanceId) {
    const ctx = ensureAudioContext();
    const inputGain = ctx.createGain();
    inputGain.gain.value = 1;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000;
    filter.Q.value = 1;
    const outputGain = ctx.createGain();
    outputGain.gain.value = 1;
    inputGain.connect(filter);
    filter.connect(outputGain);

    const root = createModuleRoot(instanceId, 'LPF Res', 'synth-module--effect');
    root.appendChild(createModuleHeader(lpfResModule.meta.name));

    const body = document.createElement('div');
    body.className = 'synth-module__body synth-module__body--controls';

    const freqRow = document.createElement('div');
    freqRow.className = 'synth-module__row';
    freqRow.innerHTML = `
      <label class="synth-module__label">Freq</label>
      <input type="range" class="synth-module__slider" data-param="freq" min="0" max="100" value="${freqToValue(2000)}" step="0.1">
      <span class="synth-module__value">${formatFreq(2000)}</span>
    `;
    const freqJackWrap = document.createElement('div');
    freqJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(freqJackWrap, 'frequency');
    freqRow.appendChild(freqJackWrap);
    const freqInput = freqRow.querySelector('[data-param="freq"]');
    const freqValue = freqRow.querySelector('.synth-module__value');
    const freqRange = [FREQ_MIN, FREQ_MAX];
    const freqDisplayRange = [0, 100];
    freqInput.addEventListener('input', () => {
      const hz = valueToFreq(freqInput.value);
      filter.frequency.setTargetAtTime(hz, ctx.currentTime, 0.01);
      freqValue.textContent = formatFreq(hz);
    });
    body.appendChild(freqRow);

    const resRow = document.createElement('div');
    resRow.className = 'synth-module__row';
    resRow.innerHTML = `
      <label class="synth-module__label">Res</label>
      <input type="range" class="synth-module__slider" data-param="res" min="${Q_MIN}" max="${Q_MAX}" value="1" step="0.01">
      <span class="synth-module__value">1.00</span>
    `;
    const resJackWrap = document.createElement('div');
    resJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(resJackWrap, 'q');
    resRow.appendChild(resJackWrap);
    const resInput = resRow.querySelector('[data-param="res"]');
    const resValue = resRow.querySelector('.synth-module__value');
    const qRange = [Q_MIN, Q_MAX];
    resInput.addEventListener('input', () => {
      const norm = paramToNorm(Number(resInput.value), qRange);
      const q = normToParam(norm, qRange);
      filter.Q.setTargetAtTime(q, ctx.currentTime, 0.01);
      resValue.textContent = formatQ(q);
    });
    body.appendChild(resRow);

    root.appendChild(body);
    const viz = attachFilterResponseViz(body, filter, outputGain);

    return {
      element: root,
      getAudioInput() { return inputGain; },
      getAudioOutput() { return outputGain; },
      getParamBaseNorm(paramId) {
        if (paramId === 'frequency') return freqToNorm01(filter.frequency.value);
        return undefined;
      },
      getParamDisplayValue(paramId) {
        if (paramId === 'frequency') return filter.frequency.value;
        return undefined;
      },
      getModulatableParams() {
        return [
          {
            id: 'frequency',
            name: 'Freq',
            param: filter.frequency,
            range: [0, 1],
            displayRange: [FREQ_MIN, FREQ_MAX],
            format: (v) => formatFreq(v),
            normToDisplayValue: (norm) => normToFreq(norm),
            toParamValue: (norm) => normToFreq(norm),
          },
          { id: 'q', name: 'Res', param: filter.Q, range: qRange, displayRange: qRange, format: (v) => formatQ(v) },
        ];
      },
      destroy() {
        viz.destroy();
        try {
          inputGain.disconnect();
          filter.disconnect();
          outputGain.disconnect();
        } catch (_) {}
      },
    };
  },
};
