# シーケンサと同期

## 1. シーケンサ（Seq-8 / Seq-16）

- **役割**: ステップごとに音高（Pitch）とゲート（ON/OFF）を出力。Pitch はオシレータの Freq に、Gate はエンベロープの Trigger に接続して使用。
- **データ**: `stepPitch[]`（0–100）、`stepGate[]` を唯一の真実の源。UI はそのインデックスだけを読み書きし、参照の混同を防ぐ。
- **進行**: `advanceStep()` を 1 箇所に集約。トリガーは (A) 内部 BPM の setInterval または (B) マスター Sync の tick のどちらか。

## 2. UI 構成

- **上窓**: ステップごとのピッチバー・ゲート・現在ステップを可視化（他モジュールと同様の波形窓）。
- **BPM 行**: 内部 BPM（Sync 未接続時）。Sync 接続中は表示が「Sync」に変わる。
- **Pitch 行**: 各ステップの数値（0–100）。ホイールで変更。縦バーとステップ番号は非表示。
- **Gate 行**: 各ステップの ON/OFF トグル。
- **Sync バッジ**: ヘッダーに「Sync」表示。Sync In にケーブルが繋がっている間は強調表示（.synth-module__sync-badge--on）。

## 3. 同期（Sync）

- **マスター側**: 右パネルに BPM（40–240）と Sync Out ジャック。BPM に基づく setInterval が 4 分音符ごとに tick を発火し、Sync Out に接続されているシーケンサの `advanceStep()` を呼ぶ。
- **シーケンサ側**: Sync In 入力ジャック。ここにマスター Sync Out を接続すると、内部 BPM のタイマーを止め、マスターの tick でステップ進行。切断すると内部 BPM で再開。
- **接続**: ケーブルは「同期」用の色（--cable-sync）。main.js で handleCableConnect 時に Sync 購読者に登録、handleCableDisconnect 時に解除。

## 4. 出力

- **Pitch**: ConstantSource。offset を現在ステップの `stepPitch[currentStep] / 100` に setTargetAtTime。Freq に接続時は modulationScale で Hz にスケール。
- **Gate**: ステップが ON になった瞬間に `addGateListener` で登録されたコールバック（例: envelope.trigger）を実行。
