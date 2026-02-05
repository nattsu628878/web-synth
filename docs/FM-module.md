# FM モジュールの仕組み

`js/modules/fm-synth.js` で実装している FM 音源の説明です。

---

## 1. FM（周波数変調）とは

**周波数変調（FM）**では、**キャリア**（鳴らしたい音のオシレータ）の**周波数**を、もう一つのオシレータ**モジュレータ**の波形で時間とともに変化させます。

- **キャリア（Carrier）**: 実際に聴こえる音の「土台」のオシレータ。基本周波数（例: 440 Hz）を持つ。
- **モジュレータ（Modulator）**: キャリアの周波数入力に「変調」を加えるオシレータ。この波形の大きさに応じてキャリアの周波数が上下する。
- **インデックス（Index）**: モジュレータの変調の「深さ」。大きいほど周波数の揺れが大きくなり、倍音が増えて音が明るく・金属的に聴こえやすい。

数式で書くと、キャリアの**瞬間周波数**はおおよそ  
`f_carrier + Index × モジュレータの波形`  
の形になります（モジュレータがサインなら `sin(2π × f_mod × t)` が周波数に足されるイメージ）。

---

## 2. Web Audio API での構成

このモジュールでは次のノードを使っています。

| ノード | 役割 |
|--------|------|
| **Oscillator (carrier)** | 実際に鳴る音。`type = 'sine'`。周波数は「下の2つを足した値」で決まる。 |
| **Oscillator (modulator)** | 変調用オシレータ。`type = 'sine'`。この出力をゲインでスケールしてキャリアの周波数に足す。 |
| **ConstantSource (carrierFreqConst)** | キャリアの**基本周波数**（例: 440 Hz）を一定値として供給。`offset` がその値。 |
| **Gain (modGain)** | モジュレータの出力を何倍にするか＝**インデックス（変調の深さ）**。0 なら変調なし。 |
| **Gain (outputGain)** | 最終的な**音量**。 |

接続の流れは次のとおりです。

```
carrierFreqConst.offset  ──┐
                           ├──► carrier.frequency  ──► carrier ──► outputGain ──► 出力
modulator ──► modGain ────┘

carrier.start()
modulator.start()
carrierFreqConst.start()
```

- **carrier.frequency** は `AudioParam` なので、ここに**複数のノードを接続すると足し算**されます。
- つまり  
  **キャリアの周波数 = carrierFreqConst.offset + modGain の出力**  
  で、  
  **carrierFreqConst.offset** = 基本周波数（Carrier スライダ）、  
  **modGain の出力** = モジュレータ波形 × Index（Mod Hz と Index スライダ）です。

---

## 3. 各パラメータの意味

| パラメータ | 対応する AudioParam / ノード | 役割 |
|------------|------------------------------|------|
| **Carrier** | `carrierFreqConst.offset` | キャリアの基本周波数（Hz）。例: 440 = ラの音。 |
| **Mod Hz** | `modulator.frequency` | モジュレータの周波数（Hz）。この値で「うねり」の速さ・倍音の間隔が変わる。 |
| **Index** | `modGain.gain` | 変調の深さ。0 だと変調なし（純粋なサイン）、大きいほど周波数が大きく揺れ、倍音が増える。 |
| **Gain** | `outputGain.gain` | 出力音量（0〜1 程度）。 |

- Carrier を 440、Mod を 220、Index を 0 にすると「440 Hz のサイン」だけの音。
- Index を上げると、220 Hz のサインで周波数が揺れ、倍音が立ち、FMらしい金属的な音になる、という流れです。

---

## 4. ケーブル接続（LFO / エンベロープ）

`getModulatableParams()` で、次の 4 つが「変調可能パラメータ」として公開されています。

- **Carrier** … `carrierFreqConst.offset`（`modulationScale: 100` → 0〜1 を約 0〜100 Hz として扱う想定）
- **Mod** … `modulator.frequency`（`modulationScale: 100`）
- **Index** … `modGain.gain`（`modulationScale: 50`）
- **Gain** … `outputGain.gain`（スケール 1）

LFO やエンベロープをこれらのジャックに繋ぐと、対応する `AudioParam` が 0〜1（およびスケール）の変調信号で動かされ、  
「キャリアの高さ」「モジュレータの速さ」「変調の深さ」「音量」を時間変化させられます。

---

## 5. まとめ

- **音の流れ**: キャリアの周波数 = 基本周波数（ConstantSource） + モジュレータ波形×Index（Gain）。そのキャリアが outputGain で音量調整されて出力。
- **Carrier / Mod Hz / Index / Gain** の 4 つが、スライダとケーブル入力の両方で操作できる、この FM モジュールの「仕組み」の中心です。
