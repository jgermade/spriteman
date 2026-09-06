//! Data model definitions for Spritemotion projects, layers, tracks, and keyframes.

use crate::math::Vec2;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Easing curve applied between keyframes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Easing {
    Linear,
    Step,
    EaseIn,
    EaseOut,
    EaseInOut,
    CubicBezier(f32, f32, f32, f32),
}

impl Default for Easing {
    fn default() -> Self {
        Self::Linear
    }
}

impl Easing {
    /// Evaluates the normalized progress `t` (0.0 ..= 1.0) through the curve.
    pub fn evaluate(&self, t: f32) -> f32 {
        let t = t.clamp(0.0, 1.0);
        match self {
            Self::Linear => t,
            Self::Step => {
                if t >= 1.0 {
                    1.0
                } else {
                    0.0
                }
            }
            Self::EaseIn => t * t,
            Self::EaseOut => t * (2.0 - t),
            Self::EaseInOut => {
                if t < 0.5 {
                    2.0 * t * t
                } else {
                    -1.0 + (4.0 - 2.0 * t) * t
                }
            }
            Self::CubicBezier(p1x, p1y, p2x, p2y) => {
                // Approximate 1D cubic bezier parameterization for easing
                sample_cubic_bezier(t, *p1x, *p1y, *p2x, *p2y)
            }
        }
    }
}

/// Simple numerical approximation of cubic bezier easing curve.
fn sample_cubic_bezier(target_x: f32, p1x: f32, p1y: f32, p2x: f32, p2y: f32) -> f32 {
    if target_x <= 0.0 {
        return 0.0;
    }
    if target_x >= 1.0 {
        return 1.0;
    }

    // Binary search / Newton iteration for parameter u where x(u) ≈ target_x
    let mut low = 0.0;
    let mut high = 1.0;
    let mut u = target_x;

    for _ in 0..10 {
        let current_x = 3.0 * (1.0 - u) * (1.0 - u) * u * p1x
            + 3.0 * (1.0 - u) * u * u * p2x
            + u * u * u;
        if (current_x - target_x).abs() < 1e-4 {
            break;
        }
        if current_x < target_x {
            low = u;
        } else {
            high = u;
        }
        u = (low + high) * 0.5;
    }

    // Calculate y(u)
    3.0 * (1.0 - u) * (1.0 - u) * u * p1y
        + 3.0 * (1.0 - u) * u * u * p2y
        + u * u * u
}

/// Single keyframe on a property track.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Keyframe<T> {
    pub frame: f32,
    pub value: T,
    #[serde(default)]
    pub easing: Easing,
}

impl<T> Keyframe<T> {
    pub fn new(frame: f32, value: T, easing: Easing) -> Self {
        Self {
            frame,
            value,
            easing,
        }
    }
}

/// Transform parameters of a layer in local space.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Transform2D {
    #[serde(default)]
    pub x: f32,
    #[serde(default)]
    pub y: f32,
    /// Rotation in degrees.
    #[serde(default)]
    pub rotation: f32,
    #[serde(default = "default_one")]
    pub scale_x: f32,
    #[serde(default = "default_one")]
    pub scale_y: f32,
    #[serde(default = "default_one")]
    pub opacity: f32,
    /// Normalized pivot inside the sprite boundary, e.g. [0.5, 0.5] for center.
    #[serde(default = "default_pivot")]
    pub pivot: Vec2,
}

fn default_one() -> f32 {
    1.0
}

fn default_pivot() -> Vec2 {
    Vec2::new(0.5, 0.5)
}

impl Default for Transform2D {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            opacity: 1.0,
            pivot: default_pivot(),
        }
    }
}

/// Sub-rectangle inside an atlas sheet for a sub-sprite.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SpriteFrame {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
    #[serde(default = "default_pivot")]
    pub pivot: Vec2,
}

/// Atlas sheet containing sub-sprite definitions.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SheetAtlas {
    pub id: String,
    pub image: String,
    #[serde(default)]
    pub frames: HashMap<String, SpriteFrame>,
}

/// Animation property tracks for a single layer.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct LayerTracks {
    #[serde(default)]
    pub position: Vec<Keyframe<[f32; 2]>>,
    #[serde(default)]
    pub rotation: Vec<Keyframe<f32>>,
    #[serde(default)]
    pub scale: Vec<Keyframe<[f32; 2]>>,
    #[serde(default)]
    pub opacity: Vec<Keyframe<f32>>,
    #[serde(default)]
    pub sprite_frame: Vec<Keyframe<String>>,
}

/// Layer representation in the project.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Layer {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub z_index: i32,
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default)]
    pub sheet_id: Option<String>,
    #[serde(default)]
    pub default_frame: Option<String>,
    #[serde(default)]
    pub default_transform: Transform2D,
    #[serde(default)]
    pub tracks: LayerTracks,
}

fn default_true() -> bool {
    true
}

/// Metadata describing overall animation clip attributes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProjectMeta {
    pub name: String,
    #[serde(default = "default_fps")]
    pub fps: u32,
    #[serde(default = "default_total_frames")]
    pub total_frames: u32,
    pub canvas_width: u32,
    pub canvas_height: u32,
}

fn default_fps() -> u32 {
    24
}

fn default_total_frames() -> u32 {
    24
}

/// Complete Spritemotion project definition.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Project {
    #[serde(default = "default_version")]
    pub version: String,
    pub meta: ProjectMeta,
    #[serde(default)]
    pub sheets: Vec<SheetAtlas>,
    #[serde(default)]
    pub layers: Vec<Layer>,
}

fn default_version() -> String {
    "1.0.0".to_string()
}

impl Project {
    pub fn from_json(json_str: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json_str)
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    pub fn find_sheet(&self, sheet_id: &str) -> Option<&SheetAtlas> {
        self.sheets.iter().find(|s| s.id == sheet_id)
    }

    pub fn find_frame<'a>(&'a self, sheet_id: &str, frame_id: &str) -> Option<&'a SpriteFrame> {
        self.find_sheet(sheet_id)?.frames.get(frame_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_project_serde_roundtrip() {
        let mut frames = HashMap::new();
        frames.insert(
            "idle_0".to_string(),
            SpriteFrame {
                x: 0,
                y: 0,
                w: 32,
                h: 32,
                pivot: Vec2::new(0.5, 1.0),
            },
        );

        let project = Project {
            version: "1.0.0".to_string(),
            meta: ProjectMeta {
                name: "hero_idle".to_string(),
                fps: 24,
                total_frames: 12,
                canvas_width: 64,
                canvas_height: 64,
            },
            sheets: vec![SheetAtlas {
                id: "hero".to_string(),
                image: "hero.png".to_string(),
                frames,
            }],
            layers: vec![Layer {
                id: "body".to_string(),
                name: "Body".to_string(),
                parent_id: None,
                z_index: 0,
                visible: true,
                sheet_id: Some("hero".to_string()),
                default_frame: Some("idle_0".to_string()),
                default_transform: Transform2D::default(),
                tracks: LayerTracks {
                    position: vec![
                        Keyframe::new(0.0, [32.0, 32.0], Easing::Linear),
                        Keyframe::new(12.0, [32.0, 30.0], Easing::EaseInOut),
                    ],
                    ..Default::default()
                },
            }],
        };

        let json = project.to_json().expect("Serialization should succeed");
        let deserialized: Project = Project::from_json(&json).expect("Deserialization should succeed");
        assert_eq!(project, deserialized);
    }
}
