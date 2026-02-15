/**
 * sequencer.js
 * Web Synth - ステップシーケンサ（Seq-8 / Seq-16 / Seq-64）
 * Seq-64 は 4 段 × 16 ステップ。データは stepPitch / stepGate 配列のみ。Sync In でマスター BPM に同期可能。
 */

import { formatParamValue } from '../base.js';
import { ensureAudioContext } from '../../audio-core.js';
import { createOutputJack, createInputJack } from '../../cables.js';

const DEFAULT_BPM = 120;
const MIN_BPM = 40;
const MAX_BPM = 240;
const PITCH_MIN = 0;
const PITCH_MAX = 100;
const SCROLL_SENSITIVITY = 0.004;

/**
 * シーケンサ用ビジュアライザ: 上窓にステップごとのピッチバー・ゲート・現在ステップを表示
 * @param {HTMLElement} container - body
 * @param {number} stepCount
 * @param {() => number[]} getStepPitch
 * @param {() => boolean[]} getStepGate
 * @param {() => number} getCurrentStep
 * @param {number} [rows=1] - 段数（Seq-64 のとき 4）
 */
function attachSequencerViz(container, stepCount, getStepPitch, getStepGate, getCurrentStep, rows = 1) {
  const wrapper = document.createElement('div');
  wrapper.className = 'synth-module__waveform-viz synth-module__waveform-viz--sequencer';
  const canvas = document.createElement('canvas');
  canvas.className = 'synth-module__waveform-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  wrapper.appendChild(canvas);
  container.insertBefore(wrapper, container.firstChild);

  const dpr = window.devicePixelRatio || 1;
  let rafId = null;
  const cols = rows > 1 ? stepCount / rows : stepCount;

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) {
      rafId = requestAnimationFrame(draw);
      return;
    }
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const cctx = canvas.getContext('2d');
    if (!cctx) {
      rafId = requestAnimationFrame(draw);
      return;
    }
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cctx.clearRect(0, 0, w, h);

    const pitch = getStepPitch();
    const gate = getStepGate();
    const current = getCurrentStep();
    const padding = 2;
    const innerW = w - padding * 2;
    const innerH = h - padding * 2;
    const colW = innerW / cols;
    const rowH = innerH / rows;
    const barColor = 'rgba(98, 136, 120, 0.5)';
    const barColorCurrent = 'rgba(98, 136, 120, 0.9)';
    const gateColor = 'rgba(98, 136, 120, 0.8)';
    const currentBg = 'rgba(114, 23, 33, 0.15)';

    for (let i = 0; i < stepCount; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = padding + col * colW;
      const y = padding + row * rowH;
      const isCurrent = i === current;
      if (isCurrent) {
        cctx.fillStyle = currentBg;
        cctx.fillRect(x, y, colW, rowH);
      }
      const pct = (pitch[i] ?? 0) / 100;
      const barH = Math.max(2, rowH * pct);
      cctx.fillStyle = isCurrent ? barColorCurrent : barColor;
      cctx.fillRect(x + 1, y + rowH - barH, colW - 2, barH);
      if (gate[i]) {
        cctx.fillStyle = gateColor;
        cctx.beginPath();
        cctx.arc(x + colW / 2, y + rowH - 4, Math.min(3, rowH / 4), 0, Math.PI * 2);
        cctx.fill();
      }
    }
    rafId = requestAnimationFrame(draw);
  }
  rafId = requestAnimationFrame(draw);
  return () => {
    if (rafId) cancelAnimationFrame(rafId);
  };
}

/**
 * @param {number} stepCount - 8 / 16 / 64
 * @param {number} [rows=1] - 段数（Seq-64 のとき 4）
 * @returns {import('../base.js').ModuleFactory}
 */
export function createSequencerModule(stepCount, rows = 1) {
  const id = `sequencer-${stepCount}`;
  const name = `Seq-${stepCount}`;
  const stepsPerRow = stepCount / rows;

  return {
    meta: {
      id,
      name,
      kind: 'modulator',
      description: `${stepCount}-step sequencer (Pitch + Gate). Sync In from Master.${rows > 1 ? ` ${rows} rows × ${stepsPerRow} steps.` : ''}`,
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
      let syncConnected = false;

      /** 唯一の真実の源: ステップごとの音高 (0–100) */
      const stepPitch = Array.from({ length: stepCount }, (_, i) => (i === 0 ? 50 : 0));
      /** 唯一の真実の源: ステップごとのゲート */
      const stepGate = Array.from({ length: stepCount }, (_, i) => i === 0);

      const root = document.createElement('div');
      root.className = `synth-module synth-module--sequencer synth-module--sequencer-${stepCount} synth-module--modulator`;
      root.dataset.moduleId = instanceId;
      root.setAttribute('role', 'group');
      root.setAttribute('aria-label', name);

      const header = document.createElement('div');
      header.className = 'synth-module__header';
      const title = document.createElement('span');
      title.className = 'synth-module__title';
      title.textContent = name;
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
      const syncInWrap = document.createElement('span');
      syncInWrap.className = 'synth-module__jack-wrap';
      syncInWrap.title = 'Sync In (from Master BPM)';
      createInputJack(syncInWrap, 'syncIn');
      headerJacks.appendChild(syncInWrap);
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
      stepsWrap.className = `synth-module__steps synth-module__steps--rows-${rows}`;

      for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
        const pitchRow = document.createElement('div');
        pitchRow.className = 'synth-module__row synth-module__row--steps synth-module__row--pitch';
        for (let c = 0; c < stepsPerRow; c++) {
          const i = rowIndex * stepsPerRow + c;
          const wrap = document.createElement('div');
          wrap.className = 'synth-module__step synth-module__step--pitch';
          const barWrap = document.createElement('div');
          barWrap.className = 'synth-module__step-pitch-cell';
          barWrap.dataset.step = String(i);
          const sliderWrap = document.createElement('div');
          sliderWrap.className = 'synth-module__step-slider-wrap';
          const rotationWrap = document.createElement('div');
          rotationWrap.className = 'synth-module__step-slider-rotation';
          const input = document.createElement('input');
          input.type = 'range';
          input.className = 'synth-module__slider synth-module__step-slider synth-module__step-slider--vertical';
          input.min = String(PITCH_MIN);
          input.max = String(PITCH_MAX);
          input.value = String(stepPitch[i]);
          input.dataset.step = String(i);
          input.dataset.param = 'pitch';
          rotationWrap.appendChild(input);
          sliderWrap.appendChild(rotationWrap);
          barWrap.appendChild(sliderWrap);
          const valueDisplay = document.createElement('span');
          valueDisplay.className = 'synth-module__step-pitch-value synth-module__value';
          valueDisplay.textContent = String(Math.floor(stepPitch[i]));
          valueDisplay.setAttribute('aria-label', `Step ${i + 1} pitch`);
          valueDisplay.setAttribute('tabindex', '0');
          barWrap.appendChild(valueDisplay);
          wrap.appendChild(barWrap);
          pitchRow.appendChild(wrap);
        }
        stepsWrap.appendChild(pitchRow);

        const gateRow = document.createElement('div');
        gateRow.className = 'synth-module__row synth-module__row--steps synth-module__row--gate';
        for (let c = 0; c < stepsPerRow; c++) {
          const i = rowIndex * stepsPerRow + c;
          const wrap = document.createElement('div');
          wrap.className = 'synth-module__step synth-module__step--gate';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'synth-module__step-gate';
          btn.dataset.step = String(i);
          btn.dataset.param = 'gate';
          btn.setAttribute('aria-label', `Step ${i + 1} gate`);
          if (stepGate[i]) btn.classList.add('synth-module__step-gate--on');
          btn.addEventListener('click', () => {
            const stepIndex = Number(btn.dataset.step ?? 0);
            stepGate[stepIndex] = !stepGate[stepIndex];
            btn.classList.toggle('synth-module__step-gate--on', stepGate[stepIndex]);
          });
          wrap.appendChild(btn);
          gateRow.appendChild(wrap);
        }
        stepsWrap.appendChild(gateRow);
      }
      body.appendChild(stepsWrap);

      const stopViz = attachSequencerViz(
        body,
        stepCount,
        () => stepPitch,
        () => stepGate,
        () => currentStep,
        rows
      );

      root.appendChild(body);

      const bpmInput = body.querySelector('[data-param="bpm"]');
      const bpmValue = bpmRow.querySelector('.synth-module__value');

      function getPitchCell(stepIndex) {
        return root.querySelector(`.synth-module__step-pitch-cell[data-step="${stepIndex}"]`);
      }

      function setPitchFromUI(stepIndex, val) {
        const num = Math.max(PITCH_MIN, Math.min(PITCH_MAX, Number(val)));
        stepPitch[stepIndex] = num;
        const cell = getPitchCell(stepIndex);
        const display = cell?.querySelector('.synth-module__step-pitch-value');
        if (display) display.textContent = String(Math.floor(num));
        if (currentStep === stepIndex) {
          pitchOut.offset.setTargetAtTime(num / 100, ctx.currentTime, 0.01);
        }
      }

      function getStepMs() {
        const bpm = Number(bpmInput?.value ?? DEFAULT_BPM);
        return (60 * 1000) / bpm / 4;
      }

      /** マスター Sync 時は masterTick を渡す（0,1,2,...）。未接続時は引数なしで内部カウンタで進行 */
      function advanceStep(masterTickArg) {
        if (syncConnected && typeof masterTickArg === 'number') {
          currentStep = masterTickArg % stepCount;
        } else {
          currentStep = (currentStep + 1) % stepCount;
        }
        const num = stepPitch[currentStep];
        pitchOut.offset.setTargetAtTime(num / 100, ctx.currentTime, 0.01);
        const gateOn = stepGate[currentStep];
        if (gateOn && !lastGateOn) {
          gateListeners.forEach((cb) => cb());
        }
        lastGateOn = gateOn;
      }

      function startLoop() {
        if (stepIntervalId) clearInterval(stepIntervalId);
        if (syncConnected) return;
        const stepMs = getStepMs();
        pitchOut.offset.setTargetAtTime(stepPitch[0] / 100, ctx.currentTime, 0.01);
        currentStep = 0;
        lastGateOn = stepGate[0];
        if (lastGateOn) gateListeners.forEach((cb) => cb());
        stepIntervalId = setInterval(advanceStep, stepMs);
      }

      bpmInput?.addEventListener('input', () => {
        if (!syncConnected && bpmValue) bpmValue.textContent = `${formatParamValue(bpmInput.value)} BPM`;
        startLoop();
      });

      stepsWrap.querySelectorAll('input[data-param="pitch"]').forEach((input) => {
        const stepIndex = Number(input.dataset.step ?? 0);
        input.addEventListener('input', () => {
          setPitchFromUI(stepIndex, input.value);
        });
      });

      body.addEventListener('wheel', (e) => {
        const valueEl = e.target.closest('.synth-module__step-pitch-value');
        if (!valueEl) return;
        const cell = valueEl.parentElement;
        if (!cell?.classList.contains('synth-module__step-pitch-cell')) return;
        const input = cell.querySelector('input[type="range"]');
        if (!input) return;
        const stepIndex = Number(input.dataset.step ?? 0);
        e.preventDefault();
        const range = PITCH_MAX - PITCH_MIN;
        let current = parseFloat(input.value) || PITCH_MIN;
        const delta = -e.deltaY * range * SCROLL_SENSITIVITY;
        const next = Math.max(PITCH_MIN, Math.min(PITCH_MAX, current + delta));
        if (next === current) return;
        input.value = String(next);
        setPitchFromUI(stepIndex, next);
      }, { passive: false });

      startLoop();

      return {
        element: root,
        advanceStep,
        setSyncConnected(connected, masterStepArg) {
          syncConnected = !!connected;
          if (bpmValue) bpmValue.textContent = syncConnected ? 'Sync' : `${formatParamValue(bpmInput?.value ?? DEFAULT_BPM)} BPM`;
          if (syncConnected) {
            if (stepIntervalId) {
              clearInterval(stepIntervalId);
              stepIntervalId = null;
            }
            if (typeof masterStepArg === 'number') {
              currentStep = masterStepArg % stepCount;
              pitchOut.offset.setTargetAtTime(stepPitch[currentStep] / 100, ctx.currentTime, 0.01);
              lastGateOn = stepGate[currentStep];
              if (lastGateOn) gateListeners.forEach((cb) => cb());
            }
          } else {
            startLoop();
          }
        },
        getModulationOutput(outputId) {
          if (outputId === 'gate') return null;
          return pitchOut;
        },
        addGateListener(cb) {
          gateListeners.push(cb);
        },
        removeGateListener(cb) {
          const idx = gateListeners.indexOf(cb);
          if (idx !== -1) gateListeners.splice(idx, 1);
        },
        destroy() {
          if (typeof stopViz === 'function') stopViz();
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
}

export const sequencer8Module = createSequencerModule(8);
export const sequencer16Module = createSequencerModule(16);
export const sequencer64Module = createSequencerModule(64, 4);
