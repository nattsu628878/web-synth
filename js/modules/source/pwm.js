/**
 * pwm.js
 * Web Synth - PWM (Pulse Width Modulation) オシレーター
 * 矩形波のデューティ比を 0〜100% で制御。アナログ風の太い音。
 */

import { formatParamValue, formatParamValueFreq } from '../base.js';
import { ensureAudioContext } from '../../audio-core.js';
import { attachWaveformViz } from '../../waveform-viz.js';
import { createInputJack } from '../../cables.js';

/** @type {import('../base.js').ModuleFactory} */
export const pwmModule = {
  meta: {
    id: 'pwm',
    name: 'PWM',
    kind: 'source',
    description: 'Pulse width modulation oscillator (Freq, Pulse %, Gain)',
  },

  create(instanceId) {
    const ctx = ensureAudioContext();
    const pwmNode = new AudioWorkletNode(ctx, 'pwm-oscillator', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      parameterData: {
        frequency: 440,
        pulseWidth: 0.5,
      },
    });
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.3;
    pwmNode.connect(gainNode);

    const root = document.createElement('div');
    root.className = 'synth-module synth-module--pwm synth-module--source';
    root.dataset.moduleId = instanceId;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'PWM Oscillator');

    const header = document.createElement('div');
    header.className = 'synth-module__header';
    const title = document.createElement('span');
    title.className = 'synth-module__title';
    title.textContent = pwmModule.meta.name;
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
      <input type="range" class="synth-module__slider" data-param="freq" min="20" max="20000" value="440" step="1">
      <span class="synth-module__value">440 Hz</span>
    `;
    const freqJackWrap = document.createElement('div');
    freqJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(freqJackWrap, 'frequency');
    freqRow.appendChild(freqJackWrap);
    body.appendChild(freqRow);

    const pwRow = document.createElement('div');
    pwRow.className = 'synth-module__row';
    pwRow.innerHTML = `
      <label class="synth-module__label">Pulse %</label>
      <input type="range" class="synth-module__slider" data-param="pulseWidth" min="0" max="100" value="50" step="0.1">
      <span class="synth-module__value">50 %</span>
    `;
    const pwJackWrap = document.createElement('div');
    pwJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(pwJackWrap, 'pulseWidth');
    pwRow.appendChild(pwJackWrap);
    body.appendChild(pwRow);

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

    root.appendChild(body);

    const freqInput = body.querySelector('[data-param="freq"]');
    const freqValue = freqInput.nextElementSibling;
    const pwInput = body.querySelector('[data-param="pulseWidth"]');
    const pwValue = pwRow.querySelector('.synth-module__value');
    const gainInput = body.querySelector('[data-param="gain"]');
    const gainValue = gainRow.querySelector('.synth-module__value');

    function updateFreqLabel() {
      freqValue.textContent = `${formatParamValueFreq(freqInput.value)} Hz`;
    }
    function updatePwLabel() {
      pwValue.textContent = `${formatParamValue(pwInput.value)} %`;
    }
    function updateGainLabel() {
      gainValue.textContent = `${formatParamValue(gainInput.value)} %`;
    }

    freqInput.addEventListener('input', () => {
      const v = Number(freqInput.value);
      pwmNode.parameters.get('frequency').setTargetAtTime(v, ctx.currentTime, 0.01);
      updateFreqLabel();
    });
    pwInput.addEventListener('input', () => {
      const v = Number(pwInput.value) / 100;
      pwmNode.parameters.get('pulseWidth').setTargetAtTime(v, ctx.currentTime, 0.01);
      updatePwLabel();
    });
    gainInput.addEventListener('input', () => {
      gainNode.gain.setTargetAtTime(Number(gainInput.value) / 100, ctx.currentTime, 0.01);
      updateGainLabel();
    });

    updateFreqLabel();
    updatePwLabel();
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
          { id: 'frequency', name: 'Freq', param: pwmNode.parameters.get('frequency'), modulationScale: 100 },
          { id: 'pulseWidth', name: 'Pulse %', param: pwmNode.parameters.get('pulseWidth'), modulationScale: 0.5 },
          { id: 'gain', name: 'Gain', param: gainNode.gain },
        ];
      },
      destroy() {
        viz.destroy();
        try {
          pwmNode.disconnect();
          gainNode.disconnect();
        } catch (_) {}
      },
    };
  },
};
