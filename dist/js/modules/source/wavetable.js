/**
 * wavetable.js
 * Web Synth - ウェーブテーブル音源（PeriodicWave ＋ 波形変形モーフィング）
 */

import { formatParamValue, formatParamValueFreq } from '../base.js';
import { ensureAudioContext } from '../../audio-core.js';
import { attachWaveformViz } from '../../waveform-viz.js';
import { createInputJack } from '../../cables.js';

const FRAME_COUNT = 4096;

/**
 * 指定波形のフーリエ係数（real, imag）を配列で返す
 * @param {string} shape - 'sine' | 'saw' | 'square' | 'triangle'
 * @returns {{ real: Float32Array, imag: Float32Array }}
 */
function getWaveCoefficients(shape) {
  const real = new Float32Array(FRAME_COUNT);
  const imag = new Float32Array(FRAME_COUNT);
  real[0] = 0;
  imag[0] = 0;

  if (shape === 'sine') {
    imag[1] = 1;
    for (let n = 2; n < FRAME_COUNT; n++) real[n] = imag[n] = 0;
  } else if (shape === 'saw') {
    for (let n = 1; n < FRAME_COUNT; n++) {
      real[n] = 0;
      imag[n] = -1 / (Math.PI * n);
    }
  } else if (shape === 'square') {
    for (let n = 1; n < FRAME_COUNT; n++) {
      real[n] = 0;
      imag[n] = n % 2 === 1 ? 4 / (Math.PI * n) : 0;
    }
  } else if (shape === 'triangle') {
    for (let n = 1; n < FRAME_COUNT; n++) real[n] = imag[n] = 0;
    for (let n = 1; n < FRAME_COUNT; n += 2) {
      const sign = n % 4 === 1 ? 1 : -1;
      imag[n] = sign * (8 / (Math.PI * Math.PI * n * n));
    }
  } else {
    imag[1] = 1;
  }
  return { real, imag };
}

/**
 * 二つの波形を t (0..1) で線形補間した PeriodicWave を生成
 * @param {AudioContext} ctx
 * @param {string} shapeA
 * @param {string} shapeB
 * @param {number} t - 0 = shapeA, 1 = shapeB
 * @returns {PeriodicWave}
 */
function createMorphedPeriodicWave(ctx, shapeA, shapeB, t) {
  const a = getWaveCoefficients(shapeA);
  const b = getWaveCoefficients(shapeB);
  const real = new Float32Array(FRAME_COUNT);
  const imag = new Float32Array(FRAME_COUNT);
  for (let n = 0; n < FRAME_COUNT; n++) {
    real[n] = (1 - t) * a.real[n] + t * b.real[n];
    imag[n] = (1 - t) * a.imag[n] + t * b.imag[n];
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

const WAVE_SHAPES = [
  { value: 'sine', label: 'Sine' },
  { value: 'saw', label: 'Saw' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Tri' },
];

/** @type {import('../base.js').ModuleFactory} */
export const wavetableModule = {
  meta: {
    id: 'wavetable',
    name: 'Wavetable',
    kind: 'source',
    description: 'Wavetable: pick 2 waves, morph between them (PeriodicWave)',
  },

  create(instanceId) {
    const ctx = ensureAudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const morphDrive = ctx.createGain();
    gainNode.gain.value = 0.3;
    morphDrive.gain.value = 0;
    osc.connect(gainNode);

    const root = document.createElement('div');
    root.className = 'synth-module synth-module--wavetable synth-module--source';
    root.dataset.moduleId = instanceId;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Wavetable');

    const header = document.createElement('div');
    header.className = 'synth-module__header';
    const title = document.createElement('span');
    title.className = 'synth-module__title';
    title.textContent = wavetableModule.meta.name;
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

    const waveARow = document.createElement('div');
    waveARow.className = 'synth-module__row';
    const waveALabel = document.createElement('label');
    waveALabel.className = 'synth-module__label';
    waveALabel.textContent = 'Wave A';
    const waveASelect = document.createElement('select');
    waveASelect.className = 'synth-module__select';
    waveASelect.dataset.param = 'waveA';
    for (const w of WAVE_SHAPES) {
      const opt = document.createElement('option');
      opt.value = w.value;
      opt.textContent = w.label;
      waveASelect.appendChild(opt);
    }
    waveARow.appendChild(waveALabel);
    waveARow.appendChild(waveASelect);
    body.appendChild(waveARow);

    const waveBRow = document.createElement('div');
    waveBRow.className = 'synth-module__row';
    const waveBLabel = document.createElement('label');
    waveBLabel.className = 'synth-module__label';
    waveBLabel.textContent = 'Wave B';
    const waveBSelect = document.createElement('select');
    waveBSelect.className = 'synth-module__select';
    waveBSelect.dataset.param = 'waveB';
    for (const w of WAVE_SHAPES) {
      const opt = document.createElement('option');
      opt.value = w.value;
      opt.textContent = w.label;
      waveBSelect.appendChild(opt);
    }
    waveBSelect.value = 'square';
    waveBRow.appendChild(waveBLabel);
    waveBRow.appendChild(waveBSelect);
    body.appendChild(waveBRow);

    const morphRow = document.createElement('div');
    morphRow.className = 'synth-module__row';
    morphRow.innerHTML = '<label class="synth-module__label">Morph</label><input type="range" class="synth-module__slider" data-param="morph" min="0" max="100" step="1" value="0" title="0 = Wave A, 100 = Wave B"><span class="synth-module__value" data-param="morphValue">0 %</span>';
    const morphJackWrap = document.createElement('div');
    morphJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(morphJackWrap, 'morph');
    morphRow.appendChild(morphJackWrap);
    body.appendChild(morphRow);

    function getMorphT() {
      try {
        const v = morphDrive.gain.getValueAtTime(ctx.currentTime);
        return Math.max(0, Math.min(1, v));
      } catch (_) {
        return Number(morphInput.value) / 100;
      }
    }
    function applyWave() {
      const shapeA = waveASelect.value;
      const shapeB = waveBSelect.value;
      const morphT = getMorphT();
      osc.setPeriodicWave(createMorphedPeriodicWave(ctx, shapeA, shapeB, morphT));
    }

    const freqRow = document.createElement('div');
    freqRow.className = 'synth-module__row';
    freqRow.innerHTML = '<label class="synth-module__label">Freq</label><input type="range" class="synth-module__slider" data-param="freq" min="20" max="20000" step="1" value="440"><span class="synth-module__value">440 Hz</span>';
    const freqJackWrap = document.createElement('div');
    freqJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(freqJackWrap, 'frequency');
    freqRow.appendChild(freqJackWrap);
    body.appendChild(freqRow);

    const gainRow = document.createElement('div');
    gainRow.className = 'synth-module__row';
    gainRow.innerHTML = '<label class="synth-module__label">Gain</label><input type="range" class="synth-module__slider" data-param="gain" min="0" max="100" step="1" value="30"><span class="synth-module__value">30 %</span>';
    const gainJackWrap = document.createElement('div');
    gainJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(gainJackWrap, 'gain');
    gainRow.appendChild(gainJackWrap);
    body.appendChild(gainRow);

    root.appendChild(body);

    const viz = attachWaveformViz(body, gainNode);

    const morphInput = body.querySelector('[data-param="morph"]');
    const morphValue = body.querySelector('[data-param="morphValue"]');
    const freqInput = body.querySelector('[data-param="freq"]');
    const freqValue = freqRow.querySelector('.synth-module__value');
    const gainInput = body.querySelector('[data-param="gain"]');
    const gainValue = gainRow.querySelector('.synth-module__value');

    applyWave();

    waveASelect.addEventListener('change', () => applyWave());
    waveBSelect.addEventListener('change', () => applyWave());
    morphInput.addEventListener('input', () => {
      const v = Number(morphInput.value) / 100;
      morphDrive.gain.setTargetAtTime(v, ctx.currentTime, 0.01);
      morphValue.textContent = `${formatParamValue(morphInput.value)} %`;
      applyWave();
    });
    morphDrive.gain.value = Number(morphInput.value) / 100;
    morphValue.textContent = `${formatParamValue(morphInput.value)} %`;

    let morphRAF = 0;
    function morphTick() {
      applyWave();
      morphValue.textContent = `${formatParamValue(Math.round(getMorphT() * 100))} %`;
      morphRAF = requestAnimationFrame(morphTick);
    }
    morphRAF = requestAnimationFrame(morphTick);

    freqInput.addEventListener('input', () => {
      osc.frequency.setTargetAtTime(Number(freqInput.value), ctx.currentTime, 0.01);
      freqValue.textContent = `${formatParamValueFreq(freqInput.value)} Hz`;
    });
    gainInput.addEventListener('input', () => {
      gainNode.gain.setTargetAtTime(Number(gainInput.value) / 100, ctx.currentTime, 0.01);
      gainValue.textContent = `${formatParamValue(gainInput.value)} %`;
    });

    osc.frequency.value = 440;
    osc.start(ctx.currentTime);

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
          { id: 'morph', name: 'Morph', param: morphDrive.gain },
          { id: 'frequency', name: 'Freq', param: osc.frequency, modulationScale: 100 },
          { id: 'gain', name: 'Gain', param: gainNode.gain },
        ];
      },
      destroy() {
        if (morphRAF) cancelAnimationFrame(morphRAF);
        viz.destroy();
        try {
          osc.stop();
          osc.disconnect();
          gainNode.disconnect();
          morphDrive.disconnect();
        } catch (_) {}
      },
    };
  },
};
