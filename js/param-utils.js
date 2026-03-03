/**
 * param-utils.js
 * 案B: パラメータを内部 0-1 で統一し、境界で倍率をかける共通層
 * LFO は -0.5 ～ 0.5 の双極として扱う
 */

/** @typedef {[number, number]} ParamRange - [min, max] のタプル */

/**
 * 変調可能パラメータのメタ（getModulatableParams の 1 要素）
 * @typedef {Object} ParamMeta
 * @property {string} id
 * @property {string} name
 * @property {AudioParam} param
 * @property {ParamRange} range - AudioParam に送る実際の範囲 [min, max]
 * @property {ParamRange} [displayRange] - 表示用範囲。省略時は range を使う
 * @property {(value: number) => string} [format] - 表示フォーマット。省略時は value をそのまま文字列化
 */

/**
 * 0-1 をパラメータ範囲の値に変換する
 * @param {number} norm - 0～1 の正規化値
 * @param {ParamRange} range - [min, max]
 * @returns {number}
 */
export function normToParam(norm, range) {
  const [min, max] = range;
  const n = clampNorm(norm);
  return min + n * (max - min);
}

/**
 * パラメータ値を 0-1 に正規化する
 * @param {number} value
 * @param {ParamRange} range - [min, max]
 * @returns {number} 0～1（範囲外はクランプ）
 */
export function paramToNorm(value, range) {
  const [min, max] = range;
  const span = max - min;
  if (span <= 0) return 0;
  return clampNorm((value - min) / span);
}

/**
 * 0-1 を表示用の値にスケールし、format で文字列化する
 * @param {number} norm - 0～1
 * @param {ParamRange} displayRange - 表示範囲 [min, max]
 * @param {(value: number) => string} [format] - 省略時は Math.round(value) の文字列
 * @returns {string}
 */
export function normToDisplay(norm, displayRange, format) {
  const value = normToParam(norm, displayRange);
  if (format) return format(value);
  return String(Math.round(value));
}

/**
 * 0-1 にクランプする
 * @param {number} norm
 * @returns {number}
 */
export function clampNorm(norm) {
  const n = Number(norm);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// --- LFO: -0.5 ～ 0.5 の双極範囲（案B ではこの範囲で統一） ---

/** LFO 出力の最小値 */
export const LFO_RANGE_MIN = -0.5;
/** LFO 出力の最大値 */
export const LFO_RANGE_MAX = 0.5;

/**
 * LFO の双極値 (-0.5～0.5) を 0-1 のユニポラに変換する（変調の effective 計算用）
 * @param {number} bipolar - LFO 出力（-0.5 ～ 0.5）
 * @returns {number} 0～1
 */
export function lfoBipolarToUnipolar(bipolar) {
  const span = LFO_RANGE_MAX - LFO_RANGE_MIN;
  const n = (bipolar - LFO_RANGE_MIN) / span;
  return clampNorm(n);
}

/**
 * 0-1 のユニポラを LFO の双極値 (-0.5～0.5) に変換する（LFO 内部で norm から出力値を得る用）
 * @param {number} norm - 0～1
 * @returns {number} -0.5 ～ 0.5
 */
export function unipolarToLfoBipolar(norm) {
  const n = clampNorm(norm);
  return LFO_RANGE_MIN + n * (LFO_RANGE_MAX - LFO_RANGE_MIN);
}

/**
 * 任意の双極範囲 [low, high] を 0-1 にマップする（汎用）
 * @param {number} value
 * @param {number} low
 * @param {number} high
 * @returns {number} 0～1
 */
export function bipolarToUnipolar(value, low, high) {
  const span = high - low;
  if (span <= 0) return 0;
  return clampNorm((value - low) / span);
}

// --- 共通のパラメータ定義（表示範囲・フォーマット）をファイルに保存 ---

/** よく使う表示フォーマット */
export const ParamFormat = {
  /** 周波数 (Hz) */
  freq: (v) => `${Math.round(v)} Hz`,
  /** 百分率 (%) */
  percent: (v) => `${Math.round(v)} %`,
  /** ゲイン dB */
  db: (v) => `${(Math.round(v * 10) / 10).toFixed(1)} dB`,
  /** そのまま整数 */
  integer: (v) => String(Math.round(v)),
  /** 小数2桁 */
  float2: (v) => String(Math.round(v * 100) / 100),
  /** 時間 ms */
  ms: (v) => `${Math.round(v)} ms`,
};

/**
 * よく使うパラメータの range / displayRange / format の定義
 * モジュールはこれを参照して ParamMeta を組み立てられる
 */
export const PARAM_DEFS = {
  /** 周波数 20–2000 Hz（表示も同じ） */
  frequency: {
    range: [20, 2000],
    displayRange: [20, 2000],
    format: ParamFormat.freq,
  },
  /** ゲイン 0–100% 表示、AudioParam は 0–1 */
  gain: {
    range: [0, 1],
    displayRange: [0, 100],
    format: ParamFormat.percent,
  },
  /** ゲイン dB（例: EQ） */
  gainDb: {
    range: [-12, 12],
    displayRange: [-12, 12],
    format: ParamFormat.db,
  },
  /** 0–100% そのまま（morph, mix など） */
  percent: {
    range: [0, 1],
    displayRange: [0, 100],
    format: ParamFormat.percent,
  },
  /** Q / レゾナンス */
  q: {
    range: [0.01, 20],
    displayRange: [0.01, 20],
    format: ParamFormat.float2,
  },
  /** ディレイ時間 (s)。表示は ms */
  timeSec: {
    range: [0, 2],
    displayRange: [0, 2000],
    format: (v) => `${Math.round(v * 1000)} ms`,
  },
  /** LFO 出力範囲（双極 -0.5～0.5）。変調ソース用 */
  lfoBipolar: {
    range: [LFO_RANGE_MIN, LFO_RANGE_MAX],
    displayRange: [LFO_RANGE_MIN, LFO_RANGE_MAX],
    format: (v) => String(Math.round(v * 100) / 100),
  },
  /** パルス幅 0–1（表示 0–100%） */
  pulseWidth: {
    range: [0, 1],
    displayRange: [0, 100],
    format: ParamFormat.percent,
  },
  /** 減衰・ダンピング（0–1、表示 0–100% または 30–99 などモジュール依存） */
  damping: {
    range: [0, 1],
    displayRange: [0, 100],
    format: ParamFormat.percent,
  },
  /** FM インデックス（0–50 など） */
  index: {
    range: [0, 50],
    displayRange: [0, 50],
    format: (v) => `${Math.round(v)} —`,
  },
  /** フィードバック 0–1（表示 0–100%） */
  feedback: {
    range: [0, 1],
    displayRange: [0, 100],
    format: ParamFormat.percent,
  },
};

/**
 * ParamMeta から norm をパラメータ値に変換する（range を使用）
 * @param {number} norm - 0～1
 * @param {ParamMeta} meta - range 必須
 * @returns {number}
 */
export function normToParamFromMeta(norm, meta) {
  return normToParam(norm, meta.range);
}

/**
 * パラメータ値を norm に変換する（ParamMeta の range を使用）
 * @param {number} value
 * @param {ParamMeta} meta
 * @returns {number} 0～1
 */
export function paramToNormFromMeta(value, meta) {
  return paramToNorm(value, meta.range);
}

/**
 * ParamMeta から表示用文字列を返す（displayRange 省略時は range を使用）
 * @param {number} norm - 0～1
 * @param {ParamMeta} meta
 * @returns {string}
 */
export function normToDisplayFromMeta(norm, meta) {
  const displayRange = meta.displayRange ?? meta.range;
  return normToDisplay(norm, displayRange, meta.format);
}
