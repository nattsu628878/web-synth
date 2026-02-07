/**
 * hpf-res.js
 * Web Synth - HPF Res（レゾナンス付きハイパスフィルタ）
 * BiquadFilterNode highpass。Freq とレゾナンス強度（Q）を変更可能。
 */

import { ensureAudioContext } from '../../audio-core.js';
import { attachFilterResponseViz } from '../../filter-response-viz.js';
import { createInputJack } from '../../cables.js';

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
function formatQ(q) {
  return q === 0 ? '0' : Number(q).toFixed(2);
}

/** @type {import('../base.js').ModuleFactory} */
export const hpfResModule = {
  meta: {
    id: 'hpf-res',
    name: 'HPF Res',
    kind: 'effect',
    description: 'High-pass filter with resonance (Freq, Res)',
  },

  create(instanceId) {
    const ctx = ensureAudioContext();
    const inputGain = ctx.createGain();
    inputGain.gain.value = 1;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 200;
    filter.Q.value = 1;
    const outputGain = ctx.createGain();
    outputGain.gain.value = 1;
    inputGain.connect(filter);
    filter.connect(outputGain);

    const root = document.createElement('div');
    root.className = 'synth-module synth-module--effect';
    root.dataset.moduleId = instanceId;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'HPF Res');

    const header = document.createElement('div');
    header.className = 'synth-module__header';
    const title = document.createElement('span');
    title.className = 'synth-module__title';
    title.textContent = hpfResModule.meta.name;
    header.appendChild(title);
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

    const freqRow = document.createElement('div');
    freqRow.className = 'synth-module__row';
    freqRow.innerHTML = `
      <label class="synth-module__label">Freq</label>
      <input type="range" class="synth-module__slider" data-param="freq" min="0" max="100" value="${freqToValue(200)}" step="0.1">
      <span class="synth-module__value">${formatFreq(200)}</span>
    `;
    const freqJackWrap = document.createElement('div');
    freqJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(freqJackWrap, 'frequency');
    freqRow.appendChild(freqJackWrap);
    const freqInput = freqRow.querySelector('[data-param="freq"]');
    const freqValue = freqRow.querySelector('.synth-module__value');
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
    resInput.addEventListener('input', () => {
      const q = Math.max(Q_MIN, Number(resInput.value));
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
      getModulatableParams() {
        return [
          { id: 'frequency', name: 'Freq', param: filter.frequency, modulationScale: 2000 },
          { id: 'q', name: 'Res', param: filter.Q, modulationScale: 10 },
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
