/**
 * ff-wavetable.js
 * Web Synth - Freeform Wavetable（描いた波形同士をモーフィング）
 * プレースホルダ：後で 2 波形描画 → モーフ再生を実装
 */

import { attachWaveformViz } from '../../waveform-viz.js';

/** @type {import('../base.js').ModuleFactory} */
export const ffWavetableModule = {
  meta: {
    id: 'ff-wavetable',
    name: 'FF-Wavetable',
    kind: 'source',
    description: 'Freeform wavetable (morph between two drawn waveforms)',
  },

  /**
   * @param {string} instanceId
   * @returns {{ element: HTMLElement, getAudioOutput?: function, destroy?: function }}
   */
  create(instanceId) {
    const root = document.createElement('div');
    root.className = 'synth-module synth-module--ff-wavetable synth-module--source';
    root.dataset.moduleId = instanceId;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'FF-Wavetable (Freeform Wavetable)');

    const header = document.createElement('div');
    header.className = 'synth-module__header';
    const title = document.createElement('span');
    title.className = 'synth-module__title';
    title.textContent = ffWavetableModule.meta.name;
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
    body.innerHTML = '<span class="synth-module__placeholder">(draw two waves, morph — not implemented)</span>';
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
