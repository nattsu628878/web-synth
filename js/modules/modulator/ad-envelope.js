/**
 * ad-envelope.js
 * Web Synth - AD Envelope（Attack–Decay）
 * トリガーで 0→1→0。パーカス・pluck 向き。Gate 接続で Sequencer からトリガー可能。
 */

import { formatParamValue } from '../base.js';
import { ensureAudioContext } from '../../audio-core.js';
import { createOutputJack, createInputJack } from '../../cables.js';

/** AD の値 at time t (0 <= t <= attack + decay) を返す */
function adValueAt(t, attack, decay) {
  if (t <= 0) return 0;
  if (t <= attack) return attack > 0 ? t / attack : 1;
  if (t <= attack + decay) return decay > 0 ? 1 - (t - attack) / decay : 0;
  return 0;
}

/**
 * AD Envelope 専用ビジュアライザ: AD の形を描画し、トリガー時に軌跡を表示
 */
function attachAdEnvelopeViz(container, getParams) {
  const wrapper = document.createElement('div');
  wrapper.className = 'synth-module__waveform-viz synth-module__waveform-viz--ad-envelope';
  const canvas = document.createElement('canvas');
  canvas.className = 'synth-module__waveform-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  wrapper.appendChild(canvas);
  container.insertBefore(wrapper, container.firstChild);

  const dpr = window.devicePixelRatio || 1;
  let rafId = null;
  let triggerStart = 0;

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

    const params = getParams();
    const attack = params.attack / 1000;
    const decay = params.decay / 1000;
    const totalSec = Math.max(attack + decay, 0.01);

    const padding = 2;
    const graphW = w - padding * 2;
    const graphH = h - padding * 2;
    const baseY = padding + graphH;
    const toX = (t) => padding + (t / totalSec) * graphW;
    const toY = (v) => baseY - v * graphH;

    cctx.strokeStyle = 'rgba(98, 136, 120, 0.35)';
    cctx.lineWidth = 1.5;
    cctx.beginPath();
    cctx.moveTo(toX(0), toY(0));
    cctx.lineTo(toX(attack), toY(1));
    cctx.lineTo(toX(attack + decay), toY(0));
    cctx.stroke();

    const now = performance.now() / 1000;
    const elapsed = now - triggerStart;
    const playing = elapsed >= 0 && elapsed < totalSec + 0.05;

    if (playing && elapsed <= totalSec) {
      const currentVal = adValueAt(elapsed, attack, decay);
      const curX = toX(elapsed);
      const curY = toY(currentVal);

      cctx.strokeStyle = '#628878';
      cctx.lineWidth = 2;
      cctx.beginPath();
      cctx.moveTo(toX(0), toY(0));
      for (let t = 0; t <= elapsed; t += 0.002) {
        const v = adValueAt(t, attack, decay);
        cctx.lineTo(toX(t), toY(v));
      }
      cctx.lineTo(curX, curY);
      cctx.stroke();

      cctx.fillStyle = '#628878';
      cctx.beginPath();
      cctx.arc(curX, curY, 3, 0, Math.PI * 2);
      cctx.fill();
      cctx.strokeStyle = 'rgba(255,255,255,0.8)';
      cctx.lineWidth = 1;
      cctx.stroke();
    }

    rafId = requestAnimationFrame(draw);
  }

  rafId = requestAnimationFrame(draw);

  return {
    destroy() {
      if (rafId != null) cancelAnimationFrame(rafId);
      wrapper.remove();
    },
    trigger() {
      triggerStart = performance.now() / 1000;
    },
  };
}

/** @type {import('../base.js').ModuleFactory} */
export const adEnvelopeModule = {
  meta: {
    id: 'ad-envelope',
    name: 'AD Env',
    kind: 'modulator',
    description: 'Attack–Decay envelope (pluck, percussive)',
  },

  create(instanceId) {
    const ctx = ensureAudioContext();
    const outNode = ctx.createConstantSource();
    outNode.offset.value = 0;
    outNode.start(ctx.currentTime);

    const root = document.createElement('div');
    root.className = 'synth-module synth-module--modulator';
    root.dataset.moduleId = instanceId;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'AD Envelope');

    const header = document.createElement('div');
    header.className = 'synth-module__header';
    const title = document.createElement('span');
    title.className = 'synth-module__title';
    title.textContent = adEnvelopeModule.meta.name;
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
    body.innerHTML = `
      <div class="synth-module__row"><label class="synth-module__label">A</label><input type="range" class="synth-module__slider" data-param="attack" min="1" max="500" value="10"><span class="synth-module__value">10 ms</span></div>
      <div class="synth-module__row"><label class="synth-module__label">D</label><input type="range" class="synth-module__slider" data-param="decay" min="1" max="2000" value="200"><span class="synth-module__value">200 ms</span></div>
      <div class="synth-module__row"><label class="synth-module__label">Depth</label><input type="range" class="synth-module__slider" data-param="depth" min="0" max="100" value="50"><span class="synth-module__value">50 %</span></div>
      <div class="synth-module__row"><button type="button" class="synth-module__trigger" data-param="trigger">Trigger</button></div>
    `;
    const triggerRow = body.querySelector('.synth-module__row:last-child');
    const triggerJackWrap = document.createElement('div');
    triggerJackWrap.className = 'synth-module__jack-wrap';
    triggerJackWrap.title = 'Drop Gate (e.g. from Sequencer)';
    createInputJack(triggerJackWrap, 'trigger');
    triggerRow.appendChild(triggerJackWrap);
    root.appendChild(body);

    const attackInput = body.querySelector('[data-param="attack"]');
    const attackValue = body.querySelectorAll('.synth-module__value')[0];
    const decayInput = body.querySelector('[data-param="decay"]');
    const decayValue = body.querySelectorAll('.synth-module__value')[1];
    const depthInput = body.querySelector('[data-param="depth"]');
    const depthValue = body.querySelectorAll('.synth-module__value')[2];
    const triggerBtn = body.querySelector('[data-param="trigger"]');

    const depthGain = ctx.createGain();
    depthGain.gain.value = 0.5;
    outNode.connect(depthGain);

    function fireTrigger() {
      const t = ctx.currentTime;
      const a = Number(attackInput.value) / 1000;
      const d = Number(decayInput.value) / 1000;
      outNode.offset.cancelScheduledValues(t);
      outNode.offset.setValueAtTime(0, t);
      outNode.offset.linearRampToValueAtTime(1, t + a);
      outNode.offset.linearRampToValueAtTime(0, t + a + d);
    }

    attackInput.addEventListener('input', () => {
      attackValue.textContent = `${formatParamValue(attackInput.value)} ms`;
    });
    decayInput.addEventListener('input', () => {
      decayValue.textContent = `${formatParamValue(decayInput.value)} ms`;
    });
    depthInput.addEventListener('input', () => {
      depthGain.gain.setTargetAtTime(Number(depthInput.value) / 100, ctx.currentTime, 0.01);
      depthValue.textContent = `${formatParamValue(depthInput.value)} %`;
    });

    function getParams() {
      return {
        attack: Number(attackInput.value),
        decay: Number(decayInput.value),
      };
    }

    const viz = attachAdEnvelopeViz(body, getParams);

    triggerBtn.addEventListener('click', () => {
      fireTrigger();
      viz.trigger();
    });

    attackValue.textContent = `${formatParamValue(attackInput.value)} ms`;
    decayValue.textContent = `${formatParamValue(decayInput.value)} ms`;
    depthValue.textContent = '50 %';

    return {
      element: root,
      getModulationOutput() {
        return depthGain;
      },
      trigger() {
        fireTrigger();
        viz.trigger();
      },
      destroy() {
        viz.destroy();
        try {
          outNode.stop();
          outNode.disconnect();
          depthGain.disconnect();
        } catch (_) {}
      },
    };
  },
};
