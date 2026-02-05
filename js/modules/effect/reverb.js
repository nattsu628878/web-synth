/**
 * reverb.js
 * Web Synth - リバーブ（エフェクト）
 * ConvolverNode で簡易リバーブ。Dry/Wet で原音と混ぜる。
 */

import { formatParamValue } from '../base.js';
import { ensureAudioContext } from '../../audio-core.js';
import { attachWaveformViz } from '../../waveform-viz.js';
import { createInputJack } from '../../cables.js';

/**
 * 簡易リバーブ用インパルス応答を生成（指数減衰ノイズ）
 * @param {AudioContext} ctx
 * @param {number} durationSec
 * @returns {AudioBuffer}
 */
function createReverbIR(ctx, durationSec = 1.5) {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(durationSec * sampleRate);
  const buffer = ctx.createBuffer(2, length, sampleRate);
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const decay = Math.exp(-t * 3);
    L[i] = (Math.random() * 2 - 1) * decay;
    R[i] = (Math.random() * 2 - 1) * decay * 0.8;
  }
  return buffer;
}

/** @type {import('../base.js').ModuleFactory} */
export const reverbModule = {
  meta: {
    id: 'reverb',
    name: 'Reverb',
    kind: 'effect',
    description: 'Reverb (ConvolverNode)',
  },

  create(instanceId) {
    const ctx = ensureAudioContext();
    const inputGain = ctx.createGain();
    inputGain.gain.value = 1;
    const dryGain = ctx.createGain();
    dryGain.gain.value = 0.7;
    const conv = ctx.createConvolver();
    conv.buffer = createReverbIR(ctx, 1.2);
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.3;
    const outputGain = ctx.createGain();
    outputGain.gain.value = 1;

    inputGain.connect(dryGain);
    inputGain.connect(conv);
    conv.connect(wetGain);
    dryGain.connect(outputGain);
    wetGain.connect(outputGain);

    const root = document.createElement('div');
    root.className = 'synth-module synth-module--effect';
    root.dataset.moduleId = instanceId;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Reverb');

    const header = document.createElement('div');
    header.className = 'synth-module__header';
    const title = document.createElement('span');
    title.className = 'synth-module__title';
    title.textContent = reverbModule.meta.name;
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
    body.innerHTML = '<div class="synth-module__row"><label class="synth-module__label">Dry/Wet</label><input type="range" class="synth-module__slider" data-param="mix" min="0" max="100" value="30"><span class="synth-module__value">30 %</span></div>';
    const mixRow = body.querySelector('.synth-module__row');
    const wetJackWrap = document.createElement('div');
    wetJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(wetJackWrap, 'wet');
    mixRow.appendChild(wetJackWrap);
    root.appendChild(body);

    const mixInput = body.querySelector('[data-param="mix"]');
    const mixValue = body.querySelector('.synth-module__value');
    mixInput.addEventListener('input', () => {
      const w = Number(mixInput.value) / 100;
      wetGain.gain.setTargetAtTime(w, ctx.currentTime, 0.01);
      dryGain.gain.setTargetAtTime(1 - w, ctx.currentTime, 0.01);
      mixValue.textContent = `${formatParamValue(mixInput.value)} %`;
    });
    mixValue.textContent = '30 %';

    const viz = attachWaveformViz(body, outputGain);

    return {
      element: root,
      getAudioInput() {
        return inputGain;
      },
      getAudioOutput() {
        return outputGain;
      },
      getModulatableParams() {
        return [
          { id: 'wet', name: 'Wet', param: wetGain.gain },
        ];
      },
      destroy() {
        viz.destroy();
        try {
          inputGain.disconnect();
          dryGain.disconnect();
          wetGain.disconnect();
          conv.disconnect();
          outputGain.disconnect();
        } catch (_) {}
      },
    };
  },
};
