/**
 * delay.js
 * Web Synth - Delay（エコー）エフェクト
 * DelayNode + フィードバックでエコー。Time / Feedback / Mix。
 */

import { formatParamValue } from '../base.js';
import { ensureAudioContext } from '../../audio-core.js';
import { attachWaveformViz } from '../../waveform-viz.js';
import { createInputJack } from '../../cables.js';
import { paramToNorm, normToParam, PARAM_DEFS, ParamFormat } from '../../param-utils.js';

const TIME_MIN = 1;
const TIME_MAX = 2000; // ms
const FEEDBACK_MAX = 98; // % (1未満に保つ)

/** @type {import('../base.js').ModuleFactory} */
export const delayModule = {
  meta: {
    id: 'delay',
    name: 'Delay',
    kind: 'effect',
    description: 'Echo delay (Time, Feedback, Dry/Wet)',
    previewDescription: 'Signal: audio in/out.\nDelay; time, feedback, mix.',
  },

  create(instanceId) {
    const ctx = ensureAudioContext();
    const inputGain = ctx.createGain();
    inputGain.gain.value = 1;

    // maxDelayTime 2秒で作成（TIME_MAX 2000ms に対応）
    const delayNode = new DelayNode(ctx, { delayTime: 0.3, maxDelayTime: 2 });
    const feedbackGain = ctx.createGain();
    feedbackGain.gain.value = 0.4;

    // 入力 → delay へ。delay → feedback → delay（ループ）。delay → wet
    inputGain.connect(delayNode);
    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);

    const dryGain = ctx.createGain();
    dryGain.gain.value = 0.7;
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.3;
    const outputGain = ctx.createGain();
    outputGain.gain.value = 1;

    inputGain.connect(dryGain);
    delayNode.connect(wetGain);
    dryGain.connect(outputGain);
    wetGain.connect(outputGain);

    const root = document.createElement('div');
    root.className = 'synth-module synth-module--effect';
    root.dataset.moduleId = instanceId;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Delay');

    const header = document.createElement('div');
    header.className = 'synth-module__header';
    const title = document.createElement('span');
    title.className = 'synth-module__title';
    title.textContent = delayModule.meta.name;
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

    const timeRow = document.createElement('div');
    timeRow.className = 'synth-module__row';
    timeRow.innerHTML = `
      <label class="synth-module__label">Time</label>
      <input type="range" class="synth-module__slider" data-param="time" min="0" max="100" value="15" step="0.5">
      <span class="synth-module__value">300 ms</span>
    `;
    const timeJackWrap = document.createElement('div');
    timeJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(timeJackWrap, 'time');
    timeRow.appendChild(timeJackWrap);
    body.appendChild(timeRow);

    const feedbackRow = document.createElement('div');
    feedbackRow.className = 'synth-module__row';
    feedbackRow.innerHTML = `
      <label class="synth-module__label">Feedback</label>
      <input type="range" class="synth-module__slider" data-param="feedback" min="0" max="98" value="40" step="1">
      <span class="synth-module__value">40 %</span>
    `;
    const feedbackJackWrap = document.createElement('div');
    feedbackJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(feedbackJackWrap, 'feedback');
    feedbackRow.appendChild(feedbackJackWrap);
    body.appendChild(feedbackRow);

    const mixRow = document.createElement('div');
    mixRow.className = 'synth-module__row';
    mixRow.innerHTML = `
      <label class="synth-module__label">Mix</label>
      <input type="range" class="synth-module__slider" data-param="mix" min="0" max="100" value="30" step="1">
      <span class="synth-module__value">30 %</span>
    `;
    const mixJackWrap = document.createElement('div');
    mixJackWrap.className = 'synth-module__jack-wrap';
    createInputJack(mixJackWrap, 'wet');
    mixRow.appendChild(mixJackWrap);
    body.appendChild(mixRow);

    root.appendChild(body);

    const timeInput = body.querySelector('[data-param="time"]');
    const feedbackInput = body.querySelector('[data-param="feedback"]');
    const mixInput = body.querySelector('[data-param="mix"]');
    const valueSpans = body.querySelectorAll('.synth-module__value');
    const timeValue = valueSpans[0];
    const feedbackValue = valueSpans[1];
    const mixValue = valueSpans[2];

    function timeSliderToMs(v) {
      const x = Math.max(0, Math.min(100, Number(v))) / 100;
      return Math.round(TIME_MIN + (TIME_MAX - TIME_MIN) * x);
    }
    function msToTimeSlider(ms) {
      const x = (Math.max(TIME_MIN, Math.min(TIME_MAX, ms)) - TIME_MIN) / (TIME_MAX - TIME_MIN);
      return Math.round(x * 100);
    }

    const timeRange = [0.001, 2];
    const timeDisplayRange = [0, 100];
    const timeFormat = (v) => `${Math.round(TIME_MIN + (TIME_MAX - TIME_MIN) * Number(v) / 100)} ms`;
    const feedbackDisplayRange = [0, FEEDBACK_MAX];
    const mixDef = PARAM_DEFS.percent;

    timeInput.addEventListener('input', () => {
      const norm = paramToNorm(Number(timeInput.value), timeDisplayRange);
      delayNode.delayTime.setTargetAtTime(normToParam(norm, timeRange), ctx.currentTime, 0.01);
      if (timeValue) timeValue.textContent = timeFormat(Number(timeInput.value));
    });
    feedbackInput.addEventListener('input', () => {
      const norm = paramToNorm(Number(feedbackInput.value), feedbackDisplayRange);
      feedbackGain.gain.setTargetAtTime(normToParam(norm, PARAM_DEFS.feedback.range), ctx.currentTime, 0.01);
      if (feedbackValue) feedbackValue.textContent = ParamFormat.percent(Number(feedbackInput.value));
    });
    mixInput.addEventListener('input', () => {
      const norm = paramToNorm(Number(mixInput.value), mixDef.displayRange);
      const w = normToParam(norm, mixDef.range);
      wetGain.gain.setTargetAtTime(w, ctx.currentTime, 0.01);
      dryGain.gain.setTargetAtTime(1 - w, ctx.currentTime, 0.01);
      if (mixValue) mixValue.textContent = mixDef.format(Number(mixInput.value));
    });

    const viz = attachWaveformViz(body, outputGain);

    return {
      element: root,
      getAudioInput() { return inputGain; },
      getAudioOutput() { return outputGain; },
      getModulatableParams() {
        return [
          { id: 'time', name: 'Time', param: delayNode.delayTime, range: timeRange, displayRange: timeDisplayRange, format: timeFormat },
          { id: 'feedback', name: 'Feedback', param: feedbackGain.gain, ...PARAM_DEFS.feedback, displayRange: feedbackDisplayRange },
          { id: 'wet', name: 'Mix', param: wetGain.gain, ...mixDef },
        ];
      },
      destroy() {
        viz.destroy();
        try {
          inputGain.disconnect();
          delayNode.disconnect();
          feedbackGain.disconnect();
          dryGain.disconnect();
          wetGain.disconnect();
          outputGain.disconnect();
        } catch (_) {}
      },
    };
  },
};
