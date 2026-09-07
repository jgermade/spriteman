//! Evaluation engine for animating Spritemotion projects at arbitrary frame times.

use crate::math::{Affine2D, Vec2};
use crate::model::{Keyframe, Layer, Project, SpriteFrame};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Render item representing an evaluated sub-sprite ready for rendering on Canvas or rasterizer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RenderItem {
    pub layer_id: String,
    pub layer_name: String,
    pub sheet_id: Option<String>,
    pub frame_id: Option<String>,
    pub source_rect: Option<[u32; 4]>, // [x, y, w, h]
    pub matrix: [f32; 6],             // [a, b, c, d, tx, ty]
    pub opacity: f32,
    pub z_index: i32,
    pub pivot_world: Vec2,
}

/// Evaluated state of the entire scene at a given frame.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResolvedFrame {
    pub frame: f32,
    pub items: Vec<RenderItem>,
}

/// Number of `f32` values written per render item by [`fill_frame_buffer`].
pub const FRAME_ITEM_STRIDE: usize = 10;

/// Packs a resolved frame into a flat `f32` buffer for consumers that read numbers
/// directly instead of deserializing a document — the WASM boundary, primarily.
///
/// One record per item, ordered as the items are (ascending `z_index`):
/// `[layer_index, a, b, c, d, tx, ty, opacity, pivot_world_x, pivot_world_y]`.
///
/// `layer_index` refers to `layer_ids`; an item whose layer is not in that list is
/// written with `-1.0` so the consumer can skip it rather than mis-index.
pub fn fill_frame_buffer(resolved: &ResolvedFrame, layer_ids: &[String], out: &mut Vec<f32>) -> usize {
    let index_of: HashMap<&str, usize> = layer_ids
        .iter()
        .enumerate()
        .map(|(i, id)| (id.as_str(), i))
        .collect();

    out.clear();
    out.reserve(resolved.items.len() * FRAME_ITEM_STRIDE);
    for item in &resolved.items {
        let index = index_of
            .get(item.layer_id.as_str())
            .map(|i| *i as f32)
            .unwrap_or(-1.0);
        out.push(index);
        out.extend_from_slice(&item.matrix);
        out.push(item.opacity);
        out.push(item.pivot_world.x);
        out.push(item.pivot_world.y);
    }
    resolved.items.len()
}

/// Evaluates a 1D scalar track (e.g. rotation, opacity) at frame `t`.
pub fn sample_scalar_track(tracks: &[Keyframe<f32>], t: f32, default_val: f32) -> f32 {
    if tracks.is_empty() {
        return default_val;
    }
    if tracks.len() == 1 || t <= tracks[0].frame {
        return tracks[0].value;
    }
    if t >= tracks[tracks.len() - 1].frame {
        return tracks[tracks.len() - 1].value;
    }

    for window in tracks.windows(2) {
        let k0 = &window[0];
        let k1 = &window[1];
        if t >= k0.frame && t <= k1.frame {
            let span = k1.frame - k0.frame;
            let factor = if span <= 0.0 { 0.0 } else { (t - k0.frame) / span };
            let eased = k0.easing.evaluate(factor);
            return k0.value + (k1.value - k0.value) * eased;
        }
    }

    default_val
}

/// Evaluates a 2D vector track (e.g. position, scale) at frame `t`.
pub fn sample_vec2_track(tracks: &[Keyframe<[f32; 2]>], t: f32, default_val: [f32; 2]) -> [f32; 2] {
    if tracks.is_empty() {
        return default_val;
    }
    if tracks.len() == 1 || t <= tracks[0].frame {
        return tracks[0].value;
    }
    if t >= tracks[tracks.len() - 1].frame {
        return tracks[tracks.len() - 1].value;
    }

    for window in tracks.windows(2) {
        let k0 = &window[0];
        let k1 = &window[1];
        if t >= k0.frame && t <= k1.frame {
            let span = k1.frame - k0.frame;
            let factor = if span <= 0.0 { 0.0 } else { (t - k0.frame) / span };
            let eased = k0.easing.evaluate(factor);
            return [
                k0.value[0] + (k1.value[0] - k0.value[0]) * eased,
                k0.value[1] + (k1.value[1] - k0.value[1]) * eased,
            ];
        }
    }

    default_val
}

/// Evaluates a discrete/step track (specifically for sprite_frame swaps).
/// Per ROADMAP: Image frame-swap is strictly discrete (step) without blending.
pub fn sample_discrete_track(tracks: &[Keyframe<String>], t: f32, default_val: Option<&str>) -> Option<String> {
    if tracks.is_empty() {
        return default_val.map(|s| s.to_string());
    }

    // Find the latest keyframe where keyframe.frame <= t
    let mut chosen = None;
    for k in tracks {
        if k.frame <= t {
            chosen = Some(k.value.clone());
        } else {
            break;
        }
    }

    chosen.or_else(|| tracks.first().map(|k| k.value.clone()))
}

/// Core evaluation engine that holds loaded project state and evaluates frames.
pub struct AnimationEngine {
    project: Project,
}

impl AnimationEngine {
    pub fn new(project: Project) -> Self {
        Self { project }
    }

    pub fn project(&self) -> &Project {
        &self.project
    }

    pub fn project_mut(&mut self) -> &mut Project {
        &mut self.project
    }

    /// Evaluates the complete project state at frame `t`.
    pub fn evaluate_frame(&self, t: f32) -> ResolvedFrame {
        // First, build a map of layer IDs to indices for quick lookup
        let layer_map: HashMap<&str, usize> = self
            .project
            .layers
            .iter()
            .enumerate()
            .map(|(idx, l)| (l.id.as_str(), idx))
            .collect();

        // Evaluate local transforms and properties for each layer
        struct LocalEval<'a> {
            layer: &'a Layer,
            local_transform: Affine2D,
            local_opacity: f32,
            frame_id: Option<String>,
            sprite_frame: Option<&'a SpriteFrame>,
            pivot_offset: Vec2,
        }

        let mut local_evals: Vec<LocalEval> = Vec::with_capacity(self.project.layers.len());

        for layer in &self.project.layers {
            let pos = sample_vec2_track(
                &layer.tracks.position,
                t,
                [layer.default_transform.x, layer.default_transform.y],
            );
            let rot_deg = sample_scalar_track(
                &layer.tracks.rotation,
                t,
                layer.default_transform.rotation,
            );
            let scale = sample_vec2_track(
                &layer.tracks.scale,
                t,
                [layer.default_transform.scale_x, layer.default_transform.scale_y],
            );
            let opacity = sample_scalar_track(
                &layer.tracks.opacity,
                t,
                layer.default_transform.opacity,
            );
            let frame_id = sample_discrete_track(
                &layer.tracks.sprite_frame,
                t,
                layer.default_frame.as_deref(),
            );

            // Lookup sprite frame bounds and pivot in sheet
            let sprite_frame = match (&layer.sheet_id, &frame_id) {
                (Some(s_id), Some(f_id)) => self.project.find_frame(s_id, f_id),
                _ => None,
            };

            let pivot_norm = sprite_frame
                .map(|f| f.pivot)
                .unwrap_or(layer.default_transform.pivot);

            let (w, h) = sprite_frame
                .map(|f| (f.w as f32, f.h as f32))
                .unwrap_or((0.0, 0.0));

            let pivot_offset = Vec2::new(w * pivot_norm.x, h * pivot_norm.y);

            let rot_rad = rot_deg.to_radians();
            let local_transform = Affine2D::from_trs_pivot(
                Vec2::new(pos[0], pos[1]),
                rot_rad,
                Vec2::new(scale[0], scale[1]),
                pivot_offset,
            );

            local_evals.push(LocalEval {
                layer,
                local_transform,
                local_opacity: opacity,
                frame_id,
                sprite_frame,
                pivot_offset,
            });
        }

        // Compute global/world transforms respecting the parent-child hierarchy
        let mut world_transforms: Vec<Option<Affine2D>> = vec![None; self.project.layers.len()];
        let mut world_opacities: Vec<Option<f32>> = vec![None; self.project.layers.len()];

        fn resolve_world(
            idx: usize,
            local_evals: &[LocalEval],
            layer_map: &HashMap<&str, usize>,
            world_transforms: &mut [Option<Affine2D>],
            world_opacities: &mut [Option<f32>],
            visiting: &mut Vec<usize>,
        ) -> (Affine2D, f32) {
            if let (Some(m), Some(o)) = (world_transforms[idx], world_opacities[idx]) {
                return (m, o);
            }

            // Cycle prevention
            if visiting.contains(&idx) {
                // Fallback to local transform if cyclical reference is detected
                return (local_evals[idx].local_transform, local_evals[idx].local_opacity);
            }

            visiting.push(idx);

            let (parent_matrix, parent_opacity) = if local_evals[idx].layer.relative_to_parent {
                match &local_evals[idx].layer.parent_id {
                    Some(p_id) => {
                        if let Some(&p_idx) = layer_map.get(p_id.as_str()) {
                            resolve_world(p_idx, local_evals, layer_map, world_transforms, world_opacities, visiting)
                        } else {
                            (Affine2D::IDENTITY, 1.0)
                        }
                    }
                    None => (Affine2D::IDENTITY, 1.0),
                }
            } else {
                (Affine2D::IDENTITY, 1.0)
            };

            visiting.pop();

            let world_m = parent_matrix.mul(&local_evals[idx].local_transform);
            let world_o = parent_opacity * local_evals[idx].local_opacity;

            world_transforms[idx] = Some(world_m);
            world_opacities[idx] = Some(world_o);

            (world_m, world_o)
        }

        let mut visiting = Vec::new();
        for i in 0..self.project.layers.len() {
            resolve_world(
                i,
                &local_evals,
                &layer_map,
                &mut world_transforms,
                &mut world_opacities,
                &mut visiting,
            );
        }

        // Build list of visible render items
        let mut items = Vec::new();
        for (i, eval) in local_evals.iter().enumerate() {
            if !eval.layer.visible {
                continue;
            }

            let matrix = world_transforms[i].unwrap_or(Affine2D::IDENTITY);
            let opacity = world_opacities[i].unwrap_or(1.0);

            // Compute world position of the pivot point for editor gizmos
            let pivot_world = matrix.transform_point(eval.pivot_offset);

            let source_rect = eval.sprite_frame.map(|f| [f.x, f.y, f.w, f.h]);

            items.push(RenderItem {
                layer_id: eval.layer.id.clone(),
                layer_name: eval.layer.name.clone(),
                sheet_id: eval.layer.sheet_id.clone(),
                frame_id: eval.frame_id.clone(),
                source_rect,
                matrix: matrix.to_array(),
                opacity,
                z_index: eval.layer.z_index,
                pivot_world,
            });
        }

        // Sort items by z_index ascending (lower z painted first, higher z on top)
        items.sort_by_key(|item| item.z_index);

        ResolvedFrame { frame: t, items }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::*;

    #[test]
    fn test_discrete_frame_swap_step() {
        let tracks = vec![
            Keyframe::new(0.0, "stand".to_string(), Easing::Step),
            Keyframe::new(5.0, "step_1".to_string(), Easing::Step),
            Keyframe::new(10.0, "step_2".to_string(), Easing::Step),
        ];

        assert_eq!(sample_discrete_track(&tracks, 0.0, None), Some("stand".to_string()));
        assert_eq!(sample_discrete_track(&tracks, 4.9, None), Some("stand".to_string()));
        assert_eq!(sample_discrete_track(&tracks, 5.0, None), Some("step_1".to_string()));
        assert_eq!(sample_discrete_track(&tracks, 9.99, None), Some("step_1".to_string()));
        assert_eq!(sample_discrete_track(&tracks, 10.0, None), Some("step_2".to_string()));
        assert_eq!(sample_discrete_track(&tracks, 20.0, None), Some("step_2".to_string()));
    }

    #[test]
    fn test_continuous_interpolation_easing() {
        let tracks = vec![
            Keyframe::new(0.0, 0.0, Easing::Linear),
            Keyframe::new(10.0, 100.0, Easing::Linear),
        ];

        let val_at_5 = sample_scalar_track(&tracks, 5.0, 0.0);
        assert!((val_at_5 - 50.0).abs() < 1e-4);
    }

    #[test]
    fn test_hierarchical_parent_child_composition() {
        // Parent layer at (50, 50)
        // Child layer at local (10, 0) relative to parent
        // When parent moves to (100, 100), child should be at (110, 100)
        let parent = Layer {
            id: "parent".to_string(),
            name: "Parent".to_string(),
            parent_id: None,
            z_index: 0,
            visible: true,
            sheet_id: None,
            default_frame: None,
            default_transform: Transform2D {
                x: 50.0,
                y: 50.0,
                ..Default::default()
            },
            relative_to_parent: true,
            tracks: LayerTracks {
                position: vec![
                    Keyframe::new(0.0, [50.0, 50.0], Easing::Linear),
                    Keyframe::new(10.0, [100.0, 100.0], Easing::Linear),
                ],
                ..Default::default()
            },
        };

        let child = Layer {
            id: "child".to_string(),
            name: "Child".to_string(),
            parent_id: Some("parent".to_string()),
            z_index: 1,
            visible: true,
            sheet_id: None,
            default_frame: None,
            default_transform: Transform2D {
                x: 10.0,
                y: 0.0,
                ..Default::default()
            },
            relative_to_parent: true,
            tracks: LayerTracks::default(),
        };

        let project = Project {
            version: "1.0.0".to_string(),
            meta: ProjectMeta {
                name: "test_hierarchy".to_string(),
                fps: 24,
                total_frames: 10,
                canvas_width: 200,
                canvas_height: 200,
            },
            sheets: vec![],
            layers: vec![parent, child],
        };

        let engine = AnimationEngine::new(project);

        // At frame 0: parent is at (50, 50), child is at (60, 50)
        let frame0 = engine.evaluate_frame(0.0);
        let child_render0 = frame0.items.iter().find(|i| i.layer_id == "child").unwrap();
        // matrix: [a, b, c, d, tx, ty]
        assert!((child_render0.matrix[4] - 60.0).abs() < 1e-4);
        assert!((child_render0.matrix[5] - 50.0).abs() < 1e-4);

        // At frame 10: parent is at (100, 100), child is at (110, 100)
        let frame10 = engine.evaluate_frame(10.0);
        let child_render10 = frame10.items.iter().find(|i| i.layer_id == "child").unwrap();
        assert!((child_render10.matrix[4] - 110.0).abs() < 1e-4);
        assert!((child_render10.matrix[5] - 100.0).abs() < 1e-4);
    }
}
