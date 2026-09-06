/**
 * Animation playback and WASM evaluation service.
 * Powered by jq79 $reactive store.
 */
import { $reactive, ReactiveDeepData } from 'jq79';
import { ensureWasmInitialized, SpritemotionWasm, ResolvedFrame } from '../wasm/index';

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

    this.state.$onAny(() => {
      this.notify();
    });
  }

  public async init(projectJson: string): Promise<void> {
    await ensureWasmInitialized();
    this.engine = new SpritemotionWasm(projectJson);
    this.state.totalFrames = this.engine.total_frames();
    this.state.fps = this.engine.fps();
    this.seek(0);
  }

  public async reloadProject(projectJson: string): Promise<void> {
    if (this.engine) {
      this.engine.load_project(projectJson);
      this.state.totalFrames = this.engine.total_frames();
      this.state.fps = this.engine.fps();
      this.seek(this.state.currentFrame);
    } else {
      await this.init(projectJson);
    }
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
    const s = this.getState();
    this.listeners.forEach((l) => l(s));
  }

  public setFps(fps: number): void {
    this.state.fps = fps;
  }

  public setSpeedMultiplier(mult: number): void {
    this.state.speedMultiplier = mult;
  }

  public setOnionSkinEnabled(enabled: boolean): void {
    this.state.onionSkinEnabled = enabled;
    this.updateFrames();
  }

  public seek(frame: number): void {
    if (!this.engine) return;
    const maxFrame = Math.max(0, this.state.totalFrames - 0.01);
    this.state.currentFrame = Math.max(0, Math.min(frame, maxFrame));
    this.updateFrames();
  }

  private updateFrames(): void {
    if (!this.engine) return;

    // Current frame evaluation
    const json = this.engine.evaluate_frame_json(this.state.currentFrame);
    this.state.resolvedFrame = JSON.parse(json);

    // Onion skin evaluation (previous frame)
    if (this.state.onionSkinEnabled && this.state.totalFrames > 1) {
      const prevInt = (Math.round(this.state.currentFrame) - 1 + this.state.totalFrames) % this.state.totalFrames;
      const onionJson = this.engine.evaluate_frame_json(prevInt);
      this.state.onionSkinFrame = JSON.parse(onionJson);
    } else {
      this.state.onionSkinFrame = null;
    }
  }

  public play(): void {
    if (this.state.isPlaying) return;
    this.state.isPlaying = true;
    this.lastTimestamp = performance.now();
    this.loop(this.lastTimestamp);
  }

  public pause(): void {
    this.state.isPlaying = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
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
    let currentInt = Math.round(this.state.currentFrame);
    let next = (currentInt + delta + this.state.totalFrames) % this.state.totalFrames;
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
