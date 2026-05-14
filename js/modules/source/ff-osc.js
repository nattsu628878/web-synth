/**
 * ff-osc.js
 * Web Synth - Freeform Oscillator（描いた波形を再生する OSC）
 * プレースホルダ：後でキャンバス描画 → PeriodicWave で発音を実装
 */

import { createModuleRoot, createModuleHeader } from '../base.js';
import { attachWaveformViz } from '../../waveform-viz.js';

/** @type {import('../base.js').ModuleFactory} */
export const ffOscModule = {
  meta: {
    id: 'ff-osc',
    name: 'FF-Osc',
    kind: 'source',
    description: 'Freeform oscillator (draw waveform, play it)',
    previewDescription: 'Signal: 1 audio out.\nDraw-your-own waveform oscillator.',
  },

  /**
   * @param {string} instanceId
   * @returns {{ element: HTMLElement, getAudioOutput?: function, destroy?: function }}
   */
  create(instanceId) {
    const root = createModuleRoot(instanceId, 'FF-Osc (Freeform Oscillator)', 'synth-module--ff-osc', 'synth-module--source');
    root.appendChild(createModuleHeader(ffOscModule.meta.name));

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
