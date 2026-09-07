# Spritemotion Roadmap Snapshot — 2026-09-07 (post-remediation)

Supersedes the plan in `ROADMAP/2026-09-07/`, which scheduled the five remediation
phases. This snapshot records what shipped and what the next iterations are.

## 1. Completed Work

- **Rust core & WASM engine** — unchanged, 10 tests passing.
- **Editor shell** — tabs, welcome screen, canvas stage, painting, layer hierarchy, frame
  strip with groups and interpolation, inspector, animation settings, undo/redo.
- **Performance remediation, phases 1-5** (this snapshot):
  - Render pipeline: one repaint per animation frame, sprite blitted from an offscreen
    buffer, HiDPI backing store, layered overlay math, no layout reads per pointer move.
  - Document & persistence: lazy compact serialization, patch-based undo for pixel edits,
    skeleton document for the engine, debounced idle autosave, IndexedDB storage with
    quota handling, JSON export.
  - Playback: one notification and one evaluation per tick, cached onion skin, engine
    reload skipped when the skeleton is unchanged.
  - Components: change-guarded panel updates, revision-keyed thumbnails, CSS cleanup.
  - Hygiene: `tsconfig.json` + typecheck, 27 frontend tests, PWA build fixed, dead code
    removed, English-only pass.
- Measured outcome on a 24-frame x 3-layer x 64x64 document: painting one pixel went from
  6 repaints and 26 280 `fillRect` calls to 3 and 2 157; playback went from continuous
  0.5–1.9 s long tasks to none, with an independent rAF ticker recovering from ~1 tick/s
  to 61.

## 2. Planned Work (next iterations)

- **Timeline editing**: rotation and scale gizmos on the canvas, and easing-curve editing
  per track. The model and the Rust evaluator already support both.
- **Atlas pipeline**: spritesheet import (TexturePacker-compatible) and the rasterized
  spritesheet export described in `ROADMAP.md` (`raster.rs`).
- **Document format v2**: stop serializing pixel data three times (per layer, as the
  composite, and inside the active animation clip). This is most of the remaining save
  cost and needs a format decision first — see below.
- **Engine boundary**: replace the per-tick `evaluate_frame_json` round trip with a
  structured or typed-array transfer once it shows up in a profile again.
- **Component-level tests**: the `.html` setup scripts are not type-checked or unit
  tested; a mount-level harness would cover the editor wiring the way the services are
  covered now.

## 3. Pending & Backlog

- Multi-document memory strategy once several project tabs are open at once.
- Storage eviction/warning UX when a browser reclaims IndexedDB space.
- Decision: does the exported document keep `frame_pixels`, or reference a rasterized
  atlas instead? This gates the format-v2 work.
- Decision: shipped UI language. Strings are English today, matching AGENTS.md §1.
