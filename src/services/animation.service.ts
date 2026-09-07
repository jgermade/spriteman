/**
 * Animation playback and WASM evaluation service.
 *
 * Notifications are emitted once per logical change instead of once per assigned
 * property, and the engine is only reloaded when the document it actually consumes has
 * changed — pixel edits leave the skeleton identical, so they cost nothing here.
 */
import { $reactive, ReactiveDeepData } from 'jq79';
import {
  ensureWasmInitialized,
  readFrameBuffer,
  EngineLayer,
  ResolvedFrame,
  SpritemotionWasm,
} from '../wasm/index';

export interface AnimationState {
  currentFrame: number;
  isPlaying: boolean;
  fps: number;
  speedMultiplier: number;
  totalFrames: number;
  resolvedFrame: ResolvedFrame | null;
  onionSkinFrame: ResolvedFrame | null;
  onionSkinEnabled: boolean;
}

type Listener = (state: AnimationState) => void;

class AnimationService {
  private engine: SpritemotionWasm | null = null;
  public readonly state: ReactiveDeepData<AnimationState>;
  private listeners: Set<Listener> = new Set();
  private animFrameId: number | null = null;
  private lastTimestamp: number = 0;
  /** Skeleton document currently loaded in the engine. */
  private loadedJson: string = '';
  /** Onion-skin frames are integer-indexed, so they can be cached per engine load. */
  private onionCache: Map<number, ResolvedFrame> = new Map();
  /** Layer table the packed frame records index into; refreshed on each engine load. */
  private engineLayers: EngineLayer[] = [];
  private itemStride: number = 10;
  /** Reused between ticks so steady-state playback allocates nothing. */
  private frameData: Float32Array = new Float32Array(0);

  constructor() {
    this.state = $reactive<AnimationState>({
      currentFrame: 0,
      isPlaying: false,
      fps: 12,
      speedMultiplier: 1.0,
      totalFrames: 4,
      resolvedFrame: null,
      onionSkinFrame: null,
      onionSkinEnabled: true,
    });
  }

  public async init(projectJson: string): Promise<void> {
    await ensureWasmInitialized();
    this.engine = new SpritemotionWasm(projectJson);
    this.loadedJson = projectJson;
    this.refreshEngineLayers();
    this.state.totalFrames = this.engine.total_frames();
    this.state.fps = this.engine.fps();
    this.seek(0);
  }

  /**
   * Reloads the engine document. Callers pass the skeleton produced by
   * `projectService.getEngineJson()`, so an edit that only touched pixels leaves this a
   * no-op instead of re-parsing the project in Rust.
   */
  public async reloadProject(projectJson: string): Promise<void> {
    if (!this.engine) {
      await this.init(projectJson);
      return;
    }
    if (projectJson === this.loadedJson) return;

    this.engine.load_project(projectJson);
    this.loadedJson = projectJson;
    this.refreshEngineLayers();
    this.state.totalFrames = this.engine.total_frames();
    this.state.fps = this.engine.fps();
    this.seek(this.state.currentFrame);
  }

  /** Drops cached evaluations without touching the engine document. */
  public invalidateFrames(): void {
    this.onionCache.clear();
  }

  /** Re-reads the layer table and stride that packed frame records refer to. */
  private refreshEngineLayers(): void {
    if (!this.engine) return;
    this.onionCache.clear();
    this.itemStride = this.engine.item_stride();
    try {
      this.engineLayers = JSON.parse(this.engine.layers_json());
    } catch {
      this.engineLayers = [];
    }
  }

  /** Evaluates one frame into a packed buffer. `reuse` avoids a per-tick allocation. */
  private evaluate(frame: number, reuse?: Float32Array): ResolvedFrame {
    const count = this.engine!.evaluate_frame(frame);
    const data = readFrameBuffer(this.engine!, count, this.itemStride, reuse);
    return { frame, count, stride: this.itemStride, data, layers: this.engineLayers };
  }

  public getState(): AnimationState {
    return { ...this.state };
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = this.getState();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  public setFps(fps: number): void {
    if (this.state.fps === fps) return;
    this.state.fps = fps;
    this.notify();
  }

  public setSpeedMultiplier(mult: number): void {
    if (this.state.speedMultiplier === mult) return;
    this.state.speedMultiplier = mult;
    this.notify();
  }

  public setOnionSkinEnabled(enabled: boolean): void {
    if (this.state.onionSkinEnabled === enabled) return;
    this.state.onionSkinEnabled = enabled;
    this.updateFrames();
    this.notify();
  }

  public seek(frame: number): void {
    if (!this.engine) return;
    const maxFrame = Math.max(0, this.state.totalFrames - 0.01);
    this.state.currentFrame = Math.max(0, Math.min(frame, maxFrame));
    this.updateFrames();
    this.notify();
  }

  /**
   * Evaluates the current frame once. The onion-skin frame is only evaluated when it is
   * actually shown, and it is cached because it always lands on an integer frame.
   */
  private updateFrames(): void {
    if (!this.engine) return;

    const resolved = this.evaluate(this.state.currentFrame, this.frameData);
    this.frameData = resolved.data;
    this.state.resolvedFrame = resolved;

    if (!this.state.onionSkinEnabled || this.state.totalFrames <= 1) {
      if (this.state.onionSkinFrame !== null) this.state.onionSkinFrame = null;
      return;
    }

    const prevInt = (Math.round(this.state.currentFrame) - 1 + this.state.totalFrames) % this.state.totalFrames;
    let cached = this.onionCache.get(prevInt);
    if (!cached) {
      // Cached frames own their buffer; the reusable one belongs to the current frame.
      cached = this.evaluate(prevInt);
      this.onionCache.set(prevInt, cached);
    }
    this.state.onionSkinFrame = cached;
  }

  public play(): void {
    if (this.state.isPlaying) return;
    this.state.isPlaying = true;
    this.lastTimestamp = performance.now();
    this.notify();
    this.animFrameId = requestAnimationFrame(this.loop);
  }

  public pause(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (!this.state.isPlaying) return;
    this.state.isPlaying = false;
    this.notify();
  }

  public togglePlay(): void {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  public step(delta: number): void {
    this.pause();
    const currentInt = Math.round(this.state.currentFrame);
    const next = (currentInt + delta + this.state.totalFrames) % this.state.totalFrames;
    this.seek(next);
  }

  private loop = (now: number) => {
    if (!this.state.isPlaying) return;
    const dt = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;

    const effectiveFps = this.state.fps * this.state.speedMultiplier;
    let next = this.state.currentFrame + dt * effectiveFps;
    if (next >= this.state.totalFrames) {
      next = next % this.state.totalFrames;
    }
    this.seek(next);

    this.animFrameId = requestAnimationFrame(this.loop);
  };
}

export const animationService = new AnimationService();
