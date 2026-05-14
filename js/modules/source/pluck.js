/**
 * pluck.js
 * Web Synth - Pluck (Karplus–Strong) 音源
 * トリガーでノイズを励起し、バッファ長でピッチ、減衰で持続を制御。ギター・キース風。
 */

import { formatParamValue, createModuleRoot, createModuleHeader } from '../base.js';
import { ensureAudioContext } from '../../audio-core.js';
import { attachWaveformViz } from '../../waveform-viz.js';
import { createInputJack } from '../../cables.js';
import { paramToNorm, normToParam, PARAM_DEFS, ParamFormat } from '../../param-utils.js';

/** プレビュー用：AudioWorklet なしで同じ見た目の DOM を生成 */
function buildPluckDomOnly(silentGainNode) {
  const root = createModuleRoot(null, 'Pluck', 'synth-module--pluck', 'synth-module--source');
  root.appendChild(createModuleHeader(pluckModule.meta.name));
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
    previewDescription: 'Signal: 1 audio out, gate in.\nPluck; trigger starts note.',
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

    const root = createModuleRoot(instanceId, 'Pluck', 'synth-module--pluck', 'synth-module--source');
    root.appendChild(createModuleHeader(pluckModule.meta.name));

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
      freqValue.textContent = `${formatParamValue(freqInput.value)} Hz`;
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

    const freqRange = [20, 2000];
    const decayDisplayRange = [30, 99];
    const decayParamRange = [0, 1];
    const gainDef = PARAM_DEFS.gain;
    freqInput.addEventListener('input', () => {
      const norm = paramToNorm(Number(freqInput.value), freqRange);
      pluckNode.parameters.get('frequency').setTargetAtTime(normToParam(norm, freqRange), ctx.currentTime, 0.01);
      updateFreqLabel();
    });
    decayInput.addEventListener('input', () => {
      const norm = paramToNorm(Number(decayInput.value), decayDisplayRange);
      pluckNode.parameters.get('damping').setTargetAtTime(normToParam(norm, decayParamRange), ctx.currentTime, 0.01);
      updateDecayLabel();
    });
    gainInput.addEventListener('input', () => {
      const norm = paramToNorm(Number(gainInput.value), gainDef.displayRange);
      gainNode.gain.setTargetAtTime(normToParam(norm, gainDef.range), ctx.currentTime, 0.01);
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
          { id: 'frequency', name: 'Freq', param: pluckNode.parameters.get('frequency'), range: freqRange, displayRange: freqRange, format: ParamFormat.freq },
          { id: 'damping', name: 'Decay', param: pluckNode.parameters.get('damping'), range: decayParamRange, displayRange: decayDisplayRange, format: ParamFormat.percent },
          { id: 'gain', name: 'Gain', param: gainNode.gain, ...PARAM_DEFS.gain },
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
