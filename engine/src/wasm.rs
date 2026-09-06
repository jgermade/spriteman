//! WebAssembly bindings exposing the Spritemotion engine to JavaScript/TypeScript.

use crate::eval::AnimationEngine;
use crate::model::Project;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct SpritemotionWasm {
    engine: AnimationEngine,
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
        })
    }

    /// Reloads or updates the project from a JSON string.
    pub fn load_project(&mut self, project_json: &str) -> Result<(), JsValue> {
        let project = Project::from_json(project_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse project JSON: {}", e)))?;
        self.engine = AnimationEngine::new(project);
        Ok(())
    }

    /// Evaluates the animation at frame `t` and returns the resolved render items as a JSON string.
    pub fn evaluate_frame_json(&self, t: f32) -> Result<String, JsValue> {
        let resolved = self.engine.evaluate_frame(t);
        serde_json::to_string(&resolved)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
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
