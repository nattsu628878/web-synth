# Web Synth — プロジェクト概要

ブラウザ上の Ableton Live 風モジュラーシンセ。**音源 | エフェクト | モジュレータ** を行単位で配置し、スロットの左右矢印で並び替え、ケーブルで変調・同期を接続。保存・読み込み、マスター出力、シーケンサ（BPM 同期）に対応。

---

## 1. 概要

| 項目 | 内容 |
|------|------|
| **エントリ** | `index.html` → `js/main.js`（ES モジュール） |
| **開発サーバ** | プロジェクトルートの `dev-server.sh`（任意） |
| **UI** | 英語ラベル。ダーク/ライトテーマ（localStorage 保存） |

---

## 2. アーキテクチャ

| ファイル | 役割 |
|----------|------|
| **js/main.js** | エントリ。モジュール登録、ラック・ケーブル・オーディオ接続、ピッカー UI、保存・読み込み、テーマ、マスター（Vol / BPM / Sync Out / メーター・波形・スペクトル・ゴニオ）、ケーブル弛み設定。 |
| **js/rack.js** | 行単位ラック。`addSourceRow` / `addEffectToRow` / `addModulatorToRow`、スロットの左右矢印でチェーン並び替え、`removeModule(instanceId)`、`getRows`、`getSlotIndex` / `getSlotInstanceId`（マスター Sync 用に rowIndex=-1, slotId='master' を扱う）。 |
| **js/cables.js** | ケーブル UI（SVG）、出力・入力ジャック、ドラッグで接続・**接続先の入力ジャックを掴んでドロップで切断**。接続種別ごとの色（Modulation / Pitch / Gate / Sync）。弛み（Cable sag）設定。`initCables`、`redrawCables`、`getConnections`、`addConnectionFromLoad`、`removeConnectionsBySlot`、`setCableDroop` / `getCableDroop`。 |
| **js/audio-core.js** | AudioContext、マスターゲイン、アナライザー（波形・スペクトル・L/R）。`resumeContext`、`getMasterInput`、`getMasterAnalyser`、`getMasterAnalyserL/R`、`ensureAudioContext`、`ensureLpfWorklet` / `ensureHpfWorklet`。 |
| **js/waveform-viz.js** | モジュール用波形キャンバス。`attachWaveformViz`（戻り値に `destroy`、`reconnect`）。 |
| **js/filter-response-viz.js** | LPF/HPF 周波数特性キャンバス。`attachFilterResponseViz`。 |
| **js/modules/base.js** | モジュール契約。`ModuleKind`（source / effect / modulator）、`ModuleMeta`、ファクトリ `create(instanceId)` が `{ element, getAudioInput?, getAudioOutput?, getModulationOutput?, getModulatableParams?, destroy? }` 等を返す。 |

---

## 3. モジュール種別（kind）

- **source** — 1 行に 1 つ、左列。行を新規追加。音声出力。
- **effect** — チェーン内。音声入出力。同一行のみ。
- **modulator** — チェーン内。変調出力。同一行の変調可能パラメータにケーブル接続可能。

---

## 4. 登録モジュール一覧

| id | name | kind | 備考 |
|----|------|------|------|
| sample | Sample | source | プレースホルダ（発音なし）。 |
| waveform | Osc | source | Sine / Square / Saw / Tri。Freq, Gain（ケーブル可）。周波数上限 20kHz。 |
| fm | FM | source | Carrier, Mod, Index, Gain（ケーブル可）。周波数上限 20kHz。 |
| wavetable | Wavetable | source | PeriodicWave。Wave A/B, Morph（ケーブル可）。Freq, Gain（ケーブル可）。周波数上限 20kHz。 |
| noise | Noise | source | ホワイトノイズ音源。Gain（ケーブル可）。 |
| pwm | PWM | source | PWM オシレータ（AudioWorklet）。Freq, Pulse %, Gain（ケーブル可）。 |
| pluck | Pluck | source | Karplus–Strong プラック（AudioWorklet）。Freq, Decay, Gain（ケーブル可）。 |
| ff-osc | FF-Osc | source | オシレータ系。 |
| ff-wavetable | FF-Wavetable | source | ウェーブテーブル系。 |
| reverb | Reverb | effect | ConvolverNode。Wet（ケーブル可）。 |
| eq8 | EQ-8 | effect | 8 バンド EQ。各バンドの Gain/Freq/Q（ケーブル可）。 |
| lpf | LPF | effect | 1/2/4 次 CR ローパス。Freq, Order。AudioWorklet。 |
| hpf | HPF | effect | 1/2/4 次 CR ハイパス。Freq, Order。AudioWorklet。 |
| lpf-res | LPF Res | effect | Biquad ローパス＋レゾナンス。Freq, Res。 |
| hpf-res | HPF Res | effect | Biquad ハイパス＋レゾナンス。Freq, Res。 |
| lfo | LFO | modulator | Wave, Rate, Depth。出力 → パラメータ。 |
| random-lfo | Random LFO | modulator | ランダム/S&H 風変調。出力 → パラメータ。 |
| envelope | Envelope | modulator | ADSR, Trigger（ボタン＋入力ジャック）。出力 → パラメータ。 |
| ad-envelope | AD Env | modulator | Attack–Decay のみ。出力 → パラメータ。 |
| sequencer-8 | Seq-8 | modulator | 8 ステップ（1 段）。Pitch / Gate 出力、Sync In。上窓でステップ可視化。 |
| sequencer-16 | Seq-16 | modulator | 16 ステップ（2 段×8）。同上。 |
| sequencer-32 | Seq-32 | modulator | 32 ステップ（4 段×8）。同上。 |

---

## 5. ラックレイアウト

- **行**: 名前（編集可） | 音源（1 つ） | チェーン（エフェクト＋モジュレータ、スロットの左右矢印で順序変更）。Pan / Mute / Solo。
- **並び替え**: 各スロットの左右矢印ボタン（音源以外）。`onChainChange` で再接続、`redrawCables()` でケーブル再描画。
- **横スクロール**: チェーンがはみ出したらラックを横スクロール。ケーブルレイヤーは `synth-rack-area` 全体にまたがる。

---

## 6. ケーブル

- **接続**: 出力ジャックからドラッグ → 入力ジャックにドロップ。1 入力あたり 1 本。
- **切断**: 接続済みの**入力ジャック**をドラッグし、別の場所にドロップで解除。
- **Master Sync Out → Sequencer Sync In**: オーディオではなく tick でシーケンサのステップ進行。fromRow=-1, fromSlotId='master', fromOutputId='sync', toParamId='syncIn'。
- **Gate → Trigger**: シーケンサの Gate 出力をエンベロープの Trigger に接続時、`addGateListener` / `removeGateListener`。
- **Pan**: 行のパンナーに変調を接続（toSlotId='pan', toParamId='pan'）。
- **ケーブル弛み（Cable sag）**: ヘッダーのスライダー 0〜100。`setCableDroop` / `getCableDroop`。

---

## 7. マスターパネル（右側）

- **BPM**: 40–240。バー＋数値表示。数値でホイール操作で変更。Sync Out の tick 源。
- **Sync Out**: ジャック。右に同期ランプ（拍ごとに点滅）。ここからシーケンサの Sync In にケーブルでマスター BPM 駆動。
- **Vol**: 0–1。バー＋数値。ホイールで変更。
- **Level**: L/R セグメントメーター（dB）。
- **Wave / Spectrum / Spectrogram / Goniometer**: 出力の波形・スペクトル・スペクトログラム・ゴニオメータ。

---

## 8. シーケンサ（Seq-8 / 16 / 64）

- **データ**: `stepPitch[]`（0–100）、`stepGate[]`。UI はインデックスで読み書き。
- **上窓**: ステップごとのピッチバー・ゲート・現在ステップを可視化。
- **BPM**: 内部 BPM（Sync 未接続時）。Sync In 接続中はマスターの tick で**位相同期**して進行。
- **出力**: Pitch（ConstantSource）→ オシレータの Freq など。Gate → エンベロープの Trigger。
- **入力**: Sync In（マスター Sync Out から接続）。

---

## 9. 保存・読み込み

- **Save**: ヘッダーから JSON ダウンロード。行（名前、音源 typeId、チェーン typeIds）、接続（fromRow, fromSlotIndex, fromOutputId, toRow, toSlotIndex, toParamId）、Pan / Mute / Solo。
- **Open**: ファイル選択でラック・ケーブルをクリア後に JSON から再構築。マスター Sync は fromRow=-1, fromSlotIndex=-1 で保存し、`getSlotInstanceId(-1,-1)='master'` で復元。

---

## 10. ファイル構成

```
web-synth/
├── index.html
├── styles.css
├── dev-server.sh
├── README.md
├── PROJECT.md
├── PROJECT-ja.md
└── js/
    ├── main.js
    ├── rack.js
    ├── cables.js
    ├── audio-core.js
    ├── waveform-viz.js
    ├── filter-response-viz.js
    ├── processors/          # AudioWorklet: 1/2/4 次 LPF, HPF, PWM, Pluck
    │   ├── one-pole-lpf-processor.js
    │   ├── two-pole-lpf-processor.js
    │   ├── four-pole-lpf-processor.js
    │   ├── one-pole-hpf-processor.js
    │   ├── two-pole-hpf-processor.js
    │   ├── four-pole-hpf-processor.js
    │   ├── pwm-oscillator-processor.js
    │   └── pluck-processor.js
    └── modules/
        ├── base.js
        ├── README.md
        ├── source/
        │   ├── sample-module.js
        │   ├── waveform-generator.js
        │   ├── fm-synth.js
        │   ├── wavetable.js
        │   ├── noise.js
        │   ├── pwm.js
        │   ├── pluck.js
        │   ├── ff-osc.js
        │   └── ff-wavetable.js
        ├── effect/
        │   ├── reverb.js
        │   ├── eq8.js
        │   ├── lpf.js
        │   ├── hpf.js
        │   ├── lpf-res.js
        │   └── hpf-res.js
        └── modulator/
            ├── lfo.js
            ├── random-lfo.js
            ├── envelope.js
            ├── ad-envelope.js
            └── sequencer.js
docs/
├── architecture.md
├── modules.md
├── cables.md
├── sequencer.md
├── development.md
└── future-ideas.md
```

---

## 11. 今後の候補

- 追加エフェクト（Stereo Delay、Chorus、Distortion など）。
- サンプルモジュールの実発音対応。
- シーケンサの Gate 音長など拡張。
- **docs/future-ideas.md** に詳細リストあり。
