/**
 * filter-response-viz.js
 * LPF/HPF の周波数特性を Canvas に描画（EQ-8 風グリッド＋曲線＋任意でスペクトラム）
 * LPF/HPF とも 1次CR の場合は数式で直線ロールオフを描画。それ以外は BiquadFilterNode の getFrequencyResponse を使用。
 */

const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const DB_MIN = -60;
const DB_MAX = 12;
const DB_GRID = [-12, -6, 0, 6, 12];
const N_POINTS = 256;
const PAD = 1;
const CURVE_COLOR = '#628878';
const FILL_COLOR = 'rgba(98, 136, 120, 0.25)';
const SPECTRUM_COLOR = '#628878';
const GRID_LIGHT = 'rgba(0, 0, 0, 0.12)';
const GRID_DARK = 'rgba(255, 255, 255, 0.15)';
const FFT_SIZE = 2048;
const N_BARS = 128;

function getGridFreqs() {
  const out = [];
  for (let decade = 1; decade <= 10000; decade *= 10) {
    for (let k = 1; k <= 10; k++) {
      const f = k * decade;
      if (f >= FREQ_MIN && f <= FREQ_MAX) out.push(f);
    }
  }
  return out.sort((a, b) => a - b);
}
const GRID_FREQS = getGridFreqs();

/**
 * @param {HTMLElement} container
 * @param {BiquadFilterNode|{ type: string, order?: number, getCutoff: () => number, context: BaseAudioContext }} filterNode
 * @param {AudioNode} [audioNodeForSpectrum]
 * @returns {{ destroy: () => void }}
 */
export function attachFilterResponseViz(container, filterNode, audioNodeForSpectrum = null) {
  const wrapper = document.createElement('div');
  wrapper.className = 'synth-module__waveform-viz synth-module__waveform-viz--filter-response synth-module__waveform-viz--eq8-style';
  const canvas = document.createElement('canvas');
  canvas.className = 'synth-module__waveform-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  wrapper.appendChild(canvas);
  container.insertBefore(wrapper, container.firstChild);

  const isRcLpf = typeof filterNode.getCutoff === 'function' && filterNode.type === 'lowpass';
  const isRcHpf = typeof filterNode.getCutoff === 'function' && filterNode.type === 'highpass';
  const isRcFilter = isRcLpf || isRcHpf;
  const ctx = isRcFilter ? filterNode.context : filterNode.context;
  const sampleRate = ctx?.sampleRate ?? 44100;
  const nyquist = sampleRate / 2;
  const freqMax = Math.min(FREQ_MAX, nyquist * 0.99);
  const logFreqMin = Math.log(FREQ_MIN);
  const logFreqMax = Math.log(freqMax);

  const freqArray = new Float32Array(N_POINTS);
  const magArray = new Float32Array(N_POINTS);
  const phaseArray = new Float32Array(N_POINTS);
  for (let i = 0; i < N_POINTS; i++) {
    const t = i / (N_POINTS - 1);
    freqArray[i] = Math.exp(logFreqMin + t * (logFreqMax - logFreqMin));
  }

  let analyser = null;
  let freqData = null;
  if (audioNodeForSpectrum && audioNodeForSpectrum.context) {
    analyser = audioNodeForSpectrum.context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.6;
    analyser.minDecibels = -60;
    analyser.maxDecibels = 0;
    audioNodeForSpectrum.connect(analyser);
    freqData = new Uint8Array(analyser.frequencyBinCount);
  }

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let rafId = null;

  function draw() {
    if (!canvas.isConnected) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
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

    const L = PAD;
    const R = w - PAD;
    const W = Math.max(0, R - L);
    const centerY = h / 2;
    const halfH = h / 2;
    const gridColor = document.documentElement.classList.contains('dark-mode') ? GRID_DARK : GRID_LIGHT;

    // グリッド
    cctx.strokeStyle = gridColor;
    cctx.lineWidth = 1;
    for (const f of GRID_FREQS) {
      const x = L + ((Math.log(f) - logFreqMin) / (logFreqMax - logFreqMin)) * W;
      if (x < L || x > R) continue;
      cctx.beginPath();
      cctx.moveTo(x, 0);
      cctx.lineTo(x, h);
      cctx.stroke();
    }
    for (const db of DB_GRID) {
      const y = centerY - (db / 12) * halfH;
      if (y < 0 || y > h) continue;
      cctx.beginPath();
      cctx.moveTo(L, y);
      cctx.lineTo(R, y);
      cctx.stroke();
    }

    // スペクトラム
    if (analyser && freqData) {
      analyser.getByteFrequencyData(freqData);
      const n = freqData.length;
      const barW = W / N_BARS;
      for (let i = 0; i < N_BARS; i++) {
        const t = (i + 0.5) / N_BARS;
        const f = Math.exp(logFreqMin + t * (logFreqMax - logFreqMin));
        const bin = Math.min(n - 1, Math.floor((f / nyquist) * n));
        const v = freqData[bin] / 255;
        const barH = v * h * 0.8;
        const x = L + (i / N_BARS) * W;
        cctx.fillStyle = SPECTRUM_COLOR;
        cctx.globalAlpha = 0.45;
        cctx.fillRect(x, h - barH, Math.max(0.5, barW), barH);
        cctx.globalAlpha = 1;
      }
    }

    const dbRange = DB_MAX - DB_MIN;
    const xs = [];
    const ys = [];

    if (isRcLpf) {
      const fc = Math.max(FREQ_MIN, Math.min(freqMax, filterNode.getCutoff()));
      const order = typeof filterNode.getOrder === 'function' ? filterNode.getOrder() : (filterNode.order ?? 1);
      for (let i = 0; i < N_POINTS; i++) {
        const f = freqArray[i];
        const r2 = fc > 0 ? (f / fc) * (f / fc) : 0;
        const den = 1 + r2;
        let db = 0;
        if (order === 4) db = -40 * Math.log10(den);
        else if (order === 2) db = -20 * Math.log10(den);
        else db = fc > 0 ? -10 * Math.log10(den) : 0;
        const clamped = Math.max(DB_MIN, Math.min(DB_MAX, db));
        const x = L + ((Math.log(f) - logFreqMin) / (logFreqMax - logFreqMin)) * W;
        const y = h * (1 - (clamped - DB_MIN) / dbRange);
        xs.push(x);
        ys.push(y);
      }
    } else if (isRcHpf) {
      const fc = Math.max(FREQ_MIN, Math.min(freqMax, filterNode.getCutoff()));
      const order = typeof filterNode.getOrder === 'function' ? filterNode.getOrder() : (filterNode.order ?? 1);
      for (let i = 0; i < N_POINTS; i++) {
        const f = freqArray[i];
        let db = DB_MIN;
        if (fc > 0 && f > 0) {
          const r = f / fc;
          const r2 = r * r;
          const den = 1 + r2;
          if (order === 4) {
            db = 10 * Math.log10((r2 * r2 * r2 * r2) / (den * den * den * den));
          } else if (order === 2) {
            db = 10 * Math.log10((r2 * r2) / (den * den));
          } else {
            db = 10 * Math.log10(r2 / den);
          }
        }
        const clamped = Math.max(DB_MIN, Math.min(DB_MAX, db));
        const x = L + ((Math.log(f) - logFreqMin) / (logFreqMax - logFreqMin)) * W;
        const y = h * (1 - (clamped - DB_MIN) / dbRange);
        xs.push(x);
        ys.push(y);
      }
    } else {
      filterNode.getFrequencyResponse(freqArray, magArray, phaseArray);
      const minMag = 1e-6;
      for (let i = 0; i < N_POINTS; i++) {
        const mag = magArray[i];
        const m = mag > minMag && Number.isFinite(mag) ? mag : minMag;
        const db = 20 * Math.log10(m);
        const clamped = Math.max(DB_MIN, Math.min(DB_MAX, db));
        const x = L + ((Math.log(freqArray[i]) - logFreqMin) / (logFreqMax - logFreqMin)) * W;
        const y = h * (1 - (clamped - DB_MIN) / dbRange);
        xs.push(x);
        ys.push(y);
      }
    }

    // 塗り
    cctx.beginPath();
    cctx.moveTo(xs[0], ys[0]);
    for (let i = 1; i < N_POINTS; i++) {
      cctx.lineTo(xs[i], ys[i]);
    }
    cctx.lineTo(xs[N_POINTS - 1], h);
    cctx.lineTo(xs[0], h);
    cctx.closePath();
    cctx.fillStyle = FILL_COLOR;
    cctx.fill();

    // 曲線
    cctx.beginPath();
    cctx.moveTo(xs[0], ys[0]);
    for (let i = 1; i < N_POINTS; i++) {
      cctx.lineTo(xs[i], ys[i]);
    }
    cctx.strokeStyle = CURVE_COLOR;
    cctx.lineWidth = 2;
    cctx.stroke();

    rafId = requestAnimationFrame(draw);
  }

  rafId = requestAnimationFrame(draw);

  return {
    destroy() {
      if (rafId != null) cancelAnimationFrame(rafId);
      if (analyser && audioNodeForSpectrum) {
        try {
          audioNodeForSpectrum.disconnect(analyser);
        } catch (_) {}
      }
      wrapper.remove();
    },
  };
}
