# 開発

## 1. 起動

- **file://**: プロジェクトルートの `index.html` をブラウザで開く。
- **ローカルサーバ**: `./dev-server.sh` を実行し、表示された URL を開く（例: http://localhost:8080）。

## 2. ファイル構成

```
web-synth/
├── index.html          # エントリ。ヘッダー、ピッカー、ラック領域、マスターパネル。
├── styles.css          # 全体スタイル。CSS 変数（テーマ、ケーブル色）、モジュール・ジャック・マスター。
├── dev-server.sh       # 簡易 HTTP サーバ（任意）。
├── README.md
├── PROJECT.md
├── memo.md
└── js/
    ├── main.js         # エントリ。モジュール登録、ラック・ケーブル・オーディオ、Save/Load、テーマ、マスター、Sync。
    ├── rack.js         # 行単位ラック、スロット追加・削除・並び替え、getRows/getSlotIndex/getSlotInstanceId。
    ├── cables.js       # ケーブル描画、出力・入力ジャック、接続・切断、弛み、色（CSS 変数参照）。
    ├── audio-core.js   # AudioContext、マスターゲイン、アナライザー。
    ├── waveform-viz.js # 波形・エンベロープ用ビジュアル。
    └── modules/
        ├── base.js     # モジュール契約（ModuleKind, ModuleMeta, create の戻り値）。
        ├── sample-module.js
        ├── waveform-generator.js
        ├── fm-synth.js
        ├── wavetable.js
        ├── reverb.js
        ├── lfo.js
        ├── envelope.js
        ├── sequencer.js  # createSequencerModule(8)/createSequencerModule(16)。
        └── README.md     # モジュール一覧・依存関係。
```

## 3. モジュールの追加手順

1. **js/modules/{kind}/xxx.js** を新規作成（kind は source / effect / modulator のいずれか）。
   - `create(instanceId)` で `{ element, getAudioInput?, getAudioOutput?, getModulationOutput?, getModulatableParams?, destroy? }` 等を返す。
   - base.js の型を JSDoc で `import('../base.js')` 参照。audio-core.js / cables.js / waveform-viz.js を `../../` で必要に応じて import。
2. **main.js** で `import { xxxModule } from './modules/{kind}/xxx.js';` し、`registerModule(xxxModule);`。
3. ピッカーは `factory.meta.kind` に応じて Sources / Effects / Modulators に表示される。

## 4. ケーブル種別・色の追加

1. **styles.css** の `:root` と `html.dark-mode` に `--cable-xxx` を追加。
2. **cables.js** に `getCableColorXxx()` を追加（getCssCableColor 利用）。`getCableStroke(c)` で fromOutputId に応じてその色を返す。
3. **createOutputJack** / **createInputJack** で outputId / paramId に応じて `synth-jack--xxx` を付与。
4. **styles.css** に `.synth-jack--xxx.synth-jack--output` / `.synth-jack--input` / `.synth-jack--drag-over` のスタイルを追加。

## 5. その他

- ビルドは不要（ES モジュールをそのまま利用）。
- 保存 JSON のバージョンは `version: 1`。形式変更時は main.js の load で分岐するかバージョン番号を上げる。
