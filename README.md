**[日本語版 README](README-ja.md)**

# Web Synth - Project Overview

Browser-based modular synth. Place sources, effects, and modulators; connect with cables; save/load projects.

---

## Screenshot

![Web Synth screenshot](screen-shot.png)

---

## Technologies
- HTML + CSS
- Vanilla JavaScript (ES modules)
- Web Audio API (`AudioContext`, `AudioNode`, `AnalyserNode`)
- AudioWorklet (custom DSP for LPF/HPF, PWM, Pluck)
- Canvas (waveform + filter response/spectrum visualization)
- SVG (cable rendering)
- JSON save/load (project state export/import)

## Overview

| Item | Description |
|------|-------------|
| Entry | `index.html` -> `js/main.js` (ES modules) |
| UI | Header (Save / Open, Cable sag, theme), picker (SOURCES / EFFECTS / MODULATORS), rack, master panel (BPM, Sync Out, Vol, Level, Wave / Spectrum / Spectrogram / Goniometer) |

---

## Layout

- **Rack**: Rows = Source (one per row) + Effect chain. Row has name, pan (knob), M/S, mute, solo. Rows scroll; header stays fixed.
- **Modulators panel**: Left of master. LFO, Envelope, Seq-8/16/32, etc. Cables connect from here to source/effect params and row pan.
- **Master**: BPM, Sync Out jack, Vol, L/R meter, output viz (Wave / Spectrum / Spectrogram / Goniometer).

---

## Module kinds

- **source** - One per row (Osc, FM, Wavetable, Noise, PWM, Pluck, FF-Osc, FF-Wavetable, Sample).
- **effect** - In chain: Reverb, Delay, EQ-8, LPF, HPF, LPF Res, HPF Res.
- **modulator** - In Modulators panel: LFO, Random LFO, Envelope, AD Env, Seq-8, Seq-16, Seq-32. Outputs (Pitch, Gate, modulation) connect to params via cables.

---

## Cables

- Drag from output jack to input jack to connect. Drag from input jack to disconnect.
- Master Sync Out to Sequencer Sync In for BPM-driven steps.
- Modulation cables: green bar = base value, purple bar = modulated range (when connected).

---

## Save / Load

- **Save**: Downloads JSON (rows, source/effect/modulator types and all parameters, connections, pan, mute, solo).
- **Open**: Rebuilds rack and modulators from JSON, restores parameters and connections.

---

## Main files

| File | Role |
|------|------|
| js/main.js | Entry (wires subsystems), rack/cable/audio routing, master viz, pickers, invokes save/load |
| js/module-registry.js | Imports all module factories; registerAllModules |
| js/connection-runtime.js | Cable-driven modulation, pan, gate/trigger, sync → AudioNode wiring |
| js/master-sync.js | Master BPM & sync tick interval, sequencer subscribers |
| js/project-io.js | Project JSON save/load, module state serialize/restore |
| js/rack.js | Rows, slots, addSourceRow / addEffectToRow / addModulator, param bars |
| js/cables.js | SVG cables, jacks, connect/disconnect, redraw on scroll |
| js/audio-core.js | AudioContext, master gain, analysers |
| js/module-preview.js | Picker hover preview (clone module, scale to fit) |
| js/modules/ | source / effect / modulator modules (base.js contract) |

---

## Docs (reference only)

- docs/architecture.md - Architecture (main, module-registry, connection-runtime, master-sync, project-io), rack, cables, save/load, dev notes.
- docs/modules.md - Module contract and list.
- docs/processors.md - AudioWorklet processors (LPF, HPF, PWM, Pluck).
