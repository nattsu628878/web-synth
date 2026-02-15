/**
 * pluck.js
 * Web Synth - Pluck (Karplus–Strong) 音源
 * トリガーでノイズを励起し、バッファ長でピッチ、減衰で持続を制御。ギター・キース風。
 */

import { formatParamValue, formatParamValueFreq } from '../base.js';
import { ensureAudioContext } from '../../audio-core.js';
import { attachWaveformViz } from '../../waveform-viz.js';
import { createInputJack } from '../../cables.js';

/** プレビュー用：AudioWorklet なしで同じ見た目の DOM を生成 */
function buildPluckDomOnly(silentGainNode) {
  const root = document.createElement('div');
  root.className = 'synth-module synth-module--pluck synth-module--source';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Pluck');
  const header = document.createElement('div');
  header.className = 'synth-module__header';
  const title = document.createElement('span');
  title.className = 'synth-module__title';
  title.textContent = pluckModule.meta.name;
  header.appendChild(title);
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'synth-module__remove';
  removeBtn.title = 'Remove';
  removeBtn.textContent = '×';
  header.appendChild(removeBtn);
  root.appendChild(header);
  const body = document.createElement('div');
  body.className = 'synth-module__body synth-module__body--controls';
  attachWaveformViz(body, silentGainNode);
  const freqRow = document.createElement('div');
  freqRow.className = 'synth-module__row';
  freqRow.innerHTML = `
    <label class="synth-module__label">Freq</label>
    <input type="range" class="synth-module__slider" data-param="freq" min="20" max="2000" value="440" step="1">
    <span class="synth-module__value">440 Hz</span>
  `;
  const freqJackWrap = document.createElement('div');
  freqJackWrap.className = 'synth-module__jack-wrap';
  createInputJack(freqJackWrap, 'frequency');
  freqRow.appendChild(freqJackWrap);
  body.appendChild(freqRow);
  const decayRow = document.createElement('div');
  decayRow.className = 'synth-module__row';
  decayRow.innerHTML = `
    <label class="synth-module__label">Decay</label>
    <input type="range" class="synth-module__slider" data-param="decay" min="30" max="99" value="50" step="1">
    <span class="synth-module__value">50 %</span>
  `;
  const decayJackWrap = document.createElement('div');
  decayJackWrap.className = 'synth-module__jack-wrap';
  createInputJack(decayJackWrap, 'damping');
  decayRow.appendChild(decayJackWrap);
  body.appendChild(decayRow);
  const gainRow = document.createElement('div');
  gainRow.className = 'synth-module__row';
  gainRow.innerHTML = `
    <label class="synth-module__label">Gain</label>
    <input type="range" class="synth-module__slider" data-param="gain" min="0" max="100" value="30" step="1">
    <span class="synth-module__value">30 %</span>
  `;
  const gainJackWrap = document.createElement('div');
  gainJackWrap.className = 'synth-module__jack-wrap';
  createInputJack(gainJackWrap, 'gain');
  gainRow.appendChild(gainJackWrap);
  body.appendChild(gainRow);
  const triggerRow = document.createElement('div');
  triggerRow.className = 'synth-module__row';
  triggerRow.innerHTML = `<button type="button" class="synth-module__trigger" data-param="trigger">Trigger</button>`;
  const triggerJackWrap = document.createElement('div');
  triggerJackWrap.className = 'synth-module__jack-wrap';
  createInputJack(triggerJackWrap, 'trigger');
  triggerRow.appendChild(triggerJackWrap);
  body.appendChild(triggerRow);
  root.appendChild(body);
  return root;
}

/** @type {import('../base.js').ModuleFactory} */
export const pluckModule = {
  meta: {
    id: 'pluck',
    name: 'Pluck',
    kind: 'source',
    description: 'Karplus–Strong pluck (Freq, Decay, Gain, Trigger)',
  },

  create(instanceId) {
    const isPreview = String(instanceId).startsWith('preview-');
    if (isPreview) {
      const ctx = ensureAudioContext();
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      return { element: buildPluckDomOnly(silentGain) };
    }
    const ctx = ensureAudioContext();
    const pluckNode = new AudioWorkletNode(ctx, 'pluck', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      parameterData: {
        frequency: 440,
        damping: 0.5,
      },
    });
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.3;
    pluckNode.connect(gainNode);

    const root = document.createElement('div');
    root.className = 'synth-module synth-module--pluck synth-module--source';
    root.dataset.moduleId = instanceId;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Pluck');

    const header = document.createElement('div');
    header.className = 'synth-module__header';
    const title = document.createElement('span');
    title.className = 'synth-module__title';
    title.textContent = pluckModule.meta.name;
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

    const viz = attachWaveformViz(body, gainNode);

    const freqRow = document.createElement('div');
    freqRow.className = 'synth-module__row';
    freqRow.innerHTML = `
      <label class="synth-module__label">Freq</label>
      <input type="range" class="synth-module__slider" data-param="freq" min="20" max="2000" value="440" step="1">
      <span class="synth-module__value">440 Hz</span>
    `;
    const freqJackWrap = document.createElement('div');
    freqJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(freqJackWrap, 'frequency');
    freqRow.appendChild(freqJackWrap);
    body.appendChild(freqRow);

    const decayRow = document.createElement('div');
    decayRow.className = 'synth-module__row';
    decayRow.innerHTML = `
      <label class="synth-module__label">Decay</label>
      <input type="range" class="synth-module__slider" data-param="decay" min="30" max="99" value="50" step="1">
      <span class="synth-module__value">50 %</span>
    `;
    const decayJackWrap = document.createElement('div');
    decayJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(decayJackWrap, 'damping');
    decayRow.appendChild(decayJackWrap);
    body.appendChild(decayRow);

    const gainRow = document.createElement('div');
    gainRow.className = 'synth-module__row';
    gainRow.innerHTML = `
      <label class="synth-module__label">Gain</label>
      <input type="range" class="synth-module__slider" data-param="gain" min="0" max="100" value="30" step="1">
      <span class="synth-module__value">30 %</span>
    `;
    const gainJackWrap = document.createElement('div');
    gainJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(gainJackWrap, 'gain');
    gainRow.appendChild(gainJackWrap);
    body.appendChild(gainRow);

    const triggerRow = document.createElement('div');
    triggerRow.className = 'synth-module__row';
    triggerRow.innerHTML = `<button type="button" class="synth-module__trigger" data-param="trigger">Trigger</button>`;
    const triggerJackWrap = document.createElement('div');
    triggerJackWrap.className = 'synth-module__jack-wrap';
    triggerJackWrap.title = 'Drop Gate (e.g. from Sequencer)';
    createInputJack(triggerJackWrap, 'trigger');
    triggerRow.appendChild(triggerJackWrap);
    body.appendChild(triggerRow);

    root.appendChild(body);

    const freqInput = body.querySelector('[data-param="freq"]');
    const freqValue = freqInput.nextElementSibling;
    const decayInput = body.querySelector('[data-param="decay"]');
    const decayValue = decayRow.querySelector('.synth-module__value');
    const gainInput = body.querySelector('[data-param="gain"]');
    const gainValue = gainRow.querySelector('.synth-module__value');
    const triggerBtn = body.querySelector('[data-param="trigger"]');

    function updateFreqLabel() {
      freqValue.textContent = `${formatParamValueFreq(freqInput.value)} Hz`;
    }
    function updateDecayLabel() {
      decayValue.textContent = `${formatParamValue(decayInput.value)} %`;
    }
    function updateGainLabel() {
      gainValue.textContent = `${formatParamValue(gainInput.value)} %`;
    }

    function fireTrigger() {
      pluckNode.port.postMessage({ type: 'trigger' });
    }

    freqInput.addEventListener('input', () => {
      const v = Number(freqInput.value);
      pluckNode.parameters.get('frequency').setTargetAtTime(v, ctx.currentTime, 0.01);
      updateFreqLabel();
    });
    decayInput.addEventListener('input', () => {
      const v = Number(decayInput.value) / 100;
      pluckNode.parameters.get('damping').setTargetAtTime(v, ctx.currentTime, 0.01);
      updateDecayLabel();
    });
    gainInput.addEventListener('input', () => {
      gainNode.gain.setTargetAtTime(Number(gainInput.value) / 100, ctx.currentTime, 0.01);
      updateGainLabel();
    });
    triggerBtn.addEventListener('click', fireTrigger);

    updateFreqLabel();
    updateDecayLabel();
    updateGainLabel();

    return {
      element: root,
      getAudioOutput() {
        return gainNode;
      },
      trigger() {
        fireTrigger();
      },
      reconnectWaveformViz() {
        viz.reconnect();
      },
      getModulatableParams() {
        return [
          { id: 'frequency', name: 'Freq', param: pluckNode.parameters.get('frequency'), modulationScale: 100 },
          { id: 'damping', name: 'Decay', param: pluckNode.parameters.get('damping'), modulationScale: 0.5 },
          { id: 'gain', name: 'Gain', param: gainNode.gain },
        ];
      },
      destroy() {
        viz.destroy();
        try {
          pluckNode.disconnect();
          gainNode.disconnect();
        } catch (_) {}
      },
    };
  },
};
