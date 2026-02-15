/**
 * 2次CRローパスフィルタ (two-pole LPF)
 * 1次LPF を2段直列。y1 = a*x + (1-a)*y1_prev, y2 = a*y1 + (1-a)*y2_prev, out = y2
 * a = 1 - exp(-2π*fc/fs) → -12 dB/oct
 */

class TwoPoleLpfProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'cutoff', defaultValue: 1000, minValue: 20, maxValue: 20000, automationRate: 'a-rate' },
    ];
  }

  constructor() {
    super();
    this.y1PrevL = 0;
    this.y1PrevR = 0;
    this.y2PrevL = 0;
    this.y2PrevR = 0;
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
      for (let i = 0; i < inCh.length; i++) {
        const fc = isARate ? cutoff[i] : cutoff[0];
        const a = 1 - Math.exp(-2 * Math.PI * Math.max(20, Math.min(20000, fc)) / fs);
        const x = Number.isFinite(inCh[i]) ? inCh[i] : 0;
        const y1 = a * x + (1 - a) * y1Prev;
        const y2 = a * y1 + (1 - a) * y2Prev;
        outCh[i] = clamp(y2);
        y1Prev = y1;
        y2Prev = y2;
      }
      if (ch === 0) {
        this.y1PrevL = y1Prev;
        this.y2PrevL = y2Prev;
      } else {
        this.y1PrevR = y1Prev;
        this.y2PrevR = y2Prev;
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

registerProcessor('two-pole-lpf', TwoPoleLpfProcessor);
