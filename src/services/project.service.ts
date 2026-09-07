import { $reactive, $toRaw, ReactiveDeepData } from 'jq79';
import { decodeCel, encodeCel, EncodedCel } from '../helpers/cel.helper';
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
  /**
   * The clip's artwork, and the only place it lives: layer id -> frame index -> pixels.
   * The active clip's cels are mirrored into `layers[].frame_pixels` while it is being
   * edited, and written back here whenever the clip is left or the document serialized.
   */
  cels: Record<string, Record<number, Record<string, string>>>;
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
  relative_to_parent?: boolean;
  groups?: LayerFrameGroup[];
  frame_pixels?: Record<number, Record<string, string>>;
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
  sheets?: any[];
  layers: LayerData[];
  selectedLayerId: string | null;
  frame_pixels: Record<number, Record<string, string>>;
  animations: AnimationClipData[];
  activeAnimationId: string;
  rawJson: string;
}

type ProjectListener = (state: ProjectState) => void;

/**
 * A single undoable step. Pixel edits — by far the most frequent — store only the
 * affected layer frame maps; everything structural falls back to a document snapshot.
 */
type PixelChange = { layerId: string; frame: number; before: PixelMap; after: PixelMap };
type HistoryEntry =
  | { kind: 'snapshot'; json: string }
  | { kind: 'pixels'; changes: PixelChange[] };

export type PixelMap = Record<string, string>;

/**
 * Encodings already computed, keyed by the cel they came from. Cels are replaced rather
 * than mutated, so an unchanged cel keeps its identity and a save re-encodes only what
 * the user actually touched.
 */
const encodedCels = new WeakMap<PixelMap, { width: number; height: number; encoded: EncodedCel | null }>();

/** Shared empty map so an absent frame keeps a stable identity between reads. */
const EMPTY_PIXELS: PixelMap = {};

/** Format written by this build. v1 documents are migrated when they are opened. */
export const DOCUMENT_VERSION = '2.0.0';

class ProjectService {
  public readonly state: ReactiveDeepData<ProjectState>;

  constructor() {
    this.state = $reactive<ProjectState>({
      meta: {
        name: 'pixel_sprite_anim',
        fps: 12,
        total_frames: 4,
        canvas_width: 64,
        canvas_height: 64,
      },
      sheets: [],
      layers: [],
      selectedLayerId: null,
      frame_pixels: {},
      animations: [
        {
          id: 'anim_idle',
          name: 'idle',
          fps: 12,
          total_frames: 4,
          cels: {},
          layer_groups: {},
        },
      ],
      activeAnimationId: 'anim_idle',
      rawJson: '',
    });


  }
  private listeners: Set<ProjectListener> = new Set();
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private readonly maxHistoryLength = 50;
  /** Serialization is lazy: mutations only mark the cached JSON stale. */
  private jsonDirty: boolean = true;
  private engineJsonCache: string = '';
  private engineJsonDirty: boolean = true;
  /** Per-frame counters so thumbnails can be cached by content instead of by guesswork. */
  private frameRevisions: Record<number, number> = {};
  private framesEpoch: number = 0;
  private pendingPixelEdit: PixelChange[] | null = null;
  private lastHistoryStructural: boolean = true;
  private pixelDragBaseline: Record<string, string> | null = null;
  private draggedPixelInitial: { x: number; y: number; color: string } | null = null;

  public getCompositeFramePixels(frameIndex: number): Record<string, string> {
    const composite: Record<string, string> = {};
    const sortedLayers = [...this.state.layers].sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0));
    for (const layer of sortedLayers) {
      if (layer.visible === false) continue;
      const lPixels = layer.frame_pixels?.[frameIndex];
      if (lPixels && Object.keys(lPixels).length > 0) {
        Object.assign(composite, lPixels);
      }
    }
    return composite;
  }

  public getLayerFramePixels(layerId: string, frameIndex: number): Record<string, string> {
    const layer = this.state.layers.find((l) => l.id === layerId);
    return layer?.frame_pixels?.[frameIndex] || {};
  }

  private layerDragBaselines: Map<string, Record<string, string>> | null = null;
  private layerDragParsedBaselines: Map<string, Array<{ x: number; y: number; color: string }>> | null = null;
  private layerDragCumulativeDelta: { x: number; y: number } = { x: 0, y: 0 };
  private layerDragTargetId: string | null = null;
  private layerDragInitialFrame: number | null = null;
  private layerDragInitialTransform: any = null;
  private layerDragInitialPivots: Map<string, { x: number; y: number }> | null = null;
  private layerDragInitialTracks: any = null;

  public startLayerTranslation(layerId: string, frameIndex?: number): void {
    const targetLayer = this.state.layers.find((l) => l.id === layerId);
    if (!targetLayer) return;

    this.pushUndoSnapshot();

    const fIdx = typeof frameIndex === "number" ? frameIndex : 0;
    this.layerDragTargetId = layerId;
    this.layerDragInitialFrame = fIdx;
    this.layerDragCumulativeDelta = { x: 0, y: 0 };
    this.layerDragBaselines = new Map();
    this.layerDragInitialPivots = new Map();

    const getLinkedDescendants = (parentId: string): LayerData[] => {
      const children = this.state.layers.filter(
        (l) => l.parent_id === parentId && l.relative_to_parent !== false
      );
      let all = [...children];
      for (const ch of children) {
        all = all.concat(getLinkedDescendants(ch.id));
      }
      return all;
    };

    this.layerDragParsedBaselines = new Map();
    const movingLayers = [targetLayer, ...getLinkedDescendants(targetLayer.id)];
    for (const l of movingLayers) {
      if (!l.frame_pixels) l.frame_pixels = {};
      if (!l.frame_pixels[fIdx] && this.state.frame_pixels[fIdx] && l.id === targetLayer.id) {
        l.frame_pixels[fIdx] = { ...this.state.frame_pixels[fIdx] };
      }
      const baseMap = { ...(l.frame_pixels[fIdx] || {}) };
      this.layerDragBaselines.set(l.id, baseMap);

      const parsed: Array<{ x: number; y: number; color: string }> = [];
      for (const key in baseMap) {
        const comma = key.indexOf(",");
        if (comma === -1) continue;
        parsed.push({
          x: parseInt(key.slice(0, comma), 10),
          y: parseInt(key.slice(comma + 1), 10),
          color: baseMap[key],
        });
      }
      this.layerDragParsedBaselines.set(l.id, parsed);

      if (l.pivot) {
        this.layerDragInitialPivots.set(l.id, { ...l.pivot });
      }
    }

    if (targetLayer.default_transform) {
      this.layerDragInitialTransform = { ...targetLayer.default_transform };
    }
    if (targetLayer.tracks?.position) {
      this.layerDragInitialTracks = JSON.parse(JSON.stringify(targetLayer.tracks.position));
    }
  }

  public clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  private pushUndoSnapshot(): void {
    this.undoStack.push({ kind: 'snapshot', json: this.getRawJson() });
    if (this.undoStack.length > this.maxHistoryLength) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /**
   * Starts recording a pixel-only edit. Only the affected layer frame maps are captured,
   * so a brush stroke never serializes the document.
   */
  private beginPixelEdit(targets: Array<{ layerId: string; frame: number }>): void {
    const changes: PixelChange[] = [];
    for (const target of targets) {
      const layer = this.state.layers.find((l) => l.id === target.layerId);
      if (!layer) continue;
      if (!layer.frame_pixels) layer.frame_pixels = {};
      changes.push({
        layerId: target.layerId,
        frame: target.frame,
        before: { ...(layer.frame_pixels[target.frame] || {}) },
        after: {},
      });
    }
    this.pendingPixelEdit = changes.length > 0 ? changes : null;
  }

  /** Closes the recording opened by `beginPixelEdit` and pushes it onto the undo stack. */
  private commitPixelEdit(): void {
    const changes = this.pendingPixelEdit;
    this.pendingPixelEdit = null;
    if (!changes) return;

    let touched = false;
    for (const change of changes) {
      const layer = this.state.layers.find((l) => l.id === change.layerId);
      change.after = { ...(layer?.frame_pixels?.[change.frame] || {}) };
      const beforeKeys = Object.keys(change.before);
      const afterKeys = Object.keys(change.after);
      if (beforeKeys.length !== afterKeys.length) {
        touched = true;
        continue;
      }
      for (const key of afterKeys) {
        if (change.before[key] !== change.after[key]) {
          touched = true;
          break;
        }
      }
    }
    if (!touched) return;

    this.undoStack.push({ kind: 'pixels', changes });
    if (this.undoStack.length > this.maxHistoryLength) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  private applyPixelChanges(changes: PixelChange[], direction: 'before' | 'after'): void {
    const frames = new Set<number>();
    for (const change of changes) {
      const layer = this.state.layers.find((l) => l.id === change.layerId);
      if (!layer) continue;
      if (!layer.frame_pixels) layer.frame_pixels = {};
      layer.frame_pixels[change.frame] = { ...change[direction] };
      frames.add(change.frame);
    }
    for (const frame of frames) {
      this.recomposeFrame(frame);
    }
    this.updateJson();
    this.notify();
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;

    if (entry.kind === 'pixels') {
      this.redoStack.push(entry);
      this.lastHistoryStructural = false;
      this.applyPixelChanges(entry.changes, 'before');
      return true;
    }

    this.redoStack.push({ kind: 'snapshot', json: this.getRawJson() });
    this.lastHistoryStructural = true;
    this.setProjectJson(entry.json);
    return true;
  }

  /**
   * Whether the last undo/redo changed anything the WASM engine cares about. Pixel-only
   * steps never do, so the caller can skip reloading the engine.
   */
  public didLastHistoryChangeStructure(): boolean {
    return this.lastHistoryStructural;
  }

  public redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;

    if (entry.kind === 'pixels') {
      this.undoStack.push(entry);
      this.lastHistoryStructural = false;
      this.applyPixelChanges(entry.changes, 'after');
      return true;
    }

    this.undoStack.push({ kind: 'snapshot', json: this.getRawJson() });
    this.lastHistoryStructural = true;
    this.setProjectJson(entry.json);
    return true;
  }

  public async loadFromUrl(url: string): Promise<string> {
    const res = await fetch(url);
    const text = await res.text();
    this.clearHistory();
    this.setProjectJson(text);
    return text;
  }

  /**
   * Creates a brand new animation project with a single initial frame (total_frames: 1).
   */
  public createNewProject(name: string, width: number, height: number, fps: number = 12): string {
    this.clearHistory();
    const project = {
      version: DOCUMENT_VERSION,
      meta: {
        name: name.trim() || 'untitled_sprite',
        fps: fps,
        total_frames: 1, // Exactly 1 initial frame as requested
        canvas_width: width,
        canvas_height: height,
      },
      sheets: [],
      selectedLayerId: 'layer_base',
      animations: [
        {
          id: 'anim_default',
          name: 'idle',
          fps,
          total_frames: 1,
          layer_groups: {},
          cels: {},
        },
      ],
      activeAnimationId: 'anim_default',
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

    const json = JSON.stringify(project);
    this.setProjectJson(json);
    return json;
  }

  /**
   * Loads a document. v2 arrives with per-clip cels; v1 is migrated on the way in, so
   * existing projects and exported files keep opening.
   */
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

      // Read the clips before touching the layers: a v1 migration recovers artwork from
      // `parsed.layers[].frame_pixels`, and the layers below are the very same objects.
      const clips = this.isVersion2(parsed) ? this.readClipsV2(parsed) : this.migrateClipsV1(parsed);

      this.state.layers = parsed.layers || [];
      this.state.sheets = parsed.sheets || [];
      for (const layer of this.state.layers) {
        if (layer.visible === undefined) layer.visible = true;
        layer.frame_pixels = {};
      }
      this.state.animations = clips;
      this.state.activeAnimationId =
        clips.find((clip) => clip.id === parsed.activeAnimationId)?.id ?? clips[0].id;

      const activeClip = clips.find((clip) => clip.id === this.state.activeAnimationId)!;
      this.state.meta.total_frames = activeClip.total_frames ?? this.state.meta.total_frames;
      this.state.meta.fps = activeClip.fps ?? this.state.meta.fps;
      this.state.frame_pixels = {};
      this.adoptClipCels(activeClip);

      // The document just changed shape, so the cached serializations are stale.
      this.jsonDirty = true;
      this.engineJsonDirty = true;

      const validSelected = this.state.layers.some((l) => l.id === this.state.selectedLayerId);
      if (!validSelected && this.state.layers.length > 0) {
        this.state.selectedLayerId = this.state.layers[0].id;
      }
      this.notify();
    } catch (err) {
      console.error('Failed to parse project JSON:', err);
    }
  }

  private isVersion2(parsed: any): boolean {
    if (typeof parsed?.version === 'string' && parsed.version.startsWith('2.')) return true;
    // Be forgiving about a missing version: cels are unambiguous on their own.
    return Array.isArray(parsed?.animations) && parsed.animations.some((clip: any) => clip && clip.cels);
  }

  private readClipsV2(parsed: any): AnimationClipData[] {
    const width = this.state.meta.canvas_width;
    const height = this.state.meta.canvas_height;

    const clips: AnimationClipData[] = (parsed.animations || []).map((clip: any) => {
      const cels: Record<string, Record<number, PixelMap>> = {};
      for (const [layerId, frames] of Object.entries(clip.cels || {})) {
        const decoded: Record<number, PixelMap> = {};
        for (const [frameKey, encoded] of Object.entries(frames as Record<string, EncodedCel>)) {
          const pixels = decodeCel(encoded, width, height);
          if (Object.keys(pixels).length > 0) decoded[Number(frameKey)] = pixels;
        }
        if (Object.keys(decoded).length > 0) cels[layerId] = decoded;
      }
      return {
        id: clip.id,
        name: clip.name,
        fps: clip.fps ?? this.state.meta.fps,
        total_frames: clip.total_frames ?? this.state.meta.total_frames,
        cels,
        layer_groups: clip.layer_groups || {},
      };
    });

    return clips.length > 0 ? clips : [this.createEmptyClip()];
  }

  /**
   * Migrates a v1 document.
   *
   * v1 kept one set of layer pixels shared by every clip, plus a flattened composite per
   * clip. The active clip's artwork can be recovered per layer; for the others only the
   * composite survives, so it is placed on the bottom-most layer, which is where a
   * flattened image belongs.
   */
  private migrateClipsV1(parsed: any): AnimationClipData[] {
    const layerPixels: Record<string, Record<number, PixelMap>> = {};
    for (const layer of parsed.layers || []) {
      if (layer?.frame_pixels && Object.keys(layer.frame_pixels).length > 0) {
        layerPixels[layer.id] = layer.frame_pixels;
      }
    }

    const bottomLayerId = [...(parsed.layers || [])].sort(
      (a: any, b: any) => (a.z_index ?? 0) - (b.z_index ?? 0)
    )[0]?.id;

    const flatten = (composite: Record<number, PixelMap> | undefined): Record<string, Record<number, PixelMap>> => {
      if (!bottomLayerId || !composite) return {};
      const frames: Record<number, PixelMap> = {};
      for (const [frameKey, map] of Object.entries(composite)) {
        if (map && Object.keys(map).length > 0) frames[Number(frameKey)] = map;
      }
      return Object.keys(frames).length > 0 ? { [bottomLayerId]: frames } : {};
    };

    const legacyClips: any[] = Array.isArray(parsed.animations) && parsed.animations.length > 0 ? parsed.animations : [];
    if (legacyClips.length === 0) {
      const name = (this.state.meta.name || 'idle').replace(/^sample_character_anim$/, 'walk');
      const layerGroups: Record<string, LayerFrameGroup[]> = {};
      for (const layer of parsed.layers || []) {
        if (layer?.groups) layerGroups[layer.id] = [...layer.groups];
      }
      return [
        {
          id: 'anim_default',
          name,
          fps: this.state.meta.fps,
          total_frames: this.state.meta.total_frames,
          cels: Object.keys(layerPixels).length > 0 ? layerPixels : flatten(parsed.frame_pixels),
          layer_groups: layerGroups,
        },
      ];
    }

    const activeId = parsed.activeAnimationId || legacyClips[0].id;
    return legacyClips.map((clip: any) => ({
      id: clip.id,
      name: clip.name,
      fps: clip.fps ?? this.state.meta.fps,
      total_frames: clip.total_frames ?? this.state.meta.total_frames,
      cels:
        clip.id === activeId && Object.keys(layerPixels).length > 0
          ? layerPixels
          : flatten(clip.frame_pixels),
      layer_groups: clip.layer_groups || {},
    }));
  }

  private createEmptyClip(): AnimationClipData {
    return {
      id: 'anim_default',
      name: 'idle',
      fps: this.state.meta.fps,
      total_frames: this.state.meta.total_frames,
      cels: {},
      layer_groups: {},
    };
  }

  public selectLayer(layerId: string | null): void {
    if (this.state.layers.length === 0) {
      this.state.selectedLayerId = null;
    } else {
      const found = this.state.layers.find((l) => l.id === layerId);
      this.state.selectedLayerId = found ? found.id : this.state.layers[0].id;
    }
    this.notify();
  }

  public setCanvasSize(width: number, height: number): void {
    this.pushUndoSnapshot();
    this.state.meta.canvas_width = width;
    this.state.meta.canvas_height = height;
    this.updateJson();
    this.notify();
  }

  public setFps(fps: number): void {
    this.pushUndoSnapshot();
    this.state.meta.fps = fps;
    this.updateJson();
    this.notify();
  }

  public setLayerColor(layerId: string, color: string): void {
    const layer = this.state.layers.find((l) => l.id === layerId);
    if (layer) {
      this.pushUndoSnapshot();
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
    this.pushUndoSnapshot();
    this.invalidateAllFrames();
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
    this.state.layers.forEach((layer) => {
      if (layer.frame_pixels) {
        const nextLayerPixels: Record<number, Record<string, string>> = {};
        for (const [kStr, map] of Object.entries(layer.frame_pixels)) {
          const k = parseInt(kStr, 10);
          if (k < insertIndex) {
            nextLayerPixels[k] = map;
          } else {
            nextLayerPixels[k + 1] = map;
          }
        }
        if (copyPrevious) {
          const sourceFrameIndex = insertIndex > 0 ? insertIndex - 1 : (currentTotal > 0 ? 1 : 0);
          nextLayerPixels[insertIndex] = { ...(layer.frame_pixels[sourceFrameIndex] || {}) };
        } else {
          nextLayerPixels[insertIndex] = {};
        }
        layer.frame_pixels = nextLayerPixels;
      }
    });
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
    this.pushUndoSnapshot();
    this.invalidateAllFrames();
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

    this.state.layers.forEach((layer) => {
      if (layer.frame_pixels && layer.frame_pixels[frameIndex]) {
        layer.frame_pixels[newFrameIndex] = { ...layer.frame_pixels[frameIndex] };
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
    this.pushUndoSnapshot();
    this.invalidateAllFrames();

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
    this.state.layers.forEach((layer) => {
      if (layer.frame_pixels) {
        const nextLayerPixels: Record<number, Record<string, string>> = {};
        for (const [kStr, map] of Object.entries(layer.frame_pixels)) {
          const k = parseInt(kStr, 10);
          if (k < frameIndex) {
            nextLayerPixels[k] = map;
          } else if (k > frameIndex) {
            nextLayerPixels[k - 1] = map;
          }
        }
        layer.frame_pixels = nextLayerPixels;
      }
    });
    this.state.frame_pixels = nextPixels;

    this.state.meta.total_frames -= 1;
    this.updateJson();
    this.notify();
  }

  /**
   * Adds a new layer to the project.
   */
  public addLayer(name?: string, parentId: string | null = null): string {
    this.pushUndoSnapshot();
    const layerIndex = this.state.layers.length + 1;
    const id = `layer_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const layerName = name || `Layer ${layerIndex}`;
    const width = this.state.meta.canvas_width;
    const height = this.state.meta.canvas_height;

    const newLayer: LayerData = {
      id,
      name: layerName,
      frame_pixels: {},
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
   * Deletes a layer by id. Re-parents orphan child layers to the deleted layer's parent.
   */
  public deleteLayer(layerId: string): boolean {
    if (this.state.layers.length <= 1) return false;
    const idx = this.state.layers.findIndex((l) => l.id === layerId);
    if (idx === -1) return false;

    this.pushUndoSnapshot();
    const deleted = this.state.layers[idx];
    this.state.layers.forEach((l) => {
      if (l.parent_id === layerId) {
        l.parent_id = deleted.parent_id;
      }
    });

    this.state.layers.splice(idx, 1);
    this.state.layers.forEach((l, i) => {
      l.z_index = i;
    });

    if (this.state.selectedLayerId === layerId || !this.state.layers.some((l) => l.id === this.state.selectedLayerId)) {
      const nextLayer = this.state.layers[Math.min(idx, this.state.layers.length - 1)] || this.state.layers[0];
      this.state.selectedLayerId = nextLayer ? nextLayer.id : null;
    }

    this.updateJson();
    this.notify();
    return true;
  }

  /**
   * Renames a layer.
   */
  public renameLayer(layerId: string, name: string): void {
    const layer = this.state.layers.find((l) => l.id === layerId);
    const trimmed = name.trim();
    if (layer && trimmed && layer.name !== trimmed) {
      this.pushUndoSnapshot();
      layer.name = trimmed;
      this.updateJson();
      this.notify();
    }
  }

  /**
   * Toggles visibility of a layer (show / hide).
   */
  public toggleLayerVisibility(layerId: string): void {
    const layer = this.state.layers.find((l) => l.id === layerId);
    if (layer) {
      this.pushUndoSnapshot();
      layer.visible = layer.visible === false ? true : false;
      this.state.layers = [...this.state.layers];
      const total = this.state.meta.total_frames || Object.keys(this.state.frame_pixels).length || 1;
      for (let fIdx = 0; fIdx < total; fIdx++) {
        this.recomposeFrame(fIdx);
      }
      this.updateJson();
      this.notify();
    }
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

    this.pushUndoSnapshot();
    const [movedLayer] = this.state.layers.splice(currentIndex, 1);
    movedLayer.parent_id = newParentId;

    const clampedIndex = Math.max(0, Math.min(this.state.layers.length, targetIndex));
    this.state.layers.splice(clampedIndex, 0, movedLayer);

    // Normalize z_index across all layers
    this.state.layers.forEach((l, idx) => {
      l.z_index = idx;
    });

    this.state.layers = [...this.state.layers];
    const total = this.state.meta.total_frames || Object.keys(this.state.frame_pixels).length || 1;
    for (let fIdx = 0; fIdx < total; fIdx++) {
      this.recomposeFrame(fIdx);
    }
    this.updateJson();
    this.notify();
  }

  public moveLayerUp(layerId: string): void {
    const idx = this.state.layers.findIndex((l) => l.id === layerId);
    if (idx < this.state.layers.length - 1) {
      this.reorderLayer(layerId, idx + 1);
    }
  }

  public moveLayerDown(layerId: string): void {
    const idx = this.state.layers.findIndex((l) => l.id === layerId);
    if (idx > 0) {
      this.reorderLayer(layerId, idx - 1);
    }
  }

  /**
   * Updates the rotation axis (pivot) of a specific layer in canvas/sprite coordinates.
   */
  public setLayerPivot(layerId: string, pivotX: number, pivotY: number): void {
    const layer = this.state.layers.find((l) => l.id === layerId);
    if (layer) {
      this.pushUndoSnapshot();
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
   * Toggles whether a child layer's transform is relative to its parent layer.
   */
  public toggleLayerRelative(layerId: string): void {
    const layer = this.state.layers.find((l) => l.id === layerId);
    if (layer && layer.parent_id) {
      this.pushUndoSnapshot();
      layer.relative_to_parent = layer.relative_to_parent === false ? true : false;
      this.updateJson();
      this.notify();
    }
  }

  /**
   * Translates a layer by (deltaX, deltaY) pixels.
   * Modifies the default_transform and any keyframes on the current frame.
   */
  public translateLayer(
    layerId: string,
    deltaX: number,
    deltaY: number,
    frameIndex?: number,
    isFinal: boolean = true
  ): void {
    const targetLayer = this.state.layers.find((l) => l.id === layerId);
    if (!targetLayer) return;

    const fIdx = typeof frameIndex === "number" ? frameIndex : (this.layerDragInitialFrame ?? 0);

    if (!this.layerDragBaselines || this.layerDragTargetId !== layerId) {
      this.startLayerTranslation(layerId, fIdx);
    }

    this.layerDragCumulativeDelta.x += deltaX;
    this.layerDragCumulativeDelta.y += deltaY;

    const totalDx = this.layerDragCumulativeDelta.x;
    const totalDy = this.layerDragCumulativeDelta.y;
    const w = this.state.meta.canvas_width;
    const h = this.state.meta.canvas_height;

    // Shift pixels from pre-parsed baseline (zero string parsing/splitting, zero cumulative clipping or drift)
    const parsedMap = this.layerDragParsedBaselines || new Map();
    for (const [lId, parsed] of parsedMap) {
      const l = this.state.layers.find((lyr) => lyr.id === lId);
      if (!l) continue;
      const newMap: Record<string, string> = {};
      for (let i = 0; i < parsed.length; i++) {
        const p = parsed[i];
        const nx = p.x + totalDx;
        const ny = p.y + totalDy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          newMap[`${nx},${ny}`] = p.color;
        }
      }
      if (!l.frame_pixels) l.frame_pixels = {};
      l.frame_pixels[fIdx] = newMap;

      const initPivot = this.layerDragInitialPivots?.get(lId);
      if (initPivot && l.pivot) {
        l.pivot.x = initPivot.x + totalDx;
        l.pivot.y = initPivot.y + totalDy;
      }
    }

    // Recompute composite for the current frame
    this.recomposeFrame(fIdx);

    if (isFinal) {
      if (this.layerDragInitialTransform) {
        targetLayer.default_transform.x = this.layerDragInitialTransform.x + totalDx;
        targetLayer.default_transform.y = this.layerDragInitialTransform.y + totalDy;
      }
      if (this.layerDragInitialTracks && targetLayer.tracks?.position) {
        targetLayer.tracks.position = JSON.parse(JSON.stringify(this.layerDragInitialTracks));
        const kf = targetLayer.tracks.position.find((k: any) => Math.round(k.frame) === Math.round(fIdx));
        if (kf) {
          kf.value = [kf.value[0] + totalDx, kf.value[1] + totalDy];
        } else if (targetLayer.default_transform) {
          targetLayer.tracks.position.push({
            frame: fIdx,
            value: [targetLayer.default_transform.x, targetLayer.default_transform.y],
            easing: "linear",
          });
          targetLayer.tracks.position.sort((a: any, b: any) => a.frame - b.frame);
        }
      }

      this.autoRecalculateGroupsForFrame(fIdx);
      this.updateJson();
      this.layerDragBaselines = null;
      this.layerDragParsedBaselines = null;
      this.layerDragTargetId = null;
      this.layerDragInitialPivots = null;
      this.layerDragInitialTransform = null;
      this.layerDragInitialTracks = null;

      this.notify();
    }
  }

  public startPixelMove(layerId: string, frameIndex: number, x: number, y: number): void {
    const targetLayer = this.state.layers.find((l) => l.id === layerId) ||
      this.state.layers.find((l) => l.id === this.state.selectedLayerId) ||
      this.state.layers[0];
    if (!targetLayer) return;

    if (!targetLayer.frame_pixels) targetLayer.frame_pixels = {};
    if (!targetLayer.frame_pixels[frameIndex] && this.state.frame_pixels[frameIndex]) {
      targetLayer.frame_pixels[frameIndex] = { ...this.state.frame_pixels[frameIndex] };
    }
    if (!targetLayer.frame_pixels[frameIndex]) {
      targetLayer.frame_pixels[frameIndex] = {};
    }

    this.beginPixelEdit([{ layerId: targetLayer.id, frame: frameIndex }]);
    this.pixelDragBaseline = { ...targetLayer.frame_pixels[frameIndex] };
    const color = this.pixelDragBaseline[`${x},${y}`] || "";
    this.draggedPixelInitial = { x, y, color };
  }

  public movePixel(
    layerId: string,
    frameIndex: number,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    isFinal: boolean = true
  ): void {
    const targetLayer = this.state.layers.find((l) => l.id === layerId) ||
      this.state.layers.find((l) => l.id === this.state.selectedLayerId) ||
      this.state.layers[0];
    if (!targetLayer || !this.pixelDragBaseline || !this.draggedPixelInitial) return;

    const w = this.state.meta.canvas_width;
    const h = this.state.meta.canvas_height;
    const clampedToX = Math.max(0, Math.min(w - 1, toX));
    const clampedToY = Math.max(0, Math.min(h - 1, toY));

    const map: Record<string, string> = { ...this.pixelDragBaseline };
    delete map[`${fromX},${fromY}`];
    if (this.draggedPixelInitial.color) {
      map[`${clampedToX},${clampedToY}`] = this.draggedPixelInitial.color;
    }

    targetLayer.frame_pixels[frameIndex] = map;
    this.recomposeFrame(frameIndex);

    if (isFinal) {
      this.pixelDragBaseline = null;
      this.draggedPixelInitial = null;
      this.commitPixelEdit();
      this.autoRecalculateGroupsForFrame(frameIndex);
      this.updateJson();
    }
    this.notify();
  }

  public cancelPixelMove(layerId: string, frameIndex: number): void {
    if (!this.pixelDragBaseline) return;
    const targetLayer = this.state.layers.find((l) => l.id === layerId) ||
      this.state.layers.find((l) => l.id === this.state.selectedLayerId) ||
      this.state.layers[0];
    if (targetLayer) {
      targetLayer.frame_pixels[frameIndex] = { ...this.pixelDragBaseline };
      this.recomposeFrame(frameIndex);
    }
    this.pixelDragBaseline = null;
    this.draggedPixelInitial = null;
    this.notify();
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
    this.pushUndoSnapshot();
    this.invalidateAllFrames();

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
    this.state.layers.forEach((layer) => {
      if (layer.frame_pixels) {
        const framesArray: Array<Record<string, string>> = [];
        for (let i = 0; i < total; i++) {
          framesArray.push({ ...(layer.frame_pixels[i] || {}) });
        }
        const [movedPixels] = framesArray.splice(fromIndex, 1);
        framesArray.splice(toIndex, 0, movedPixels);
        const nextLayerPixels: Record<number, Record<string, string>> = {};
        framesArray.forEach((pxMap, idx) => {
          nextLayerPixels[idx] = pxMap;
        });
        layer.frame_pixels = nextLayerPixels;
      }
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
  /**
   * Fills the frames between two keyframes by translating the artwork along the centroid
   * path. The in-betweens are written into the owning layer, not just into the composite,
   * so they survive a save and a reload.
   */
  public interpolateMotion(startFrame: number, endFrame: number, layerId?: string | null): void {
    if (endFrame - startFrame < 2) return;

    const targetLayer =
      (layerId && this.state.layers.find((l) => l.id === layerId)) ||
      this.state.layers.find((l) => l.id === this.state.selectedLayerId) ||
      this.state.layers[0];
    if (!targetLayer) return;
    if (!targetLayer.frame_pixels) targetLayer.frame_pixels = {};

    const startPixels = targetLayer.frame_pixels[startFrame] || {};
    const endPixels = targetLayer.frame_pixels[endFrame] || {};

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

      targetLayer.frame_pixels[f] = interpolated;
      this.recomposeFrame(f);
    }

    this.updateJson();
    this.notify();
  }

  /**
   * The already-composed pixel map for a frame. Unlike `getFramePixels` this never
   * recomposes: the composite is maintained on edit, so the render path can read it
   * straight through. Its identity changes exactly when the frame content changes.
   */
  public getFrameComposite(frameIndex: number): PixelMap {
    return ($toRaw(this.state.frame_pixels[frameIndex]) as PixelMap) || EMPTY_PIXELS;
  }

  public getFramePixels(frameIndex: number, layerId?: string | null): Record<string, string> {
    if (layerId) {
      return this.getLayerFramePixels(layerId, frameIndex);
    }
    return this.getCompositeFramePixels(frameIndex);
  }

  public getActiveLayerMovingPixels(frameIndex: number): Record<string, string> {
    const targetLayer = this.state.layers.find((l) => l.id === this.state.selectedLayerId) || this.state.layers[0];
    if (!targetLayer) return {};

    const getLinkedDescendants = (parentId: string): LayerData[] => {
      const children = this.state.layers.filter(
        (l) => l.parent_id === parentId && l.relative_to_parent !== false
      );
      let all = [...children];
      for (const ch of children) {
        all = all.concat(getLinkedDescendants(ch.id));
      }
      return all;
    };

    const movingLayers = [targetLayer, ...getLinkedDescendants(targetLayer.id)];
    const movingPixels: Record<string, string> = {};

    for (const l of movingLayers) {
      if (l.visible === false) continue;
      const map = l.frame_pixels?.[frameIndex];
      if (map && Object.keys(map).length > 0) {
        Object.assign(movingPixels, map);
      } else if (l.id === targetLayer.id && this.state.frame_pixels?.[frameIndex] && Object.keys(movingPixels).length === 0) {
        Object.assign(movingPixels, this.state.frame_pixels[frameIndex]);
      }
    }

    return movingPixels;
  }

  private autoRecalculateGroupsForFrame(frameIndex: number): void {
    for (const layer of this.state.layers) {
      if (!layer.groups) continue;
      for (const grp of layer.groups) {
        if (grp.start_frame === frameIndex || grp.end_frame === frameIndex) {
          this.interpolateMotion(grp.start_frame, grp.end_frame, layer.id);
        }
      }
    }
  }

  public setPixel(frameIndex: number, x: number, y: number, color: string, layerId?: string): void {
    const targetLayer = (layerId && this.state.layers.find((l) => l.id === layerId)) ||
      this.state.layers.find((l) => l.id === this.state.selectedLayerId) ||
      this.state.layers[0];
    if (targetLayer) this.beginPixelEdit([{ layerId: targetLayer.id, frame: frameIndex }]);
    if (targetLayer) {
      if (!targetLayer.frame_pixels) targetLayer.frame_pixels = {};
      // Cels are replaced rather than mutated, so an unchanged cel keeps its identity and
      // with it its cached encoding.
      targetLayer.frame_pixels[frameIndex] = { ...(targetLayer.frame_pixels[frameIndex] || {}), [`${x},${y}`]: color };
    }
    this.commitPixelEdit();
    this.recomposeFrame(frameIndex);
    this.autoRecalculateGroupsForFrame(frameIndex);
    this.updateJson();
    this.notify();
  }

  public setPixels(frameIndex: number, pixels: Array<{ x: number; y: number }>, color: string, layerId?: string): void {
    const targetLayer = (layerId && this.state.layers.find((l) => l.id === layerId)) ||
      this.state.layers.find((l) => l.id === this.state.selectedLayerId) ||
      this.state.layers[0];
    if (targetLayer) this.beginPixelEdit([{ layerId: targetLayer.id, frame: frameIndex }]);
    if (targetLayer) {
      if (!targetLayer.frame_pixels) targetLayer.frame_pixels = {};
      const map = { ...(targetLayer.frame_pixels[frameIndex] || {}) };
      for (const p of pixels) {
        map[`${p.x},${p.y}`] = color;
      }
      targetLayer.frame_pixels[frameIndex] = map;
    }
    this.commitPixelEdit();
    this.recomposeFrame(frameIndex);
    this.autoRecalculateGroupsForFrame(frameIndex);
    this.updateJson();
    this.notify();
  }

  public erasePixel(frameIndex: number, x: number, y: number, layerId?: string): void {
    const targetLayer = (layerId && this.state.layers.find((l) => l.id === layerId)) ||
      this.state.layers.find((l) => l.id === this.state.selectedLayerId) ||
      this.state.layers[0];
    if (targetLayer && targetLayer.frame_pixels?.[frameIndex]) {
      this.beginPixelEdit([{ layerId: targetLayer.id, frame: frameIndex }]);
      const map = { ...targetLayer.frame_pixels[frameIndex] };
      delete map[`${x},${y}`];
      targetLayer.frame_pixels[frameIndex] = map;
      this.commitPixelEdit();
      this.recomposeFrame(frameIndex);
      this.autoRecalculateGroupsForFrame(frameIndex);
      this.updateJson();
      this.notify();
    }
  }

  public erasePixels(frameIndex: number, pixels: Array<{ x: number; y: number }>, layerId?: string): void {
    const targetLayer = (layerId && this.state.layers.find((l) => l.id === layerId)) ||
      this.state.layers.find((l) => l.id === this.state.selectedLayerId) ||
      this.state.layers[0];
    if (targetLayer && targetLayer.frame_pixels?.[frameIndex]) {
      this.beginPixelEdit([{ layerId: targetLayer.id, frame: frameIndex }]);
      const map = { ...targetLayer.frame_pixels[frameIndex] };
      for (const p of pixels) {
        delete map[`${p.x},${p.y}`];
      }
      targetLayer.frame_pixels[frameIndex] = map;
      this.commitPixelEdit();
      this.recomposeFrame(frameIndex);
      this.autoRecalculateGroupsForFrame(frameIndex);
      this.updateJson();
      this.notify();
    }
  }

  // --- Layer Frame Groups ---
  public createFrameGroup(layerId: string, startFrame: number, endFrame: number, name?: string): LayerFrameGroup | null {
    const layer = this.state.layers.find((l) => l.id === layerId);
    if (!layer) return null;
    this.pushUndoSnapshot();
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

    // Automatically calculate interpolation across the newly created group!
    this.interpolateMotion(start, end, layerId);

    this.updateJson();
    this.notify();
    return newGroup;
  }

  public deleteFrameGroup(layerId: string, groupId: string): void {
    const layer = this.state.layers.find((l) => l.id === layerId);
    if (!layer || !layer.groups) return;
    this.pushUndoSnapshot();
    layer.groups = layer.groups.filter((g) => g.id !== groupId);
    this.updateJson();
    this.notify();
  }

  public setGroupPivot(layerId: string, groupId: string, pivotX: number, pivotY: number): void {
    const layer = this.state.layers.find((l) => l.id === layerId);
    if (!layer || !layer.groups) return;
    const grp = layer.groups.find((g) => g.id === groupId);
    if (grp) {
      this.pushUndoSnapshot();
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
    this.interpolateMotion(grp.start_frame, grp.end_frame, layerId);
  }

  // --- Multi-Animation Management ---
  /**
   * Writes the working set back into the active clip. Artwork is stored per layer, so
   * clips no longer share one set of layer pixels — painting in one cannot leak into
   * another.
   */
  public syncActiveAnimation(): void {
    const activeClip = this.state.animations.find((a) => a.id === this.state.activeAnimationId);
    if (!activeClip) return;

    activeClip.total_frames = this.state.meta.total_frames;
    activeClip.fps = this.state.meta.fps;
    if (!activeClip.layer_groups) activeClip.layer_groups = {};

    const cels: Record<string, Record<number, PixelMap>> = {};
    this.state.layers.forEach((layer) => {
      activeClip.layer_groups![layer.id] = layer.groups ? [...layer.groups] : [];
      const frames = layer.frame_pixels || {};
      const kept: Record<number, PixelMap> = {};
      for (const [frameKey, map] of Object.entries(frames)) {
        if (map && Object.keys(map).length > 0) kept[Number(frameKey)] = map as PixelMap;
      }
      if (Object.keys(kept).length > 0) cels[layer.id] = kept;
    });
    activeClip.cels = cels;
  }

  /** Loads a clip's cels into the layers, replacing whatever the previous clip left. */
  private adoptClipCels(clip: AnimationClipData): void {
    this.state.layers.forEach((layer) => {
      const cels = clip.cels?.[layer.id];
      layer.frame_pixels = cels ? { ...cels } : {};
      layer.groups = clip.layer_groups?.[layer.id] ? [...clip.layer_groups[layer.id]] : [];
    });
    this.invalidateAllFrames();
    const total = Math.max(1, this.state.meta.total_frames || 1);
    for (let i = 0; i < total; i++) {
      this.recomposeFrame(i);
    }
  }

  public addAnimation(name?: string): string {
    this.pushUndoSnapshot();
    this.syncActiveAnimation();
    const count = this.state.animations.length + 1;
    const id = `anim_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const animName = name || `anim_${count}`;
    const newClip: AnimationClipData = {
      id,
      name: animName,
      fps: this.state.meta.fps,
      total_frames: 1,
      cels: {},
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
    this.state.frame_pixels = {};
    this.adoptClipCels(target);

    this.updateJson();
    this.notify();
  }

  public renameAnimation(animId: string, name: string): void {
    const clip = this.state.animations.find((a) => a.id === animId);
    if (clip) {
      this.pushUndoSnapshot();
      clip.name = name.trim() || clip.name;
      this.updateJson();
      this.notify();
    }
  }

  public deleteAnimation(animId: string): void {
    if (this.state.animations.length <= 1) return;
    const idx = this.state.animations.findIndex((a) => a.id === animId);
    if (idx === -1) return;

    this.pushUndoSnapshot();
    this.state.animations.splice(idx, 1);
    if (this.state.activeAnimationId === animId) {
      const nextClip = this.state.animations[Math.max(0, idx - 1)];
      this.selectAnimation(nextClip.id);
    } else {
      this.updateJson();
      this.notify();
    }
  }

  /**
   * Marks the serialized document stale. Serializing a full project costs tens of
   * milliseconds and grows with the sprite, so it happens on demand (save, export,
   * snapshot) rather than on every edit.
   */
  private updateJson(): void {
    this.syncActiveClipMeta();
    this.jsonDirty = true;
    this.engineJsonDirty = true;
  }

  /** Cheap half of the clip sync, kept eager so animation tabs never show stale counts. */
  private syncActiveClipMeta(): void {
    const activeClip = this.state.animations.find((a) => a.id === this.state.activeAnimationId);
    if (!activeClip) return;
    if (activeClip.total_frames !== this.state.meta.total_frames) {
      activeClip.total_frames = this.state.meta.total_frames;
    }
    if (activeClip.fps !== this.state.meta.fps) {
      activeClip.fps = this.state.meta.fps;
    }
  }

  /**
   * Serializes the document in the v2 format: layers carry the skeleton, each animation
   * clip owns its artwork as run-length encoded cels, and the composite is left out
   * because it is derived from the cels on load.
   */
  private buildJson(): string {
    this.syncActiveAnimation();
    const width = this.state.meta.canvas_width;
    const height = this.state.meta.canvas_height;

    const layers = this.state.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      parent_id: layer.parent_id ?? null,
      z_index: layer.z_index ?? 0,
      visible: layer.visible !== false,
      sheet_id: layer.sheet_id,
      default_frame: layer.default_frame,
      color: layer.color,
      default_transform: layer.default_transform,
      pivot: layer.pivot,
      relative_to_parent: layer.relative_to_parent !== false,
      tracks: layer.tracks,
    }));

    const animations = this.state.animations.map((clip) => {
      const cels: Record<string, Record<number, EncodedCel>> = {};
      for (const [layerId, frames] of Object.entries(clip.cels || {})) {
        const encodedFrames: Record<number, EncodedCel> = {};
        for (const [frameKey, map] of Object.entries(frames)) {
          const cel = map as PixelMap;
          let cached = encodedCels.get(cel);
          // The canvas size is part of the encoding, so a resize invalidates the cache.
          if (!cached || cached.width !== width || cached.height !== height) {
            cached = { width, height, encoded: encodeCel(cel, width, height) };
            encodedCels.set(cel, cached);
          }
          if (cached.encoded) encodedFrames[Number(frameKey)] = cached.encoded;
        }
        if (Object.keys(encodedFrames).length > 0) cels[layerId] = encodedFrames;
      }
      return {
        id: clip.id,
        name: clip.name,
        fps: clip.fps,
        total_frames: clip.total_frames,
        layer_groups: clip.layer_groups || {},
        cels,
      };
    });

    return JSON.stringify({
      version: DOCUMENT_VERSION,
      meta: this.state.meta,
      sheets: this.state.sheets || [],
      layers,
      animations,
      activeAnimationId: this.state.activeAnimationId,
    });
  }

  /** The full document, including pixels. Built on demand and cached until the next edit. */
  public getRawJson(): string {
    if (this.jsonDirty || !this.state.rawJson) {
      this.state.rawJson = this.buildJson();
      this.jsonDirty = false;
    }
    return this.state.rawJson;
  }

  /**
   * The document as the WASM engine actually consumes it: metadata, sheets and layer
   * transforms/tracks. `frame_pixels` is deliberately left out because the Rust `Layer`
   * struct does not declare it — shipping pixels means parsing megabytes to discard them.
   */
  public getEngineJson(): string {
    if (!this.engineJsonDirty && this.engineJsonCache) return this.engineJsonCache;
    const layers = this.state.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      parent_id: layer.parent_id ?? null,
      z_index: layer.z_index ?? 0,
      visible: layer.visible !== false,
      sheet_id: layer.sheet_id,
      default_frame: layer.default_frame,
      default_transform: layer.default_transform,
      relative_to_parent: layer.relative_to_parent !== false,
      tracks: layer.tracks,
    }));
    this.engineJsonCache = JSON.stringify({
      version: '1.0.0',
      meta: this.state.meta,
      sheets: this.state.sheets || [],
      layers,
    });
    this.engineJsonDirty = false;
    return this.engineJsonCache;
  }

  /**
   * Recomposes one frame from its layers and stamps it so thumbnail caches invalidate
   * exactly when the content changed.
   */
  private recomposeFrame(frameIndex: number): void {
    this.state.frame_pixels[frameIndex] = this.getCompositeFramePixels(frameIndex);
    this.frameRevisions[frameIndex] = (this.frameRevisions[frameIndex] || 0) + 1;
  }

  /** Invalidates every frame stamp; used when frames are inserted, removed or reordered. */
  private invalidateAllFrames(): void {
    this.framesEpoch++;
    this.frameRevisions = {};
  }

  /** Per-frame content stamps, used as thumbnail cache keys. */
  public getFrameRevisions(): number[] {
    const total = Math.max(1, this.state.meta.total_frames || 1);
    const revisions: number[] = new Array(total);
    for (let i = 0; i < total; i++) {
      revisions[i] = this.frameRevisions[i] || 0;
    }
    return revisions;
  }

  /**
   * Cheap signature of everything the layer tree renders, so the tree is only rebuilt
   * when one of those properties actually changed.
   */
  public getLayersStamp(): string {
    return this.state.layers
      .map(
        (l) =>
          `${l.id}|${l.name}|${l.parent_id ?? ''}|${l.z_index ?? 0}|${l.visible !== false ? 1 : 0}` +
          `|${l.relative_to_parent !== false ? 1 : 0}|${l.groups?.length ?? 0}`
      )
      .join(';');
  }

  /** Compact signature of all frame stamps, cheap to compare between updates. */
  public getFramesStamp(): string {
    return `${this.framesEpoch}:${this.getFrameRevisions().join(',')}`;
  }

  public getState(): ProjectState {
    return { ...this.state, layers: [...this.state.layers] };
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
