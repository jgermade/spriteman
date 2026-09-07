import { beforeEach, describe, expect, it } from 'vitest';
import { DOCUMENT_VERSION, projectService } from '../services/project.service';

const newProject = (width = 8, height = 8) => {
  projectService.setProjectJson(projectService.createNewProject('fmt', width, height, 12));
  projectService.clearHistory();
};

describe('v2 documents', () => {
  beforeEach(() => newProject());

  it('writes cels per clip and no derived composite', () => {
    projectService.setPixels(0, [{ x: 1, y: 1 }], '#ff0000');
    const doc = JSON.parse(projectService.getRawJson());

    expect(doc.version).toBe(DOCUMENT_VERSION);
    expect(doc.frame_pixels).toBeUndefined();
    expect(doc.layers[0].frame_pixels).toBeUndefined();

    const cels = doc.animations[0].cels;
    expect(Object.keys(cels)).toEqual(['layer_base']);
    expect(cels.layer_base['0'].p).toEqual(['#ff0000']);
  });

  it('round-trips artwork through save and load', () => {
    projectService.setPixels(0, [{ x: 2, y: 3 }, { x: 4, y: 5 }], '#0a0b0c');
    const saved = projectService.getRawJson();

    projectService.setProjectJson(saved);
    const composite = projectService.getFrameComposite(0);
    expect(composite['2,3']).toBe('#0a0b0c');
    expect(composite['4,5']).toBe('#0a0b0c');
  });

  it('keeps layer identity across a round trip instead of flattening', () => {
    projectService.setPixels(0, [{ x: 0, y: 0 }], '#111111');
    const second = projectService.addLayer('Top');
    projectService.selectLayer(second);
    projectService.setPixels(0, [{ x: 7, y: 7 }], '#222222');

    projectService.setProjectJson(projectService.getRawJson());
    const doc = JSON.parse(projectService.getRawJson());
    expect(Object.keys(doc.animations[0].cels).sort()).toEqual(['layer_base', second].sort());
  });

  it('is dramatically smaller than the same artwork inline', () => {
    newProject(64, 64);
    const pixels = [];
    for (let y = 10; y < 40; y++) for (let x = 10; x < 40; x++) pixels.push({ x, y });
    projectService.setPixels(0, pixels, '#3a5f8a');

    const v2 = projectService.getRawJson().length;
    const inline = JSON.stringify(projectService.getFrameComposite(0)).length;
    expect(v2).toBeLessThan(inline / 2);
  });
});

describe('multi-animation isolation', () => {
  beforeEach(() => newProject());

  it('starts a new clip empty and keeps clips from leaking into each other', () => {
    projectService.setPixels(0, [{ x: 1, y: 1 }], '#aa0000');
    const first = projectService.getState().activeAnimationId;

    projectService.addAnimation('attack');
    expect(Object.keys(projectService.getFrameComposite(0)).length, 'new clip starts empty').toBe(0);

    projectService.setPixels(0, [{ x: 5, y: 5 }], '#0000bb');
    const second = projectService.getFrameComposite(0);
    expect(second['5,5']).toBe('#0000bb');
    expect(second['1,1'], "the first clip's pixel leaked into the second").toBeUndefined();

    projectService.selectAnimation(first);
    const back = projectService.getFrameComposite(0);
    expect(back['1,1']).toBe('#aa0000');
    expect(back['5,5']).toBeUndefined();
  });

  it('persists both clips through a save and load', () => {
    projectService.setPixels(0, [{ x: 1, y: 1 }], '#aa0000');
    const first = projectService.getState().activeAnimationId;
    const second = projectService.addAnimation('attack');
    projectService.setPixels(0, [{ x: 5, y: 5 }], '#0000bb');

    projectService.setProjectJson(projectService.getRawJson());

    projectService.selectAnimation(first);
    expect(projectService.getFrameComposite(0)['1,1']).toBe('#aa0000');
    projectService.selectAnimation(second);
    expect(projectService.getFrameComposite(0)['5,5']).toBe('#0000bb');
  });
});

describe('v1 migration', () => {
  const v1Document = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      version: '1.0.0',
      meta: { name: 'legacy', fps: 12, total_frames: 2, canvas_width: 8, canvas_height: 8 },
      frame_pixels: { 0: { '1,1': '#aa0000', '6,6': '#00bb00' } },
      sheets: [],
      layers: [
        {
          id: 'layer_base',
          name: 'Base',
          parent_id: null,
          z_index: 0,
          visible: true,
          frame_pixels: { 0: { '1,1': '#aa0000' } },
          default_transform: { x: 4, y: 4, rotation: 0, scale_x: 1, scale_y: 1, opacity: 1 },
          tracks: { position: [{ frame: 0, value: [4, 4], easing: 'linear' }] },
        },
        {
          id: 'layer_top',
          name: 'Top',
          parent_id: null,
          z_index: 1,
          visible: true,
          frame_pixels: { 0: { '6,6': '#00bb00' } },
          default_transform: { x: 4, y: 4, rotation: 0, scale_x: 1, scale_y: 1, opacity: 1 },
          tracks: {},
        },
      ],
      ...extra,
    });

  it('recovers per-layer artwork from the active clip', () => {
    projectService.setProjectJson(v1Document());
    const doc = JSON.parse(projectService.getRawJson());

    expect(doc.version).toBe(DOCUMENT_VERSION);
    expect(Object.keys(doc.animations[0].cels).sort()).toEqual(['layer_base', 'layer_top']);
    const composite = projectService.getFrameComposite(0);
    expect(composite['1,1']).toBe('#aa0000');
    expect(composite['6,6']).toBe('#00bb00');
  });

  it('keeps a non-active clip’s flattened artwork on the bottom layer', () => {
    projectService.setProjectJson(
      v1Document({
        activeAnimationId: 'walk',
        animations: [
          { id: 'walk', name: 'walk', fps: 12, total_frames: 2, frame_pixels: {}, layer_groups: {} },
          {
            id: 'jump',
            name: 'jump',
            fps: 12,
            total_frames: 1,
            frame_pixels: { 0: { '3,3': '#cccccc' } },
            layer_groups: {},
          },
        ],
      })
    );

    projectService.selectAnimation('jump');
    expect(projectService.getFrameComposite(0)['3,3']).toBe('#cccccc');
  });

  it('reads a v1 document that has no animations at all', () => {
    const doc = JSON.parse(v1Document());
    delete doc.animations;
    projectService.setProjectJson(JSON.stringify(doc));

    expect(projectService.getState().animations.length).toBe(1);
    expect(projectService.getFrameComposite(0)['1,1']).toBe('#aa0000');
  });
});
