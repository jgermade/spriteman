import { beforeEach, describe, expect, it } from 'vitest';
import { projectService } from '../services/project.service';

const newProject = (width = 8, height = 8) => {
  const json = projectService.createNewProject('test_sprite', width, height, 12);
  projectService.setProjectJson(json);
  projectService.clearHistory();
};

describe('pixel editing', () => {
  beforeEach(() => newProject());

  it('paints into the selected layer and recomposes the frame', () => {
    projectService.setPixels(0, [{ x: 1, y: 1 }, { x: 2, y: 1 }], '#ff0000');
    const composite = projectService.getFrameComposite(0);
    expect(composite['1,1']).toBe('#ff0000');
    expect(composite['2,1']).toBe('#ff0000');
  });

  it('bumps the frame revision so thumbnails invalidate on a same-count repaint', () => {
    projectService.setPixels(0, [{ x: 1, y: 1 }], '#ff0000');
    const first = projectService.getFrameRevisions()[0];
    // Repaint the same pixel a different color: the pixel count does not change.
    projectService.setPixels(0, [{ x: 1, y: 1 }], '#00ff00');
    expect(projectService.getFrameRevisions()[0]).toBeGreaterThan(first);
  });
});

describe('history', () => {
  beforeEach(() => newProject());

  it('undoes and redoes a stroke without touching the engine document', () => {
    projectService.setPixels(0, [{ x: 3, y: 3 }], '#123456');
    expect(projectService.getFrameComposite(0)['3,3']).toBe('#123456');

    expect(projectService.undo()).toBe(true);
    expect(projectService.didLastHistoryChangeStructure()).toBe(false);
    expect(projectService.getFrameComposite(0)['3,3']).toBeUndefined();

    expect(projectService.redo()).toBe(true);
    expect(projectService.getFrameComposite(0)['3,3']).toBe('#123456');
  });

  it('reports nothing to undo on a fresh document', () => {
    expect(projectService.canUndo()).toBe(false);
    expect(projectService.undo()).toBe(false);
  });

  it('marks structural steps so the caller reloads the engine', () => {
    projectService.addLayer('Second layer');
    expect(projectService.undo()).toBe(true);
    expect(projectService.didLastHistoryChangeStructure()).toBe(true);
  });

  it('records no history entry for a stroke that changes nothing', () => {
    projectService.setPixels(0, [{ x: 4, y: 4 }], '#abcdef');
    projectService.setPixels(0, [{ x: 4, y: 4 }], '#abcdef');
    expect(projectService.undo()).toBe(true);
    expect(projectService.getFrameComposite(0)['4,4']).toBeUndefined();
  });
});

describe('engine document', () => {
  beforeEach(() => newProject());

  it('excludes pixel data the Rust engine does not declare', () => {
    projectService.setPixels(0, [{ x: 0, y: 0 }], '#ffffff');
    const engineDoc = JSON.parse(projectService.getEngineJson());

    expect(engineDoc.meta.canvas_width).toBe(8);
    expect(engineDoc.layers.length).toBeGreaterThan(0);
    expect(engineDoc.layers[0].frame_pixels).toBeUndefined();
    expect(engineDoc.frame_pixels).toBeUndefined();
    expect(engineDoc.layers[0].tracks).toBeDefined();
  });

  it('stays byte-identical across a pixel-only edit, so the engine can skip reloading', () => {
    const before = projectService.getEngineJson();
    projectService.setPixels(0, [{ x: 5, y: 5 }], '#010203');
    expect(projectService.getEngineJson()).toBe(before);
  });

  it('changes when a layer transform changes', () => {
    const before = projectService.getEngineJson();
    projectService.addLayer('Arm');
    expect(projectService.getEngineJson()).not.toBe(before);
  });
});

describe('serialization', () => {
  beforeEach(() => newProject());

  it('round-trips the document through save and load', () => {
    projectService.setPixels(0, [{ x: 2, y: 2 }], '#0f0f0f');
    const saved = projectService.getRawJson();

    projectService.setProjectJson(saved);
    expect(projectService.getFrameComposite(0)['2,2']).toBe('#0f0f0f');
  });

  it('serializes compactly, not pretty-printed', () => {
    expect(projectService.getRawJson()).not.toContain('\n  ');
  });
});
