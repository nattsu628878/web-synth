# AudioWorklet プロセッサ（確認用）

`js/processors/` は Web Audio API の **AudioWorklet** として登録されるプロセッサ。audio-core.js の `ensureLpfWorklet` / `ensureHpfWorklet` / `ensurePwmWorklet` / `ensurePluckWorklet` で読み込まれる。

## 一覧


| ファイル                        | 登録名              | 用途                   | パラメータ                                   |
| --------------------------- | ---------------- | -------------------- | --------------------------------------- |
| one-pole-lpf-processor.js   | `one-pole-lpf`   | 1 次 CR ローパス          | cutoff (20–20000)                       |
| two-pole-lpf-processor.js   | `two-pole-lpf`   | 2 次 CR ローパス          | cutoff                                  |
| four-pole-lpf-processor.js  | `four-pole-lpf`  | 4 次 CR ローパス          | cutoff                                  |
| one-pole-hpf-processor.js   | `one-pole-hpf`   | 1 次 CR ハイパス          | cutoff                                  |
| two-pole-hpf-processor.js   | `two-pole-hpf`   | 2 次 CR ハイパス          | cutoff                                  |
| four-pole-hpf-processor.js  | `four-pole-hpf`  | 4 次 CR ハイパス          | cutoff                                  |
| pwm-oscillator-processor.js | `pwm-oscillator` | PWM 矩形波オシレータ         | frequency, pulseWidth (0.01–0.99)       |
| pluck-processor.js          | `pluck`          | Karplus–Strong プラック音 | frequency (20–2000), damping (0.3–0.99) |


## 読み込み（audio-core.js）

- **LPF モジュール**: `ensureLpfWorklet()` → one/two/four-pole-lpf を一括 addModule。
- **HPF モジュール**: `ensureHpfWorklet()` → one/two/four-pole-hpf を一括 addModule。
- **PWM モジュール**: `ensurePwmWorklet()` → pwm-oscillator を addModule。
- **Pluck モジュール**: `ensurePluckWorklet()` → pluck を addModule。

## 補足

- **CR フィルタ**: 1 次は `a = 1 - exp(-2π·fc/fs)` の one-pole。2/4 次はカスケード。HPF は入力 − LPF 出力。
- **Pluck**: トリガーは `workletNode.port.postMessage({ type: 'trigger' })` で送信。バッファ長 = sampleRate/frequency、ノイズ初期化＋減衰フィードバック。

