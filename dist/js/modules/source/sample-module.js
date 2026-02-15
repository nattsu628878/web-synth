/**
 * sample-module.js
 * Web Synth - サンプル用の「何も機能しない」モジュール
 * 後から細かい UI や画像を追加しやすいようにルート要素だけ用意
 */

import { attachWaveformViz } from '../../waveform-viz.js';

/** @type {import('../base.js').ModuleFactory} */
export const sampleModule = {
  meta: {
    id: 'sample',
    name: 'Sample',
    kind: 'source',
    description: 'Sample module (placeholder for UI)',
  },

  /**
   * @param {string} instanceId
   * @returns {{ element: HTMLElement, getAudioInput?: function, getAudioOutput?: function, destroy?: function }}
   */
  create(instanceId) {
    const root = document.createElement('div');
    root.className = 'synth-module synth-module--sample synth-module--source';
    root.dataset.moduleId = instanceId;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Sample module');

    // ヘッダー（タイトル＋後からボタン等を追加しやすい）
    const header = document.createElement('div');
    header.className = 'synth-module__header';
    const title = document.createElement('span');
    title.className = 'synth-module__title';
    title.textContent = sampleModule.meta.name;
    header.appendChild(title);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'synth-module__remove';
    removeBtn.title = 'Remove';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', 'Remove module');
    header.appendChild(removeBtn);
    root.appendChild(header);

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
