# Spritemotion Roadmap Snapshot — 2026-09-07 (document format v2)

Follows `ROADMAP/2026-09-07-remediation/`, which listed "document format v2" as needing a
decision first. The decision was taken (one owner for the artwork plus a run-length
codec) and the work is done.

## 1. Completed Work

- Everything in the previous snapshot: the five performance phases, localization in
  Spanish and English, and the typed-array WASM boundary.
- **Document format v2** (this snapshot):
  - `animations[].cels[layerId][frameIndex]` is the single owner of artwork; `layers[]` is
    the skeleton, shared across clips; the flattened composite is derived on load.
  - Cels are stored as a palette plus run-length pairs — 153 kB of a real project becomes
    10 kB, and the save path went from 121 ms of serialization to 2–3 ms, with no long
    task at all on saves after the first.
  - v1 documents are migrated on open and rewritten as v2 on the next save.
  - Fixed: a second animation clip used to inherit the first clip's pixels, because layer
    artwork was shared across clips.
  - Fixed: interpolated in-between frames were written only into the composite and lost on
    reload; they now belong to the layer that owns the group.
  - The format is specified in `docs/format.md`, including a four-line decoder.

## 2. Planned Work (next iterations)

- **Timeline editing**: rotation and scale gizmos on the canvas, easing-curve editing per
  track. The model, the evaluator and now the format all support them.
- **Atlas pipeline**: spritesheet import (TexturePacker-compatible) and the rasterized
  export from `raster.rs`. With cels as a first-class concept, an atlas is a natural
  second source for a cel.
- **Component-level tests**: the `.html` setup scripts are still neither type-checked nor
  unit tested; a mount-level harness would cover the editor wiring the way the services
  are covered now.
- **Per-clip incremental persistence**: saving currently rewrites the whole document.
  With cels it would be straightforward to store one record per clip, if project sizes
  ever make that worthwhile.

## 3. Pending & Backlog

- Multi-document memory strategy once several project tabs are open at once.
- Storage eviction/warning UX when a browser reclaims IndexedDB space.
- A cel could reference an atlas rectangle instead of holding pixels; that is the bridge
  between the pixel-art editor and the spritesheet workflow described in `ROADMAP.md`.
