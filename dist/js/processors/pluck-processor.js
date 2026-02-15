/**
 * Pluck (Karplus–Strong) 音源
 * バッファ長 = sampleRate/freq、ノイズで初期化し、隣接サンプル平均＋減衰でフィードバック。
 * トリガーはメッセージで受け取り、次フレームでバッファを再初期化。
 */

const MAX_BUFFER_LENGTH = 22050; // sampleRate/2 程度で十分（20Hz @ 44.1k）

class PluckProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 440, minValue: 20, maxValue: 2000, automationRate: 'a-rate' },
      { name: 'damping', defaultValue: 0.5, minValue: 0.3, maxValue: 0.99, automationRate: 'a-rate' },
    ];
  }

  constructor(options) {
    super(options);
    this.buffer = new Float32Array(MAX_BUFFER_LENGTH);
    this.L = 100;
    this.readIndex = 0;
    this.doTrigger = false;
    this.port.onmessage = (e) => {
      if (e.data?.type === 'trigger') this.doTrigger = true;
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const freq = parameters.frequency;
    const damp = parameters.damping;
    const fs = sampleRate;
    const isFreqARate = freq.length > 0;
    const isDampARate = damp.length > 0;

    if (this.doTrigger) {
      const f = isFreqARate ? freq[0] : freq[0];
      const hz = Math.max(20, Math.min(2000, Number(f) || 440));
      this.L = Math.max(2, Math.min(MAX_BUFFER_LENGTH, Math.round(fs / hz)));
      for (let i = 0; i < this.L; i++) {
        this.buffer[i] = Math.random() * 2 - 1;
      }
      this.readIndex = 0;
      this.doTrigger = false;
    }

    const len = output[0]?.length ?? 0;
    if (len === 0) return true;

    const outCh0 = output[0];
    const outCh1 = output[1];

    for (let i = 0; i < len; i++) {
      const L = this.L;
      if (L < 2) {
        if (outCh0) outCh0[i] = 0;
        if (outCh1) outCh1[i] = 0;
        continue;
      }
      const idx = this.readIndex;
      const nextIdx = (idx + 1) % L;
      const out = this.buffer[idx];
      const d = isDampARate ? damp[i] : damp[0];
      const decay = 0.5 * Math.max(0.3, Math.min(0.99, Number(d) ?? 0.5));
      this.buffer[idx] = (this.buffer[idx] + this.buffer[nextIdx]) * decay;
      this.readIndex = nextIdx;
      if (outCh0) outCh0[i] = out;
      if (outCh1) outCh1[i] = out;
    }
    return true;
  }
}

registerProcessor('pluck', PluckProcessor);
