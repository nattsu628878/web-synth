/**
 * sequencer.js
 * Web Synth - ステップシーケンサ（8ステップ、Pitch + Gate 出力）
 * kind: modulator。Pitch はオシレータの Freq にケーブル、Gate はエンベロープの Trigger にケーブル。
 */

import { ensureAudioContext } from '../audio-core.js';
import { createOutputJack } from '../cables.js';

const STEP_COUNT = 8;
const DEFAULT_BPM = 120;
const MIN_BPM = 40;
const MAX_BPM = 240;

/** @type {import('./base.js').ModuleFactory} */
export const sequencerModule = {
  meta: {
    id: 'sequencer',
    name: 'Seq',
    kind: 'modulator',
    description: '8-step sequencer (Pitch + Gate, connect Gate to envelope Trigger)',
  },

  create(instanceId) {
    const ctx = ensureAudioContext();
    const pitchOut = ctx.createConstantSource();
    pitchOut.offset.value = 0;
    pitchOut.start(ctx.currentTime);

    const gateListeners = /** @type {Array<() => void>} */ ([]);
    let currentStep = 0;
    let stepIntervalId = null;
    let lastGateOn = false;

    const root = document.createElement('div');
    root.className = 'synth-module synth-module--sequencer synth-module--modulator';
    root.dataset.moduleId = instanceId;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Sequencer');

    const header = document.createElement('div');
    header.className = 'synth-module__header';
    const title = document.createElement('span');
    title.className = 'synth-module__title';
    title.textContent = sequencerModule.meta.name;
    header.appendChild(title);
    const headerJacks = document.createElement('div');
    headerJacks.className = 'synth-module__header-jacks';
    const pitchJackWrap = document.createElement('span');
    pitchJackWrap.className = 'synth-module__jack-wrap';
    pitchJackWrap.title = 'Pitch (connect to Freq)';
    createOutputJack(pitchJackWrap, 'pitch');
    headerJacks.appendChild(pitchJackWrap);
    const gateJackWrap = document.createElement('span');
    gateJackWrap.className = 'synth-module__jack-wrap';
    createOutputJack(gateJackWrap, 'gate');
    headerJacks.appendChild(gateJackWrap);
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

    const bpmRow = document.createElement('div');
    bpmRow.className = 'synth-module__row';
    bpmRow.innerHTML = `<label class="synth-module__label">BPM</label><input type="range" class="synth-module__slider" data-param="bpm" min="${MIN_BPM}" max="${MAX_BPM}" step="1" value="${DEFAULT_BPM}"><span class="synth-module__value">${DEFAULT_BPM} BPM</span>`;
    body.appendChild(bpmRow);

    const stepsWrap = document.createElement('div');
    stepsWrap.className = 'synth-module__steps';
    const stepLabels = document.createElement('div');
    stepLabels.className = 'synth-module__step-labels';
    for (let i = 0; i < STEP_COUNT; i++) {
      const span = document.createElement('span');
      span.className = 'synth-module__step-label';
      span.textContent = String(i + 1);
      stepLabels.appendChild(span);
    }
    stepsWrap.appendChild(stepLabels);

    const pitchRow = document.createElement('div');
    pitchRow.className = 'synth-module__row synth-module__row--steps synth-module__row--pitch';
    const pitchLabel = document.createElement('label');
    pitchLabel.className = 'synth-module__label synth-module__step-row-label';
    pitchLabel.textContent = 'Pitch';
    pitchRow.appendChild(pitchLabel);
    const pitchSliders = [];
    for (let i = 0; i < STEP_COUNT; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'synth-module__step synth-module__step--pitch';
      const sliderWrap = document.createElement('div');
      sliderWrap.className = 'synth-module__step-slider-wrap';
      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'synth-module__slider synth-module__step-slider synth-module__step-slider--vertical';
      input.min = '0';
      input.max = '100';
      input.value = i === 0 ? '50' : '0';
      input.dataset.step = String(i);
      input.dataset.param = 'pitch';
      sliderWrap.appendChild(input);
      wrap.appendChild(sliderWrap);
      pitchRow.appendChild(wrap);
      pitchSliders.push({ input });
    }
    stepsWrap.appendChild(pitchRow);

    const gateRow = document.createElement('div');
    gateRow.className = 'synth-module__row synth-module__row--steps synth-module__row--gate';
    const gateLabel = document.createElement('label');
    gateLabel.className = 'synth-module__label synth-module__step-row-label';
    gateLabel.textContent = 'Gate';
    gateRow.appendChild(gateLabel);
    const gateState = [true, false, false, false, false, false, false, false];
    const gateButtons = [];
    for (let i = 0; i < STEP_COUNT; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'synth-module__step synth-module__step--gate';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'synth-module__step-gate';
      btn.dataset.step = String(i);
      btn.dataset.param = 'gate';
      btn.setAttribute('aria-label', `Step ${i + 1} gate`);
      if (gateState[i]) btn.classList.add('synth-module__step-gate--on');
      btn.addEventListener('click', () => {
        gateState[i] = !gateState[i];
        btn.classList.toggle('synth-module__step-gate--on', gateState[i]);
      });
      wrap.appendChild(btn);
      gateRow.appendChild(wrap);
      gateButtons.push(btn);
    }
    stepsWrap.appendChild(gateRow);
    body.appendChild(stepsWrap);

    root.appendChild(body);

    const bpmInput = body.querySelector('[data-param="bpm"]');
    const bpmValue = bpmRow.querySelector('.synth-module__value');

    function getStepMs() {
      const bpm = Number(bpmInput?.value ?? DEFAULT_BPM);
      return (60 * 1000) / bpm / 4;
    }

    function advanceStep() {
      currentStep = (currentStep + 1) % STEP_COUNT;
      const pitchVal = Number(pitchSliders[currentStep].input.value) / 100;
      pitchOut.offset.setTargetAtTime(pitchVal, ctx.currentTime, 0.01);
      const gateOn = gateState[currentStep];
      if (gateOn && !lastGateOn) {
        gateListeners.forEach((cb) => cb());
      }
      lastGateOn = gateOn;
    }

    function startLoop() {
      if (stepIntervalId) clearInterval(stepIntervalId);
      const stepMs = getStepMs();
      pitchOut.offset.setTargetAtTime(Number(pitchSliders[0].input.value) / 100, ctx.currentTime, 0.01);
      currentStep = 0;
      lastGateOn = gateState[0];
      if (lastGateOn) gateListeners.forEach((cb) => cb());
      stepIntervalId = setInterval(advanceStep, stepMs);
    }

    bpmInput?.addEventListener('input', () => {
      bpmValue.textContent = `${bpmInput.value} BPM`;
      startLoop();
    });

    pitchSliders.forEach(({ input }) => {
      input.addEventListener('input', () => {
        if (currentStep === Number(input.dataset.step)) {
          pitchOut.offset.setTargetAtTime(Number(input.value) / 100, ctx.currentTime, 0.01);
        }
      });
    });

    startLoop();

    return {
      element: root,
      getModulationOutput(outputId) {
        if (outputId === 'gate') return null;
        return pitchOut;
      },
      addGateListener(cb) {
        gateListeners.push(cb);
      },
      removeGateListener(cb) {
        const i = gateListeners.indexOf(cb);
        if (i !== -1) gateListeners.splice(i, 1);
      },
      destroy() {
        if (stepIntervalId) clearInterval(stepIntervalId);
        gateListeners.length = 0;
        try {
          pitchOut.stop();
          pitchOut.disconnect();
        } catch (_) {}
      },
    };
  },
};
