# Web Synth — プロジェクト状況

Ableton Live 風のモジュラーシンセ：ブラウザ上で **音源 | エフェクト | モジュレータ** を行単位で配置し、ドラッグで並び替え、LFO/エンベロープをパラメータにケーブル接続。保存・読み込み、マスター出力に対応。

---

## 概要

- **エントリ**: `index.html` → `js/main.js`（ES モジュール）。
- **テンプレート**: `tpl/tool-box-tpl.html`（tool-box）。
- **開発サーバー**: プロジェクトルートの `dev-server.sh`。
- **UI 言語**: 英語（ラベル、ボタン、モジュール名、パラメータ、aria-label）。

---

## アーキテクチャ

| ファイル | 役割 |
|----------|------|
| `js/main.js` | エントリポイント。モジュール登録、ラック・ケーブル・オーディオの接続、ピッカー UI、保存・読み込み、テーマ、マスター音量・メーター・波形。 |
| `js/rack.js` | 行単位ラック：`addSourceRow`、`addEffectToRow`、`addModulatorToRow`、ハンドルでの並び替え（`moveSlotInChain` → `redrawCables()`）、`removeModule`、`getRows` など。 |
| `js/cables.js` | ケーブル UI（SVG）、出力・入力ジャック、ドラッグで接続、`initCables`、`redrawCables`、`getConnections`、`addConnectionFromLoad`、`removeConnectionsBySlot`。 |
| `js/audio-core.js` | AudioContext、マスターゲイン、アナライザー。`resumeContext`、`getMasterInput`、`getMasterAnalyser`、`ensureAudioContext`。 |
| `js/waveform-viz.js` | 各モジュール用の小型波形キャンバスとマスター出力用。`attachWaveformViz`。 |
| `js/modules/base.js` | モジュールインターフェース：`ModuleKind`（'source' \| 'effect' \| 'modulator'）、`ModuleMeta`、ファクトリ `create(instanceId)` が `{ element, getAudioInput?, getAudioOutput?, getModulationOutput?, getModulatableParams?, destroy? }` を返す。 |

---

## モジュール種別（kind）

- **source** — 1 行に 1 つ、左列。行を新規追加。音声出力のみ。
- **effect** — チェーン内（音源 → エフェクト → …）。音声入出力あり。同一行のみ。
- **modulator** — チェーン内。変調出力あり。同一行の音源・エフェクトの**変調可能パラメータ**にケーブル接続可能（LFO/エンベロープ → パラメータ）。

kind は色分けと配置に使用。現状「eq」専用種別はなく、EQ は `effect` とするか、必要なら新 kind を追加可能。

---

## 登録モジュール一覧

| id | name | kind | 備考 |
|----|------|------|------|
| sample | Sample | source | プレースホルダ（発音なし）。 |
| waveform | Osc | source | サイン / 矩形 / ノコギリ / 三角。Freq, Gain（ケーブル接続可）。 |
| fm | FM | source | Carrier, Mod, Index, Gain（ケーブル接続可）。 |
| wavetable | Wavetable | source | PeriodicWave。波形変形スライダ。Freq, Gain（ケーブル接続可）。 |
| reverb | Reverb | effect | ConvolverNode。Dry/Wet（ケーブル接続可）。 |
| lfo | LFO | modulator | 波形タイプ、Rate、Depth。出力ジャック → パラメータ。 |
| envelope | Envelope | modulator | ADSR、トリガー。出力ジャック → パラメータ。 |

---

## ラックレイアウト

- **行**: 各行 = **名前**（編集可） | **音源**（1 つ） | **チェーン**（エフェクト＋モジュレータ、ドラッグで順序変更）。
- **並び替え**: 各モジュール上部の**ハンドル**（⋮⋮）のみドラッグ可能。ドロップでチェーン内の順序が変わり、`redrawCables()` を呼ぶ（レイアウト反映のため二重 `requestAnimationFrame`）。
- **信号フロー表示**: 背景グラデーションと矢印（→、＋）で 音源 → チェーン → 出力 を表示。音源は緑系、チェーンは青・紫系。
- **横スクロール**: チェーンがはみ出したとき、ラック領域を横スクロール可能。

---

## ケーブル

- **出力ジャック**: LFO と Envelope モジュールにあり（ここからドラッグ）。
- **入力ジャック**: 音源・エフェクトの**変調可能**パラメータ（Freq, Gain, Wet など）の横に配置。
- **接続**: 出力ジャックからドラッグ → 入力ジャックにドロップ。1 接続先あたり 1 本（toRow, toSlotId, toParamId）。ケーブルは SVG で描画し、前面レイヤーに表示（`pointer-events: none` でドロップはジャックに透過）。
- **オーディオ**: 接続時に LFO/エンベロープ出力を対象 `AudioParam` に接続（周波数などは `modulationScale` でスケール）。切断・モジュール削除時に接続とスケール用ノードを解除。
- **再描画**: 接続・切断、読み込み、並び替え後（`moveSlotInChain` 内）でケーブルを再描画。

---

## マスターパネル（右側、ラックと同じ高さで固定）

- **Vol**: マスター音量スライダ（0–1）、数値表示。
- **Level**: デジタル風メーター（セグメント＋dB 表示）。通常音量域で動きが分かりやすいよう調整済み。
- **Wave**: 出力波形キャンバス（モジュールのミニ波形と同じスタイル）。

---

## 保存・読み込み

- **Save**: ヘッダーのボタン。現在の状態を JSON でダウンロード（行：名前、音源 typeId、チェーン typeIds。接続：fromRow, fromSlotIndex, toRow, toSlotIndex, toParamId）。
- **Open**: ヘッダーのファイル選択。ラックとケーブルをクリアしたうえで、JSON から行・チェーン・ケーブルを再構築。Effects/Modulators の行選択は再生成され、有効な場合は最後に選んだ行を復元。

---

## UI 詳細

- **モジュールピッカー**: 3 グループ（Sources／Effects＋行選択／Modulators＋行選択）をそれぞれ改行表示。行選択は縦並び（ラベル＋ドロップダウン）。Effects/Modulators で一度行を選ぶと、次回追加時もその行が選択されたまま。
- **テーマ**: ヘッダーの Dark/Light 切り替え。`localStorage` に保存。
- **モジュール波形**: 各モジュールに小型キャンバス（#628878）。時間で塗りつぶす表示はなし（静止波形）。

---

## ファイル構成

```
web-synth/
├── index.html
├── styles.css
├── memo.md
├── PROJECT.md          ← 英語版
├── PROJECT-ja.md       ← 本ファイル（日本語版）
└── js/
    ├── main.js
    ├── rack.js
    ├── cables.js
    ├── audio-core.js
    ├── waveform-viz.js
    └── modules/
        ├── base.js
        ├── sample-module.js
        ├── waveform-generator.js
        ├── fm-synth.js
        ├── wavetable.js
        ├── reverb.js
        ├── lfo.js
        └── envelope.js
```

---

## 今後の候補

- **EQ**: `effect` として追加（例：`eq.js` で BiquadFilterNode のバンド）するか、必要に応じて新 kind（例：`eq`）とピッカーセクションを追加。
- **その他エフェクト**: Chorus、Compressor など（`memo.md` 参照）。
- **サンプルモジュール**: プレースホルダを実際のサンプル再生に差し替え。
