# modules フォルダ

## 役割

各ファイルはモジュールファクトリを export し、main.js で `registerModule()` により rack.js に登録される。base.js は契約・型定義のみで、登録対象ではない。

## フォルダ構成（kind 別）

モジュールは **kind**（source / effect / modulator）ごとにサブフォルダに配置する。

| フォルダ | kind | 説明 |
|----------|------|------|
| **source/** | source | 音源。1 行に 1 つ、左列。行を新規追加。 |
| **effect/** | effect | エフェクト。チェーン内。音声入出力。 |
| **modulator/** | modulator | モジュレータ。変調出力。同一行のパラメータにケーブル接続可能。 |

base.js は modules 直下に置き、全モジュールから `../base.js`（source/effect/modulator 内）で参照する。

## 一覧

| ファイル | kind | 説明 |
|----------|------|------|
| **base.js** | — | ModuleKind / ModuleMeta / モジュール契約。各モジュールが JSDoc で参照。 |
| **source/sample-module.js** | source | プレースホルダ音源（発音なし）。 |
| **source/waveform-generator.js** | source | Osc。Sine/Square/Saw/Tri。Freq, Gain。 |
| **source/fm-synth.js** | source | FM 音源。Carrier, Mod, Index, Gain。 |
| **source/wavetable.js** | source | Wavetable。Wave A/B, Morph。Freq, Gain。 |
| **source/noise.js** | source | ホワイトノイズ音源。Gain。 |
| **source/pwm.js** | source | PWM オシレータ（AudioWorklet）。Freq, Pulse %, Gain。 |
| **source/pluck.js** | source | Pluck（Karplus–Strong, AudioWorklet）。Freq, Decay, Gain。 |
| **source/ff-osc.js** | source | FF-Osc。 |
| **source/ff-wavetable.js** | source | FF-Wavetable。 |
| **effect/reverb.js** | effect | リバーブ。Wet。 |
| **effect/eq8.js** | effect | 8 バンド EQ。各バンド Gain/Freq/Q。 |
| **effect/lpf.js** | effect | 1/2/4 次 CR ローパス。Freq, Order。 |
| **effect/hpf.js** | effect | 1/2/4 次 CR ハイパス。Freq, Order。 |
| **effect/lpf-res.js** | effect | Biquad ローパス＋レゾナンス。Freq, Res。 |
| **effect/hpf-res.js** | effect | Biquad ハイパス＋レゾナンス。Freq, Res。 |
| **modulator/lfo.js** | modulator | LFO。Wave, Rate, Depth。出力 → パラメータ。 |
| **modulator/random-lfo.js** | modulator | Random LFO。出力 → パラメータ。 |
| **modulator/envelope.js** | modulator | ADSR, Trigger（ボタン＋入力）。出力 → パラメータ。 |
| **modulator/ad-envelope.js** | modulator | AD エンベロープ。出力 → パラメータ。 |
| **modulator/sequencer.js** | modulator | Seq-8 / Seq-16 / Seq-32。1 段 8 ステップ。Pitch, Gate 出力、Sync In。上窓でステップ可視化。 |

## 依存

- **main.js** が各モジュールを `./modules/source/xxx.js` 等で import し `registerModule()` で登録。
- 各モジュールは **base.js**（`../base.js`）、**audio-core.js**（`../../audio-core.js`）、**cables.js**（`../../cables.js`）、**waveform-viz.js**（`../../waveform-viz.js`）、**filter-response-viz.js**（`../../filter-response-viz.js`）を必要に応じて import。
- **base.js** は JSDoc の `@type {import('../base.js').ModuleFactory}` 等で参照。

詳細はルートの [docs/modules.md](../../docs/modules.md) を参照。
