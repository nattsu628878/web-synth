/**
 * lfo.js
 * Web Synth - LFO（エンベロープ・LFO タイプ）
 * 低周波オシレータ。同じ段の音源・エフェクトのパラメータに接続可能。
 */

import { formatParamValue, formatParamValueFreq } from '../base.js';
import { ensureAudioContext } from '../../audio-core.js';
import { attachWaveformViz } from '../../waveform-viz.js';
import { createOutputJack } from '../../cables.js';

const WAVE_TYPES = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Tri' },
  { value: 'square', label: 'Square' },
  { value: 'sawtooth', label: 'Saw' },
];

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

    const viz = attachWaveformViz(body, depthGain);

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
