/**
 * waveform-generator.js
 * Web Synth - 純粋な波形ジェネレータ（sine / square / sawtooth / triangle）
 */

import { formatParamValue, createModuleRoot, createModuleHeader } from '../base.js';
import { ensureAudioContext } from '../../audio-core.js';
import { attachWaveformViz } from '../../waveform-viz.js';
import { createInputJack } from '../../cables.js';
import { paramToNorm, normToParam, PARAM_DEFS, ParamFormat } from '../../param-utils.js';

const WAVE_TYPES = [
  { value: 'sine', label: 'Sine' },
  { value: 'square', label: 'Square' },
  { value: 'sawtooth', label: 'Saw' },
  { value: 'triangle', label: 'Tri' },
];

/** @type {import('../base.js').ModuleFactory} */
export const waveformGeneratorModule = {
  meta: {
    id: 'waveform',
    name: 'Osc',
    kind: 'source',
    description: 'Oscillator (sine / square / sawtooth / triangle)',
    previewDescription: 'Signal: 1 audio out.\nBasic oscillator; freq and gain.',
  },

  create(instanceId) {
    const ctx = ensureAudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.3;
    osc.connect(gainNode);

    const root = createModuleRoot(instanceId, 'Oscillator', 'synth-module--waveform', 'synth-module--source');
    root.appendChild(createModuleHeader(waveformGeneratorModule.meta.name));

    const body = document.createElement('div');
    body.className = 'synth-module__body synth-module__body--controls';

    const viz = attachWaveformViz(body, gainNode);

    const waveRow = document.createElement('div');
    waveRow.className = 'synth-module__row';
    const waveLabel = document.createElement('label');
    waveLabel.className = 'synth-module__label';
    waveLabel.textContent = 'Wave';
    const waveSelect = document.createElement('select');
    waveSelect.className = 'synth-module__select';
    waveSelect.dataset.param = 'type';
    for (const w of WAVE_TYPES) {
      const opt = document.createElement('option');
      opt.value = w.value;
      opt.textContent = w.label;
      waveSelect.appendChild(opt);
    }
    waveRow.appendChild(waveLabel);
    waveRow.appendChild(waveSelect);
    body.appendChild(waveRow);

    const freqRow = document.createElement('div');
    freqRow.className = 'synth-module__row';
    const freqLabel = document.createElement('label');
    freqLabel.className = 'synth-module__label';
    freqLabel.textContent = 'Freq';
    const freqInput = document.createElement('input');
    freqInput.type = 'range';
    freqInput.className = 'synth-module__slider';
    freqInput.setAttribute('data-param', 'freq');
    freqInput.min = '20';
    freqInput.max = '20000';
    freqInput.step = '1';
    freqInput.value = '440';
    const freqValue = document.createElement('span');
    freqValue.className = 'synth-module__value';
    freqValue.textContent = '440 Hz';
    freqRow.appendChild(freqLabel);
    freqRow.appendChild(freqInput);
    freqRow.appendChild(freqValue);
    const freqJackWrap = document.createElement('div');
    freqJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(freqJackWrap, 'frequency');
    freqRow.appendChild(freqJackWrap);
    body.appendChild(freqRow);

    const gainRow = document.createElement('div');
    gainRow.className = 'synth-module__row';
    const gainLabel = document.createElement('label');
    gainLabel.className = 'synth-module__label';
    gainLabel.textContent = 'Gain';
    const gainInput = document.createElement('input');
    gainInput.type = 'range';
    gainInput.className = 'synth-module__slider';
    gainInput.setAttribute('data-param', 'gain');
    gainInput.min = '0';
    gainInput.max = '100';
    gainInput.step = '1';
    gainInput.value = '30';
    const gainValue = document.createElement('span');
    gainValue.className = 'synth-module__value';
    gainValue.textContent = '30 %';
    gainRow.appendChild(gainLabel);
    gainRow.appendChild(gainInput);
    gainRow.appendChild(gainValue);
    const gainJackWrap = document.createElement('div');
    gainJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(gainJackWrap, 'gain');
    gainRow.appendChild(gainJackWrap);
    body.appendChild(gainRow);

    root.appendChild(body);

    function updateFreqLabel() {
      freqValue.textContent = `${formatParamValue(freqInput.value)} Hz`;
    }
    function updateGainLabel() {
      gainValue.textContent = `${formatParamValue(gainInput.value)} %`;
    }

    waveSelect.addEventListener('change', () => {
      osc.type = waveSelect.value;
    });
    const freqRange = [20, 20000];
    const gainDef = PARAM_DEFS.gain;
    freqInput.addEventListener('input', () => {
      const norm = paramToNorm(Number(freqInput.value), freqRange);
      osc.frequency.setTargetAtTime(normToParam(norm, freqRange), ctx.currentTime, 0.01);
      updateFreqLabel();
    });
    gainInput.addEventListener('input', () => {
      const norm = paramToNorm(Number(gainInput.value), gainDef.displayRange);
      gainNode.gain.setTargetAtTime(normToParam(norm, gainDef.range), ctx.currentTime, 0.01);
      updateGainLabel();
    });

    osc.type = waveSelect.value;
    osc.frequency.value = 440;
    osc.start(ctx.currentTime);
    updateFreqLabel();
    updateGainLabel();

    return {
      element: root,
      getAudioOutput() {
        return gainNode;
      },
      reconnectWaveformViz() {
        viz.reconnect();
      },
      getModulatableParams() {
        return [
          { id: 'frequency', name: 'Freq', param: osc.frequency, range: [20, 20000], displayRange: [20, 20000], format: ParamFormat.freq },
          { id: 'gain', name: 'Gain', param: gainNode.gain, ...PARAM_DEFS.gain },
        ];
      },
      destroy() {
        viz.destroy();
        try {
          osc.stop();
          osc.disconnect();
          gainNode.disconnect();
        } catch (_) {}
      },
    };
  },
};
