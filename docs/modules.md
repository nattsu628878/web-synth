# モジュール契約と一覧（確認用）

## 役割

各ファイルはモジュールファクトリを export し、main.js で `registerModule()` により rack.js に登録する。base.js は契約・型定義のみで登録対象ではない。

## フォルダ構成（kind 別）

モジュールは **kind**（source / effect / modulator）ごとに `js/modules/` のサブフォルダに配置する。

| フォルダ | kind | 説明 |
|----------|------|------|
| **source/** | source | 音源。1 行に 1 つ。行を新規追加。 |
| **effect/** | effect | エフェクト。チェーン内。音声入出力。 |
| **modulator/** | modulator | モジュレータ。Modulators パネルに追加。変調出力をパラメータにケーブル接続。 |

base.js は modules 直下に置き、各モジュールから `../base.js` で参照する。

## 契約（base.js）

- **ModuleKind**: `'source' | 'effect' | 'modulator'`
- **create(instanceId)** の戻り値: `element`, `getAudioInput?`, `getAudioOutput?`, `getModulationOutput?`, `getModulatableParams?`, `destroy?`。Seq は `advanceStep`, `setSyncConnected`, `addGateListener` / `removeGateListener`。Envelope は `trigger`。

## 登録モジュール一覧

| id | name | kind | ファイル | 備考 |
|----|------|------|----------|------|
| sample | Sample | source | source/sample-module.js | プレースホルダ（発音なし） |
| waveform | Osc | source | source/waveform-generator.js | Sine/Square/Saw/Tri。Freq, Gain。 |
| fm | FM | source | source/fm-synth.js | Carrier, Mod, Index, Gain。 |
| wavetable | Wavetable | source | source/wavetable.js | Wave A/B, Morph。Freq, Gain。 |
| noise | Noise | source | source/noise.js | ホワイトノイズ。Gain。 |
| pwm | PWM | source | source/pwm.js | AudioWorklet。Freq, Pulse %, Gain。 |
| pluck | Pluck | source | source/pluck.js | Karplus–Strong。Freq, Decay, Gain。 |
| ff-osc | FF-Osc | source | source/ff-osc.js | |
| ff-wavetable | FF-Wavetable | source | source/ff-wavetable.js | |
| reverb | Reverb | effect | effect/reverb.js | Wet。 |
| delay | Delay | effect | effect/delay.js | |
| eq8 | EQ-8 | effect | effect/eq8.js | 8 バンド。Gain/Freq/Q。 |
| lpf | LPF | effect | effect/lpf.js | 1/2/4 次 CR。Freq, Order。 |
| hpf | HPF | effect | effect/hpf.js | 1/2/4 次 CR。Freq, Order。 |
| lpf-res | LPF Res | effect | effect/lpf-res.js | Biquad＋レゾナンス。 |
| hpf-res | HPF Res | effect | effect/hpf-res.js | Biquad＋レゾナンス。 |
| lfo | LFO | modulator | modulator/lfo.js | Wave, Rate, Depth。 |
| random-lfo | Random LFO | modulator | modulator/random-lfo.js | |
| envelope | Envelope | modulator | modulator/envelope.js | ADSR, Trigger。 |
| ad-envelope | AD Env | modulator | modulator/ad-envelope.js | Attack–Decay。 |
| sequencer-8 | Seq-8 | modulator | modulator/sequencer.js | 8 ステップ（1 段）。Pitch, Gate, Sync In。 |
| sequencer-16 | Seq-16 | modulator | modulator/sequencer.js | 16 ステップ（2 段×8）。 |
| sequencer-32 | Seq-32 | modulator | modulator/sequencer.js | 32 ステップ（4 段×8）。 |

## 依存

- **main.js** が各モジュールを `./modules/source/xxx.js` 等で import し `registerModule()` で登録。
- 各モジュールは **base.js**（`../base.js`）、**audio-core.js**、**cables.js**、**waveform-viz.js**、**filter-response-viz.js**、**param-utils.js** を必要に応じて import。
