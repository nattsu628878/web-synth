# ケーブルと接続

## 1. 接続の流れ

- **接続**: 出力ジャックからドラッグ → 入力ジャックにドロップ。1 入力あたり 1 本（既存接続は上書き）。
- **切断**: 接続済みの**入力ジャック**をドラッグし、別の入力ジャックまたは空きスペースにドロップするとその接続が解除される。接続がある入力ジャックだけ `draggable` になり、title は "Drag away to disconnect"。

## 2. 接続種別と色

「させるところ」と色を対応させている。色は CSS 変数で定義し、ケーブル描画とジャックの枠・塗りで共通利用。

| 種別 | CSS 変数 | 用途 | 出力例 | 入力例 |
|------|----------|------|--------|--------|
| **Modulation** | --cable-modulation | LFO/Envelope → 各種パラメータ | LFO, Envelope | Gain, Pan, Wet, index, morph など |
| **Pitch** | --cable-pitch | シーケンサ Pitch → 周波数 | Seq Pitch | frequency, carrierFreq, modFreq |
| **Gate** | --cable-gate | シーケンサ Gate → トリガー | Seq Gate | trigger |
| **Sync** | --cable-sync | マスター BPM → シーケンサ | Master Sync Out | Seq Sync In |

- **ケーブル色**: 接続の `fromOutputId`（およびマスター Sync の場合は fromRow/fromSlotId）で決定。cables.js の `getCableStroke(c)` で種別ごとの色を取得。
- **ジャック**: `createOutputJack(container, outputId)` / `createInputJack(container, paramId)` で outputId / paramId に応じて `synth-jack--modulation` / `synth-jack--pitch` / `synth-jack--gate` / `synth-jack--sync` を付与。

## 3. 特殊接続

- **Master Sync Out → Sequencer Sync In**  
  - オーディオではなく「tick」でシーケンサの `advanceStep()` を呼ぶ。  
  - 接続情報: `fromRow=-1`, `fromSlotId='master'`, `fromOutputId='sync'`, `toParamId='syncIn'`。  
  - main.js の handleCableConnect で該当シーケンサを Sync 購読者に登録し、`setSyncConnected(true)`。切断時に購読解除と `setSyncConnected(false)`。

- **Gate → Trigger**  
  - シーケンサの Gate 出力をエンベロープの Trigger に接続時、`addGateListener` で `envelope.trigger()` を登録。切断時に `removeGateListener`。

- **Pan**  
  - 行のパンナーに変調を接続。`toRow`, `toSlotId='pan'`, `toParamId='pan'`。main.js で該当行の panner.pan に接続。

## 4. ケーブル弛み（Cable sag）

- ヘッダーの「Cable sag」スライダーで 0〜100 の範囲で変更可能。
- cables.js の `setCableDroop(value)` / `getCableDroop()`。描画時の垂れ下がり量（px）に反映。

## 5. 保存・読み込みでの扱い

- 接続は `fromRow`, `fromSlotIndex`, `fromOutputId`, `toRow`, `toSlotIndex`, `toParamId` で保存。
- マスター Sync は `fromRow=-1`, `fromSlotIndex=-1`。rack.js の `getSlotInstanceId(-1,-1)='master'`, `getSlotIndex(-1,'master')=-1` で復元。
