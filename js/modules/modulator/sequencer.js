/**
 * sequencer.js
 * Web Synth - ステップシーケンサ（Seq-8 / Seq-16 / Seq-32）
 * いずれも 1 段あたり 8 ステップ。データは stepPitch / stepGate 配列のみ。Sync In でマスター BPM に同期可能。
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
 * @param {number} [rows=1] - 段数（8 ステップ/段。Seq-16 は 2 段、Seq-32 は 4 段）
 * @param {() => number} [getDepthPercent] - Depth 0–100。省略時は 100
 */
function attachSequencerViz(container, stepCount, getStepPitch, getCurrentStep, rows = 1, getDepthPercent) {
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
    const current = getCurrentStep();
    const padding = 2;
    const innerW = w - padding * 2;
    const innerH = h - padding * 2;
    const colW = innerW / cols;
    const rowH = innerH / rows;
    const barColor = 'rgba(98, 136, 120, 0.5)';
    const barColorCurrent = 'rgba(98, 136, 120, 0.9)';
    const currentBg = 'rgba(114, 23, 33, 0.15)';

    const depthPct = Math.max(0, Math.min(100, Number(getDepthPercent?.() ?? 100)));
    const depthLineY = padding + innerH * (1 - depthPct / 100);
    cctx.strokeStyle = '#628878';
    cctx.lineWidth = 1.5;
    cctx.beginPath();
    cctx.moveTo(padding, depthLineY);
    cctx.lineTo(w - padding, depthLineY);
    cctx.stroke();

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
    }
    rafId = requestAnimationFrame(draw);
  }
  rafId = requestAnimationFrame(draw);
  return {
    destroy: () => { if (rafId) cancelAnimationFrame(rafId); },
    wrapper,
  };
}

/**
 * @param {number} stepCount - 8 / 16 / 32
 * @param {number} [rows=1] - 段数（8 ステップ/段。Seq-16 は 2 段、Seq-32 は 4 段）
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
      previewDescription: `Signal: Pitch + Gate out, Sync In.\n${stepCount}-step sequencer; BPM or sync from Master.`,
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
      bpmRow.className = 'synth-module__row synth-module__row--bpm';
      bpmRow.innerHTML = `<label class="synth-module__label">BPM</label><input type="range" class="synth-module__slider" data-param="bpm" min="${MIN_BPM}" max="${MAX_BPM}" step="1" value="${DEFAULT_BPM}"><span class="synth-module__value">${DEFAULT_BPM} BPM</span>`;
      body.appendChild(bpmRow);

      const depthRow = document.createElement('div');
      depthRow.className = 'synth-module__row';
      depthRow.innerHTML = '<label class="synth-module__label">Depth</label><input type="range" class="synth-module__slider" data-param="depth" min="0" max="100" step="1" value="100"><span class="synth-module__value">100 %</span>';
      body.appendChild(depthRow);

      const depthInput = body.querySelector('[data-param="depth"]');
      const depthValue = depthRow.querySelector('.synth-module__value');

      const vizResult = attachSequencerViz(
        body,
        stepCount,
        () => stepPitch,
        () => currentStep,
        rows,
        () => (depthInput ? Number(depthInput.value) : 100)
      );
      const vizWrapper = vizResult.wrapper;

      const pitchOverlay = document.createElement('div');
      pitchOverlay.className = 'synth-module__sequencer-viz-overlay';
      pitchOverlay.setAttribute('aria-hidden', 'true');
      for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
        const pitchRow = document.createElement('div');
        pitchRow.className = 'synth-module__sequencer-viz-overlay-row';
        for (let c = 0; c < stepsPerRow; c++) {
          const i = rowIndex * stepsPerRow + c;
          const barWrap = document.createElement('div');
          barWrap.className = 'synth-module__step-pitch-cell synth-module__sequencer-viz-overlay-cell';
          barWrap.dataset.step = String(i);
          if (stepGate[i]) barWrap.classList.add('synth-module__step-pitch-cell--gate-on');
          barWrap.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            const stepIndex = i;
            stepGate[stepIndex] = !stepGate[stepIndex];
            barWrap.classList.toggle('synth-module__step-pitch-cell--gate-on', stepGate[stepIndex]);
            const paintValue = stepGate[stepIndex];
            const onDocMove = (moveEv) => {
              const under = document.elementFromPoint(moveEv.clientX, moveEv.clientY);
              const cell = under?.closest('.synth-module__step-pitch-cell.synth-module__sequencer-viz-overlay-cell');
              if (!cell || !root.contains(cell)) return;
              const idx = Number(cell.dataset.step ?? 0);
              if (stepGate[idx] === paintValue) return;
              stepGate[idx] = paintValue;
              cell.classList.toggle('synth-module__step-pitch-cell--gate-on', paintValue);
            };
            const onDocUp = () => {
              document.removeEventListener('pointermove', onDocMove);
              document.removeEventListener('pointerup', onDocUp);
              document.removeEventListener('pointercancel', onDocUp);
            };
            document.addEventListener('pointermove', onDocMove);
            document.addEventListener('pointerup', onDocUp);
            document.addEventListener('pointercancel', onDocUp);
          });
          barWrap.setAttribute('role', 'button');
          barWrap.setAttribute('aria-label', `Step ${i + 1} gate`);
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
          pitchRow.appendChild(barWrap);
        }
        pitchOverlay.appendChild(pitchRow);
      }
      vizWrapper.appendChild(pitchOverlay);

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
        if (gateOn) {
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

      depthInput?.addEventListener('input', () => {
        if (depthValue) depthValue.textContent = `${formatParamValue(depthInput.value)} %`;
      });

      root.querySelectorAll('input[data-param="pitch"]').forEach((input) => {
        const stepIndex = Number(input.dataset.step ?? 0);
        input.addEventListener('input', () => {
          setPitchFromUI(stepIndex, input.value);
        });
      });

      body.addEventListener('wheel', (e) => {
        const cell = e.target.closest('.synth-module__step-pitch-cell');
        if (!cell || !cell.classList.contains('synth-module__sequencer-viz-overlay-cell')) return;
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
        setSyncConnected(connected, masterStepArg, masterBpm) {
          syncConnected = !!connected;
          bpmRow.classList.toggle('synth-module__row--bpm-sync', syncConnected);
          if (bpmInput) bpmInput.disabled = syncConnected;
          if (syncConnected) {
            if (bpmValue && typeof masterBpm === 'number') {
              const v = Math.max(MIN_BPM, Math.min(MAX_BPM, masterBpm));
              bpmValue.textContent = `${Math.floor(v)} BPM`;
              if (bpmInput) {
                bpmInput.value = String(v);
                bpmInput.dispatchEvent(new Event('input', { bubbles: true }));
              }
            } else if (bpmValue) bpmValue.textContent = 'Sync BPM';
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
            if (bpmValue) bpmValue.textContent = `${formatParamValue(bpmInput?.value ?? DEFAULT_BPM)} BPM`;
            startLoop();
          }
        },
        setMasterBpm(bpm) {
          if (!syncConnected || !bpmValue) return;
          const v = Math.max(MIN_BPM, Math.min(MAX_BPM, Number(bpm)));
          bpmValue.textContent = `${Math.floor(v)} BPM`;
          if (bpmInput) {
            bpmInput.value = String(v);
            bpmInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        },
        getModulationOutput(outputId) {
          if (outputId === 'gate') return null;
          return pitchOut;
        },
        getModulationValue(outputId) {
          if (outputId === 'gate') return undefined;
          const depthPct = Math.max(0, Math.min(100, Number(depthInput?.value) ?? 100));
          return ((stepPitch[currentStep] ?? 0) / 100) * (depthPct / 100);
        },
        getModulationRange(outputId) {
          if (outputId === 'gate') return undefined;
          const maxP = stepCount ? Math.max(...stepPitch.slice(0, stepCount), 0) : 0;
          const depthPct = Math.max(0, Math.min(100, Number(depthInput?.value) ?? 100));
          return { min: 0, max: (maxP / 100) * (depthPct / 100) };
        },
        /** バー表示用: 緑の先端からのオフセット％。depth と pitch 最大値まで右に伸びる */
        getModulationRangePercent(outputId) {
          if (outputId === 'gate') return undefined;
          const maxP = stepCount ? Math.max(...stepPitch.slice(0, stepCount), 0) : 0;
          const depthPct = Math.max(0, Math.min(100, Number(depthInput?.value) ?? 100));
          return { leftOffset: 0, rightOffset: Math.min(100, maxP * (depthPct / 100)) };
        },
        addGateListener(cb) {
          gateListeners.push(cb);
        },
        removeGateListener(cb) {
          const idx = gateListeners.indexOf(cb);
          if (idx !== -1) gateListeners.splice(idx, 1);
        },
        restoreState(state) {
          if (!state || typeof state !== 'object') return;
          for (let i = 0; i < stepCount; i++) {
            if (state[`gate_${i}`] !== undefined) {
              stepGate[i] = !!state[`gate_${i}`];
              const cell = getPitchCell(i);
              if (cell) cell.classList.toggle('synth-module__step-pitch-cell--gate-on', stepGate[i]);
            }
          }
        },
        destroy() {
          if (vizResult?.destroy) vizResult.destroy();
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

export const sequencer8Module = createSequencerModule(8, 1);
export const sequencer16Module = createSequencerModule(16, 2);
export const sequencer32Module = createSequencerModule(32, 4);
