# アーキテクチャ（確認用）

## 1. エントリ

- **index.html** — ヘッダー（Cable sag, Save/Open, テーマ）、ピッカー（SOURCES / EFFECTS / MODULATORS）、ラック、マスター（BPM, Sync Out, Vol, Level, Wave/Spectrum/Spectrogram/Goniometer）。
- **js/main.js** — モジュール登録（`module-registry.js` 経由）、ラック・ケーブル初期化、行オーディオ配線、マスター可視化、ピッカー・テーマ、Save/Load の呼び出し。
- **js/module-registry.js** — 全モジュールの import と `registerModule` 一括登録。
- **js/connection-runtime.js** — ケーブル接続に応じた変調・Pan・Gate/Trigger・Master Sync の AudioNode 管理と変調表示ループ。
- **js/master-sync.js** — マスター BPM、Sync tick インターバル、同期先シーケンサの購読。
- **js/project-io.js** — プロジェクト JSON の保存・読み込み、スロット状態の収集・復元。

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

## 6. 保存・読み込み（project-io.js）

- 保存: `getRows()` + `getConnections()` から JSON。行・モジュレータの全パラメータは `getModuleState(slot)`（collectParamsFromElement + getSerializableState）。
- 読み込み: 接続・変調・Sync 状態をリセット → `clearRack` → 行・チェーン・モジュレータ再構築 → `restoreModuleState` → `addConnectionFromLoad` で接続復元。オーディオ再接続は `main.js` の `connectRowToMaster` 等をコールバックで渡す。

## 7. 開発メモ

- **起動**: `index.html` を開く、または `./dev-server.sh`。
- **モジュール追加**: `js/modules/{kind}/xxx.js` で `create(instanceId)` を export → `js/module-registry.js` の一覧に追加（`main.js` は `registerAllModules` のみ）。契約は [modules.md](modules.md)。


