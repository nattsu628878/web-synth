# Web Synth — プロジェクト概要

ブラウザ上の Ableton Live 風モジュラーシンセ。**音源 | エフェクト | モジュレータ** を行単位で配置し、ドラッグで並び替え、ケーブルで変調・同期を接続。保存・読み込み、マスター出力、シーケンサ（BPM 同期）に対応。

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
| **js/rack.js** | 行単位ラック。`addSourceRow` / `addEffectToRow` / `addModulatorToRow`、ハンドルでチェーン並び替え、`removeModule`、`getRows`、`getSlotIndex` / `getSlotInstanceId`（マスター Sync 用に rowIndex=-1, slotId='master' を扱う）。 |
| **js/cables.js** | ケーブル UI（SVG）、出力・入力ジャック、ドラッグで接続・**接続先を掴んでドロップで切断**。接続種別ごとの色（Modulation / Pitch / Gate / Sync）。弛み（Cable sag）設定。`initCables`（synth-rack-area にレイヤー）、`redrawCables`、`getConnections`、`addConnectionFromLoad`、`removeConnectionsBySlot`、`setCableDroop` / `getCableDroop`。 |
| **js/audio-core.js** | AudioContext、マスターゲイン、アナライザー（波形・スペクトル・L/R）。`resumeContext`、`getMasterInput`、`getMasterAnalyser`、`getMasterAnalyserL/R`、`ensureAudioContext`。 |
| **js/waveform-viz.js** | モジュール用・マスター用の波形キャンバス。`attachWaveformViz`、エンベロープ用 `attachEnvelopeViz`。 |
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
| reverb | Reverb | effect | ConvolverNode。Wet（ケーブル可）。 |
| lfo | LFO | modulator | Wave, Rate, Depth。出力 → パラメータ。 |
| envelope | Envelope | modulator | ADSR, Trigger（ボタン＋入力ジャック）。出力 → パラメータ。 |
| sequencer-8 | Seq-8 | modulator | 8 ステップ。Pitch / Gate 出力、Sync In。上窓でステップ可視化。 |
| sequencer-16 | Seq-16 | modulator | 16 ステップ。同上。 |
| sequencer-64 | Seq-64 | modulator | 4 段×16 ステップ（計 64）。同上。 |

---

## 5. ラックレイアウト

- **行**: 名前（編集可） | 音源（1 つ） | チェーン（エフェクト＋モジュレータ、ドラッグで順序変更）。Pan / Mute / Solo あり。
- **並び替え**: モジュール上部のハンドル（⋮⋮）をドラッグでチェーン内の順序変更。`redrawCables()` でケーブル再描画。
- **横スクロール**: チェーンがはみ出したらラックを横スクロール。ケーブルレイヤーは `synth-rack-area` 全体（ラック＋マスター）にまたがる。

---

## 6. ケーブル

### 6.1 接続

- **出力ジャック** からドラッグ → **入力ジャック** にドロップで接続。1 入力あたり 1 本。
- **切断**: 接続済みの**入力ジャック**をドラッグし、別の入力ジャックまたは空きスペースにドロップするとその接続が解除される。接続がある入力ジャックだけ `draggable` になる。

### 6.2 接続種別と色（させるところと対応）

色は CSS 変数（`--cable-modulation` / `--cable-pitch` / `--cable-gate` / `--cable-sync`）で統一。ケーブル描画とジャックの枠・塗りが同じ色になる。

| 種別 | 色（ライト） | 出力例 | 入力例 |
|------|-------------|--------|--------|
| **Modulation** | 緑 #628878 | LFO, Envelope | Gain, Pan, Wet, index, morph など |
| **Pitch** | 青緑 #2e6b7c | Seq Pitch | frequency, carrierFreq, modFreq |
| **Gate** | ゴールド #b8860b | Seq Gate | trigger |
| **Sync** | 赤 #721721 | Master Sync Out | Seq Sync In |

### 6.3 特殊接続

- **Master Sync Out → Sequencer Sync In**: オーディオではなく「tick」でシーケンサのステップ進行。マスター BPM で駆動。`fromRow=-1`, `fromSlotId='master'`, `fromOutputId='sync'` で扱う。
- **Gate → Trigger**: シーケンサの Gate 出力をエンベロープの Trigger に接続時、`addGateListener` でトリガー発火。
- **Pan**: 行のパンナーに変調を接続（toSlotId='pan', toParamId='pan'）。

### 6.4 その他

- **ケーブル弛み（Cable sag）**: ヘッダーのスライダーで 0〜100 の範囲で変更可能。`setCableDroop` / `getCableDroop`（cables.js）。
- ケーブルは SVG で垂れ下がり曲線。レイヤーは `pointer-events: none` でドロップはジャックに透過。

---

## 7. マスターパネル（右側）

- **BPM**: グローバルテンポ（40–240）。バー＋数値表示。数値でホイール操作で変更。Sync Out の tick 源。
- **Sync Out**: ジャック。その右に **Sync ランプ**（マスター BPM に同期して 1 拍 1 回点滅）。ここからシーケンサの Sync In にケーブルを繋ぐと、マスター BPM でステップ進行（位相同期）。
- **区切り線**: Sync ブロックと Volume ブロックの間に 1px の区切り線。
- **Vol**: マスター音量（0–1）。バー＋数値表示。数値でホイール操作で変更。
- **Level**: デジタル風メーター（セグメント＋dB）。
- **Wave / Spectrum / Spectrogram / Goniometer**: 出力の波形・スペクトル・スペクトログラム・ゴニオメータ。

---

## 8. シーケンサ（Seq-8 / Seq-16 / Seq-64）

- **データ**: `stepPitch[]`（0–100）、`stepGate[]` を唯一の真実の源。UI はそのインデックスだけを読み書き。Seq-64 は 4 段×16 ステップ。
- **上窓**: ステップごとのピッチバー・ゲート・現在ステップを可視化（他モジュールと同様の窓）。
- **BPM**: 内部 BPM（Sync 未接続時）。Sync In にケーブル接続中はマスターのグローバルステップに**位相を合わせて**進行（リセットではなく追従）。
- **出力**: Pitch（ConstantSource, 0–1）→ オシレータの Freq に接続。Gate → エンベロープの Trigger に接続可能。
- **入力**: Sync In（マスター Sync Out から接続）。

---

## 9. 保存・読み込み

- **Save**: ヘッダーから JSON ダウンロード。行（名前、音源 typeId、チェーン typeIds）、接続（fromRow, fromSlotIndex, fromOutputId, toRow, toSlotIndex, toParamId）、Pan / Mute / Solo。
- **Open**: ファイル選択でラック・ケーブルをクリア後に JSON から再構築。マスター Sync 接続は `fromRow=-1`, fromSlotIndex=-1 で保存し、`getSlotInstanceId(-1,-1)='master'` で復元。

---

## 10. ファイル構成

```
web-synth/
├── index.html
├── styles.css
├── dev-server.sh
├── README.md
├── PROJECT.md          ← 本ファイル
├── memo.md
└── js/
    ├── main.js
    ├── rack.js
    ├── cables.js
    ├── audio-core.js
    ├── waveform-viz.js
    └── modules/
        ├── base.js
        ├── README.md
        ├── source/           # kind: source
        │   ├── sample-module.js
        │   ├── waveform-generator.js
        │   ├── fm-synth.js
        │   ├── wavetable.js
        │   └── noise.js
        ├── effect/           # kind: effect
        │   └── reverb.js
        └── modulator/       # kind: modulator
            ├── lfo.js
            ├── envelope.js
            └── sequencer.js
docs/
├── architecture.md     # アーキテクチャ
├── modules.md         # モジュール一覧・インターフェース
├── cables.md          # ケーブル・接続種別・色・切断
├── sequencer.md       # シーケンサ・同期
└── development.md     # 開発・起動・ファイル構成
```

---

## 11. 今後の候補

- EQ（effect）、Chorus / Compressor など。
- サンプルモジュールの実発音対応。
- 追加のシーケンサ機能（Gate の音長など）。
- ケーブル接続・表示の安定化（接続時の挙動、横スクロール時の追従など）。
