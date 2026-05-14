/**
 * ff-wavetable.js
 * Web Synth - Freeform Wavetable（描いた波形同士をモーフィング）
 * プレースホルダ：後で 2 波形描画 → モーフ再生を実装
 */

import { createModuleRoot, createModuleHeader } from '../base.js';
import { attachWaveformViz } from '../../waveform-viz.js';

/** @type {import('../base.js').ModuleFactory} */
export const ffWavetableModule = {
  meta: {
    id: 'ff-wavetable',
    name: 'FF-Wavetable',
    kind: 'source',
    description: 'Freeform wavetable (morph between two drawn waveforms)',
    previewDescription: 'Signal: 1 audio out.\nTwo drawn waves; morph between A/B.',
  },

  /**
   * @param {string} instanceId
   * @returns {{ element: HTMLElement, getAudioOutput?: function, destroy?: function }}
   */
  create(instanceId) {
    const root = createModuleRoot(instanceId, 'FF-Wavetable (Freeform Wavetable)', 'synth-module--ff-wavetable', 'synth-module--source');
    root.appendChild(createModuleHeader(ffWavetableModule.meta.name));

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
