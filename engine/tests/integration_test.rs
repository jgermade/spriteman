use spritemotion::eval::AnimationEngine;
use spritemotion::model::Project;

#[test]
fn test_sample_walk_project_evaluation() {
    let json_str = include_str!("../../examples/sample_walk.json");
    let project = Project::from_json(json_str).expect("Failed to parse sample_walk.json");
    assert_eq!(project.meta.name, "sample_character_anim");
    assert_eq!(project.layers.len(), 3);

    let engine = AnimationEngine::new(project);

    // Evaluate over the full animation range [0..24]
    for f in 0..=24 {
        let resolved = engine.evaluate_frame(f as f32);
        assert_eq!(resolved.items.len(), 3);

        // Verify z-index ordering
        for i in 0..resolved.items.len() - 1 {
            assert!(resolved.items[i].z_index <= resolved.items[i + 1].z_index);
        }
    }
}

#[test]
fn test_frame_buffer_packs_items_in_z_order() {
    use spritemotion::eval::{fill_frame_buffer, FRAME_ITEM_STRIDE};

    let json_str = include_str!("../../examples/sample_walk.json");
    let project = Project::from_json(json_str).expect("Failed to parse sample_walk.json");
    let layer_ids: Vec<String> = project.layers.iter().map(|l| l.id.clone()).collect();

    let engine = AnimationEngine::new(project);
    let resolved = engine.evaluate_frame(6.0);

    let mut buffer: Vec<f32> = Vec::new();
    let count = fill_frame_buffer(&resolved, &layer_ids, &mut buffer);

    assert_eq!(count, resolved.items.len());
    assert_eq!(buffer.len(), count * FRAME_ITEM_STRIDE);

    for (i, item) in resolved.items.iter().enumerate() {
        let base = i * FRAME_ITEM_STRIDE;
        let layer_index = buffer[base] as usize;

        // The packed index must resolve back to the item's own layer.
        assert_eq!(layer_ids[layer_index], item.layer_id);

        assert_eq!(&buffer[base + 1..base + 7], &item.matrix[..]);
        assert_eq!(buffer[base + 7], item.opacity);
        assert_eq!(buffer[base + 8], item.pivot_world.x);
        assert_eq!(buffer[base + 9], item.pivot_world.y);
    }
}

#[test]
fn test_frame_buffer_marks_unknown_layers() {
    use spritemotion::eval::{fill_frame_buffer, FRAME_ITEM_STRIDE};

    let json_str = include_str!("../../examples/sample_walk.json");
    let project = Project::from_json(json_str).expect("Failed to parse sample_walk.json");
    let engine = AnimationEngine::new(project);
    let resolved = engine.evaluate_frame(0.0);

    // An empty table means nothing can be resolved; every record is flagged instead of
    // silently pointing at layer 0.
    let mut buffer: Vec<f32> = Vec::new();
    let count = fill_frame_buffer(&resolved, &[], &mut buffer);
    assert!(count > 0);
    for i in 0..count {
        assert_eq!(buffer[i * FRAME_ITEM_STRIDE], -1.0);
    }
}

#[test]
fn test_frame_buffer_is_reused_between_frames() {
    use spritemotion::eval::fill_frame_buffer;

    let json_str = include_str!("../../examples/sample_walk.json");
    let project = Project::from_json(json_str).expect("Failed to parse sample_walk.json");
    let layer_ids: Vec<String> = project.layers.iter().map(|l| l.id.clone()).collect();
    let engine = AnimationEngine::new(project);

    let mut buffer: Vec<f32> = Vec::new();
    let first = fill_frame_buffer(&engine.evaluate_frame(0.0), &layer_ids, &mut buffer);
    let len_after_first = buffer.len();
    let second = fill_frame_buffer(&engine.evaluate_frame(12.0), &layer_ids, &mut buffer);

    assert_eq!(first, second);
    assert_eq!(buffer.len(), len_after_first, "buffer must not grow across frames");
}
