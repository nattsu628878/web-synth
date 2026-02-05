# アーキテクチャ

Web Synth の全体構成と主要モジュールの役割。

## 1. エントリと初期化

- **index.html**  
  - ヘッダー（タイトル、Cable sag、Save / Open、テーマ）、ピッカー（Sources / Effects / Modulators）、ラック領域（`#rackContainer`）、マスターパネル（BPM、Sync Out、Vol、Level、Wave / Spectrum / Spectrogram / Goniometer）。
- **js/main.js**  
  - モジュール登録、ラックコンテナの設定、ケーブル初期化（`synth-rack-area` にレイヤー）、マスター BPM / Sync tick、Save / Load、テーマ、メーター・波形・スペクトル・ゴニオのループ。

## 2. ラック（rack.js）

- **行（RackRow）**: `rowIndex`, `name`, `source`（1 スロット）, `chain`（エフェクト＋モジュレータのスロット配列）, `pan`, `mute`, `solo`。
- **スロット（RackSlot）**: `typeId`, `instanceId`, `kind`, `element`, `instance`（モジュールの戻り値）。
- **主な API**  
  - `addSourceRow(typeId)` — 新規行を追加し、音源を配置。  
  - `addEffectToRow(rowIndex, typeId)` / `addModulatorToRow(rowIndex, typeId)` — チェーンに追加。  
  - `moveSlotInChain(rowIndex, fromIndex, toIndex)` — ハンドルドラッグで並び替え。  
  - `removeModule(rowIndex, slotInstanceId)` — モジュール削除。  
  - `getRows()` — 全行。  
  - `getSlotIndex(rowIndex, instanceId)` / `getSlotInstanceId(rowIndex, slotIndex)` — 保存・読み込み・マスター Sync 用（rowIndex=-1, slotIndex=-1 → 'master'）。

## 3. ケーブル（cables.js）

- **接続（Connection）**: `fromRow`, `fromSlotId`, `fromOutputId?`, `toRow`, `toSlotId`, `toParamId`。
- **描画**: SVG で垂れ下がり曲線。色は接続種別（fromOutputId とマスター Sync）で決定。CSS 変数（`--cable-modulation` 等）を参照。
- **ジャック**:  
  - 出力: `createOutputJack(container, outputId)`。outputId に応じて `synth-jack--modulation` / `synth-jack--pitch` / `synth-jack--gate` / `synth-jack--sync`。  
  - 入力: `createInputJack(container, paramId)`。paramId に応じて種別クラスを付与。接続がある入力だけ `draggable` にし、ドラッグして別の場所にドロップで切断。
- **初期化**: `initCables(synthRackArea, getRows, onConnect, onDisconnect)`。ラックのスクロール時に `redrawCables()` を呼ぶ。
- **弛み**: `setCableDroop(value)` / `getCableDroop()`。ヘッダーの Cable sag スライダーと連動。

## 4. オーディオ（audio-core.js）

- **AudioContext**: シングルトン。`ensureAudioContext()`、`resumeContext()`。
- **マスター**: `getMasterInput()`（GainNode）。各行の tail（source → effects → gain → panner）をここに接続。
- **アナライザー**: マスター用の AnalyserNode（波形・スペクトル・L/R ゴニオ用）。`getMasterAnalyser()` 等。

## 5. 信号フロー

- **行ごと**: `source.getAudioOutput()` → チェーン内の effect の `getAudioInput()` / `getAudioOutput()` を順に接続 → `gain`（Mute/Solo）→ `panner`（Pan）→ `getMasterInput()`。
- **変調**: ケーブル接続時に `fromSlot.instance.getModulationOutput(fromOutputId)` を `toSlot.instance.getModulatableParams()` の該当 `param` に接続。周波数などは `modulationScale` で GainNode を挟む。
- **同期**: マスター BPM の `setInterval` が tick を発火。Sync Out → Sequencer Sync In の接続があるシーケンサの `advanceStep()` を呼ぶ。

## 6. 保存・読み込み（main.js）

- **保存**: `getRows()` と `getConnections()` から JSON を組み立て。接続は `fromSlotIndex` / `toSlotIndex` で保存（マスターは fromRow=-1, fromSlotIndex=-1）。
- **読み込み**: `clearAllConnections()` → `clearRack()` の後、行・チェーンを再構築し、`addConnectionFromLoad(...)` で接続を復元。Sync 購読者リストもクリアしてから接続復元で再登録。
