//! Spritemotion: 2D animated sprite editor core.
//!
//! Features:
//! - Hierarchical parent-child layer transforms with pivot anchoring.
//! - Continuous keyframe interpolation for transforms (Linear, Easing, Bezier).
//! - Discrete step frame-swapping for sub-sprite changes.
//! - WebAssembly integration for reactive Web UI rendering.

pub mod eval;
pub mod math;
pub mod model;

#[cfg(feature = "wasm")]
pub mod wasm;

pub use eval::{AnimationEngine, RenderItem, ResolvedFrame};
pub use math::{Affine2D, Vec2};
pub use model::{Easing, Keyframe, Layer, Project, SheetAtlas, SpriteFrame, Transform2D};

#[cfg(feature = "wasm")]
pub use wasm::SpritemotionWasm;
