# ファイル構造と各ファイルの機能

Web Synth プロジェクトのディレクトリ構成と、各ファイルの役割の一覧。

---

## ルート

| ファイル | 機能 |
|----------|------|
| **index.html** | アプリのエントリ。ヘッダー（タイトル、Cable sag、Save/Open、テーマ切替）、ピッカー（Sources / Effects / Modulators）、ラック領域（`#rackContainer`）、マスターパネル（BPM、Sync Out、Vol、Level、Wave / Spectrum / Spectrogram / Goniometer）を定義。`js/main.js` を ES モジュールで読み込む。 |
| **styles.css** | 全体のスタイル。CSS 変数（テーマ色、ケーブル色）、ヘッダー・ラック・モジュール・ジャック・マスターパネル・ピッカーなどの見た目を定義。 |
| **dev-server.sh** | 簡易 HTTP サーバ起動用スクリプト。ローカルで開く際に利用（任意）。 |
| **README.md** | プロジェクト概要、起動方法、主な機能、ドキュメントへのリンク。 |
| **PROJECT.md** | プロジェクト仕様（英語）。アーキテクチャ、モジュール一覧、ケーブル、シーケンサ、保存形式、ファイル構成など。 |
| **PROJECT-ja.md** | 上記の日本語版。 |

---

## .github/workflows/

| ファイル | 機能 |
|----------|------|
| **deploy.yml** | GitHub Actions のワークフロー。デプロイや CI 用の設定。 |

---

## .vscode/

| ファイル | 機能 |
|----------|------|
| **settings.json** | VSCode 用ワークスペース設定。 |

---

## js/（メインの JavaScript）

### エントリ・コア

| ファイル | 機能 |
|----------|------|
| **main.js** | エントリポイント。モジュールの import と `registerModule`、ラックコンテナ設定、ケーブル初期化（`initCables`）、マスター BPM / Sync tick、Save / Load、テーマ、モジュールプレビュー、ピッカー（Sources / Effects / Modulators）の描画、行選択の更新、接続・切断ハンドラ（`handleCableConnect` / `handleCableDisconnect`）、行のマスター接続（`connectRowToMaster`）、メーター・波形・スペクトル・スペクトログラム・ゴニオの更新ループ。`param-utils` の `normToParam` / `paramToNorm` / `clampNorm` を変調計算に利用。 |
| **rack.js** | 行単位ラックの状態と操作。行（RackRow）・スロット（RackSlot）のデータ構造、`addSourceRow` / `addEffectToRow` / `addModulatorToRow`、スロットの左右矢印による並び替え（`moveSlotLeft` / `moveSlotRight`）、`removeModule(instanceId)`、`getRows`、`getSlotIndex` / `getSlotInstanceId`（保存・読み込み・マスター Sync 用）。スライダーをバー表示に置き換える `replaceSlidersWithBars`、`updateParamDisplayFromValue`。モジュール登録（`registerModule`、`getModuleFactory`、`getRegisteredModules`）。 |
| **cables.js** | ケーブル UI と接続状態。SVG で垂れ下がり曲線を描画。出力ジャック `createOutputJack`、入力ジャック `createInputJack`（paramId に応じた色分け、PITCH_PARAM_IDS）。接続の追加・解除（`addConnection`、`removeConnectionTo`、`addConnectionFromLoad`、`clearAllConnections`、`removeConnectionsBySlot`）。`initCables`（ラック領域にレイヤーを追加、ドラッグ＆ドロップのリスナー）、`redrawCables` / `scheduleRedrawCables`。ケーブル弛み `setCableDroop` / `getCableDroop`。接続一覧 `getConnections`。 |
| **audio-core.js** | オーディオ基盤。AudioContext のシングルトン（`getAudioContext`、`ensureAudioContext`）、`resumeContext`。マスター入出力（`getMasterInput`＝GainNode、その先に Analyser と L/R 用 ChannelSplitter＋Analyser）。`getMasterAnalyser` / `getMasterAnalyserL` / `getMasterAnalyserR`。LPF/HPF/PWM/Pluck 用 AudioWorklet の読み込み（`ensureLpfWorklet`、`ensureHpfWorklet`、`ensurePwmWorklet`、`ensurePluckWorklet`）。 |
| **param-utils.js** | パラメータの正規化・変換（案B: 内部 0–1 統一）。`normToParam`（0–1 → パラメータ範囲）、`paramToNorm`（パラメータ値 → 0–1）、`clampNorm`、`normToDisplay`。LFO 用の双極範囲（`LFO_RANGE_MIN` / `LFO_RANGE_MAX`）、`bipolarToUnipolar` / `unipolarToBipolar`。変調の effective 計算用ヘルパ。`ParamMeta` 型（id, name, param, range, displayRange, format）。 |

### ビジュアル

| ファイル | 機能 |
|----------|------|
| **waveform-viz.js** | モジュール用の小型波形ビジュアル。`attachWaveformViz(container, audioNode)`。AnalyserNode で時間領域を取得し Canvas に描画。戻り値の `reconnect` で、接続し直したあと波形を再表示。 |
| **filter-response-viz.js** | LPF/HPF の周波数特性を Canvas に描画（EQ-8 風グリッド＋曲線＋任意でスペクトラム）。1 次 CR は数式、それ以外は BiquadFilterNode の `getFrequencyResponse` を使用。`attachFilterResponseViz(container, filterNode, audioNodeForSpectrum)`。 |

---

## js/processors/（AudioWorklet）

Web Audio の AudioWorklet として動作。`audioWorklet.addModule()` で読み込まれる。

| ファイル | 機能 |
|----------|------|
| **one-pole-lpf-processor.js** | 1 次 CR ローパスフィルタ。`one-pole-lpf` で登録。cutoff パラメータ。 |
| **two-pole-lpf-processor.js** | 2 次 CR ローパスフィルタ。`two-pole-lpf` で登録。 |
| **four-pole-lpf-processor.js** | 4 次 CR ローパスフィルタ。`four-pole-lpf` で登録。 |
| **one-pole-hpf-processor.js** | 1 次 CR ハイパスフィルタ。`one-pole-hpf` で登録。 |
| **two-pole-hpf-processor.js** | 2 次 CR ハイパスフィルタ。`two-pole-hpf` で登録。 |
| **four-pole-hpf-processor.js** | 4 次 CR ハイパスフィルタ。`four-pole-hpf` で登録。 |
| **pwm-oscillator-processor.js** | PWM オシレータ。`pwm-oscillator` で登録。周波数・パルス幅など。 |
| **pluck-processor.js** | Karplus–Strong 系プラック音。`pluck` で登録。周波数・減衰など。 |

---

## js/modules/

### 共通

| ファイル | 機能 |
|----------|------|
| **base.js** | モジュールの契約・型定義。`ModuleKind`（source / effect / modulator）、`ModuleMeta`、ファクトリの `create(instanceId)` が返すインスタンスのインターフェース。`formatParamValue` / `formatParamValueFreq`（表示用）。JSDoc 用の `ModuleMeta` / `ModuleFactory` オブジェクト。 |
| **README.md** | modules フォルダの役割、kind 別フォルダ構成、ファイル一覧、main.js との依存関係。 |

### js/modules/source/（音源）

| ファイル | 機能 |
|----------|------|
| **sample-module.js** | Sample。プレースホルダ音源（発音なし）。 |
| **waveform-generator.js** | Osc。Sine / Square / Saw / Triangle。Freq, Gain。波形ビジュアル。 |
| **fm-synth.js** | FM。Carrier, Mod, Index, Gain。FM 音源。 |
| **wavetable.js** | Wavetable。PeriodicWave、Wave A/B、Morph。Freq, Gain。 |
| **noise.js** | Noise。ホワイトノイズ。Gain。 |
| **pwm.js** | PWM。AudioWorklet の PWM オシレータ。Freq, Pulse %, Gain。 |
| **pluck.js** | Pluck。AudioWorklet の Karplus–Strong プラック。Freq, Decay, Gain。 |
| **ff-osc.js** | FF-Osc。オシレータ系の別バリアント。 |
| **ff-wavetable.js** | FF-Wavetable。ウェーブテーブル系の別バリアント。 |

### js/modules/effect/（エフェクト）

| ファイル | 機能 |
|----------|------|
| **reverb.js** | Reverb。ConvolverNode。Wet（ケーブル可）。 |
| **delay.js** | Delay。ステレオディレイ（時間・フィードバック等）。 |
| **eq8.js** | EQ-8。8 バンド EQ。各バンドの Gain / Freq / Q。filter-response-viz は使わず、バンド表示。 |
| **lpf.js** | LPF。1/2/4 次 CR ローパス。Freq, Order。AudioWorklet。filter-response-viz で周波数特性表示。 |
| **hpf.js** | HPF。1/2/4 次 CR ハイパス。Freq, Order。AudioWorklet。同上。 |
| **lpf-res.js** | LPF Res。BiquadFilterNode ローパス＋レゾナンス。Freq, Res。 |
| **hpf-res.js** | HPF Res。BiquadFilterNode ハイパス＋レゾナンス。Freq, Res。 |

### js/modules/modulator/（モジュレータ）

| ファイル | 機能 |
|----------|------|
| **lfo.js** | LFO。波形、Rate、Depth。変調出力をパラメータに接続。 |
| **random-lfo.js** | Random LFO。ランダム／S&H 風の変調出力。 |
| **envelope.js** | Envelope。ADSR、Trigger（ボタン＋入力ジャック）。Gate 接続でトリガー。 |
| **ad-envelope.js** | AD Env。Attack–Decay のみ。 |
| **sequencer.js** | Seq-8 / Seq-16 / Seq-64。ステップごとの Pitch / Gate。Sync In でマスター BPM に同期。Pitch / Gate 出力、上窓でステップ可視化。 |

---

## docs/

| ファイル | 機能 |
|----------|------|
| **architecture.md** | アーキテクチャ概要。エントリ・ラック・ケーブル・オーディオ・信号フロー・保存・読み込み。 |
| **modules.md** | モジュール契約（base.js）、登録モジュール一覧、モジュールごとの補足、追加手順。 |
| **cables.md** | ケーブルと接続。接続の流れ、種別と色、Master Sync / Gate→Trigger / Pan、弛み、保存・読み込みでの扱い。 |
| **sequencer.md** | シーケンサと同期。役割、UI、Sync、出力。 |
| **development.md** | 開発向け。起動方法、ファイル構成、モジュール追加手順、ケーブル種別・色の追加、その他（ビルド不要、保存 JSON バージョン）。 |
| **future-ideas.md** | 今後の候補。新モジュール（Sources / Effects / Modulators）、UI/UX、ドキュメント・コード品質、保存、オーディオ周り、優先度の目安。 |
| **PARAM_NORMALIZATION.md** | パラメータ値の管理方針。案 A（現状延長）と案 B（内部 0–1 統一＋境界で倍率）の比較と推奨。 |
| **FILE_STRUCTURE.md** | 本ドキュメント。プロジェクト全体のファイル構造と各ファイルの機能。 |

---

## ディレクトリツリー（概要）

```
web-synth/
├── index.html
├── styles.css
├── dev-server.sh
├── README.md
├── PROJECT.md
├── PROJECT-ja.md
├── .github/workflows/
│   └── deploy.yml
├── .vscode/
│   └── settings.json
├── js/
│   ├── main.js
│   ├── rack.js
│   ├── cables.js
│   ├── audio-core.js
│   ├── param-utils.js
│   ├── waveform-viz.js
│   ├── filter-response-viz.js
│   ├── processors/
│   │   ├── one-pole-lpf-processor.js
│   │   ├── two-pole-lpf-processor.js
│   │   ├── four-pole-lpf-processor.js
│   │   ├── one-pole-hpf-processor.js
│   │   ├── two-pole-hpf-processor.js
│   │   ├── four-pole-hpf-processor.js
│   │   ├── pwm-oscillator-processor.js
│   │   └── pluck-processor.js
│   └── modules/
│       ├── base.js
│       ├── README.md
│       ├── source/
│       │   ├── sample-module.js
│       │   ├── waveform-generator.js
│       │   ├── fm-synth.js
│       │   ├── wavetable.js
│       │   ├── noise.js
│       │   ├── pwm.js
│       │   ├── pluck.js
│       │   ├── ff-osc.js
│       │   └── ff-wavetable.js
│       ├── effect/
│       │   ├── reverb.js
│       │   ├── delay.js
│       │   ├── eq8.js
│       │   ├── lpf.js
│       │   ├── hpf.js
│       │   ├── lpf-res.js
│       │   └── hpf-res.js
│       └── modulator/
│           ├── lfo.js
│           ├── random-lfo.js
│           ├── envelope.js
│           ├── ad-envelope.js
│           └── sequencer.js
└── docs/
    ├── architecture.md
    ├── modules.md
    ├── cables.md
    ├── sequencer.md
    ├── development.md
    ├── future-ideas.md
    ├── PARAM_NORMALIZATION.md
    └── FILE_STRUCTURE.md
```
