# モジュール一覧とインターフェース

## 1. モジュール契約（base.js）

- **ModuleKind**: `'source' | 'effect' | 'modulator'`
- **ModuleMeta**: `id`, `name`, `kind`, `description?`
- **create(instanceId)** が返すオブジェクト:
  - **element** (HTMLElement) — 必須
  - **getAudioInput?** () → AudioNode | null
  - **getAudioOutput?** () → AudioNode | null
  - **getModulationOutput?** (outputId?) → AudioNode | null
  - **getModulatableParams?** () → Array<{ id, name, param: AudioParam, modulationScale? }>
  - **destroy?** () → void
  - **trigger?** () — エンベロープ用
  - **addGateListener?** (cb) / **removeGateListener?** (cb) — シーケンサ Gate 用
  - **advanceStep?** () / **setSyncConnected?** (bool) — シーケンサ Sync 用

## 2. 登録モジュール

| id | name | kind | 主な出力/入力 |
|----|------|------|----------------|
| sample | Sample | source | （プレースホルダ） |
| waveform | Osc | source | 出力。Freq, Gain 入力。 |
| fm | FM | source | 出力。carrierFreq, modFreq, index, gain 入力。 |
| wavetable | Wavetable | source | 出力。frequency, gain, morph 入力。 |
| noise | Noise | source | 出力。gain 入力。 |
| reverb | Reverb | effect | 音声入出力。wet 入力。 |
| eq8 | EQ-8 | effect | 8 バンド EQ。各バンドの Gain/Freq/Q。 |
| lpf | LPF | effect | 1/2/4 次 CR ローパス。Freq, Order。AudioWorklet。 |
| hpf | HPF | effect | 1/2/4 次 CR ハイパス。Freq, Order。AudioWorklet。 |
| lpf-res | LPF Res | effect | Biquad ローパス＋レゾナンス。Freq, Res。 |
| hpf-res | HPF Res | effect | Biquad ハイパス＋レゾナンス。Freq, Res。 |
| lfo | LFO | modulator | 出力ジャック（modulation）。 |
| envelope | Envelope | modulator | 出力ジャック。trigger 入力（Gate 接続可）。 |
| sequencer-8 | Seq-8 | modulator | 8 ステップ（1 段）。Pitch, Gate 出力。Sync In 入力。 |
| sequencer-16 | Seq-16 | modulator | 16 ステップ（2 段×8）。同上。 |
| sequencer-32 | Seq-32 | modulator | 32 ステップ（4 段×8）。同上。 |

## 3. モジュールごとの補足

- **Sample**: 現状は発音なしのプレースホルダ。
- **Osc / FM / Wavetable / PWM / Pluck / FF-Osc / FF-Wavetable**: 上窓に波形ビジュアル（音源）。スライダーは rack.js の `replaceSlidersWithBars` でバー表示に置き換え。
- **Reverb**: ConvolverNode。インパルスは簡易のため短いバッファ。
- **EQ-8**: 8 バンド EQ。BiquadFilterNode。各バンドの Gain / Freq / Q をケーブル可能。
- **LPF / HPF**: 1/2/4 次 CR。AudioWorklet。filter-response-viz で周波数特性を表示。
- **LPF Res / HPF Res**: BiquadFilterNode。レゾナンス付き。
- **LFO / Random LFO**: 出力を Freq 等に接続時は modulationScale でスケール。
- **Envelope / AD Env**: ADSR または AD。Trigger ボタンまたはシーケンサ Gate → trigger 入力で発火。
- **Sequencer**: stepPitch / stepGate を唯一の真実の源。上窓でステップ可視化。Sync In 接続時はマスターのグローバルステップに位相を合わせて進行。Seq-64 は 4 段×16 ステップ。

## 4. モジュールの追加方法

1. `js/modules/{kind}/`（kind は source / effect / modulator）に新規 JS を追加。`create(instanceId)` で `{ element, ... }` を返すファクトリを export。
2. `main.js` で `import { xxxModule } from './modules/{kind}/xxx.js';` し `registerModule(xxxModule)`。
3. ピッカーは kind に応じて Sources / Effects / Modulators のいずれかに表示される。

詳細は [development.md](development.md) を参照。
