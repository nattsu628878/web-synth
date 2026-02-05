/**
 * waveform-viz.js
 * Web Synth - モジュール用の小さな波形ビジュアライズ
 * AnalyserNode で時間領域を取得し Canvas に描画。音源がない場合はフラットライン表示。
 */

const WAVEFORM_COLOR = '#628878';

/**
 * 親要素に波形ビジュアライズ用の Canvas を追加する
 * @param {HTMLElement} container - 描画を挿入する親要素
 * @param {AudioNode|null} audioNode - 接続する音声ノード（null の場合はフラットライン）
 * @returns {{ destroy: function }} - 破棄時に呼ぶ
 */
export function attachWaveformViz(container, audioNode) {
  const wrapper = document.createElement('div');
  wrapper.className = 'synth-module__waveform-viz';
  const canvas = document.createElement('canvas');
  canvas.className = 'synth-module__waveform-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  wrapper.appendChild(canvas);
  container.insertBefore(wrapper, container.firstChild);

  const dpr = window.devicePixelRatio || 1;
  let analyser = null;
  let dataArray = null;
  let rafId = null;

  if (audioNode && audioNode.context) {
    const ctx = audioNode.context;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    audioNode.connect(analyser);
    dataArray = new Uint8Array(analyser.fftSize);
  }

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

    const centerY = h / 2;
    cctx.strokeStyle = WAVEFORM_COLOR;
    cctx.lineWidth = 1;
    cctx.beginPath();

    if (analyser && dataArray) {
      analyser.getByteTimeDomainData(dataArray);
      const step = (w / dataArray.length) || 1;
      for (let i = 0; i < dataArray.length; i++) {
        const x = (i / dataArray.length) * w;
        const v = (dataArray[i] - 128) / 128;
        const y = centerY + v * (centerY - 2);
        if (i === 0) cctx.moveTo(x, y);
        else cctx.lineTo(x, y);
      }
    } else {
      cctx.moveTo(0, centerY);
      cctx.lineTo(w, centerY);
    }
    cctx.stroke();
    rafId = requestAnimationFrame(draw);
  }
  rafId = requestAnimationFrame(draw);

  return {
    destroy() {
      if (rafId != null) cancelAnimationFrame(rafId);
      if (analyser && audioNode) {
        try {
          audioNode.disconnect(analyser);
        } catch (_) {}
      }
      wrapper.remove();
    },
  };
}
