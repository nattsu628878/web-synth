/**
 * fm-synth.js
 * Web Synth - FM音源（キャリア + モジュレータで周波数変調）
 */

import { formatParamValue, formatParamValueFreq } from '../base.js';
import { ensureAudioContext } from '../../audio-core.js';
import { attachWaveformViz } from '../../waveform-viz.js';
import { createInputJack } from '../../cables.js';
import { paramToNorm, normToParam, PARAM_DEFS, ParamFormat } from '../../param-utils.js';

/** @type {import('../base.js').ModuleFactory} */
export const fmSynthModule = {
  meta: {
    id: 'fm',
    name: 'FM',
    kind: 'source',
    description: 'FM synth (frequency modulation)',
    previewDescription: 'Signal: 1 audio out.\nFM synth; carrier, modulator, index.',
  },

  create(instanceId) {
    const ctx = ensureAudioContext();

    const carrier = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const modGain = ctx.createGain();
    const carrierFreqConst = ctx.createConstantSource();
    const outputGain = ctx.createGain();

    // AudioParam に接続すると「接続元の出力」と「パラメータの現在値」が加算される。
    // OscillatorNode.frequency のデフォルトは 440 なので、0 にしてから接続する。
    carrier.frequency.setValueAtTime(0, ctx.currentTime);
    carrierFreqConst.offset.value = 440;
    carrierFreqConst.connect(carrier.frequency);
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    modGain.gain.value = 0;
    carrier.connect(outputGain);
    outputGain.gain.value = 0.3;

    carrier.type = 'sine';
    modulator.type = 'sine';
    modulator.frequency.value = 220;

    carrier.start(ctx.currentTime);
    modulator.start(ctx.currentTime);
    carrierFreqConst.start(ctx.currentTime);

    const root = document.createElement('div');
    root.className = 'synth-module synth-module--fm synth-module--source';
    root.dataset.moduleId = instanceId;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'FM synth');

    const header = document.createElement('div');
    header.className = 'synth-module__header';
    const title = document.createElement('span');
    title.className = 'synth-module__title';
    title.textContent = fmSynthModule.meta.name;
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

    const carrierRow = document.createElement('div');
    carrierRow.className = 'synth-module__row';
    carrierRow.innerHTML = '<label class="synth-module__label">Carrier</label><input type="range" class="synth-module__slider" data-param="carrier" min="20" max="20000" step="1" value="440"><span class="synth-module__value">440 Hz</span>';
    const carrierJackWrap = document.createElement('div');
    carrierJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(carrierJackWrap, 'carrierFreq');
    carrierRow.appendChild(carrierJackWrap);
    body.appendChild(carrierRow);

    const modFreqRow = document.createElement('div');
    modFreqRow.className = 'synth-module__row';
    modFreqRow.innerHTML = '<label class="synth-module__label">Mod</label><input type="range" class="synth-module__slider" data-param="modFreq" min="1" max="20000" step="1" value="220"><span class="synth-module__value">220 Hz</span>';
    const modFreqJackWrap = document.createElement('div');
    modFreqJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(modFreqJackWrap, 'modFreq');
    modFreqRow.appendChild(modFreqJackWrap);
    body.appendChild(modFreqRow);

    const indexRow = document.createElement('div');
    indexRow.className = 'synth-module__row';
    indexRow.innerHTML = '<label class="synth-module__label">Index</label><input type="range" class="synth-module__slider" data-param="index" min="0" max="500" step="1" value="0"><span class="synth-module__value">0 —</span>';
    const indexJackWrap = document.createElement('div');
    indexJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(indexJackWrap, 'index');
    indexRow.appendChild(indexJackWrap);
    body.appendChild(indexRow);

    const gainRow = document.createElement('div');
    gainRow.className = 'synth-module__row';
    gainRow.innerHTML = '<label class="synth-module__label">Gain</label><input type="range" class="synth-module__slider" data-param="gain" min="0" max="100" step="1" value="30"><span class="synth-module__value">30 %</span>';
    const gainJackWrap = document.createElement('div');
    gainJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(gainJackWrap, 'gain');
    gainRow.appendChild(gainJackWrap);
    body.appendChild(gainRow);

    root.appendChild(body);

    const viz = attachWaveformViz(body, outputGain);

    const carrierInput = body.querySelector('[data-param="carrier"]');
    const carrierValue = carrierRow.querySelector('.synth-module__value');
    const modFreqInput = body.querySelector('[data-param="modFreq"]');
    const modFreqValue = modFreqRow.querySelector('.synth-module__value');
    const indexInput = body.querySelector('[data-param="index"]');
    const indexValue = indexRow.querySelector('.synth-module__value');
    const gainInput = body.querySelector('[data-param="gain"]');
    const gainValue = gainRow.querySelector('.synth-module__value');

    const carrierRange = [20, 20000];
    const modFreqRange = [1, 20000];
    const indexRange = [0, 500];
    const gainDef = PARAM_DEFS.gain;
    carrierInput.addEventListener('input', () => {
      const norm = paramToNorm(Number(carrierInput.value), carrierRange);
      carrierFreqConst.offset.setTargetAtTime(normToParam(norm, carrierRange), ctx.currentTime, 0.01);
      carrierValue.textContent = ParamFormat.freq(Number(carrierInput.value));
    });
    modFreqInput.addEventListener('input', () => {
      const norm = paramToNorm(Number(modFreqInput.value), modFreqRange);
      modulator.frequency.setTargetAtTime(normToParam(norm, modFreqRange), ctx.currentTime, 0.01);
      modFreqValue.textContent = ParamFormat.freq(Number(modFreqInput.value));
    });
    indexInput.addEventListener('input', () => {
      const norm = paramToNorm(Number(indexInput.value), indexRange);
      modGain.gain.setTargetAtTime(normToParam(norm, indexRange), ctx.currentTime, 0.01);
      indexValue.textContent = `${Math.round(Number(indexInput.value))} —`;
    });
    gainInput.addEventListener('input', () => {
      const norm = paramToNorm(Number(gainInput.value), gainDef.displayRange);
      outputGain.gain.setTargetAtTime(normToParam(norm, gainDef.range), ctx.currentTime, 0.01);
      gainValue.textContent = gainDef.format(Number(gainInput.value));
    });

    carrierValue.textContent = `${formatParamValueFreq(carrierInput.value)} Hz`;
    modFreqValue.textContent = `${formatParamValueFreq(modFreqInput.value)} Hz`;
    indexValue.textContent = `${formatParamValue(indexInput.value)} —`;
    gainValue.textContent = '30 %';

    return {
      element: root,
      getAudioOutput() {
        return outputGain;
      },
      reconnectWaveformViz() {
        viz.reconnect();
      },
      getModulatableParams() {
        return [
          { id: 'carrierFreq', name: 'Carrier', param: carrierFreqConst.offset, range: carrierRange, displayRange: carrierRange, format: ParamFormat.freq },
          { id: 'modFreq', name: 'Mod', param: modulator.frequency, range: modFreqRange, displayRange: modFreqRange, format: ParamFormat.freq },
          { id: 'index', name: 'Index', param: modGain.gain, range: indexRange, displayRange: indexRange, format: (v) => `${Math.round(v)} —` },
          { id: 'gain', name: 'Gain', param: outputGain.gain, ...PARAM_DEFS.gain },
        ];
      },
      destroy() {
        viz.destroy();
        try {
          carrier.stop();
          modulator.stop();
          carrierFreqConst.stop();
          carrier.disconnect();
          modulator.disconnect();
          modGain.disconnect();
          carrierFreqConst.disconnect();
          outputGain.disconnect();
        } catch (_) {}
      },
    };
  },
};
