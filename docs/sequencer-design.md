# シーケンサ追加の設計案

## 1. シーケンサの役割

- **ステップシーケンサ**: 一定間隔（BPM）でステップを進め、各ステップで「音高（Pitch）」と「ゲート（ON/OFF）」を出力する。
- **出力**:
  - **Pitch**: 音高（周波数や 0–1 の CV）。オシレータの Freq にケーブル接続して音程を変える。
  - **Gate**: トリガー（ON の瞬間にエンベロープを発火させたい）。現状のエンベロープは「Trigger ボタン」のみで、他モジュールからの入力はない。

---

## 2. type（kind）の選び方

### 案 A: 既存の `modulator` として実装（推奨）

- **kind: 'modulator'** のまま、シーケンサを「変調源の一種」として追加する。
- **メリット**
  - 新 kind を増やさないので、rack.js / main.js / ピッカーがそのまま使える。
  - LFO/Envelope と同じ「行に追加 → 出力ジャックをパラメータにケーブル」で扱える。
- **デメリット**
  - ピッカーの「Modulators」に LFO / Envelope / Sequencer が並ぶ（分類は「変調源」でまとまるので許容しやすい）。

### 案 B: 新 kind `sequencer` を追加

- **kind: 'sequencer'** を定義し、ピッカーに「Sequencers」セクションを追加する。
- **メリット**
  - UI 上で「シーケンサ」だけ別枠にできる。
- **デメリット**
  - base.js の `ModuleKind`、rack.js の `addModulatorToRow` 相当（addSequencerToRow か、chain に「sequencer も並べる」分岐）、main.js のピッカー・保存読み込みを修正する必要がある。
  - 振る舞いは modulator とほぼ同じ（チェーンに並ぶ・出力ジャックで接続）なので、kind を分けるメリットは主に表示上の区別だけ。

**結論**: まずは **案 A（modulator）** で実装し、のちに UI を分けたいときだけ案 B を検討するのがよい。

---

## 3. 実装の切り分け

### 3.1 Pitch 出力（既存の仕組みで実現可能）

- シーケンサは **getModulationOutput()** を 1 つだけ返すとする場合:
  - 現在のステップの「音高」を 0–1 の CV として **ConstantSource** で出力する。
  - ケーブルでオシレータの **Freq** に接続し、main.js 側で `modulationScale`（例: 500 や 1000）で Hz にスケールする。
- 複数出力にしたい場合（Pitch 用と Gate 用で別ジャック）は、現状のケーブルは「1 モジュール = 1 出力ジャック」前提なので、**複数ジャック対応**（例: `getModulationOutputs()` で `{ pitch: node, gate: node }` のような形）を cables.js / main.js で拡張する必要がある。

**最小構成**: 1 出力「Pitch」だけにして、既存の modulator と同じ扱いにする。

### 3.2 Gate（トリガー）出力

- **やりたいこと**: シーケンサのステップが「ON」のタイミングで、接続先のエンベロープの `trigger()` を呼ぶ。
- **問題**: いまのエンベロープは「Trigger ボタン」でしか発火しておらず、**AudioParam や AudioNode の「トリガー入力」はない**。
- **実装案**:

| 方式 | 内容 | 難易度 |
|------|------|--------|
| **イベント接続** | ケーブルで「シーケンサ Gate → エンベロープ」を選んだときに、main.js が「このシーケンサの onStep でこの envelope.trigger() を呼ぶ」と登録する。接続情報は「from/to スロット + Gate→Trigger」として保存。 | 中（cables の接続種別が増える） |
| **Gate を AudioParam に接続** | エンベロープに「trigger input」用の AudioParam を追加し、シーケンサの Gate（0/1 の ConstantSource）をそこに接続。エンベロープ側でその値をサンプリングし、0→1 の立ち上がりで `trigger()` を実行。 | 中（Envelope の変更 + サンプリング処理） |
| **Gate は使わない（v1）** | 最初は Pitch 出力だけにして、トリガーは手動。あとから Gate 対応を追加。 | 小 |

**推奨**: v1 は **Pitch のみ**（Gate は使わない）。必要になったら「イベント接続」か「Gate → エンベロープの trigger input」のどちらかで拡張する。

---

## 4. シーケンサモジュールの仕様案（v1: Pitch のみ）

- **kind**: `modulator`
- **配置**: 既存の Modulators と同じ（行を選んで追加、チェーン内で並び替え可能）。
- **UI**
  - BPM（例: 60–180）
  - ステップ数（例: 8 または 16）
  - 各ステップ: 音高（0–100% またはノート番号）、ON/OFF（v1 では省略しても可）
- **出力**
  - 1 つ: **Pitch**（ConstantSource、0–1）。現在ステップの音高を 0–1 で出力。
- **音高の扱い**
  - 0–1 を、接続先の `modulationScale`（例: 500）で Hz に変換する想定。
  - あるいは「ノート番号」で持ち、0–1 に正規化する（例: C2–C6 を 0–1 にマッピング）。

### ファイル構成

- **js/modules/sequencer.js** を新規作成。
- main.js で `registerModule(sequencerModule)` し、Modulators のピッカーに並ぶようにする。

### タイミング（BPM）の実装

- **setInterval** または **requestAnimationFrame** で経過時間を計り、`currentStep = floor(elapsed / stepDuration) % stepCount` で現在ステップを更新。
- ステップが変わったら、そのステップの音高で **ConstantSource.offset** を `setTargetAtTime` で更新する。

---

## 5. まとめ

| 項目 | 推奨 |
|------|------|
| **type（kind）** | 新 kind は作らず **modulator** で実装する。 |
| **出力** | v1 は **Pitch 1 本**（既存ケーブルで Freq に接続）。Gate は v2 で検討。 |
| **実装** | `js/modules/sequencer.js` を追加し、BPM + ステップ数 + 各ステップの音高スライダ、getModulationOutput() で ConstantSource を返す。 |
| **Gate / トリガー** | エンベロープに「トリガー入力」を足すか、イベント接続を導入するまで、トリガーは手動でよい。 |

この方針で進めれば、既存のモジュール・ケーブル・保存読み込みをほとんど変えずにシーケンサを追加できます。
