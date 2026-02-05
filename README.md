# Web Synth

ブラウザ上の Ableton Live 風モジュラーシンセ。音源・エフェクト・モジュレータを行単位で配置し、ケーブルで変調・同期を接続して演奏・保存できます。

## 起動

1. プロジェクトルートで `index.html` をブラウザで開く（`file://` またはローカルサーバ経由）。
2. 任意: `./dev-server.sh` で簡易サーバを起動し、表示された URL を開く。

## 主な機能

- **ラック**: 行ごとに音源（1 つ）＋チェーン（エフェクト・モジュレータ）。ドラッグで並び替え。
- **音源**: Sample（プレースホルダ）、Osc、FM、Wavetable、Noise。周波数は最大 20kHz まで。
- **エフェクト**: Reverb（Wet ケーブル可）。
- **モジュレータ**: LFO、Envelope（ADSR）、Seq-8 / Seq-16 / Seq-64。シーケンサはマスター Sync で位相同期。
- **ケーブル**: 出力ジャックから入力ジャックへドラッグで接続。接続先を掴んで別の場所にドロップで切断。接続種別（Modulation / Pitch / Gate / Sync）ごとに色分け。
- **マスター**: BPM・Vol はバー＋数値（ホイールで変更）。Sync Out の右に同期ランプ。Sync と Vol の間に区切り線。メーター、波形・スペクトル・スペクトログラム・ゴニオメータ。
- **保存・読み込み**: ヘッダーの Save / Open で JSON に保存・復元。
- **テーマ**: ダーク / ライト切り替え（localStorage 保存）。

## ドキュメント

- **[PROJECT.md](PROJECT.md)** — 実装の全体像（アーキテクチャ、モジュール一覧、ケーブル、シーケンサ、保存など）。
- **docs/** — 詳細ドキュメント。
  - [architecture.md](docs/architecture.md) — アーキテクチャ
  - [modules.md](docs/modules.md) — モジュール一覧・インターフェース
  - [cables.md](docs/cables.md) — ケーブル・接続種別・色・切断
  - [sequencer.md](docs/sequencer.md) — シーケンサ・同期
  - [development.md](docs/development.md) — 開発・起動・ファイル構成

## 技術

- フロントのみ（ES モジュール）。ビルド不要。
- Web Audio API（AudioContext、OscillatorNode、GainNode、ConvolverNode、ConstantSourceNode など）。
- 保存形式は JSON（行・チェーン・接続・Pan / Mute / Solo）。
