/**
 * sample-module.js
 * Web Synth - サンプル用の「何も機能しない」モジュール
 * 後から細かい UI や画像を追加しやすいようにルート要素だけ用意
 */

import { createModuleRoot, createModuleHeader } from '../base.js';
import { attachWaveformViz } from '../../waveform-viz.js';

/** @type {import('../base.js').ModuleFactory} */
export const sampleModule = {
  meta: {
    id: 'sample',
    name: 'Sample',
    kind: 'source',
    description: 'Sample module (placeholder for UI)',
    previewDescription: 'Signal: 1 audio out, trigger in.\nSample playback; load and trigger.',
  },

  /**
   * @param {string} instanceId
   * @returns {{ element: HTMLElement, getAudioInput?: function, getAudioOutput?: function, destroy?: function }}
   */
  create(instanceId) {
    const root = createModuleRoot(instanceId, 'Sample module', 'synth-module--sample', 'synth-module--source');
    root.appendChild(createModuleHeader(sampleModule.meta.name));

    // ボディ（波形ビジュアライズ ＋ プレースホルダ）
    const body = document.createElement('div');
    body.className = 'synth-module__body';
    body.innerHTML = '<span class="synth-module__placeholder">(not implemented)</span>';
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
