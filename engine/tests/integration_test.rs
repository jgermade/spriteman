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
