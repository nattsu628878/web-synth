/**
 * envelope.js
 * Web Synth - エンベロープ（ADSR）
 * トリガーで発火し、同段のパラメータに接続可能。
 * 波形窓に ADSR の形を表示し、トリガー時に軌跡をアニメーション。
 */

import { ensureAudioContext } from '../audio-core.js';
import { createOutputJack, createInputJack } from '../cables.js';

/** ADSR の値 at time t (0 <= t <= totalSec) を返す。totalSec = attack + decay + release */
function envelopeValueAt(t, attack, decay, sustain, release) {
  if (t <= 0) return 0;
  if (t <= attack) return attack > 0 ? t / attack : 1;
  if (t <= attack + decay) return decay > 0 ? 1 + (sustain - 1) * ((t - attack) / decay) : sustain;
  if (t <= attack + decay + release) return release > 0 ? sustain + (0 - sustain) * ((t - attack - decay) / release) : 0;
  return 0;
}

/**
 * エンベロープ専用ビジュアライザ: ADSR の形を描画し、トリガー時に軌跡を表示
 */
function attachEnvelopeViz(container, getParams) {
  const wrapper = document.createElement('div');
  wrapper.className = 'synth-module__waveform-viz synth-module__waveform-viz--envelope';
  const canvas = document.createElement('canvas');
  canvas.className = 'synth-module__waveform-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  wrapper.appendChild(canvas);
  container.insertBefore(wrapper, container.firstChild);

  const dpr = window.devicePixelRatio || 1;
  let rafId = null;
  let triggerStart = 0; // performance.now() / 1000

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
    const sustain = params.sustain / 100;
    const release = params.release / 1000;
    const totalSec = Math.max(attack + decay + release, 0.01);
    if (totalSec <= 0) {
      rafId = requestAnimationFrame(draw);
      return;
    }

    const padding = 2;
    const graphW = w - padding * 2;
    const graphH = h - padding * 2;
    const baseY = padding + graphH;

    const toX = (t) => padding + (t / totalSec) * graphW;
    const toY = (v) => baseY - v * graphH;

    // ADSR の形（薄い線）
    cctx.strokeStyle = 'rgba(98, 136, 120, 0.35)';
    cctx.lineWidth = 1.5;
    cctx.beginPath();
    cctx.moveTo(toX(0), toY(0));
    cctx.lineTo(toX(attack), toY(1));
    cctx.lineTo(toX(attack + decay), toY(sustain));
    cctx.lineTo(toX(attack + decay + release), toY(0));
    cctx.stroke();

    const now = performance.now() / 1000;
    const elapsed = now - triggerStart;
    const playing = elapsed >= 0 && elapsed < totalSec + 0.05;

    if (playing && elapsed <= totalSec) {
      const currentVal = envelopeValueAt(elapsed, attack, decay, sustain, release);
      const curX = toX(elapsed);
      const curY = toY(currentVal);

      // 軌跡（先頭まで塗った線）
      cctx.strokeStyle = '#628878';
      cctx.lineWidth = 2;
      cctx.beginPath();
      cctx.moveTo(toX(0), toY(0));
      for (let t = 0; t <= elapsed; t += 0.002) {
        const v = envelopeValueAt(t, attack, decay, sustain, release);
        cctx.lineTo(toX(t), toY(v));
      }
      cctx.lineTo(curX, curY);
      cctx.stroke();

      // 現在位置のマーカー
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

/** @type {import('./base.js').ModuleFactory} */
export const envelopeModule = {
  meta: {
    id: 'envelope',
    name: 'Envelope',
    kind: 'modulator',
    description: 'ADSR envelope (connect to params via cable)',
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
    root.setAttribute('aria-label', 'Envelope');

    const header = document.createElement('div');
    header.className = 'synth-module__header';
    const title = document.createElement('span');
    title.className = 'synth-module__title';
    title.textContent = envelopeModule.meta.name;
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
      <div class="synth-module__row"><label class="synth-module__label">A</label><input type="range" class="synth-module__slider" data-param="attack" min="1" max="500" value="50"><span class="synth-module__value">50 ms</span></div>
      <div class="synth-module__row"><label class="synth-module__label">D</label><input type="range" class="synth-module__slider" data-param="decay" min="1" max="500" value="100"><span class="synth-module__value">100 ms</span></div>
      <div class="synth-module__row"><label class="synth-module__label">S</label><input type="range" class="synth-module__slider" data-param="sustain" min="0" max="100" value="70"><span class="synth-module__value">70 %</span></div>
      <div class="synth-module__row"><label class="synth-module__label">R</label><input type="range" class="synth-module__slider" data-param="release" min="10" max="2000" value="200"><span class="synth-module__value">200 ms</span></div>
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
    const sustainInput = body.querySelector('[data-param="sustain"]');
    const sustainValue = body.querySelectorAll('.synth-module__value')[2];
    const releaseInput = body.querySelector('[data-param="release"]');
    const releaseValue = body.querySelectorAll('.synth-module__value')[3];
    const depthInput = body.querySelector('[data-param="depth"]');
    const depthValue = body.querySelectorAll('.synth-module__value')[4];
    const triggerBtn = body.querySelector('[data-param="trigger"]');

    const depthGain = ctx.createGain();
    depthGain.gain.value = 0.5;
    outNode.connect(depthGain);

    function fireTrigger() {
      const t = ctx.currentTime;
      const a = Number(attackInput.value) / 1000;
      const d = Number(decayInput.value) / 1000;
      const s = Number(sustainInput.value) / 100;
      const r = Number(releaseInput.value) / 1000;
      outNode.offset.cancelScheduledValues(t);
      outNode.offset.setValueAtTime(0, t);
      outNode.offset.linearRampToValueAtTime(1, t + a);
      outNode.offset.linearRampToValueAtTime(s, t + a + d);
      const releaseStart = t + a + d + 0.001;
      outNode.offset.linearRampToValueAtTime(0, releaseStart + r);
    }

    attackInput.addEventListener('input', () => { attackValue.textContent = `${attackInput.value} ms`; });
    decayInput.addEventListener('input', () => { decayValue.textContent = `${decayInput.value} ms`; });
    sustainInput.addEventListener('input', () => {
      sustainValue.textContent = `${sustainInput.value} %`;
    });
    releaseInput.addEventListener('input', () => { releaseValue.textContent = `${releaseInput.value} ms`; });
    depthInput.addEventListener('input', () => {
      depthGain.gain.setTargetAtTime(Number(depthInput.value) / 100, ctx.currentTime, 0.01);
      depthValue.textContent = `${depthInput.value} %`;
    });
    function getParams() {
      return {
        attack: Number(attackInput.value),
        decay: Number(decayInput.value),
        sustain: Number(sustainInput.value),
        release: Number(releaseInput.value),
      };
    }

    const viz = attachEnvelopeViz(body, getParams);

    triggerBtn.addEventListener('click', () => {
      fireTrigger();
      viz.trigger();
    });

    attackValue.textContent = `${attackInput.value} ms`;
    decayValue.textContent = `${decayInput.value} ms`;
    sustainValue.textContent = '70 %';
    releaseValue.textContent = `${releaseInput.value} ms`;
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
