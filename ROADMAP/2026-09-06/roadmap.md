# Spritemotion Roadmap Snapshot — 2026-09-06

## 1. What Has Been Done

- **Core Data Model**: Complete serde data structures for project metadata, sheet atlases, sprite frames, layers, tracks, keyframes, and easing curves.
- **2D Affine Math**: Full 2D affine transformation engine (`Affine2D`) supporting matrix multiplication, inversion, translation, rotation, scaling, and pivot offsetting.
- **Evaluation Engine**:
  - Continuous curve sampling with easing functions (`Linear`, `Step`, `EaseIn`, `EaseOut`, `EaseInOut`, `CubicBezier`).
  - Strict discrete step frame-swapping for sub-sprites.
  - Hierarchical parent-child transformation inheritance and world opacity composition.
  - Stable Z-index depth sorting and emission of `RenderItem` draw lists.
- **WASM Engine**: Exported `SpritemotionWasm` interface compatible with browser and Node environments.
- **Verification Suite**: 10 unit and integration tests passing; Node.js WASM runtime test verified.

---

## 2. What Is Planned (Next Steps)

- **UI Development in `jq79`**:
  - Application layout: Header transport bar, layer hierarchy sidebar, interactive canvas viewport, and bottom timeline.
  - Interactive Canvas viewport:
    - HTML5 Canvas renderer consuming `RenderItem` matrices.
    - Transform gizmo (translation handles, rotation ring, anchor/pivot point handle).
    - Pan and zoom controls.
  - Timeline Component:
    - Track bars synchronized with layers.
    - Keyframe marker placement, selection, and drag-and-drop movement.
    - Easing curve selector popup.
- **Atlas & Asset Management**:
  - Spritesheet image loading and slicing preview in the UI.
  - Drag-and-drop image slicing tool.

---

## 3. Pending & Future Backlog

- **Spritesheet Rasterizer**:
  - Core WASM / Rust offline rasterizer rendering all composite layers per frame into a single unified spritesheet PNG.
- **Exporters / Importers**:
  - TexturePacker and Aseprite JSON atlas import compatibility.
  - Standalone lightweight runtime player for Godot / Bevy / Web.
- **Audio & Event Tracks**:
  - Support for sound triggers and custom event keyframes along the animation timeline.
