/**
 * Project document state management service.
 */

export interface ProjectMeta {
  name: string;
  fps: number;
  total_frames: number;
  canvas_width: number;
  canvas_height: number;
}

export interface LayerFrameGroup {
  id: string;
  layer_id: string;
  start_frame: number;
  end_frame: number;
  name?: string;
  pivot?: { x: number; y: number };
}

export interface AnimationClipData {
  id: string;
  name: string;
  fps: number;
  total_frames: number;
  frame_pixels: Record<number, Record<string, string>>;
  layer_groups?: Record<string, LayerFrameGroup[]>;
}

export interface LayerData {
  id: string;
  name: string;
  parent_id: string | null;
  z_index: number;
  visible: boolean;
  sheet_id?: string;
  default_frame?: string;
  color?: string;
  default_transform?: {
    x: number;
    y: number;
    rotation: number;
    scale_x: number;
    scale_y: number;
    opacity: number;
    pivot?: { x: number; y: number };
  };
  pivot?: { x: number; y: number };
  groups?: LayerFrameGroup[];
  tracks?: {
    position?: Array<{ frame: number; value: [number, number]; easing?: string }>;
    rotation?: Array<{ frame: number; value: number; easing?: string }>;
    scale?: Array<{ frame: number; value: [number, number]; easing?: string }>;
    opacity?: Array<{ frame: number; value: number; easing?: string }>;
    sprite_frame?: Array<{ frame: number; value: string; easing?: string }>;
  };
}

export interface ProjectState {
  meta: ProjectMeta;
  layers: LayerData[];
  selectedLayerId: string | null;
  frame_pixels: Record<number, Record<string, string>>;
  animations: AnimationClipData[];
  activeAnimationId: string;
  rawJson: string;
}

type ProjectListener = (state: ProjectState) => void;

class ProjectService {
  private state: ProjectState = {
    meta: {
      name: 'pixel_sprite_anim',
      fps: 12,
      total_frames: 4,
      canvas_width: 64,
      canvas_height: 64,
    },
    layers: [],
    selectedLayerId: null,
    frame_pixels: {},
    animations: [
      {
        id: 'anim_idle',
        name: 'idle',
        fps: 12,
        total_frames: 4,
        frame_pixels: {},
        layer_groups: {},
      },
    ],
    activeAnimationId: 'anim_idle',
    rawJson: '',
  };
  private listeners: Set<ProjectListener> = new Set();

  public async loadFromUrl(url: string): Promise<string> {
    const res = await fetch(url);
    const text = await res.text();
    this.setProjectJson(text);
    return text;
  }

  /**
   * Creates a brand new animation project with a single initial frame (total_frames: 1).
   */
  public createNewProject(name: string, width: number, height: number, fps: number = 12): string {
    const project = {
      version: '1.0.0',
      meta: {
        name: name.trim() || 'untitled_sprite',
        fps: fps,
        total_frames: 1, // Exactly 1 initial frame as requested
        canvas_width: width,
        canvas_height: height,
      },
      frame_pixels: { 0: {} },
      sheets: [],
      layers: [
        {
          id: 'layer_base',
          name: 'Base Layer',
          parent_id: null,
          z_index: 0,
          visible: true,
          default_transform: {
            x: Math.round(width / 2),
            y: Math.round(height / 2),
            rotation: 0,
            scale_x: 1,
            scale_y: 1,
            opacity: 1,
            pivot: { x: 0.5, y: 0.5 },
          },
          tracks: {
            position: [
              {
                frame: 0,
                value: [Math.round(width / 2), Math.round(height / 2)],
                easing: 'linear',
              },
            ],
            rotation: [
              {
                frame: 0,
                value: 0,
                easing: 'linear',
              },
            ],
            scale: [],
            opacity: [],
            sprite_frame: [],
          },
        },
      ],
    };

    const json = JSON.stringify(project, null, 2);
    this.setProjectJson(json);
    return json;
  }

  public setProjectJson(json: string): void {
    try {
      const parsed = JSON.parse(json);
      this.state.rawJson = json;
      if (parsed.meta) {
        this.state.meta = {
          name: parsed.meta.name ?? 'sprite_anim',
          fps: parsed.meta.fps ?? 12,
          total_frames: parsed.meta.total_frames ?? 4,
          canvas_width: parsed.meta.canvas_width ?? 64,
          canvas_height: parsed.meta.canvas_height ?? 64,
        };
      }
      this.state.layers = parsed.layers || [];
      this.state.frame_pixels = parsed.frame_pixels || {};

      // Parse or synthesize animation clips
      if (parsed.animations && Array.isArray(parsed.animations) && parsed.animations.length > 0) {
        this.state.animations = parsed.animations;
        this.state.activeAnimationId = parsed.activeAnimationId || parsed.animations[0].id;
        const activeClip = this.state.animations.find((a) => a.id === this.state.activeAnimationId) || this.state.animations[0];
        this.state.frame_pixels = activeClip.frame_pixels || {};
        this.state.meta.total_frames = activeClip.total_frames ?? this.state.meta.total_frames;
        this.state.meta.fps = activeClip.fps ?? this.state.meta.fps;
        if (activeClip.layer_groups) {
          this.state.layers.forEach((l) => {
            l.groups = activeClip.layer_groups![l.id] || l.groups || [];
          });
        }
      } else {
        const animName = (this.state.meta.name || 'idle').replace(/^sample_character_anim$/, 'walk');
        const defaultAnim: AnimationClipData = {
          id: 'anim_default',
          name: animName,
          fps: this.state.meta.fps,
          total_frames: this.state.meta.total_frames,
          frame_pixels: this.state.frame_pixels,
          layer_groups: {},
        };
        this.state.layers.forEach((l) => {
          if (l.groups) {
            defaultAnim.layer_groups![l.id] = [...l.groups];
          }
        });
        this.state.animations = [defaultAnim];
        this.state.activeAnimationId = 'anim_default';
      }

      if (!this.state.selectedLayerId && this.state.layers.length > 0) {
        this.state.selectedLayerId = this.state.layers[0].id;
      }
      this.notify();
    } catch (err) {
      console.error('Failed to parse project JSON:', err);
    }
  }

  public selectLayer(layerId: string | null): void {
    this.state.selectedLayerId = layerId;
    this.notify();
  }

  public setCanvasSize(width: number, height: number): void {
    this.state.meta.canvas_width = width;
    this.state.meta.canvas_height = height;
    this.updateJson();
    this.notify();
  }

  public setFps(fps: number): void {
    this.state.meta.fps = fps;
    this.updateJson();
    this.notify();
  }

  public setLayerColor(layerId: string, color: string): void {
    const layer = this.state.layers.find((l) => l.id === layerId);
    if (layer) {
      layer.color = color;
      this.updateJson();
      this.notify();
    }
  }

  /**
   * Inserts a new frame at targetIndex, shifting subsequent keyframes by +1,
   * and copying the preceding frame's content/keyframes by default.
   */
  public insertFrame(targetIndex: number, copyPrevious = true): number {
    const currentTotal = this.state.meta.total_frames;
    const insertIndex = Math.max(0, Math.min(targetIndex, currentTotal));

    // Shift keyframes at or beyond insertIndex
    this.state.layers.forEach((layer) => {
      if (!layer.tracks) return;
      if (layer.tracks.position) {
        layer.tracks.position = layer.tracks.position.map((k) =>
          k.frame >= insertIndex ? { ...k, frame: k.frame + 1 } : k
        );
      }
      if (layer.tracks.rotation) {
        layer.tracks.rotation = layer.tracks.rotation.map((k) =>
          k.frame >= insertIndex ? { ...k, frame: k.frame + 1 } : k
        );
      }
      if (layer.tracks.scale) {
        layer.tracks.scale = layer.tracks.scale.map((k) =>
          k.frame >= insertIndex ? { ...k, frame: k.frame + 1 } : k
        );
      }
      if (layer.tracks.opacity) {
        layer.tracks.opacity = layer.tracks.opacity.map((k) =>
          k.frame >= insertIndex ? { ...k, frame: k.frame + 1 } : k
        );
      }
      if (layer.tracks.sprite_frame) {
        layer.tracks.sprite_frame = layer.tracks.sprite_frame.map((k) =>
          k.frame >= insertIndex ? { ...k, frame: k.frame + 1 } : k
        );
      }

      if (layer.groups) {
        layer.groups.forEach((g) => {
          if (g.start_frame >= insertIndex) g.start_frame += 1;
          if (g.end_frame >= insertIndex) g.end_frame += 1;
        });
      }
    });

    this.state.meta.total_frames = currentTotal + 1;

    if (copyPrevious) {
      // Find source keyframe: immediately preceding frame if available, otherwise shifted frame
      const sourceFrameIndex = insertIndex > 0 ? insertIndex - 1 : (currentTotal > 0 ? 1 : 0);
      this.state.layers.forEach((layer) => {
        if (!layer.tracks) layer.tracks = {};

        // Copy position
        if (layer.tracks.position && layer.tracks.position.length > 0) {
          const sourcePos =
            layer.tracks.position.find((k) => k.frame === sourceFrameIndex) ||
            layer.tracks.position[0];
          if (sourcePos) {
            layer.tracks.position.push({
              frame: insertIndex,
              value: [...sourcePos.value],
              easing: 'linear',
            });
            layer.tracks.position.sort((a, b) => a.frame - b.frame);
          }
        }

        // Copy rotation
        if (layer.tracks.rotation && layer.tracks.rotation.length > 0) {
          const sourceRot =
            layer.tracks.rotation.find((k) => k.frame === sourceFrameIndex) ||
            layer.tracks.rotation[0];
          if (sourceRot) {
            layer.tracks.rotation.push({
              frame: insertIndex,
              value: sourceRot.value,
              easing: 'linear',
            });
            layer.tracks.rotation.sort((a, b) => a.frame - b.frame);
          }
        }

        // Copy scale
        if (layer.tracks.scale && layer.tracks.scale.length > 0) {
          const sourceScale =
            layer.tracks.scale.find((k) => k.frame === sourceFrameIndex) ||
            layer.tracks.scale[0];
          if (sourceScale) {
            layer.tracks.scale.push({
              frame: insertIndex,
              value: [...sourceScale.value],
              easing: 'linear',
            });
            layer.tracks.scale.sort((a, b) => a.frame - b.frame);
          }
        }

        // Copy opacity
        if (layer.tracks.opacity && layer.tracks.opacity.length > 0) {
          const sourceOpacity =
            layer.tracks.opacity.find((k) => k.frame === sourceFrameIndex) ||
            layer.tracks.opacity[0];
          if (sourceOpacity) {
            layer.tracks.opacity.push({
              frame: insertIndex,
              value: sourceOpacity.value,
              easing: 'linear',
            });
            layer.tracks.opacity.sort((a, b) => a.frame - b.frame);
          }
        }

        // Copy sprite_frame
        if (layer.tracks.sprite_frame && layer.tracks.sprite_frame.length > 0) {
          const sourceSprite =
            layer.tracks.sprite_frame.find((k) => k.frame === sourceFrameIndex) ||
            layer.tracks.sprite_frame[0];
          if (sourceSprite) {
            layer.tracks.sprite_frame.push({
              frame: insertIndex,
              value: sourceSprite.value,
              easing: 'step',
            });
            layer.tracks.sprite_frame.sort((a, b) => a.frame - b.frame);
          }
        }
      });
    }

    // Shift frame_pixels keys at or after insertIndex
    const nextPixels: Record<number, Record<string, string>> = {};
    for (const [kStr, map] of Object.entries(this.state.frame_pixels)) {
      const k = parseInt(kStr, 10);
      if (k < insertIndex) {
        nextPixels[k] = map;
      } else {
        nextPixels[k + 1] = map;
      }
    }
    if (copyPrevious) {
      const sourceFrameIndex = insertIndex > 0 ? insertIndex - 1 : (currentTotal > 0 ? 1 : 0);
      nextPixels[insertIndex] = { ...(this.state.frame_pixels[sourceFrameIndex] || {}) };
    } else {
      nextPixels[insertIndex] = {};
    }
    this.state.frame_pixels = nextPixels;

    this.updateJson();
    this.notify();
    return insertIndex;
  }

  /**
   * Adds a new frame at the end, by default copying previous frame's content/keyframes.
   */
  public addFrame(copyPrevious = true): number {
    return this.insertFrame(this.state.meta.total_frames, copyPrevious);
  }

  /**
   * Duplicates the specified frame into a new frame.
   */
  public duplicateFrame(frameIndex: number): number {
    const newFrameIndex = this.state.meta.total_frames;
    this.state.meta.total_frames += 1;

    this.state.layers.forEach((layer) => {
      if (!layer.tracks) return;
      if (layer.tracks.position) {
        const k = layer.tracks.position.find((p) => p.frame === frameIndex);
        if (k) layer.tracks.position.push({ frame: newFrameIndex, value: [...k.value], easing: 'linear' });
      }
      if (layer.tracks.rotation) {
        const k = layer.tracks.rotation.find((r) => r.frame === frameIndex);
        if (k) layer.tracks.rotation.push({ frame: newFrameIndex, value: k.value, easing: 'linear' });
      }
    });

    this.state.frame_pixels[newFrameIndex] = { ...(this.state.frame_pixels[frameIndex] || {}) };

    this.updateJson();
    this.notify();
    return newFrameIndex;
  }

  /**
   * Deletes the given frame.
   */
  public deleteFrame(frameIndex: number): void {
    if (this.state.meta.total_frames <= 1) return;

    this.state.layers.forEach((layer) => {
      if (!layer.tracks) return;
      if (layer.tracks.position) {
        layer.tracks.position = layer.tracks.position
          .filter((k) => k.frame !== frameIndex)
          .map((k) => (k.frame > frameIndex ? { ...k, frame: k.frame - 1 } : k));
      }
      if (layer.tracks.rotation) {
        layer.tracks.rotation = layer.tracks.rotation
          .filter((k) => k.frame !== frameIndex)
          .map((k) => (k.frame > frameIndex ? { ...k, frame: k.frame - 1 } : k));
      }

      if (layer.groups) {
        layer.groups = layer.groups
          .map((g) => {
            let start = g.start_frame;
            let end = g.end_frame;
            if (start > frameIndex) start = Math.max(0, start - 1);
            if (end >= frameIndex) end = Math.max(0, end - 1);
            return { ...g, start_frame: start, end_frame: end };
          })
          .filter((g) => g.end_frame >= g.start_frame);
      }
    });

    const nextPixels: Record<number, Record<string, string>> = {};
    for (const [kStr, map] of Object.entries(this.state.frame_pixels)) {
      const k = parseInt(kStr, 10);
      if (k < frameIndex) {
        nextPixels[k] = map;
      } else if (k > frameIndex) {
        nextPixels[k - 1] = map;
      }
    }
    this.state.frame_pixels = nextPixels;

    this.state.meta.total_frames -= 1;
    this.updateJson();
    this.notify();
  }

  /**
   * Adds a new layer to the project.
   */
  public addLayer(name?: string, parentId: string | null = null): string {
    const layerIndex = this.state.layers.length + 1;
    const id = `layer_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const layerName = name || `Layer ${layerIndex}`;
    const width = this.state.meta.canvas_width;
    const height = this.state.meta.canvas_height;

    const newLayer: LayerData = {
      id,
      name: layerName,
      parent_id: parentId,
      z_index: this.state.layers.length,
      visible: true,
      default_transform: {
        x: Math.round(width / 2),
        y: Math.round(height / 2),
        rotation: 0,
        scale_x: 1,
        scale_y: 1,
        opacity: 1,
        pivot: { x: Math.round(width / 2), y: Math.round(height / 2) },
      },
      pivot: { x: Math.round(width / 2), y: Math.round(height / 2) },
      tracks: {
        position: [
          {
            frame: 0,
            value: [Math.round(width / 2), Math.round(height / 2)],
            easing: 'linear',
          },
        ],
        rotation: [
          {
            frame: 0,
            value: 0,
            easing: 'linear',
          },
        ],
        scale: [],
        opacity: [],
        sprite_frame: [],
      },
    };

    this.state.layers.push(newLayer);
    this.state.selectedLayerId = id;
    this.updateJson();
    this.notify();
    return id;
  }

  /**
   * Reorders a layer to targetIndex, optionally updating its parent_id.
   * Prevents circular hierarchy dependencies and updates all layer z_index values.
   */
  public reorderLayer(layerId: string, targetIndex: number, newParentId: string | null = null): void {
    const currentIndex = this.state.layers.findIndex((l) => l.id === layerId);
    if (currentIndex === -1) return;

    // Check if newParentId is invalid (e.g. self or descendant)
    if (newParentId === layerId) return;
    if (newParentId) {
      let curr: string | null = newParentId;
      while (curr) {
        if (curr === layerId) return; // Prevent cyclic hierarchy
        const pLayer = this.state.layers.find((l) => l.id === curr);
        curr = pLayer ? pLayer.parent_id : null;
      }
    }

    const [movedLayer] = this.state.layers.splice(currentIndex, 1);
    movedLayer.parent_id = newParentId;

    const clampedIndex = Math.max(0, Math.min(this.state.layers.length, targetIndex));
    this.state.layers.splice(clampedIndex, 0, movedLayer);

    // Normalize z_index across all layers
    this.state.layers.forEach((l, idx) => {
      l.z_index = idx;
    });

    this.updateJson();
    this.notify();
  }

  /**
   * Updates the rotation axis (pivot) of a specific layer in canvas/sprite coordinates.
   */
  public setLayerPivot(layerId: string, pivotX: number, pivotY: number): void {
    const layer = this.state.layers.find((l) => l.id === layerId);
    if (layer) {
      if (!layer.default_transform) {
        layer.default_transform = {
          x: Math.round(this.state.meta.canvas_width / 2),
          y: Math.round(this.state.meta.canvas_height / 2),
          rotation: 0,
          scale_x: 1,
          scale_y: 1,
          opacity: 1,
          pivot: { x: pivotX, y: pivotY },
        };
      } else {
        layer.default_transform.pivot = { x: pivotX, y: pivotY };
      }
      layer.pivot = { x: pivotX, y: pivotY };
      this.updateJson();
      this.notify();
    }
  }

  /**
   * Reorders a frame from fromIndex to toIndex.
   * Updates frame_pixels and layer track keyframe indices.
   */
  public reorderFrame(fromIndex: number, toIndex: number): void {
    const total = this.state.meta.total_frames;
    if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= total || toIndex < 0 || toIndex >= total) {
      return;
    }

    // Reorder frame_pixels
    const framesArray: Array<Record<string, string>> = [];
    for (let i = 0; i < total; i++) {
      framesArray.push({ ...(this.state.frame_pixels[i] || {}) });
    }
    const [movedPixels] = framesArray.splice(fromIndex, 1);
    framesArray.splice(toIndex, 0, movedPixels);

    const nextPixels: Record<number, Record<string, string>> = {};
    framesArray.forEach((pxMap, idx) => {
      nextPixels[idx] = pxMap;
    });
    this.state.frame_pixels = nextPixels;

    // Shift keyframes in tracks
    const remap = (f: number): number => {
      if (f === fromIndex) return toIndex;
      if (fromIndex < toIndex) {
        if (f > fromIndex && f <= toIndex) return f - 1;
      } else {
        if (f >= toIndex && f < fromIndex) return f + 1;
      }
      return f;
    };

    this.state.layers.forEach((layer) => {
      if (!layer.tracks) return;
      if (layer.tracks.position) {
        layer.tracks.position = layer.tracks.position.map((k) => ({ ...k, frame: remap(k.frame) }));
        layer.tracks.position.sort((a, b) => a.frame - b.frame);
      }
      if (layer.tracks.rotation) {
        layer.tracks.rotation = layer.tracks.rotation.map((k) => ({ ...k, frame: remap(k.frame) }));
        layer.tracks.rotation.sort((a, b) => a.frame - b.frame);
      }
      if (layer.tracks.scale) {
        layer.tracks.scale = layer.tracks.scale.map((k) => ({ ...k, frame: remap(k.frame) }));
        layer.tracks.scale.sort((a, b) => a.frame - b.frame);
      }
      if (layer.tracks.opacity) {
        layer.tracks.opacity = layer.tracks.opacity.map((k) => ({ ...k, frame: remap(k.frame) }));
        layer.tracks.opacity.sort((a, b) => a.frame - b.frame);
      }
      if (layer.tracks.sprite_frame) {
        layer.tracks.sprite_frame = layer.tracks.sprite_frame.map((k) => ({ ...k, frame: remap(k.frame) }));
        layer.tracks.sprite_frame.sort((a, b) => a.frame - b.frame);
      }
    });

    this.updateJson();
    this.notify();
  }

  /**
   * Interpolates pixel motion across intermediate frames between startFrame and endFrame.
   * Replaces intermediate frames' pixel content with interpolated positions.
   */
  public interpolateMotion(startFrame: number, endFrame: number, _easing: string = 'linear'): void {
    if (endFrame - startFrame < 2) return;

    const startPixels = this.state.frame_pixels[startFrame] || {};
    const endPixels = this.state.frame_pixels[endFrame] || {};

    // Helper to calculate pixel centroid
    const getCentroid = (pixels: Record<string, string>): { cx: number; cy: number; count: number } => {
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      for (const key of Object.keys(pixels)) {
        const [x, y] = key.split(',').map(Number);
        sumX += x;
        sumY += y;
        count++;
      }
      return count > 0 ? { cx: sumX / count, cy: sumY / count, count } : { cx: 0, cy: 0, count: 0 };
    };

    const startCentroid = getCentroid(startPixels);
    const endCentroid = getCentroid(endPixels);

    const deltaX = endCentroid.count > 0 && startCentroid.count > 0 ? endCentroid.cx - startCentroid.cx : 0;
    const deltaY = endCentroid.count > 0 && startCentroid.count > 0 ? endCentroid.cy - startCentroid.cy : 0;

    const totalSteps = endFrame - startFrame;

    for (let f = startFrame + 1; f < endFrame; f++) {
      const t = (f - startFrame) / totalSteps;
      const stepDeltaX = Math.round(deltaX * t);
      const stepDeltaY = Math.round(deltaY * t);

      const interpolated: Record<string, string> = {};

      // If progress is <= 0.5, translate from start pixels; otherwise translate from end pixels
      if (t <= 0.5 || endCentroid.count === 0) {
        for (const [key, color] of Object.entries(startPixels)) {
          const [x, y] = key.split(',').map(Number);
          const nx = Math.max(0, Math.min(this.state.meta.canvas_width - 1, x + stepDeltaX));
          const ny = Math.max(0, Math.min(this.state.meta.canvas_height - 1, y + stepDeltaY));
          interpolated[`${nx},${ny}`] = color;
        }
      } else {
        const endStepDeltaX = Math.round(deltaX * (t - 1));
        const endStepDeltaY = Math.round(deltaY * (t - 1));
        for (const [key, color] of Object.entries(endPixels)) {
          const [x, y] = key.split(',').map(Number);
          const nx = Math.max(0, Math.min(this.state.meta.canvas_width - 1, x + endStepDeltaX));
          const ny = Math.max(0, Math.min(this.state.meta.canvas_height - 1, y + endStepDeltaY));
          interpolated[`${nx},${ny}`] = color;
        }
      }

      this.state.frame_pixels[f] = interpolated;
    }

    this.updateJson();
    this.notify();
  }

  public getFramePixels(frameIndex: number): Record<string, string> {
    return this.state.frame_pixels[frameIndex] || {};
  }

  public setPixel(frameIndex: number, x: number, y: number, color: string): void {
    if (!this.state.frame_pixels[frameIndex]) {
      this.state.frame_pixels[frameIndex] = {};
    }
    this.state.frame_pixels[frameIndex][`${x},${y}`] = color;
    this.updateJson();
    this.notify();
  }

  public setPixels(frameIndex: number, pixels: Array<{ x: number; y: number }>, color: string): void {
    if (!this.state.frame_pixels[frameIndex]) {
      this.state.frame_pixels[frameIndex] = {};
    }
    const map = this.state.frame_pixels[frameIndex];
    for (const p of pixels) {
      map[`${p.x},${p.y}`] = color;
    }
    this.updateJson();
    this.notify();
  }

  public erasePixel(frameIndex: number, x: number, y: number): void {
    if (this.state.frame_pixels[frameIndex]) {
      delete this.state.frame_pixels[frameIndex][`${x},${y}`];
      this.updateJson();
      this.notify();
    }
  }

  public erasePixels(frameIndex: number, pixels: Array<{ x: number; y: number }>): void {
    if (this.state.frame_pixels[frameIndex]) {
      const map = this.state.frame_pixels[frameIndex];
      for (const p of pixels) {
        delete map[`${p.x},${p.y}`];
      }
      this.updateJson();
      this.notify();
    }
  }

  // --- Layer Frame Groups ---
  public createFrameGroup(layerId: string, startFrame: number, endFrame: number, name?: string): LayerFrameGroup | null {
    const layer = this.state.layers.find((l) => l.id === layerId);
    if (!layer) return null;
    if (!layer.groups) layer.groups = [];

    const start = Math.min(startFrame, endFrame);
    const end = Math.max(startFrame, endFrame);
    const groupName = name || `Grupo ${start + 1}..${end + 1}`;

    const newGroup: LayerFrameGroup = {
      id: `grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      layer_id: layerId,
      start_frame: start,
      end_frame: end,
      name: groupName,
      pivot: undefined,
    };

    layer.groups.push(newGroup);
    layer.groups.sort((a, b) => a.start_frame - b.start_frame);

    this.updateJson();
    this.notify();
    return newGroup;
  }

  public deleteFrameGroup(layerId: string, groupId: string): void {
    const layer = this.state.layers.find((l) => l.id === layerId);
    if (!layer || !layer.groups) return;
    layer.groups = layer.groups.filter((g) => g.id !== groupId);
    this.updateJson();
    this.notify();
  }

  public setGroupPivot(layerId: string, groupId: string, pivotX: number, pivotY: number): void {
    const layer = this.state.layers.find((l) => l.id === layerId);
    if (!layer || !layer.groups) return;
    const grp = layer.groups.find((g) => g.id === groupId);
    if (grp) {
      grp.pivot = { x: pivotX, y: pivotY };
      this.updateJson();
      this.notify();
    }
  }

  public getGroupForFrame(layerId: string, frameIndex: number): LayerFrameGroup | null {
    const layer = this.state.layers.find((l) => l.id === layerId);
    if (!layer || !layer.groups) return null;
    return layer.groups.find((g) => frameIndex >= g.start_frame && frameIndex <= g.end_frame) || null;
  }

  public getActiveLayerGroupForFrame(frameIndex: number): LayerFrameGroup | null {
    if (!this.state.selectedLayerId) return null;
    return this.getGroupForFrame(this.state.selectedLayerId, frameIndex);
  }

  public interpolateGroupMotion(layerId: string, groupId: string): void {
    const layer = this.state.layers.find((l) => l.id === layerId);
    if (!layer || !layer.groups) return;
    const grp = layer.groups.find((g) => g.id === groupId);
    if (!grp) return;
    this.interpolateMotion(grp.start_frame, grp.end_frame);
  }

  // --- Multi-Animation Management ---
  public syncActiveAnimation(): void {
    const activeClip = this.state.animations.find((a) => a.id === this.state.activeAnimationId);
    if (activeClip) {
      activeClip.total_frames = this.state.meta.total_frames;
      activeClip.fps = this.state.meta.fps;
      activeClip.frame_pixels = { ...this.state.frame_pixels };
      if (!activeClip.layer_groups) activeClip.layer_groups = {};
      this.state.layers.forEach((l) => {
        activeClip.layer_groups![l.id] = l.groups ? [...l.groups] : [];
      });
    }
  }

  public addAnimation(name?: string): string {
    this.syncActiveAnimation();
    const count = this.state.animations.length + 1;
    const id = `anim_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const animName = name || `anim_${count}`;
    const newClip: AnimationClipData = {
      id,
      name: animName,
      fps: this.state.meta.fps,
      total_frames: 1,
      frame_pixels: { 0: {} },
      layer_groups: {},
    };
    this.state.animations.push(newClip);
    this.selectAnimation(id);
    return id;
  }

  public selectAnimation(animId: string): void {
    if (this.state.activeAnimationId === animId) return;
    this.syncActiveAnimation();

    const target = this.state.animations.find((a) => a.id === animId);
    if (!target) return;

    this.state.activeAnimationId = animId;
    this.state.meta.total_frames = target.total_frames;
    this.state.meta.fps = target.fps;
    this.state.frame_pixels = { ...target.frame_pixels };

    // Restore layer groups for this animation
    this.state.layers.forEach((l) => {
      l.groups = target.layer_groups?.[l.id] ? [...target.layer_groups[l.id]] : [];
    });

    this.updateJson();
    this.notify();
  }

  public renameAnimation(animId: string, name: string): void {
    const clip = this.state.animations.find((a) => a.id === animId);
    if (clip) {
      clip.name = name.trim() || clip.name;
      this.updateJson();
      this.notify();
    }
  }

  public deleteAnimation(animId: string): void {
    if (this.state.animations.length <= 1) return;
    const idx = this.state.animations.findIndex((a) => a.id === animId);
    if (idx === -1) return;

    this.state.animations.splice(idx, 1);
    if (this.state.activeAnimationId === animId) {
      const nextClip = this.state.animations[Math.max(0, idx - 1)];
      this.selectAnimation(nextClip.id);
    } else {
      this.updateJson();
      this.notify();
    }
  }

  private updateJson(): void {
    this.syncActiveAnimation();
    const obj = {
      version: '1.0.0',
      meta: this.state.meta,
      frame_pixels: this.state.frame_pixels,
      sheets: [],
      layers: this.state.layers,
      animations: this.state.animations,
      activeAnimationId: this.state.activeAnimationId,
    };
    this.state.rawJson = JSON.stringify(obj, null, 2);
  }

  public getRawJson(): string {
    return this.state.rawJson;
  }

  public getState(): ProjectState {
    return { ...this.state };
  }

  public subscribe(listener: ProjectListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const s = this.getState();
    this.listeners.forEach((l) => l(s));
  }
}

export const projectService = new ProjectService();
