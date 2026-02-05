# modules フォルダ構成

## 役割

| ファイル | 種類 | main.js での登録 | 説明 |
|----------|------|------------------|------|
| **base.js** | インターフェース | 登録しない | `ModuleKind` / `ModuleMeta` / モジュール契約。各モジュールが JSDoc で参照。ラックに追加される「モジュール」ではない。 |
| **sample-module.js** | source | ✅ registerModule(sampleModule) | プレースホルダ音源（発音なし）。 |
| **waveform-generator.js** | source | ✅ registerModule(waveformGeneratorModule) | Osc。単一波形（Sine/Square/Saw/Tri）選択。 |
| **fm-synth.js** | source | ✅ registerModule(fmSynthModule) | FM 音源。Carrier / Mod / Index / Gain。 |
| **wavetable.js** | source | ✅ registerModule(wavetableModule) | Wavetable。**Wave A** / **Wave B** を 4 種から選択し、**Morph** で補間。 |
| **reverb.js** | effect | ✅ registerModule(reverbModule) | リバーブ。Dry/Wet。 |
| **lfo.js** | modulator | ✅ registerModule(lfoModule) | LFO。波形・Rate・Depth、出力ジャック。 |
| **envelope.js** | modulator | ✅ registerModule(envelopeModule) | エンベロープ ADSR、トリガー、出力ジャック。 |

## 依存関係

- **main.js** が上記 7 モジュールを import し、`registerModule()` で rack.js に登録。
- **rack.js** は `moduleRegistry` に登録されたファクトリのみ使用。base.js は import しない。
- 各モジュールは **base.js** を型参照のみ（JSDoc `@type {import('./base.js').ModuleFactory}`）で使用。base.js は export が空オブジェクトなので実行時の依存はない。
- 各モジュールは **audio-core.js**（ensureAudioContext）、**cables.js**（createInputJack 等）、**waveform-viz.js**（attachWaveformViz）を必要に応じて import。

## 不要なモジュール

- **なし**。base.js 以外の 7 ファイルはすべて main.js で登録され、ピッカー／ラックで使用されている。
- base.js は「いらない」のではなく、共通の型・契約用で、ラックに並ぶモジュールとして登録しないだけ。
