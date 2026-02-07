/**
 * PWM (Pulse Width Modulation) オシレーター
 * 矩形波のデューティ比を 0〜1 で制御。出力は -1 / +1。
 */

class PwmOscillatorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 440, minValue: 1, maxValue: 20000, automationRate: 'a-rate' },
      { name: 'pulseWidth', defaultValue: 0.5, minValue: 0.01, maxValue: 0.99, automationRate: 'a-rate' },
    ];
  }

  constructor() {
    super();
    this.phase = 0;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const freq = parameters.frequency;
    const pw = parameters.pulseWidth;
    const fs = sampleRate;
    const isFreqARate = freq.length > 0;
    const isPwARate = pw.length > 0;

    for (let ch = 0; ch < output.length; ch++) {
      const outCh = output[ch];
      if (!outCh?.length) continue;

      for (let i = 0; i < outCh.length; i++) {
        const f = isFreqARate ? freq[i] : freq[0];
        const p = isPwARate ? pw[i] : pw[0];
        const inc = Math.max(0, Math.min(20000, Number(f) || 440)) / fs;
        this.phase += inc;
        if (this.phase >= 1) this.phase -= 1;
        const w = Math.max(0.01, Math.min(0.99, Number(p) ?? 0.5));
        outCh[i] = this.phase < w ? 1 : -1;
      }
    }
    return true;
  }
}

registerProcessor('pwm-oscillator', PwmOscillatorProcessor);
