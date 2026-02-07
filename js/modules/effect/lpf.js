/**
 * lpf.js
 * Web Synth - LPF（1次/2次CRローパスフィルタ）
 * Order 1: -6 dB/oct, Order 2: -12 dB/oct, Order 4: -24 dB/oct
 */

import { ensureAudioContext } from '../../audio-core.js';
import { attachFilterResponseViz } from '../../filter-response-viz.js';
import { createInputJack } from '../../cables.js';

const FREQ_MIN = 20;
const FREQ_MAX = 20000;

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

/** プレビュー用：音声ノードなしで実モジュールと同じ見た目の DOM を生成 */
function buildLpfDomOnly(title, freqValue, freqLabel) {
  const root = document.createElement('div');
  root.className = 'synth-module synth-module--effect';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', title);
  const header = document.createElement('div');
  header.className = 'synth-module__header';
  const titleEl = document.createElement('span');
  titleEl.className = 'synth-module__title';
  titleEl.textContent = title;
  header.appendChild(titleEl);
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'synth-module__remove';
  removeBtn.textContent = '×';
  header.appendChild(removeBtn);
  root.appendChild(header);
  const body = document.createElement('div');
  body.className = 'synth-module__body synth-module__body--controls';
  const freqRow = document.createElement('div');
  freqRow.className = 'synth-module__row';
  freqRow.innerHTML = `
    <label class="synth-module__label">Freq</label>
    <input type="range" class="synth-module__slider" data-param="freq" min="0" max="100" value="${freqValue}" step="0.1">
    <span class="synth-module__value">${freqLabel}</span>
  `;
  const freqJackWrap = document.createElement('div');
  freqJackWrap.className = 'synth-module__jack-wrap';
  createInputJack(freqJackWrap, 'frequency');
  freqRow.appendChild(freqJackWrap);
  body.appendChild(freqRow);
  const orderRow = document.createElement('div');
  orderRow.className = 'synth-module__row';
  orderRow.innerHTML = `
    <label class="synth-module__label">Order</label>
    <select class="synth-module__select" data-param="order" aria-label="Filter order">
      <option value="1">1 (-6 dB/oct)</option>
      <option value="2">2 (-12 dB/oct)</option>
      <option value="4">4 (-24 dB/oct)</option>
    </select>
  `;
  body.appendChild(orderRow);
  const filterDescriptor = {
    type: 'lowpass',
    getOrder: () => 1,
    getCutoff: () => 2000,
    context: null,
  };
  attachFilterResponseViz(body, filterDescriptor, null);
  root.appendChild(body);
  return root;
}

/** @type {import('../base.js').ModuleFactory} */
export const lpfModule = {
  meta: {
    id: 'lpf',
    name: 'LPF',
    kind: 'effect',
    description: '1st/2nd-order RC low-pass filter (Freq, Order)',
  },

  create(instanceId) {
    const isPreview = String(instanceId).startsWith('preview-');
    if (isPreview) {
      return { element: buildLpfDomOnly('LPF', freqToValue(2000), formatFreq(2000)) };
    }
    const ctx = ensureAudioContext();
    const inputGain = ctx.createGain();
    inputGain.gain.value = 1;
    const filter1 = new AudioWorkletNode(ctx, 'one-pole-lpf', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      parameterData: { cutoff: 2000 },
    });
    const filter2 = new AudioWorkletNode(ctx, 'two-pole-lpf', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      parameterData: { cutoff: 2000 },
    });
    const filter4 = new AudioWorkletNode(ctx, 'four-pole-lpf', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      parameterData: { cutoff: 2000 },
    });
    const outputGain = ctx.createGain();
    outputGain.gain.value = 1;

    let order = 1;
    function route() {
      inputGain.disconnect();
      filter1.disconnect();
      filter2.disconnect();
      filter4.disconnect();
      if (order === 1) {
        inputGain.connect(filter1);
        filter1.connect(outputGain);
      } else if (order === 2) {
        inputGain.connect(filter2);
        filter2.connect(outputGain);
      } else {
        inputGain.connect(filter4);
        filter4.connect(outputGain);
      }
    }
    route();

    const root = document.createElement('div');
    root.className = 'synth-module synth-module--effect';
    root.dataset.moduleId = instanceId;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'LPF');

    const header = document.createElement('div');
    header.className = 'synth-module__header';
    const title = document.createElement('span');
    title.className = 'synth-module__title';
    title.textContent = lpfModule.meta.name;
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
      <input type="range" class="synth-module__slider" data-param="freq" min="0" max="100" value="${freqToValue(2000)}" step="0.1">
      <span class="synth-module__value">${formatFreq(2000)}</span>
    `;
    const freqJackWrap = document.createElement('div');
    freqJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(freqJackWrap, 'frequency');
    freqRow.appendChild(freqJackWrap);
    const freqInput = freqRow.querySelector('[data-param="freq"]');
    const freqValue = freqRow.querySelector('.synth-module__value');
    const setCutoff = (hz) => {
      filter1.parameters.get('cutoff').setTargetAtTime(hz, ctx.currentTime, 0.01);
      filter2.parameters.get('cutoff').setTargetAtTime(hz, ctx.currentTime, 0.01);
      filter4.parameters.get('cutoff').setTargetAtTime(hz, ctx.currentTime, 0.01);
      freqValue.textContent = formatFreq(hz);
    };
    freqInput.addEventListener('input', () => setCutoff(valueToFreq(freqInput.value)));
    body.appendChild(freqRow);

    const orderRow = document.createElement('div');
    orderRow.className = 'synth-module__row';
    orderRow.innerHTML = `
      <label class="synth-module__label">Order</label>
      <select class="synth-module__select" data-param="order" aria-label="Filter order">
        <option value="1">1 (-6 dB/oct)</option>
        <option value="2">2 (-12 dB/oct)</option>
        <option value="4">4 (-24 dB/oct)</option>
      </select>
    `;
    const orderSelect = orderRow.querySelector('[data-param="order"]');
    orderSelect.addEventListener('change', () => {
      order = parseInt(orderSelect.value, 10);
      route();
    });
    body.appendChild(orderRow);

    root.appendChild(body);

    const filterDescriptor = {
      type: 'lowpass',
      getOrder: () => order,
      getCutoff: () => valueToFreq(freqInput.value),
      context: ctx,
    };
    const viz = attachFilterResponseViz(body, filterDescriptor, outputGain);

    return {
      element: root,
      getAudioInput() { return inputGain; },
      getAudioOutput() { return outputGain; },
      getModulatableParams() {
        const param = order === 1 ? filter1.parameters.get('cutoff') : order === 2 ? filter2.parameters.get('cutoff') : filter4.parameters.get('cutoff');
        return [
          { id: 'frequency', name: 'Freq', param, modulationScale: 2000 },
        ];
      },
      destroy() {
        viz.destroy();
        try {
          inputGain.disconnect();
          filter1.disconnect();
          filter2.disconnect();
          filter4.disconnect();
          outputGain.disconnect();
        } catch (_) {}
      },
    };
  },
};
