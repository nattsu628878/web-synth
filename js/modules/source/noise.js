/**
 * noise.js
 * Web Synth - ホワイトノイズ音源
 */

import { formatParamValue } from '../base.js';
import { ensureAudioContext } from '../../audio-core.js';
import { attachWaveformViz } from '../../waveform-viz.js';
import { createInputJack } from '../../cables.js';

/** @type {import('../base.js').ModuleFactory} */
export const noiseModule = {
  meta: {
    id: 'noise',
    name: 'Noise',
    kind: 'source',
    description: 'White noise source',
  },

  create(instanceId) {
    const ctx = ensureAudioContext();
    const sampleRate = ctx.sampleRate;
    const duration = 2;
    const length = sampleRate * duration;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;
    noiseSource.start(ctx.currentTime);

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.3;
    noiseSource.connect(gainNode);

    const root = document.createElement('div');
    root.className = 'synth-module synth-module--noise synth-module--source';
    root.dataset.moduleId = instanceId;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Noise');

    const header = document.createElement('div');
    header.className = 'synth-module__header';
    const title = document.createElement('span');
    title.className = 'synth-module__title';
    title.textContent = noiseModule.meta.name;
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

    const gainRow = document.createElement('div');
    gainRow.className = 'synth-module__row';
    const gainLabel = document.createElement('label');
    gainLabel.className = 'synth-module__label';
    gainLabel.textContent = 'Gain';
    const gainInput = document.createElement('input');
    gainInput.type = 'range';
    gainInput.className = 'synth-module__slider';
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

    gainInput.addEventListener('input', () => {
      gainNode.gain.setTargetAtTime(Number(gainInput.value) / 100, ctx.currentTime, 0.01);
      gainValue.textContent = `${formatParamValue(gainInput.value)} %`;
    });

    return {
      element: root,
      getAudioOutput() {
        return gainNode;
      },
      getModulatableParams() {
        return [
          { id: 'gain', name: 'Gain', param: gainNode.gain },
        ];
      },
      destroy() {
        viz.destroy();
        try {
          noiseSource.stop();
          noiseSource.disconnect();
          gainNode.disconnect();
        } catch (_) {}
      },
    };
  },
};
