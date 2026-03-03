# Web Synth — Project Overview

Browser-based modular synth in the style of Ableton Live. Place **sources | effects | modulators** per row, reorder with slot arrows, connect modulation and sync with cables. Supports save/load, master output, and sequencers (BPM sync).

---

## 1. Overview

| Item | Description |
|------|-------------|
| **Entry** | `index.html` → `js/main.js` (ES modules) |
| **Dev server** | `./dev-server.sh` (optional) |
| **UI** | English labels. Dark/light theme (stored in localStorage) |

---

## 2. Architecture

| File | Role |
|------|------|
| **js/main.js** | Entry. Module registration, rack/cable/audio wiring, picker UI, save/load, theme, master (Vol / BPM / Sync Out / meter, waveform, spectrum, spectrogram, goniometer), cable droop. |
| **js/rack.js** | Row-based rack. `addSourceRow` / `addEffectToRow` / `addModulatorToRow`, chain reorder via slot left/right arrows, `removeModule(instanceId)`, `getRows`, `getSlotIndex` / `getSlotInstanceId` (rowIndex=-1, slotId='master' for master Sync). |
| **js/cables.js** | Cable UI (SVG), output/input jacks, drag to connect, **drag from input jack to disconnect**. Colors by connection type (Modulation / Pitch / Gate / Sync). Droop (Cable sag). `initCables`, `redrawCables`, `getConnections`, `addConnectionFromLoad`, `removeConnectionsBySlot`, `setCableDroop` / `getCableDroop`. |
| **js/audio-core.js** | AudioContext, master gain, analysers (waveform, spectrum, L/R for goniometer). `resumeContext`, `getMasterInput`, `getMasterAnalyser`, `getMasterAnalyserL/R`, `ensureAudioContext`, `ensureLpfWorklet` / `ensureHpfWorklet`. |
| **js/waveform-viz.js** | Module waveform canvas. `attachWaveformViz` (returns `destroy`, `reconnect`). |
| **js/filter-response-viz.js** | LPF/HPF frequency response canvas. `attachFilterResponseViz`. |
| **js/modules/base.js** | Module contract. `ModuleKind` (source / effect / modulator), `ModuleMeta`, factory `create(instanceId)` returns `{ element, getAudioInput?, getAudioOutput?, getModulationOutput?, getModulatableParams?, destroy? }` etc. |

---

## 3. Module kinds

- **source** — One per row, left column. Add new row.
- **effect** — In chain. Audio in/out. Same row only.
- **modulator** — In chain. Modulation output. Can cable to modulatable params on the same row.

---

## 4. Registered modules

| id | name | kind | Notes |
|----|------|------|-------|
| sample | Sample | source | Placeholder (no sound). |
| waveform | Osc | source | Sine / Square / Saw / Tri. Freq, Gain (cable). Up to 20 kHz. |
| fm | FM | source | Carrier, Mod, Index, Gain (cable). Up to 20 kHz. |
| wavetable | Wavetable | source | PeriodicWave. Wave A/B, Morph (cable). Freq, Gain (cable). Up to 20 kHz. |
| noise | Noise | source | White noise. Gain (cable). |
| pwm | PWM | source | PWM oscillator (AudioWorklet). Freq, Pulse %, Gain (cable). |
| pluck | Pluck | source | Karplus–Strong pluck (AudioWorklet). Freq, Decay, Gain (cable). |
| ff-osc | FF-Osc | source | (Oscillator variant.) |
| ff-wavetable | FF-Wavetable | source | (Wavetable variant.) |
| reverb | Reverb | effect | ConvolverNode. Wet (cable). |
| eq8 | EQ-8 | effect | 8-band EQ. Gain/Freq/Q per band (cable). |
| lpf | LPF | effect | 1st/2nd/4th-order CR low-pass. Freq, Order. AudioWorklet. |
| hpf | HPF | effect | 1st/2nd/4th-order CR high-pass. Freq, Order. AudioWorklet. |
| lpf-res | LPF Res | effect | Biquad low-pass with resonance. Freq, Res. |
| hpf-res | HPF Res | effect | Biquad high-pass with resonance. Freq, Res. |
| lfo | LFO | modulator | Wave, Rate, Depth. Output → params. |
| random-lfo | Random LFO | modulator | Random/S&H-style modulation. Output → params. |
| envelope | Envelope | modulator | ADSR, Trigger (button + input jack). Output → params. |
| ad-envelope | AD Env | modulator | Attack–Decay only. Output → params. |
| sequencer-8 | Seq-8 | modulator | 8 steps (1 row). Pitch / Gate out, Sync In. Step viz in top panel. |
| sequencer-16 | Seq-16 | modulator | 16 steps (2 rows × 8). Same. |
| sequencer-32 | Seq-32 | modulator | 32 steps (4 rows × 8). Same. |

---

## 5. Rack layout

- **Row**: Name (editable) | Source (one) | Chain (effects + modulators, reorder with slot arrows). Pan / Mute / Solo.
- **Reorder**: Left/right arrows on each slot (except source). `onChainChange` triggers rewire; `redrawCables()` for cables.
- **Scroll**: Horizontal scroll when chain overflows. Cable layer covers `synth-rack-area`.

---

## 6. Cables

- **Connect**: Drag from output jack → drop on input jack. One connection per input.
- **Disconnect**: Drag from connected **input** jack and drop elsewhere.
- **Master Sync Out → Sequencer Sync In**: Tick-based step advance; fromRow=-1, fromSlotId='master', fromOutputId='sync', toParamId='syncIn'.
- **Gate → Trigger**: Sequencer Gate to Envelope Trigger via `addGateListener` / `removeGateListener`.
- **Pan**: Modulator → row panner (toSlotId='pan', toParamId='pan').
- **Cable sag**: Header slider 0–100. `setCableDroop` / `getCableDroop`.

---

## 7. Master panel (right)

- **BPM**: 40–240. Bar + value; wheel on value to change. Source for Sync Out tick.
- **Sync Out**: Jack. Lamp flashes on beat. Cable to Sequencer Sync In for master-driven steps.
- **Vol**: 0–1. Bar + value; wheel to change.
- **Level**: L/R segment meter (dB).
- **Wave / Spectrum / Spectrogram / Goniometer**: Output visualisation.

---

## 8. Sequencer (Seq-8 / 16 / 64)

- **Data**: `stepPitch[]` (0–100), `stepGate[]`. UI reads/writes by index.
- **Top panel**: Step pitch bars, gates, current step.
- **BPM**: Internal when Sync not connected. With Sync In, steps follow master tick (phase-aligned).
- **Outputs**: Pitch (ConstantSource) → e.g. Osc Freq; Gate → e.g. Envelope Trigger.
- **Input**: Sync In (from Master Sync Out).

---

## 9. Save / load

- **Save**: JSON download from header. Rows (name, source typeId, chain typeIds), connections (fromRow, fromSlotIndex, fromOutputId, toRow, toSlotIndex, toParamId), Pan / Mute / Solo.
- **Open**: Clear rack and cables, then rebuild from JSON. Master Sync: fromRow=-1, fromSlotIndex=-1; `getSlotInstanceId(-1,-1)='master'` for restore.

---

## 10. File structure

```
web-synth/
├── index.html
├── styles.css
├── dev-server.sh
├── README.md
├── PROJECT.md
├── PROJECT-ja.md
└── js/
    ├── main.js
    ├── rack.js
    ├── cables.js
    ├── audio-core.js
    ├── waveform-viz.js
    ├── filter-response-viz.js
    ├── processors/          # AudioWorklet: 1/2/4-pole LPF, HPF, PWM, Pluck
    │   ├── one-pole-lpf-processor.js
    │   ├── two-pole-lpf-processor.js
    │   ├── four-pole-lpf-processor.js
    │   ├── one-pole-hpf-processor.js
    │   ├── two-pole-hpf-processor.js
    │   ├── four-pole-hpf-processor.js
    │   ├── pwm-oscillator-processor.js
    │   └── pluck-processor.js
    └── modules/
        ├── base.js
        ├── README.md
        ├── source/
        │   ├── sample-module.js
        │   ├── waveform-generator.js
        │   ├── fm-synth.js
        │   ├── wavetable.js
        │   ├── noise.js
        │   ├── pwm.js
        │   ├── pluck.js
        │   ├── ff-osc.js
        │   └── ff-wavetable.js
        ├── effect/
        │   ├── reverb.js
        │   ├── eq8.js
        │   ├── lpf.js
        │   ├── hpf.js
        │   ├── lpf-res.js
        │   └── hpf-res.js
        └── modulator/
            ├── lfo.js
            ├── random-lfo.js
            ├── envelope.js
            ├── ad-envelope.js
            └── sequencer.js
docs/
├── architecture.md
├── modules.md
├── cables.md
├── sequencer.md
├── development.md
└── future-ideas.md
```

---

## 11. Future ideas

- More effects (e.g. Stereo Delay, Chorus, Distortion).
- Sample module: actual playback.
- Sequencer: gate length, more step options.
- See **docs/future-ideas.md** for a longer list.
