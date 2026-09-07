# Spritemotion Roadmap Snapshot — 2026-09-07

Focus of this snapshot: the outcome of the UI performance & project audit
(`RECORD/2026-09-07.ui-performance-and-project-audit.completed.md`) and the
remediation plan it produces.

## 1. Completed Work

- **Rust core**: data model, `Affine2D` math, hierarchical evaluation with easing,
  discrete sprite-frame swaps, Z-ordered `RenderItem` emission. 10 tests passing.
- **WASM bindings**: `SpritemotionWasm` (`new`, `load_project`, `evaluate_frame_json`,
  `total_frames`, `fps`, canvas size).
- **Frontend (jq79)**: editor shell with project tabs and URL-hash routing, welcome
  screen, project modal, canvas stage with pan/zoom/pinch, pixel painting with dual
  colour palette, layer hierarchy with drag & drop, frame strip with groups,
  interpolation and onion skin, inspector, animation settings, undo/redo.
- **Tooling**: Vite dev/build pipeline, `Makefile` targets, local storage of projects,
  PWA scaffolding (manifest, service worker source, install prompt).
- **Audit (this snapshot)**: instrumented profiling of the running editor, hot-path
  micro-benchmarks, production-build inspection, repository hygiene review.

## 2. Audit Outcome — What Is Actually Slow

Measured on a 24-frame x 3-layer x 64x64 document (~2 226 composite pixels/frame):

- One painted pixel triggers **6 full canvas repaints** (26 280 `fillRect` calls);
  stepping one frame triggers **10** (43 790 calls); plain hovering repaints the whole
  sprite on every mouse move.
- One brush stroke blocks the main thread for **~0.5 s** and one layer drag for
  **~0.9 s**, dominated by `JSON.stringify` of the whole document (43 ms per call,
  several per interaction) plus a synchronous `localStorage` write.
- Playback saturates the main thread; a competing rAF ticker is starved to ~1 tick/s.
- The WASM engine is handed the full pixel payload on every edit even though the Rust
  `Project`/`Layer` structs do not declare `frame_pixels`.
- `localStorage` hits `QuotaExceededError` at ~4–5 MB and the error is not caught, so
  saves can fail silently.

## 3. Planned Work (remediation, in priority order)

### Phase 1 — Render pipeline (highest impact)
- Coalesce every `CanvasService.notify()` into one `requestAnimationFrame` redraw with
  a dirty flag; add equality guards to the setters so no-op updates do not repaint.
- Replace per-pixel `fillRect` with an offscreen `ImageData` / `ImageBitmap` blit at
  sprite resolution, rebuilt only when pixels actually change.
- Stack canvases: static (artboard, grid, checkerboard) vs dynamic (cursor, gizmos,
  selection outline); draw the grid once per frame instead of twice; keep `shadowBlur`
  out of the hot path.
- Scale the backing store by `devicePixelRatio` so pixel art stays crisp on HiDPI.

### Phase 2 — Document model & persistence
- Drop pretty-printing from `updateJson()`; serialize lazily (only when saving or
  exporting), not on every mutation.
- Replace full-JSON undo snapshots with a patch/command stack.
- Debounce autosave onto idle time; show a real "unsaved / saving / saved" state.
- Feed WASM a skeleton document (meta + layers + tracks, no `frame_pixels`).
- Move storage to IndexedDB, handle quota explicitly, and add JSON file export/import
  as the durable escape hatch.

### Phase 3 — Playback
- One evaluation per tick, cached resolved frames, no onion-skin evaluation when the
  option is off.
- Replace the JSON round trip across the WASM boundary with a structured or
  typed-array transfer.
- Drive playback from a frame-accurate scheduler decoupled from the editor's
  notification storm.

### Phase 4 — Component update discipline
- Batch `component.data` writes into a single reactive update per notification; keep
  array/object identities stable between renders.
- Key frame thumbnails by a content hash and generate them off the critical path
  (idle callback / worker), never `toDataURL()` inside a render pass.
- CSS: remove `transition: all`, the infinite `box-shadow` glow, and the
  `backdrop-filter` that sits over the canvas.

### Phase 5 — Hygiene & correctness
- Add `tsconfig.json` and a `typecheck` script; fix the invalid `src/env.d.ts`.
- Add frontend smoke tests (mount, paint, undo, save) alongside `cargo test`.
- Fix the PWA build: emit `sw.js` and keep the manifest unhashed at the site root so
  `start_url`, `scope` and icons resolve; self-host or precache the fonts.
- Delete dead code (`PlayControls.html`, unused canvas helpers, duplicated
  `getLinePixels`); reconcile the wheel-zoom HUD hint with the real behaviour.
- Complete the English-only pass over comments and UI strings per AGENTS.md §1.

## 4. Pending & Backlog

- Spritesheet/atlas import (TexturePacker-compatible) and rasterized spritesheet export
  from the Rust `raster.rs` module described in `ROADMAP.md` — not started.
- Rotation/scale gizmos and easing-curve editing in the timeline (the model supports
  them; the UI does not expose them yet).
- Multi-document memory strategy once several tabs can be open at once.
- Decision needed: is `frame_pixels` a first-class part of the exported format, or does
  the exported document reference a rasterized atlas instead? This drives Phase 2.
- Decision needed: single UI language (Spanish or English) for shipped strings.
