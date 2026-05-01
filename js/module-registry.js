import { sampleModule } from './modules/source/sample-module.js';
import { waveformGeneratorModule } from './modules/source/waveform-generator.js';
import { fmSynthModule } from './modules/source/fm-synth.js';
import { wavetableModule } from './modules/source/wavetable.js';
import { noiseModule } from './modules/source/noise.js';
import { pwmModule } from './modules/source/pwm.js';
import { pluckModule } from './modules/source/pluck.js';
import { ffOscModule } from './modules/source/ff-osc.js';
import { ffWavetableModule } from './modules/source/ff-wavetable.js';
import { reverbModule } from './modules/effect/reverb.js';
import { delayModule } from './modules/effect/delay.js';
import { eq8Module } from './modules/effect/eq8.js';
import { lpfModule } from './modules/effect/lpf.js';
import { hpfModule } from './modules/effect/hpf.js';
import { lpfResModule } from './modules/effect/lpf-res.js';
import { hpfResModule } from './modules/effect/hpf-res.js';
import { lfoModule } from './modules/modulator/lfo.js';
import { randomLfoModule } from './modules/modulator/random-lfo.js';
import { envelopeModule } from './modules/modulator/envelope.js';
import { adEnvelopeModule } from './modules/modulator/ad-envelope.js';
import { sequencer8Module, sequencer16Module, sequencer32Module } from './modules/modulator/sequencer.js';

const MODULE_DEFINITIONS = [
  sampleModule,
  waveformGeneratorModule,
  fmSynthModule,
  wavetableModule,
  noiseModule,
  pwmModule,
  pluckModule,
  ffOscModule,
  ffWavetableModule,
  reverbModule,
  delayModule,
  eq8Module,
  lpfModule,
  hpfModule,
  lpfResModule,
  hpfResModule,
  lfoModule,
  randomLfoModule,
  envelopeModule,
  adEnvelopeModule,
  sequencer8Module,
  sequencer16Module,
  sequencer32Module,
];

/**
 * すべてのモジュールを登録する。
 * @param {(moduleFactory: unknown) => void} register
 */
export function registerAllModules(register) {
  MODULE_DEFINITIONS.forEach((moduleFactory) => register(moduleFactory));
}
