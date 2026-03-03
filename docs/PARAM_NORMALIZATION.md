# パラメータ値の管理方針：0-1 統一 vs 現状

## 目的

- 変調・表示・AudioParam への適用を一貫して扱いやすくする
- バグ（単位の取り違え、gain が爆音になる等）を減らす

---

## 案 A: 現状の延長（スライダー空間 + paramMin/paramMax）

**やっていること**

- スライダーは「表示したい範囲」のまま（例: Freq 20–2000, Gain 0–100%）
- `getModulatableParams` で、AudioParam の実際の範囲が違うときだけ `paramMin` / `paramMax` を指定（例: gain → 0, 1）
- 変調は「スライダー空間」で effective を計算 → 必要なら `toNative()` で param 空間に変換してオフセット

**メリット**

- 各モジュールは「人間向けの値」をそのまま持てる（440 Hz, 50 %）
- 既存の `input.min` / `input.max` とそのまま対応
- 変更は「param 空間が違うものだけ paramMin/paramMax を足す」で済む

**デメリット**

- 変調ロジックで「スライダー空間 ⇔ param 空間」の変換が毎回必要
- モジュールごとに「この param は 0-1」「この param は Hz のまま」を把握する必要がある

---

## 案 B: 内部 0-1 統一 + 境界で倍率（推奨の方向性）

**やること**

1. **内部表現はすべて 0–1**
   - 変調の計算・保存・受け渡しはすべて 0–1
   - モジュレータの出力も 0–1（LFO は -1~1 なら `(x+1)/2` で 0–1 に正規化）

2. **「境界」でだけ倍率をかける**
   - **UI（スライダー・表示）**:  
     `displayValue = min + norm * (max - min)`  
     例: Freq `20 + norm*1980`, Gain% `norm*100`, Gain(dB) は必要なら `min + norm*(max-min)` など
   - **AudioParam への反映**:  
     `paramValue = paramMin + norm * (paramMax - paramMin)`  
     例: `osc.frequency = 20 + norm*1980`, `gainNode.gain = norm`（paramMin=0, paramMax=1）

3. **パラメータ定義を 1 箇所にまとめる（推奨）**

   例: パラメータメタを 1 オブジェクトで持つ

   ```js
   // 例: 1 パラメータの定義
   {
     id: 'frequency',
     name: 'Freq',
     param: osc.frequency,
     range: [20, 2000],        // AudioParam に送る範囲（＝表示範囲でよい場合はこれだけ）
     unit: 'Hz',               // 表示用（任意）
     format: (n) => `${Math.round(n)} Hz`
   }
   // または gain のように param が 0-1 なら
   {
     id: 'gain',
     name: 'Gain',
     param: gainNode.gain,
     range: [0, 1],            // 実際の AudioParam の範囲
     displayRange: [0, 100],  // 表示は 0-100%
     unit: '%',
     format: (n) => `${Math.round(n)} %`
   }
   ```

   - 内部では常に `norm = 0..1`
   - `range`（と必要なら `displayRange`）から「param への値」「表示用の値」を算出
   - 表示は「0-1 から `displayRange` でスケールして format で文字列化」で統一できる

**メリット**

- 変調は「0–1 の値 × depth」だけ考えればよく、ロジックが単純
- 表示は「norm → displayRange → format」の 1 本のパイプラインで揃えられる
- 新しいパラメータを足すときは「range（と displayRange）と format」だけ揃えればよい
- paramMin/paramMax の取り違えや「gain に 100 を足す」ようなミスが起きにくい

**デメリット**

- 既存モジュールを「0–1 を基準にした定義」に寄せていく作業が一度必要
- スライダーは「0–1 を入出力」するようにするか、または「displayRange と双方向変換」を共通レイヤで持つ必要がある

---

## 案 C: ハイブリッド（段階的に 0-1 に寄せる）

- **新規・触る機会のあるモジュール**から「内部 0-1 + range/displayRange」に寄せる
- **既存**は当面スライダー空間 + paramMin/paramMax のまま
- 共通レイヤ（例: `paramNormToNative(norm, entry)`, `nativeToNorm(value, entry)`）を用意し、変調と表示は「可能なら norm で扱い、無理なら従来どおり」にすると、少しずつ 0-1 に統一できる

---

## 推奨

- **長期的には「案 B: 0-1 統一 + 境界で倍率」**にすると、パラメータ管理と表示が一番楽になる。
- **表示**は「0-1 から displayRange でスケール → format」に統一すれば、バー・数値・変調の紫範囲を同じ式で扱える。
- いきなり全体を書き換えず、**案 C** のように「共通の param メタ + 変換関数」を用意して、新規・変調まわりから 0-1 を入れていく進め方が現実的。

---

## 次のステップ（案 B/C を進める場合）

1. **パラメータメタの型を定義**  
   `range`, `displayRange`（省略時は range）, `format` を並べる。
2. **共通ユーティリティ**  
   - `normToParam(norm, range)`  
   - `paramToNorm(value, range)`  
   - `normToDisplay(norm, displayRange, format)`  
   を 1 箇所（例: `param-utils.js` や base.js）に用意。
3. **変調まわり**  
   接続先の `range` だけ見て、0-1 の effective を `normToParam` で送る。表示も 0-1 ベースで渡す。
4. **既存モジュール**  
   `getModulatableParams` の戻りを「range / displayRange / format 付き」にし、既存の paramMin/paramMax は `range` から生成するようにして、段階的に 0-1 ベースに寄せる。

この方針なら「0-1 で統一し、表示は 0-1 から倍率で出す」形に整理でき、管理が楽になります。

---

## 実装メモ（案B）

- **共通層**: `js/param-utils.js` に以下を集約している。
  - 型: `ParamRange`, `ParamMeta`
  - 変換: `normToParam`, `paramToNorm`, `normToDisplay`, `clampNorm`
  - LFO: 出力を **-0.5 ～ 0.5** に統一。`lfoBipolarToUnipolar` / `unipolarToLfoBipolar`, `LFO_RANGE_MIN`, `LFO_RANGE_MAX`
  - パラメータ定義の保存: `PARAM_DEFS`（frequency, gain, gainDb, percent, q, timeSec, lfoBipolar）, `ParamFormat`
  - メタ用: `normToParamFromMeta`, `paramToNormFromMeta`, `normToDisplayFromMeta`
