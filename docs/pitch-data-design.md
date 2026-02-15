# 音高データ（Pitch Data）設計案

スケーラー・アルペジエータなどを実装するため、音高を扱うデータフローを整理する。

---

## 1. 現状

- **シーケンサ**: 各ステップに **Pitch 0–100**（スライダー）と Gate。Pitch は `ConstantSourceNode.offset = value/100`（0–1）で出力。
- **接続**: Sequencer Pitch Out → Osc Freq など。`getModulationOutput('pitch')` で `pitchOut`（ConstantSourceNode）を返し、接続先の **AudioParam**（例: `osc.frequency`）に接続。`modulationScale`（例: 100）でゲインをかける。
- **問題**: ピッチが「DC 値 0–1」であり、**スケール量化**や**複数音のアルペジオ**には向かない。また「何の音程か」がモジュール間で共有されていない。

---

## 2. 音高の表現（MIDI 風にするか）

### 2.1 候補

| 方式 | 内容 | 利点 | 欠点 |
|------|------|------|------|
| **A. MIDI ノート番号** | 0–127（C-1 〜 G9）。中央の 69 = A4 = 440 Hz | スケール・和音・アルペジオの計算が容易。業界標準 | 既存の 0–100 と変換が必要 |
| **B. 周波数 (Hz)** | そのまま Hz | 既存の Freq パラメータと一致 | スケール「C にスナップ」などの演算が面倒 |
| **C. 0–1 正規化** | 現在の 0–100 を 0–1 にしたまま | 既存実装をそのまま使える | 音程の意味が曖昧。スケールと相性が悪い |

**推奨**: **A. MIDI ノート番号**を「音高データ」の共通表現にする。  
スケーラー（スケールに量子化）、アルペジエータ（和音を順番に出力）は MIDI で扱うと実装が簡単。  
必要に応じて **Hz 変換** は `440 * 2 ** ((midi - 69) / 12)` で行う。

### 2.2 変換の置き場所

- **MIDI → Hz**: 音源（Osc, Pluck など）の **Freq 入力に渡す直前**、または「Pitch を受けるモジュール」内で変換。
- **現在の 0–100 → MIDI**: シーケンサの「ステップのピッチ 0–100」を、例えば `midi = 24 + Math.round((pitch/100) * 72)` のように 1–2 オクターブにマッピングする。  
  （必要なら 0–127 全体や、キー範囲を設定可能にする。）

---

## 3. 音高の流し方（2 通り）

### 3.1 現行: DC（オーディオ接続）

- **送り側**: `ConstantSourceNode.offset` に値（0–1 または Hz をスケールした値）をセット。
- **受け側**: そのノードを **AudioParam**（例: `osc.frequency`）に接続。
- **特徴**: 既存の「Sequencer Pitch → Osc Freq」のまま動く。**1 本のケーブル = 1 つの現在値**のみ。

### 3.2 新規: イベント（Pitch 受信コールバック）

- **送り側**: ピッチが変わったときに「登録された受け側」に **コールバックで値を渡す**。  
  例: `pitchReceivers.forEach(cb => cb(midiNote, velocity?))`
- **受け側**: 「Pitch In」ジャック用に `receivePitch(midiNote, velocity?)` のような API を用意。  
  スケーラーならここで量子化してから、自分の「Pitch Out」リスナーに渡す（または DC 出力を更新）。
- **特徴**: **スケーラー／アルペジエータ**のように「ピッチを加工してから別のモジュールに渡す」のに向く。  
  複数音（和音）を扱う場合は「配列で渡す」などに拡張できる。

両方サポートする形にすると:

- **Pitch Out → Freq（AudioParam）**: 従来どおり DC 接続（必要なら MIDI→Hz を「Pitch Out 側」でやってから DC に載せる）。
- **Pitch Out → Pitch In（スケーラー等）**: イベント接続（`addPitchReceiver` / `receivePitch`）。

---

## 4. 接続タイプの整理

| 送り | 受け | 方式 | 備考 |
|------|------|------|------|
| Sequencer Pitch Out | Osc / Pluck Freq | DC（現行） | 既存。値は Hz または 0–1×scale |
| Sequencer Pitch Out | Scaler Pitch In | イベント（新規） | `receivePitch(midi)` |
| Scaler Pitch Out | Osc Freq | DC または イベント→DC | スケール済み MIDI → Hz → ConstantSource |
| Sequencer Pitch Out | Arpeggiator Pitch In | イベント（新規） | 和音入力は「複数 MIDI」で渡すか、別設計 |
| Arpeggiator Pitch Out | Osc Freq | DC | アルペジオの「現在の 1 音」を Hz で |

---

## 5. 実装のステップ案

1. **共通定義**
   - `midiToHz(midi)` / `hzToMidi(hz)` をどこか 1 か所（例: `js/audio-core.js` や `js/pitch.js`）に用意。
   - 必要なら「Pitch 用」の定数（A4=69, 440Hz）もここに集約。

2. **シーケンサの拡張**
   - 内部で「ステップの 0–100」を **MIDI に変換**する関数を用意。
   - **Pitch 受信者**用に `addPitchReceiver(cb)` を追加。  
     `advanceStep` のときに `cb(currentMidiNote)` を呼ぶ。
   - 既存の「Pitch Out → Freq」はそのまま DC でつなぐ場合、  
     「Pitch Out の値 = MIDI から換算した Hz」にするか、  
     あるいは「Pitch Out はこれまでどおり 0–1、Freq 側で scale だけ」のままにするかは方針次第。

3. **main.js の接続処理**
   - **Pitch Out → Pitch In** 用の分岐を追加。  
     接続時: `fromSlot.instance.addPitchReceiver(toSlot.instance.receivePitch)` のような登録。  
     切断時: 対応する `removePitchReceiver`。
   - **Pitch Out → Freq** は従来どおり DC（`getModulationOutput('pitch')` → param）。

4. **スケーラー**
   - **Pitch In**: `receivePitch(midi)` で受け取り、スケールに量子化してから `setPitchOut(midi)`。
   - **Pitch Out**: 量子化した MIDI を、DC（Hz）で出力するか、または `addPitchReceiver` で下流にイベント配送。
   - スケールは「C major」「Pentatonic」などプリセットを列挙。

5. **アルペジエータ**
   - **Pitch In**: 和音（複数 MIDI）を受け取るか、または「単音を複数回トリガー」で擬似的に和音にするかは要検討。
   - **Gate / Rate**: 何拍ごとに次の音に進めるか。
   - **Pitch Out**: 現在の 1 音を MIDI（→ Hz）で出力。  
     Gate でトリガーするたびに「次の音」に進める。

---

## 6. まとめ

- **音高データ**は **MIDI ノート番号（0–127）** を共通表現にすると、スケーラー・アルペジエータが作りやすい。
- **既存の DC 接続**（Sequencer → Osc Freq）は残しつつ、**イベント経路**（Pitch Out → Pitch In）を新設する。
- 変換（MIDI ↔ Hz）は共通ユーティリティにまとめ、シーケンサは「ステップ値 0–100」を MIDI にマッピングしてからイベントで配る形にすると、スケーラー／アルペジエータと一貫したデータで扱える。

この方針で進めれば、スケーラーとアルペジエータを「音高データ」の上に実装できる。
