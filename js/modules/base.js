/**
 * base.js
 * Web Synth - ラックに配置するモジュールの基底インターフェース
 * 各モジュールは createElement() で DOM を返し、必要なら getAudioInput/getAudioOutput を実装する
 */

/**
 * モジュール種別（色分け・配置に使用）
 * @typedef {'source'|'effect'|'modulator'} ModuleKind
 */

/**
 * モジュールのメタ情報
 * @typedef {Object} ModuleMeta
 * @property {string} id - 一意の種類 ID（例: 'sample'）
 * @property {string} name - 表示名
 * @property {ModuleKind} kind - 音源 / エフェクト / エンベロープ・LFO
 * @property {string} [description] - 説明（任意）
 * @property {string} [previewDescription] - プレビュー枠用の説明（英語・概要・信号、任意）
 */

/**
 * モジュールインスタンスが実装するインターフェース
 * - createElement(instanceId: string): HTMLElement  … モジュールのルート DOM（細かい UI はここで自由に実装可能）
 * - getAudioInput?(): AudioNode|null   … このモジュールの入力ノード（前段から接続される）
 * - getAudioOutput?(): AudioNode|null … このモジュールの出力ノード（次段へ接続される）
 * - getModulationOutput?(): AudioNode|null … モジュレータ用。LFO/エンベロープの出力（AudioParam に接続）
 * - getModulatableParams?(): Array<import('../param-utils.js').ParamMeta | { id, name, param, paramMin?, paramMax? }> … 接続先候補（案B では ParamMeta の range/displayRange/format を使用。互換のため paramMin/paramMax も可）
 * - destroy?(): void                   … 削除時のクリーンアップ
 */

/**
 * モジュールファクトリの型
 * @typedef {Object} ModuleFactory
 * @property {ModuleMeta} meta
 * @property {function(string): { element: HTMLElement, getAudioInput?: function, getAudioOutput?: function, destroy?: function }} create - (instanceId) => instance
 */

/**
 * パラメータ表示用: 小数点以下切り捨てで整数表示
 * @param {string|number} v
 * @returns {string}
 */
export function formatParamValue(v) {
  return String(Math.floor(Number(v)));
}

/**
 * 周波数表示用: 小数点以下切り捨て（Hz 表示用）
 * @param {string|number} v
 * @returns {string}
 */
export function formatParamValueFreq(v) {
  return String(Math.floor(Number(v)));
}

export const ModuleMeta = {};
export const ModuleFactory = {};
