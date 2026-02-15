/**
 * 1次CRハイパスフィルタ (one-pole HPF)
 * HPF = 入力 − LPF(入力)。LPF: y_lp = a*x + (1-a)*y_lp_prev, a = 1 - exp(-2π*fc/fs)
 * y_hp = x - y_lp
 */

class OnePoleHpfProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'cutoff', defaultValue: 200, minValue: 20, maxValue: 20000, automationRate: 'a-rate' },
    ];
  }

  constructor() {
    super();
    this.yLpPrevL = 0;
    this.yLpPrevR = 0;
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

      let yLpPrev = ch === 0 ? this.yLpPrevL : this.yLpPrevR;
      for (let i = 0; i < inCh.length; i++) {
        const fc = isARate ? cutoff[i] : cutoff[0];
        const a = 1 - Math.exp(-2 * Math.PI * Math.max(20, Math.min(20000, fc)) / fs);
        const x = Number.isFinite(inCh[i]) ? inCh[i] : 0;
        const yLp = a * x + (1 - a) * yLpPrev;
        outCh[i] = clamp(x - yLp);
        yLpPrev = yLp;
      }
      if (ch === 0) this.yLpPrevL = yLpPrev;
      else this.yLpPrevR = yLpPrev;
    }
    const nCh = Math.min(input.length, output.length);
    for (let ch = nCh; ch < output.length; ch++) {
      const outCh = output[ch];
      if (outCh?.length) for (let i = 0; i < outCh.length; i++) outCh[i] = 0;
    }
    return true;
  }
}

registerProcessor('one-pole-hpf', OnePoleHpfProcessor);
