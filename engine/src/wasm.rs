//! WebAssembly bindings exposing the Spritemotion engine to JavaScript/TypeScript.
//!
//! Frame evaluation crosses the boundary as plain `f32` numbers in a reusable buffer that
//! JavaScript reads as a `Float32Array` view over WASM memory. The previous binding
//! serialized every frame to JSON in Rust and parsed it again in JS, which put an
//! allocation and a parse on the playback path for data that is a handful of floats.
//!
//! Layout of the buffer, one record of `item_stride()` values per visible layer, ordered
//! by ascending `z_index`:
//!
//! ```text
//! [ layer_index, a, b, c, d, tx, ty, opacity, pivot_world_x, pivot_world_y ]
//! ```
//!
//! `layer_index` indexes the table returned by `layers_json()`, which only changes when a
//! project is loaded, so names, ids and z-indices never travel per frame.

use crate::eval::{fill_frame_buffer, AnimationEngine, FRAME_ITEM_STRIDE};
use crate::model::Project;
use serde::Serialize;
use wasm_bindgen::prelude::*;

/// One entry of the layer table handed to JavaScript when a project is loaded.
#[derive(Serialize)]
struct LayerInfo<'a> {
    id: &'a str,
    name: &'a str,
    z_index: i32,
}

#[wasm_bindgen]
pub struct SpritemotionWasm {
    engine: AnimationEngine,
    /// Reused between frames so steady-state playback allocates nothing.
    frame_buffer: Vec<f32>,
}

#[wasm_bindgen]
impl SpritemotionWasm {
    /// Creates a new Spritemotion engine from a JSON string.
    #[wasm_bindgen(constructor)]
    pub fn new(project_json: &str) -> Result<SpritemotionWasm, JsValue> {
        let project = Project::from_json(project_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse project JSON: {}", e)))?;
        Ok(Self {
            engine: AnimationEngine::new(project),
            frame_buffer: Vec::new(),
        })
    }

    /// Reloads or updates the project from a JSON string.
    pub fn load_project(&mut self, project_json: &str) -> Result<(), JsValue> {
        let project = Project::from_json(project_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse project JSON: {}", e)))?;
        self.engine = AnimationEngine::new(project);
        self.frame_buffer.clear();
        Ok(())
    }

    /// Values per render item in the frame buffer.
    pub fn item_stride(&self) -> u32 {
        FRAME_ITEM_STRIDE as u32
    }

    /// The layer table render items index into: `[{ id, name, z_index }, …]` in project
    /// order. Only changes when a project is loaded.
    pub fn layers_json(&self) -> Result<String, JsValue> {
        let layers: Vec<LayerInfo> = self
            .engine
            .project()
            .layers
            .iter()
            .map(|layer| LayerInfo {
                id: &layer.id,
                name: &layer.name,
                z_index: layer.z_index,
            })
            .collect();
        serde_json::to_string(&layers)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Evaluates the animation at frame `t` into the internal buffer and returns the
    /// number of render items written. Read the values with `frame_buffer_ptr`.
    pub fn evaluate_frame(&mut self, t: f32) -> u32 {
        let resolved = self.engine.evaluate_frame(t);
        let layer_ids: Vec<String> = self
            .engine
            .project()
            .layers
            .iter()
            .map(|layer| layer.id.clone())
            .collect();
        fill_frame_buffer(&resolved, &layer_ids, &mut self.frame_buffer) as u32
    }

    /// Pointer to the frame buffer filled by the last `evaluate_frame` call. Read it
    /// immediately: any later call into the engine may move or overwrite the buffer.
    pub fn frame_buffer_ptr(&self) -> *const f32 {
        self.frame_buffer.as_ptr()
    }

    /// Returns the current project state as pretty JSON.
    pub fn get_project_json(&self) -> Result<String, JsValue> {
        self.engine
            .project()
            .to_json()
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Returns total frames in the animation clip.
    pub fn total_frames(&self) -> u32 {
        self.engine.project().meta.total_frames
    }

    /// Returns playback frames per second.
    pub fn fps(&self) -> u32 {
        self.engine.project().meta.fps
    }

    /// Returns canvas width in pixels.
    pub fn canvas_width(&self) -> u32 {
        self.engine.project().meta.canvas_width
    }

    /// Returns canvas height in pixels.
    pub fn canvas_height(&self) -> u32 {
        self.engine.project().meta.canvas_height
    }
}
