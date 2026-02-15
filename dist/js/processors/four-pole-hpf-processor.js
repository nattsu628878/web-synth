/**
 * 4次CRハイパスフィルタ (four-pole HPF)
 * 入力 − 4次LPF の出力。a = 1 - exp(-2π*fc/fs) → -24 dB/oct
 */

class FourPoleHpfProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'cutoff', defaultValue: 200, minValue: 20, maxValue: 20000, automationRate: 'a-rate' },
    ];
  }

  constructor() {
    super();
    this.y1PrevL = 0;
    this.y1PrevR = 0;
    this.y2PrevL = 0;
    this.y2PrevR = 0;
    this.y3PrevL = 0;
    this.y3PrevR = 0;
    this.y4PrevL = 0;
    this.y4PrevR = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const cutoff = parameters.cutoff;
    const fs = sampleRate;
    const isARate = cutoff.length > 0;
    const clamp = (v) => (v !== v || v < -1 || v > 1) ? (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0) : v;

    for (let ch = 0; ch < Math.min(input.length, output.length); ch++) {
      const inCh = input[ch];
      const outCh = output[ch];
      if (!inCh?.length || !outCh?.length) continue;

      let y1Prev = ch === 0 ? this.y1PrevL : this.y1PrevR;
      let y2Prev = ch === 0 ? this.y2PrevL : this.y2PrevR;
      let y3Prev = ch === 0 ? this.y3PrevL : this.y3PrevR;
      let y4Prev = ch === 0 ? this.y4PrevL : this.y4PrevR;
      for (let i = 0; i < inCh.length; i++) {
        const fc = isARate ? cutoff[i] : cutoff[0];
        const a = 1 - Math.exp(-2 * Math.PI * Math.max(20, Math.min(20000, fc)) / fs);
        const x = Number.isFinite(inCh[i]) ? inCh[i] : 0;
        const y1 = a * x + (1 - a) * y1Prev;
        const y2 = a * y1 + (1 - a) * y2Prev;
        const y3 = a * y2 + (1 - a) * y3Prev;
        const y4 = a * y3 + (1 - a) * y4Prev;
        outCh[i] = clamp(x - y4);
        y1Prev = y1;
        y2Prev = y2;
        y3Prev = y3;
        y4Prev = y4;
      }
      if (ch === 0) {
        this.y1PrevL = y1Prev;
        this.y2PrevL = y2Prev;
        this.y3PrevL = y3Prev;
        this.y4PrevL = y4Prev;
      } else {
        this.y1PrevR = y1Prev;
        this.y2PrevR = y2Prev;
        this.y3PrevR = y3Prev;
        this.y4PrevR = y4Prev;
      }
    }
    const nCh = Math.min(input.length, output.length);
    for (let ch = nCh; ch < output.length; ch++) {
      const outCh = output[ch];
      if (outCh?.length) for (let i = 0; i < outCh.length; i++) outCh[i] = 0;
    }
    return true;
  }
}

registerProcessor('four-pole-hpf', FourPoleHpfProcessor);
