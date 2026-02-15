/**
 * ff-osc.js
 * Web Synth - Freeform Oscillator（描いた波形を再生する OSC）
 * プレースホルダ：後でキャンバス描画 → PeriodicWave で発音を実装
 */

import { attachWaveformViz } from '../../waveform-viz.js';

/** @type {import('../base.js').ModuleFactory} */
export const ffOscModule = {
  meta: {
    id: 'ff-osc',
    name: 'FF-Osc',
    kind: 'source',
    description: 'Freeform oscillator (draw waveform, play it)',
  },

  /**
   * @param {string} instanceId
   * @returns {{ element: HTMLElement, getAudioOutput?: function, destroy?: function }}
   */
  create(instanceId) {
    const root = document.createElement('div');
    root.className = 'synth-module synth-module--ff-osc synth-module--source';
    root.dataset.moduleId = instanceId;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'FF-Osc (Freeform Oscillator)');

    const header = document.createElement('div');
    header.className = 'synth-module__header';
    const title = document.createElement('span');
    title.className = 'synth-module__title';
    title.textContent = ffOscModule.meta.name;
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
    body.className = 'synth-module__body';
    body.innerHTML = '<span class="synth-module__placeholder">(draw waveform — not implemented)</span>';
    root.appendChild(body);

    const viz = attachWaveformViz(body, null);

    return {
      element: root,
      destroy() {
        viz.destroy();
      },
    };
  },
};
