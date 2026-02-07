# Web Synth システム構成精査レポート

**精査日**: 2025年2月8日  
**対象**: `js/` 配下の JavaScript 関数単位の精査（不要関数・修正候補・重複・改善提案）

---

## 1. 概要

- **エントリ**: `main.js`（モジュール登録・UI・接続・保存/読み込み・マスターBPM/メーター）
- **コア**: `audio-core.js`, `rack.js`, `cables.js`
- **ビジュアル**: `filter-response-viz.js`, `waveform-viz.js`
- **モジュール**: `modules/base.js` + `effect/`, `modulator/`, `source/`
- **プロセッサ**: `processors/`（AudioWorklet: LPF/HPF 1/2/4次）

---

## 2. 不要・未使用と判断した関数・API

### 2.1 プロジェクト内で一度も参照されていない export

| ファイル | 関数/API | 内容 |
|----------|-----------|------|
| **rack.js** | `getSlotOrder()` | 行・スロットの並び順を `{ rowIndex, kind, typeId, instanceId }[]` で返す。保存/読み込みや他モジュールから未使用。 |
| **cables.js** | `disconnectParam(toRow, toSlotId, toParamId)` | 指定入力への接続を解除する API。切断は `removeConnectionTo` 経由で行われており、外部から呼ばれていない。 |
| **audio-core.js** | `getDestination()` | `ctx.destination` を返す。他ファイルで未使用。 |
| **audio-core.js** | `getSampleRate()` | サンプルレート取得。他ファイルで未使用。 |
| **audio-core.js** | `getCurrentTime()` | コンテキストの currentTime。他ファイルでは `ensureAudioContext()` 取得後の `ctx.currentTime` を直接使用。 |
| **audio-core.js** | `createGain(gain)` | GainNode 作成のラッパー。各モジュールは `ctx.createGain()` を直接使用しており未使用。 |

**推奨**:  
- 将来の拡張で使う予定がなければ、上記を削除するか、使用予定がある場合はコメントで「予約」と明記する。  
- `getSlotOrder` は保存形式の拡張（スロット順の明示保存）で使う可能性があるなら残し、そうでなければ削除候補。

---

## 2.2 未使用の定数・配列

| ファイル | 名前 | 内容 |
|----------|------|------|
| **cables.js** | `PITCH_PARAM_IDS` | `createInputJack` 内で `paramId` がピッチ用かどうかの判定に使用。常に `[]` のため、現状どの paramId もピッチ扱いにならない。シーケンサの `frequency` 等をピッチ色にしたい場合はここに id を追加する設計だが、未使用のまま。 |

**推奨**:  
- ピッチ用ジャックの色分けを使うなら、該当 `paramId`（例: `'frequency'`, `'pitch'`）を `PITCH_PARAM_IDS` に追加する。  
- 使わないなら、判定ロジックごと削除して「モジュレーション用のみ」に整理してもよい。

---

## 3. 修正すべき・注意した方がよい点

### 3.1 main.js

- **`handleCableConnect`（scale !== 1 の分岐）**  
  - `modulationScaleNodes.set(connectionKey(...), gainNode)` で正しく登録されている。  
  - 一方、`scale === 1` のときは `out.connect(entry.param)` のみで、`modulationScaleNodes` には入れていない。  
  - `handleCableDisconnect` では `modulationScaleNodes.get(key)` が undefined のとき `out.disconnect(entry.param)` を呼ぶため、挙動は一致している。**修正不要。**

- **`getSlotAt(rowIndex, instanceId)`**  
  - main.js 内で定義され、`getRows()` と `instanceId` からスロットを取得するために使用されている。  
  - rack.js の `getSlotIndex` / `getSlotInstanceId` は「index ⇔ instanceId」の変換のみで、スロットオブジェクト自体は返さない。  
  - 役割が明確に分かれており、**現状のままで問題なし。**

- **`rowTailToMaster`**  
  - main.js 内で定義され、行ごとのパンナー（tail → master の接続）を保持。`connectRowToMaster` や Pan 接続で使用。**問題なし。**

### 3.2 audio-core.js

- **`resumeContext()`**  
  - `getAudioContext()` が null の場合は何もしない。初回は `ensureAudioContext()` を別途呼ぶ必要がある。  
  - 現状、main.js では `resumeContext()` の前に `ensureAudioContext()` を経由する処理が多く、大きな問題はない。  
  - 明示的に「コンテキストが未作成なら何もしない」仕様としてコメントがあると分かりやすい。

### 3.3 cables.js

- **`getCableColorModulation` / `getCableColorPitch` / `getCableColorGate` / `getCableColorSync`**  
  - いずれも export されておらず、`drawCables` 内の `getCableStroke(c)` からだけ参照されている。**不要な修正なし。**

### 3.4 モジュール間の重複（修正は任意）

- **周波数・ゲインなどのユーティリティ**  
  - `valueToFreq` / `freqToValue` / `formatFreq` が **lpf.js**, **hpf.js**, **lpf-res.js**, **hpf-res.js** にほぼ同一で存在。  
  - 定数 `FREQ_MIN`, `FREQ_MAX` も同様。  
  - **filter-response-viz.js** の `FREQ_MIN`, `FREQ_MAX` と意味は同じで値も 20 / 20000。  
  - 共通化する場合は、例: `js/utils/filter-params.js` のような小さなモジュールにまとめ、各エフェクトから import する形が考えられる。現状のままでも動作に問題はない。

### 3.5 ドキュメントとの齟齬

- **docs/architecture.md**  
  - 「`moveSlotInChain(rowIndex, fromIndex, toIndex)`」「`removeModule(rowIndex, slotInstanceId)`」と記載がある。  
  - 実装は **rack.js** で `moveSlotLeft` / `moveSlotRight`（スロット単位）と `removeModule(instanceId)`（instanceId のみ）。  
  - ドキュメントを実装に合わせて修正するか、公開 API として `moveSlotInChain` を残すなら rack.js にラッパーを用意する必要がある。

---

## 4. ファイル別 関数一覧と役割（要約）

### 4.1 main.js

- **モジュールプレビュー**: `showModulePreview`, `clearModulePreview`, `bindModulePreviewToPicker` … ピッカーでホバー時にプレビュー表示。
- **接続・ゲイン**: `connectionKey`, `triggerConnectionKey`, `handleCableConnect`, `handleCableDisconnect`, `connectRowToMaster`, `applyPanConnectionsForRow`, `computeRowGain`, `applyAllRowGains`.
- **スロット取得**: `getSlotAt` … 行＋instanceId からスロットオブジェクト取得。
- **マスター**: `startMasterSyncInterval`, `updateMasterBpmBar`, `updateMasterVolumeBar`, `updateMeterAndWaveform`（メーター・波形・スペクトル・スペクトログラム・ゴニオ）, `spectrogramColor`.
- **行選択**: `updateRowSelects`, `escapeHtml`.
- **保存・読み込み**: `saveProject`, `loadProject`.
- **ピッカー**: `renderSourcePicker`, `renderEffectPicker`, `renderModulatorPicker`, `renderModulePickers`.
- **テーマ**: `setTheme`.

いずれもエントリまたはイベント駆動で使用されており、**不要な関数はなし**。

### 4.2 audio-core.js

- **コンテキスト**: `getAudioContext`, `ensureAudioContext`, `resumeContext`.
- **マスター**: `getMasterInput`, `getMasterAnalyser`, `getMasterAnalyserL`, `getMasterAnalyserR`.
- **ユーティリティ**: `getDestination`, `createGain`, `getSampleRate`, `getCurrentTime` … 上記のとおり未使用。
- **Worklet**: `getWorkletUrl`（内部）, `ensureLpfWorklet`, `ensureHpfWorklet`.

### 4.3 rack.js

- **登録・取得**: `registerModule`, `getModuleFactory`, `getRegisteredModules`, `setRackContainer`, `setOnChainChange`, `setOnPanChange`, `setOnMuteSoloChange`.
- **行・スロット操作**: `addSourceRow`, `addEffectToRow`, `addModulatorToRow`, `removeModule`, `clearRack`, `getRows`, `getSlotIndex`, `getSlotInstanceId`, `getSlotOrder`（未使用）.
- **行プロパティ**: `setRowName`, `setRowPan`, `setRowMute`, `setRowSolo`.
- **内部**: `nextInstanceId`, `updateParamBarFill`, `replaceSlidersWithBars`, `createSlotWrapper`, `findSlotByInstanceId`, `updateChainMoveButtons`, `moveSlotLeft`, `moveSlotRight`, `bindSlotEvents`.

### 4.4 cables.js

- **接続**: `addConnection`, `removeConnectionTo`, `addConnectionFromLoad`, `clearAllConnections`, `disconnectParam`（未使用）, `removeConnectionsBySlot`.
- **描画**: `initCables`, `drawCables`, `redrawCables`.
- **ジャック**: `createOutputJack`, `createInputJack`.
- **設定**: `getCableDroop`, `setCableDroop`.
- **取得**: `getConnections`.
- **内部**: `getJackPosition`, `getSlotElement`, `getOutputJackEl`, `getInputJackEl`, `updateInputJackDraggable`, `getCableColor*`（4種）.

### 4.5 filter-response-viz.js / waveform-viz.js

- **filter-response-viz.js**: `attachFilterResponseViz` のみ export。LPF/HPF の周波数特性と任意でスペクトラムを描画。内部に `getGridFreqs` と定数あり。
- **waveform-viz.js**: `attachWaveformViz` のみ export。戻り値の `reconnect` が音源モジュールの `reconnectWaveformViz` から利用されている。

### 4.6 modules/base.js

- **export**: `formatParamValue`, `formatParamValueFreq`, `ModuleMeta`, `ModuleFactory`（空オブジェクト。JSDoc 用）。
- 各モジュールは `formatParamValue` / `formatParamValueFreq` を利用。`ModuleMeta` / `ModuleFactory` は型参照用で、ランタイムでは未使用だがドキュメント上有用。

### 4.7 processors/

- **one-pole-lpf-processor.js** 等、各 LPF/HPF の AudioWorkletProcessor を登録。main や rack から直接参照はされず、`audioWorklet.addModule(...)` で読み込まれるのみ。**削除対象ではない。**

---

## 5. 推奨アクションまとめ

| 優先度 | 内容 |
|--------|------|
| 高 | **未使用 export の整理**: `getSlotOrder`, `disconnectParam`, `getDestination`, `getSampleRate`, `getCurrentTime`, `createGain` を削除するか、使用予定をコメントで明記する。 |
| 中 | **PITCH_PARAM_IDS**: ピッチ用ジャックの色分けを使うなら id を追加する。使わないなら判定をやめてコードを簡略化する。 |
| 中 | **docs/architecture.md**: `moveSlotInChain` / `removeModule` の説明を実装（`moveSlotLeft` / `moveSlotRight` / `removeModule(instanceId)`）に合わせて修正する。 |
| 低 | **フィルタ用ユーティリティの共通化**: `valueToFreq` / `freqToValue` / `formatFreq` と FREQ_MIN/MAX を共通モジュールにまとめる（任意）。 |
| 低 | **base.js の ModuleMeta / ModuleFactory**: JSDoc 用として残すか、型定義ファイルに移すかは好みでよい。 |

---

## 6. 結論

- **致命的なバグや不要な重複処理は見当たらない。** 接続・ゲイン・Pan・Sync の扱いも一貫している。
- **削除・整理してよいのは「プロジェクト内で参照されていない export」**（getSlotOrder, disconnectParam, getDestination, getSampleRate, getCurrentTime, createGain）と、**未使用の PITCH_PARAM_IDS** の扱い。
- **ドキュメントと実装の差異**は architecture.md のラック API 説明を修正するとよい。
- フィルタ周りの定数・ユーティリティの共通化は、保守性を上げたい場合の任意の改善として検討できる。

以上を踏まえ、まずは「未使用 API の削除またはコメント明記」と「ドキュメント修正」から進めることを推奨する。
