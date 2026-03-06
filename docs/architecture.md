# アーキテクチャ（確認用）

## 1. エントリ

- **index.html** — ヘッダー（Cable sag, Save/Open, テーマ）、ピッカー（SOURCES / EFFECTS / MODULATORS）、ラック、マスター（BPM, Sync Out, Vol, Level, Wave/Spectrum/Spectrogram/Goniometer）。
- **js/main.js** — モジュール登録、ラック・ケーブル・オーディオ配線、Save/Load、マスター BPM/Sync、モジュールプレビュー、変調ループ。

## 2. ラック（rack.js）

- **行**: `rowIndex`, `name`, `source`（1スロット）, `chain`（エフェクトのみ）, `pan`, `mute`, `solo`。モジュレータは別パネル（MODULATOR_ROW）。
- **スロット**: `typeId`, `instanceId`, `kind`, `element`, `instance`。
- **API**: `addSourceRow`, `addEffectToRow`, `addModulator`（Modulators パネルに追加）, `getRows`, `getSlotIndex` / `getSlotInstanceId`, `removeModule`。並び替えはスロットの左右矢印。

## 3. ケーブル（cables.js）

- 接続: 出力ジャック → 入力ジャックにドロップ。切断: 入力ジャックをドラッグしてドロップ。
- 種別・色: Modulation / Pitch / Gate / Sync（CSS 変数 `--cable-modulation` 等）。`createOutputJack`, `createInputJack`。
- 特殊: Master Sync Out → Seq Sync In（tick で `advanceStep`）。Gate → Envelope Trigger（`addGateListener`）。変調 → 行 Pan（`toParamId='pan'`）。
- 弛み: `setCableDroop` / `getCableDroop`。

## 4. オーディオ（audio-core.js）

- AudioContext シングルトン。`getMasterInput()` に各行の tail（source → effects → gain → panner）を接続。
- アナライザー: マスター波形・スペクトル・L/R ゴニオ用。

## 5. 信号フロー

- 行: `source.getAudioOutput()` → チェーン effect の getAudioInput/getAudioOutput → gain（Mute/Solo）→ panner → `getMasterInput()`。
- 変調: ケーブル接続で `getModulationOutput` → 対象の `getModulatableParams` の param に接続。0–1 正規化は param-utils。
- 同期: マスター BPM の tick → Sync 接続済み Seq の `advanceStep()`。

## 6. 保存・読み込み（main.js）

- 保存: `getRows()` + `getConnections()` から JSON。行・モジュレータの全パラメータは `getModuleState(slot)`（collectParamsFromElement + getSerializableState）。
- 読み込み: clearRack → 行・チェーン・モジュレータ再構築 → `restoreModuleState` → `addConnectionFromLoad` で接続復元。

## 7. 開発メモ

- **起動**: `index.html` を開く、または `./dev-server.sh`。
- **モジュール追加**: `js/modules/{kind}/xxx.js` で `create(instanceId)` を export → `main.js` で `registerModule(xxxModule)`。契約は [modules.md](modules.md)。
