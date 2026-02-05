# Web Synth — Project Status

Ableton Live–style modular synth in the browser: rows of **Source | Effects | Modulators**, drag-to-reorder, cable patching (LFO/Envelope → params), save/load, and master output.

---

## Overview

- **Entry**: `index.html` → `js/main.js` (ES modules).
- **Template base**: `tpl/tool-box-tpl.html` (tool-box).
- **Dev server**: `dev-server.sh` (project root).
- **UI language**: English (labels, buttons, module names, params, aria-labels).

---

## Architecture

| File | Role |
|------|------|
| `js/main.js` | Entry point. Registers modules, wires rack/cables/audio, picker UI, save/load, theme, master volume/meter/waveform. |
| `js/rack.js` | Row-based rack: `addSourceRow`, `addEffectToRow`, `addModulatorToRow`, drag handle reorder (`moveSlotInChain` → `redrawCables()`), `removeModule`, `getRows`, etc. |
| `js/cables.js` | Cable UI (SVG), output/input jacks, drag-to-connect, `initCables`, `redrawCables`, `getConnections`, `addConnectionFromLoad`, `removeConnectionsBySlot`. |
| `js/audio-core.js` | AudioContext, master gain, analyser; `resumeContext`, `getMasterInput`, `getMasterAnalyser`, `ensureAudioContext`. |
| `js/waveform-viz.js` | Small waveform canvas per module + master output; `attachWaveformViz`. |
| `js/modules/base.js` | Module interface: `ModuleKind` ('source' \| 'effect' \| 'modulator'), `ModuleMeta`, factory `create(instanceId)` returning `{ element, getAudioInput?, getAudioOutput?, getModulationOutput?, getModulatableParams?, destroy? }`. |

---

## Module Types (kind)

- **source** — One per row, left column; adds a new row. Audio out only.
- **effect** — In chain (source → effect → …); has audio in/out. Same row only.
- **modulator** — In chain; has modulation out. Can be cabled to **modulatable params** on sources/effects in the same row (LFO/Envelope → param).

Kind is used for color and placement; no separate "eq" type yet (EQ would be `effect` or a new kind if desired).

---

## Registered Modules

| id | name | kind | Notes |
|----|------|------|--------|
| sample | Sample | source | Placeholder (no sound). |
| waveform | Osc | source | Sine / square / sawtooth / triangle; Freq, Gain (cableable). |
| fm | FM | source | Carrier, Mod, Index, Gain (cableable). |
| wavetable | Wavetable | source | PeriodicWave; shape slider; Freq, Gain (cableable). |
| reverb | Reverb | effect | ConvolverNode; Dry/Wet (cableable). |
| lfo | LFO | modulator | Wave type, Rate, Depth; output jack → params. |
| envelope | Envelope | modulator | ADSR, trigger; output jack → params. |

---

## Rack Layout

- **Rows**: Each row = **name** (editable) | **source** (one) | **chain** (effects + modulators, order by drag).
- **Drag reorder**: Only the **handle** (⋮⋮) on top of each module is draggable; dropping reorders within the chain and calls `redrawCables()` (with double `requestAnimationFrame` for layout).
- **Signal flow visuals**: Background gradients and arrows (→, +) for source → chain → output; source tint (green), chain tint (blue/purple).
- **Horizontal scroll**: When the chain overflows, the rack area scrolls horizontally.

---

## Cables

- **Output jacks**: On LFO and Envelope modules (drag from here).
- **Input jacks**: Next to each **modulatable** param on sources and effects (Freq, Gain, Wet, etc.).
- **Connection**: Drag from output jack → drop on input jack; one cable per (toRow, toSlotId, toParamId). Cables drawn as SVG; layer in front with `pointer-events: none` so drops hit jacks.
- **Audio**: On connect, LFO/Envelope output is connected to the target `AudioParam` (with optional `modulationScale`, e.g. for frequency). On disconnect or module remove, connections and scale nodes are cleaned up.
- **Redraw**: Cables redraw on connect/disconnect, load, and after reorder (in `moveSlotInChain`).

---

## Master Panel (right, fixed height with rack)

- **Vol**: Master volume slider (0–1), value display.
- **Level**: Digital-style meter (segments + dB value), tuned for normal levels.
- **Wave**: Output waveform canvas (same style as module mini waveform).

---

## Save / Load

- **Save**: Button in header; downloads current state as JSON (rows: name, source typeId, chain typeIds; connections: fromRow, fromSlotIndex, toRow, toSlotIndex, toParamId).
- **Open**: File input in header; clears rack and cables, then recreates rows, chain, and cables from JSON. Row selection for Effects/Modulators is repopulated; last selected row is restored when valid.

---

## UI Details

- **Module picker**: Three groups (Sources; Effects + row select; Modulators + row select), each on its own line; row selects are vertical (label + dropdown). Once a row is chosen for Effects/Modulators, it stays selected for next add.
- **Theme**: Dark/Light toggle in header; persisted in `localStorage`.
- **Module waveform**: Small canvas per module (#628878); no time-based fill (static waveform display).

---

## File Structure

```
web-synth/
├── index.html
├── styles.css
├── memo.md
├── PROJECT.md          ← this file
└── js/
    ├── main.js
    ├── rack.js
    ├── cables.js
    ├── audio-core.js
    ├── waveform-viz.js
    └── modules/
        ├── base.js
        ├── sample-module.js
        ├── waveform-generator.js
        ├── fm-synth.js
        ├── wavetable.js
        ├── reverb.js
        ├── lfo.js
        └── envelope.js
```

---

## Possible Next Steps

- **EQ**: Add as `effect` (e.g. `eq.js` with BiquadFilterNode bands) or introduce a new kind (e.g. `eq`) and picker section if desired.
- **More effects**: Chorus, compressor, etc. (see `memo.md`).
- **Sample module**: Replace placeholder with real sample playback.
