/**
 * eq8.js
 * Web Synth - EQ-8（8バンドパラメトリックイコライザー）
 * 8本の BiquadFilter を直列に接続。バンド選択で Freq / Gain / Q を編集。
 * 窓はスペクトラム表示＋その上に設定した EQ カーブを重ねて表示。
 */

import { formatParamValue } from '../base.js';
import { ensureAudioContext } from '../../audio-core.js';
import { createInputJack, registerModuleInputJackVisibility, scheduleRedrawCables } from '../../cables.js';
import { PARAM_DEFS, ParamFormat, paramToNorm } from '../../param-utils.js';

const SPECTRUM_COLOR = '#628878';
const EQ_CURVE_COLOR = '#628878';
const EQ_CURVE_DB_RANGE = 12;
const EQ_RESPONSE_POINTS = 512;
const EQ8_VIZ_FFT_SIZE = 2048;
const EQ8_VIZ_BAR_COUNT = 256;
const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const GRID_COLOR_LIGHT = 'rgba(0, 0, 0, 0.12)';
const GRID_COLOR_DARK = 'rgba(255, 255, 255, 0.15)';

const BAND_COUNT = 8;
const FILTER_TYPES = [
  { value: 'peaking', label: 'Bell' },
  { value: 'highpass', label: 'HP' },
  { value: 'lowpass', label: 'LP' },
  { value: 'lowshelf', label: 'LSh' },
  { value: 'highshelf', label: 'HSh' },
];

/** 周波数スライダー値 (0–100) を Hz に変換（対数スケール） */
function valueToFreq(v) {
  const min = 20;
  const max = 20000;
  const x = Math.max(0, Math.min(100, Number(v))) / 100;
  return min * Math.pow(max / min, x);
}

/** Hz をスライダー値 (0–100) に変換 */
function freqToValue(hz) {
  const min = 20;
  const max = 20000;
  const x = Math.log(Math.max(min, Math.min(max, hz)) / min) / Math.log(max / min);
  return Math.round(x * 100);
}

/** 周波数表示用 (Hz / kHz) */
function formatFreq(hz) {
  if (hz >= 1000) return `${(hz / 1000).toFixed(2)} kHz`;
  return `${Math.round(hz)} Hz`;
}

/** Hz をスライダーと同じ 0–1 norm に変換（対数スケール・バー表示をケーブル有無で統一） */
function freqToNorm01(hz) {
  const h = Math.max(FREQ_MIN, Math.min(FREQ_MAX, hz));
  return Math.log(h / FREQ_MIN) / Math.log(FREQ_MAX / FREQ_MIN);
}

/** 0–1 norm（対数スケール）を Hz に変換 */
function normToFreq(norm) {
  const n = Math.max(0, Math.min(1, norm));
  return FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, n);
}

/** @type {import('../base.js').ModuleFactory} */
export const eq8Module = {
  meta: {
    id: 'eq8',
    name: 'EQ-8',
    kind: 'effect',
    description: '8-band parametric equalizer',
    previewDescription: 'Signal: audio in/out.\n8-band EQ; type, freq, gain, Q per band.',
  },

  create(instanceId) {
    const ctx = ensureAudioContext();
    const inputGain = ctx.createGain();
    inputGain.gain.value = 1;

    const filters = [];
    let node = inputGain;
    /** 8バンドの周波数を対数等分（20Hz〜20kHz） */
    const defaultFreqs = Array.from({ length: BAND_COUNT }, (_, i) =>
      FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, i / (BAND_COUNT - 1))
    );
    for (let i = 0; i < BAND_COUNT; i++) {
      const bq = ctx.createBiquadFilter();
      bq.type = 'peaking';
      bq.frequency.value = defaultFreqs[i];
      bq.gain.value = 0;
      bq.Q.value = 1;
      node.connect(bq);
      node = bq;
      filters.push({
        type: 'peaking',
        frequency: defaultFreqs[i],
        gainDb: 0,
        Q: 1,
        node: bq,
      });
    }
    const outputGain = ctx.createGain();
    outputGain.gain.value = 1;
    node.connect(outputGain);

    function applyBand(band) {
      const bq = band.node;
      bq.type = band.type;
      bq.frequency.value = band.frequency;
      bq.Q.value = Math.max(0.01, band.Q);
      if (['peaking', 'lowshelf', 'highshelf'].includes(band.type)) {
        bq.gain.value = band.gainDb;
      } else {
        bq.gain.value = 0;
      }
    }

    const root = document.createElement('div');
    root.className = 'synth-module synth-module--effect synth-module--eq8';
    root.dataset.moduleId = instanceId;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'EQ-8');

    const header = document.createElement('div');
    header.className = 'synth-module__header';
    const title = document.createElement('span');
    title.className = 'synth-module__title';
    title.textContent = eq8Module.meta.name;
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
    body.className = 'synth-module__body synth-module__body--controls';

    let selectedBand = 0;

    const bandStrip = document.createElement('div');
    bandStrip.className = 'synth-module__eq8-band-strip';
    bandStrip.setAttribute('aria-label', 'Band select');
    function updateBandButtons() {
      bandStrip.querySelectorAll('.synth-module__eq8-band-btn').forEach((b, j) => {
        b.classList.toggle('synth-module__eq8-band-btn--active', j === selectedBand);
      });
    }
    for (let i = 0; i < BAND_COUNT; i++) {
      applyBand(filters[i]);
    }
    for (let i = 0; i < BAND_COUNT; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'synth-module__eq8-band-btn';
      btn.textContent = String(i + 1);
      btn.dataset.band = String(i);
      btn.setAttribute('aria-label', `Band ${i + 1} (select)`);
      btn.addEventListener('click', () => {
        selectedBand = i;
        syncControlsFromBand(filters[i]);
        setSelectedJackColumn(selectedBand);
        updateBandButtons();
        scheduleRedrawCables();
      });
      bandStrip.appendChild(btn);
    }
    body.appendChild(bandStrip);

    /* 全24ジャックを3か所（Freq/Gain/Q行の横）に重ねて配置。タブでどのバンドのジャックを前面にするかだけ切り替え。 */
    const bandJacks = [];
    for (let i = 0; i < BAND_COUNT; i++) {
      const fWrap = document.createElement('div');
      fWrap.className = 'synth-module__jack-wrap synth-module__eq8-jack-wrap';
      fWrap.dataset.band = String(i);
      fWrap.title = `Band ${i + 1} Freq`;
      createInputJack(fWrap, `freq${i + 1}`);
      const gWrap = document.createElement('div');
      gWrap.className = 'synth-module__jack-wrap synth-module__eq8-jack-wrap';
      gWrap.dataset.band = String(i);
      gWrap.title = `Band ${i + 1} Gain`;
      createInputJack(gWrap, `gain${i + 1}`);
      const qWrap = document.createElement('div');
      qWrap.className = 'synth-module__jack-wrap synth-module__eq8-jack-wrap';
      qWrap.dataset.band = String(i);
      qWrap.title = `Band ${i + 1} Q`;
      createInputJack(qWrap, `q${i + 1}`);
      bandJacks.push({ freq: fWrap, gain: gWrap, q: qWrap });
    }

    function setSelectedJackColumn(bandIndex) {
      bandJacks.forEach((jacks, i) => {
        [jacks.freq, jacks.gain, jacks.q].forEach((wrap) => {
          wrap.classList.toggle('synth-module__eq8-jack-wrap--on-top', i === bandIndex);
        });
      });
    }

    function syncControlsFromBand(band) {
      typeSelect.value = band.type;
      setGainRowEnabled(true);
      freqInput.value = String(freqToValue(band.frequency));
      freqInput.dispatchEvent(new Event('input', { bubbles: false }));
      gainInput.value = String(Math.round(band.gainDb * 10) / 10);
      gainInput.dispatchEvent(new Event('input', { bubbles: false }));
      qInput.value = String(Math.round(band.Q * 100) / 100);
      qInput.dispatchEvent(new Event('input', { bubbles: false }));
    }

    const paramBlock = document.createElement('div');
    paramBlock.className = 'synth-module__eq8-params';

    const typeRow = document.createElement('div');
    typeRow.className = 'synth-module__row';
    const typeLabel = document.createElement('label');
    typeLabel.className = 'synth-module__label';
    typeLabel.textContent = 'Type';
    const typeSelect = document.createElement('select');
    typeSelect.className = 'synth-module__select';
    typeSelect.setAttribute('data-param', 'type');
    FILTER_TYPES.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.value;
      opt.textContent = t.label;
      typeSelect.appendChild(opt);
    });
    function setGainRowEnabled(enabled) {
      const isGainRelevant = ['peaking', 'lowshelf', 'highshelf'].includes(typeSelect.value);
      gainRow.classList.toggle('synth-module__eq8-gain-row--disabled', !isGainRelevant);
      gainInput.disabled = !isGainRelevant;
    }
    typeSelect.addEventListener('change', () => {
      filters[selectedBand].type = typeSelect.value;
      applyBand(filters[selectedBand]);
      setGainRowEnabled(true);
    });
    typeRow.appendChild(typeLabel);
    typeRow.appendChild(typeSelect);
    paramBlock.appendChild(typeRow);

    const freqRow = document.createElement('div');
    freqRow.className = 'synth-module__row';
    freqRow.innerHTML = `
      <label class="synth-module__label">Freq</label>
      <input type="range" class="synth-module__slider" data-param="freq" min="0" max="100" value="${freqToValue(defaultFreqs[0])}" step="0.1">
      <span class="synth-module__value">${formatFreq(defaultFreqs[0])}</span>
    `;
    const freqInput = freqRow.querySelector('[data-param="freq"]');
    const freqValue = freqRow.querySelector('.synth-module__value');
    freqInput.addEventListener('input', () => {
      const hz = valueToFreq(freqInput.value);
      filters[selectedBand].frequency = hz;
      applyBand(filters[selectedBand]);
      freqValue.textContent = formatFreq(hz);
    });
    const freqJackStack = document.createElement('div');
    freqJackStack.className = 'synth-module__eq8-jack-stack';
    bandJacks.forEach((j) => freqJackStack.appendChild(j.freq));
    freqRow.appendChild(freqJackStack);
    paramBlock.appendChild(freqRow);

    const gainRow = document.createElement('div');
    gainRow.className = 'synth-module__row synth-module__eq8-gain-row';
    gainRow.innerHTML = `
      <label class="synth-module__label">Gain</label>
      <input type="range" class="synth-module__slider" data-param="gain" min="-12" max="12" value="0" step="0.1">
      <span class="synth-module__value">0 dB</span>
    `;
    const gainInput = gainRow.querySelector('[data-param="gain"]');
    const gainValue = gainRow.querySelector('.synth-module__value');
    gainInput.addEventListener('input', () => {
      const db = Number(gainInput.value);
      filters[selectedBand].gainDb = db;
      applyBand(filters[selectedBand]);
      gainValue.textContent = `${db >= 0 ? '+' : ''}${Number(db).toFixed(1)} dB`;
    });
    const gainJackStack = document.createElement('div');
    gainJackStack.className = 'synth-module__eq8-jack-stack';
    bandJacks.forEach((j) => gainJackStack.appendChild(j.gain));
    gainRow.appendChild(gainJackStack);
    paramBlock.appendChild(gainRow);

    setGainRowEnabled(true);

    const qRow = document.createElement('div');
    qRow.className = 'synth-module__row';
    qRow.innerHTML = `
      <label class="synth-module__label">Q</label>
      <input type="range" class="synth-module__slider" data-param="q" min="0.01" max="10" value="1" step="0.01">
      <span class="synth-module__value">1.0</span>
    `;
    const qInput = qRow.querySelector('[data-param="q"]');
    const qValue = qRow.querySelector('.synth-module__value');
    qInput.addEventListener('input', () => {
      const q = Number(qInput.value);
      filters[selectedBand].Q = q;
      applyBand(filters[selectedBand]);
      qValue.textContent = q === 0 ? '0' : Number(q).toFixed(2);
    });
    const qJackStack = document.createElement('div');
    qJackStack.className = 'synth-module__eq8-jack-stack';
    bandJacks.forEach((j) => qJackStack.appendChild(j.q));
    qRow.appendChild(qJackStack);
    paramBlock.appendChild(qRow);

    body.appendChild(paramBlock);
    setSelectedJackColumn(0);
    updateBandButtons();

    /** ケーブル描画: このモジュールはタブ（選択バンド）が一致するときだけ実線、それ以外は点線。スクロール外は点線にしない。 */
    registerModuleInputJackVisibility(root, (paramId) => {
      const m = String(paramId).match(/^(freq|gain|q)(\d+)$/);
      if (!m) return true;
      const bandNum1Based = parseInt(m[2], 10);
      return bandNum1Based === selectedBand + 1;
    });

    root.appendChild(body);

    const viz = attachEq8SpectrumViz(body, outputGain, () => filters.map((b) => b.node), () =>
      filters.map((b, i) => ({ frequency: b.frequency, index: i + 1 }))
    );

    return {
      element: root,
      getAudioInput() {
        return inputGain;
      },
      getAudioOutput() {
        return outputGain;
      },
      getModulatableParams() {
        const list = [];
        const freqRange = [FREQ_MIN, FREQ_MAX];
        for (let i = 0; i < BAND_COUNT; i++) {
          const bq = filters[i].node;
          list.push(
            { id: `freq${i + 1}`, name: `Freq ${i + 1}`, param: bq.frequency, range: [0, 1], displayRange: freqRange, format: ParamFormat.freq, toParamValue: (norm) => normToFreq(norm) },
            { id: `gain${i + 1}`, name: `Gain ${i + 1}`, param: bq.gain, ...PARAM_DEFS.gainDb },
            { id: `q${i + 1}`, name: `Q ${i + 1}`, param: bq.Q, ...PARAM_DEFS.q }
          );
        }
        return list;
      },
      /** 共有UIのため: そのバンドの現在値から baseNorm (0-1) を返す。変調表示で使用 */
      getParamBaseNorm(paramId) {
        const m = String(paramId).match(/^(freq|gain|q)(\d+)$/);
        if (!m) return undefined;
        const bandIndex = parseInt(m[2], 10) - 1;
        if (bandIndex < 0 || bandIndex >= BAND_COUNT) return undefined;
        const band = filters[bandIndex];
        const id = m[1];
        if (id === 'freq') return freqToNorm01(band.frequency);
        if (id === 'gain') return paramToNorm(band.gainDb, [-12, 12]);
        if (id === 'q') return paramToNorm(band.Q, PARAM_DEFS.q.range);
        return undefined;
      },
      /** 共有UIのため: そのバンドの表示用の現在値（format に渡す単位）を返す */
      getParamDisplayValue(paramId) {
        const m = String(paramId).match(/^(freq|gain|q)(\d+)$/);
        if (!m) return undefined;
        const bandIndex = parseInt(m[2], 10) - 1;
        if (bandIndex < 0 || bandIndex >= BAND_COUNT) return undefined;
        const band = filters[bandIndex];
        const id = m[1];
        if (id === 'freq') return band.frequency;
        if (id === 'gain') return band.gainDb;
        if (id === 'q') return band.Q;
        return undefined;
      },
      /** 共有UIのため: このパラメータが選択中バンドなら表示を更新してよい */
      shouldUpdateParamDisplay(paramId) {
        const m = String(paramId).match(/^(freq|gain|q)(\d+)$/);
        if (!m) return true;
        const bandIndex = parseInt(m[2], 10) - 1;
        return bandIndex === selectedBand;
      },
      getSerializableState() {
        return {
          selectedBand,
          bands: filters.map((b) => ({
            type: b.type,
            frequency: b.frequency,
            gainDb: b.gainDb,
            Q: b.Q,
          })),
        };
      },
      restoreState(state) {
        if (!state || typeof state !== 'object') return;
        if (Array.isArray(state.bands)) {
          state.bands.slice(0, BAND_COUNT).forEach((b, i) => {
            if (!b || i >= filters.length) return;
            const band = filters[i];
            if (b.type != null) band.type = b.type;
            if (b.frequency != null) band.frequency = Number(b.frequency);
            if (b.gainDb != null) band.gainDb = Number(b.gainDb);
            if (b.Q != null) band.Q = Number(b.Q);
            applyBand(band);
          });
        }
        if (state.selectedBand !== undefined) {
          selectedBand = Math.max(0, Math.min(BAND_COUNT - 1, Number(state.selectedBand) | 0));
          syncControlsFromBand(filters[selectedBand]);
          setSelectedJackColumn(selectedBand);
          updateBandButtons();
        }
      },
      destroy() {
        registerModuleInputJackVisibility(root, null);
        viz.destroy();
        try {
          inputGain.disconnect();
          filters.forEach((b) => b.node.disconnect());
          outputGain.disconnect();
        } catch (_) {}
      },
    };
  },
};

/**
 * EQ-8 用: スペクトラムを表示し、その上に設定した EQ カーブと有効バンド番号を重ねる
 * @param {HTMLElement} container
 * @param {AudioNode} audioNode - EQ 出力（スペクトラムの元）
 * @param {() => BiquadFilterNode[]} getFilterNodes - 8 本の BiquadFilter を返す
 * @param {() => Array<{ frequency: number, index: number }>} getBands - 各バンドの周波数・番号を返す
 */
function attachEq8SpectrumViz(container, audioNode, getFilterNodes, getBands) {
  const wrapper = document.createElement('div');
  wrapper.className = 'synth-module__waveform-viz synth-module__waveform-viz--eq8-spectrum';
  const canvas = document.createElement('canvas');
  canvas.className = 'synth-module__waveform-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  wrapper.appendChild(canvas);
  container.insertBefore(wrapper, container.firstChild);

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let analyser = null;
  let freqData = null;
  let rafId = null;

  const freqArray = new Float32Array(EQ_RESPONSE_POINTS);
  const magArray = new Float32Array(EQ_RESPONSE_POINTS);
  const combinedMag = new Float32Array(EQ_RESPONSE_POINTS);
  const sampleRate = audioNode?.context?.sampleRate ?? 44100;
  for (let i = 0; i < EQ_RESPONSE_POINTS; i++) {
    const t = i / (EQ_RESPONSE_POINTS - 1);
    freqArray[i] = FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, t);
  }
  const freqMarksSet = new Set();
  for (let p = 1; p <= 10000; p *= 10) {
    for (let k = 1; k <= 10; k++) {
      const f = k * p;
      if (f >= FREQ_MIN && f <= FREQ_MAX) freqMarksSet.add(f);
    }
  }
  const freqMarks = Array.from(freqMarksSet).sort((a, b) => a - b);
  const dbMarks = [-12, -6, 0, 6, 12];

  if (audioNode && audioNode.context) {
    const ctx = audioNode.context;
    analyser = ctx.createAnalyser();
    analyser.fftSize = EQ8_VIZ_FFT_SIZE;
    analyser.smoothingTimeConstant = 0.6;
    analyser.minDecibels = -60;
    analyser.maxDecibels = 0;
    audioNode.connect(analyser);
    freqData = new Uint8Array(analyser.frequencyBinCount);
  }

  function getCombinedEqResponse() {
    const nodes = getFilterNodes();
    if (!nodes.length) return null;
    for (let i = 0; i < EQ_RESPONSE_POINTS; i++) combinedMag[i] = 1;
    for (let k = 0; k < nodes.length; k++) {
      nodes[k].getFrequencyResponse(freqArray, magArray, new Float32Array(EQ_RESPONSE_POINTS));
      for (let i = 0; i < EQ_RESPONSE_POINTS; i++) combinedMag[i] *= magArray[i];
    }
    return combinedMag;
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

    const logMin = Math.log(FREQ_MIN);
    const logMax = Math.log(FREQ_MAX);
    const centerY = h / 2;
    const isDark = document.documentElement.classList.contains('dark-mode');
    const gridColor = isDark ? GRID_COLOR_DARK : GRID_COLOR_LIGHT;

    cctx.strokeStyle = gridColor;
    cctx.lineWidth = 1;
    for (const freq of freqMarks) {
      const x = ((Math.log(freq) - logMin) / (logMax - logMin)) * w;
      cctx.beginPath();
      cctx.moveTo(x, 0);
      cctx.lineTo(x, h);
      cctx.stroke();
    }
    for (const db of dbMarks) {
      const y = centerY - (db / EQ_CURVE_DB_RANGE) * (h / 2);
      if (y < 0 || y > h) continue;
      cctx.beginPath();
      cctx.moveTo(0, y);
      cctx.lineTo(w, y);
      cctx.stroke();
    }

    if (analyser && freqData) {
      analyser.getByteFrequencyData(freqData);
      const binCount = freqData.length;
      const nyquist = sampleRate / 2;
      const barW = Math.max(0.5, w / EQ8_VIZ_BAR_COUNT);
      for (let i = 0; i < EQ8_VIZ_BAR_COUNT; i++) {
        const t = i / (EQ8_VIZ_BAR_COUNT - 1);
        const freq = FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, t);
        const bin = Math.min(binCount - 1, Math.floor((freq / nyquist) * binCount));
        const v = freqData[bin] / 255;
        const barH = Math.max(0, v * h * 0.82);
        const px = (i / EQ8_VIZ_BAR_COUNT) * w;
        cctx.fillStyle = SPECTRUM_COLOR;
        cctx.fillRect(px, h - barH, barW + 0.5, barH);
      }
    }

    const mags = getCombinedEqResponse();
    if (mags) {
      cctx.strokeStyle = EQ_CURVE_COLOR;
      cctx.lineWidth = 2;
      cctx.beginPath();
      for (let i = 0; i < EQ_RESPONSE_POINTS; i++) {
        const freq = freqArray[i];
        const mag = mags[i];
        const db = mag > 1e-6 ? 20 * Math.log10(mag) : -EQ_CURVE_DB_RANGE * 2;
        const x = ((Math.log(freq) - logMin) / (logMax - logMin)) * w;
        const y = Math.max(0, Math.min(h, centerY - (db / EQ_CURVE_DB_RANGE) * (h / 2)));
        if (i === 0) cctx.moveTo(x, y);
        else cctx.lineTo(x, y);
      }
      cctx.stroke();
    }

    if (getBands) {
      const bands = getBands();
      cctx.fillStyle = EQ_CURVE_COLOR;
      const blockHeight = Math.min(h - 4, 8 * 8);
      const lineHeight = blockHeight / 8;
      const fontSize = Math.max(7, Math.min(10, Math.floor(lineHeight * 0.95)));
      cctx.font = `bold ${fontSize}px sans-serif`;
      cctx.textAlign = 'center';
      cctx.textBaseline = 'middle';
      const padding = fontSize * 1.2;
      const centerY = h / 2;
      const blockTop = centerY - blockHeight / 2;
      for (const band of bands) {
        let x = ((Math.log(Math.max(FREQ_MIN, Math.min(FREQ_MAX, band.frequency))) - logMin) / (logMax - logMin)) * w;
        x = Math.max(padding, Math.min(w - padding, x));
        const y = blockTop + (band.index - 0.5) * lineHeight;
        if (y < fontSize || y > h - fontSize) continue;
        cctx.fillText(String(band.index), x, y);
      }
    }

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
