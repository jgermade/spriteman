/**
 * CanvasService — viewport transform, pointer mapping and 2D canvas drawing.
 *
 * Two rules keep this cheap:
 *  1. Every mutation marks the view dirty and schedules **one** repaint per animation
 *     frame; setters that change nothing schedule nothing.
 *  2. Sprite content is composed into offscreen buffers at sprite resolution and only
 *     recomposed when the pixels actually change. A repaint is a handful of `drawImage`
 *     calls plus overlays, not one `fillRect` per painted pixel.
 *
 * The drawing context is expected to be scaled by `devicePixelRatio` by the caller, so
 * every coordinate here is in CSS pixels.
 */
import {
  buildClusterOutline,
  composePixelBuffer,
  drawClusterOutline,
  drawPivotGizmo,
  drawPixelCursor,
  drawPixelGrid,
  PixelMap,
} from '../helpers/canvas.helper';

export interface CanvasTransformState {
  zoom: number;
  panX: number;
  panY: number;
  spriteWidth: number;
  spriteHeight: number;
  primaryColor: string;
  secondaryColor: string;
  isPivotMode: boolean;
  pivot: { x: number; y: number } | null;
}

export interface RedrawModifiers {
  isShiftHeld?: boolean;
  isCtrlHeld?: boolean;
  isCmdHeld?: boolean;
  isAltHeld?: boolean;
  isDragging?: boolean;
}

export type CanvasChangeListener = () => void;

const ERASER = '__eraser__';
const MIN_ZOOM = 1;
const MAX_ZOOM = 32;
const GRID_MIN_ZOOM = 4;

const createBuffer = (): HTMLCanvasElement => document.createElement('canvas');

class CanvasService {
  private zoom: number = 6;
  private panX: number = 0;
  private panY: number = 0;
  private spriteWidth: number = 64;
  private spriteHeight: number = 64;

  private primaryColor: string = '#000000';
  private secondaryColor: string = '#ffffff';

  private framePixels: PixelMap = {};
  private onionPixels: PixelMap | null = null;
  private activeLayerPixels: PixelMap | null = null;
  private hoverPixel: { x: number; y: number } | null = null;
  private pivot: { x: number; y: number } | null = null;
  private isSettingPivot: boolean = false;

  // Offscreen buffers at sprite resolution, rebuilt only when their source changes.
  private spriteBuffer: HTMLCanvasElement | null = null;
  private onionBuffer: HTMLCanvasElement | null = null;
  private activeBuffer: HTMLCanvasElement | null = null;
  private spriteDirty: boolean = true;
  private onionDirty: boolean = true;
  private activeDirty: boolean = true;
  private activeOutline: Float32Array = new Float32Array(0);
  /** True once a local stroke has forked the frame map away from the project's copy. */
  private ownsFramePixels: boolean = false;
  /** The moving-layer highlight is only resolved when it is about to be drawn. */
  private activeStamp: string = '';
  private activeProvider: (() => PixelMap | null) | null = null;

  private listeners: Set<CanvasChangeListener> = new Set();
  private zoomListeners: Set<(zoom: number) => void> = new Set();
  private frameHandle: number | null = null;

  public subscribe(listener: CanvasChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public onZoom(listener: (zoom: number) => void): () => void {
    this.zoomListeners.add(listener);
    return () => this.zoomListeners.delete(listener);
  }

  /**
   * Marks the view dirty. Listeners run once on the next animation frame, however many
   * times this is called in between.
   */
  public notify(): void {
    if (this.frameHandle !== null) return;
    this.frameHandle = requestAnimationFrame(() => {
      this.frameHandle = null;
      for (const listener of this.listeners) {
        listener();
      }
    });
  }

  /** Runs any pending repaint immediately (used when a synchronous frame is required). */
  public flush(): void {
    if (this.frameHandle === null) return;
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private emitZoom(): void {
    for (const zoomListener of this.zoomListeners) {
      zoomListener(this.zoom);
    }
  }

  public getZoom(): number {
    return this.zoom;
  }

  public setZoom(zoom: number): void {
    const clamped = Math.max(MIN_ZOOM, Math.min(zoom, MAX_ZOOM));
    if (this.zoom === clamped) return;
    this.zoom = clamped;
    this.emitZoom();
    this.notify();
  }

  public getPan(): { x: number; y: number } {
    return { x: this.panX, y: this.panY };
  }

  public setPan(x: number, y: number): void {
    if (this.panX === x && this.panY === y) return;
    this.panX = x;
    this.panY = y;
    this.notify();
  }

  public pan(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.panX += dx;
    this.panY += dy;
    this.notify();
  }

  public setCanvasSize(w: number, h: number): void {
    const width = Math.max(1, w);
    const height = Math.max(1, h);
    if (this.spriteWidth === width && this.spriteHeight === height) return;
    this.spriteWidth = width;
    this.spriteHeight = height;
    this.spriteDirty = true;
    this.onionDirty = true;
    this.activeDirty = true;
    this.notify();
  }

  public getCanvasSize(): { width: number; height: number } {
    return { width: this.spriteWidth, height: this.spriteHeight };
  }

  public setColors(primary: string, secondary: string): void {
    if (this.primaryColor === primary && this.secondaryColor === secondary) return;
    this.primaryColor = primary;
    this.secondaryColor = secondary;
    this.notify();
  }

  public setPrimaryColor(color: string): void {
    if (this.primaryColor === color) return;
    this.primaryColor = color;
    this.notify();
  }

  public setSecondaryColor(color: string): void {
    if (this.secondaryColor === color) return;
    this.secondaryColor = color;
    this.notify();
  }

  public getColors(): { primary: string; secondary: string } {
    return { primary: this.primaryColor, secondary: this.secondaryColor };
  }

  /**
   * Adopts the pixel maps for the current frame. The maps are taken by reference — the
   * project service already hands over freshly composed objects — so a repaint costs no
   * clone. Buffers are only recomposed when a reference actually changes.
   */
  public setFramePixels(
    currentPixels: PixelMap,
    onionPixels?: PixelMap | null,
    activeLayerPixels?: PixelMap | null
  ): void {
    let changed = false;

    if (this.framePixels !== currentPixels) {
      this.framePixels = currentPixels || {};
      this.ownsFramePixels = false;
      this.spriteDirty = true;
      changed = true;
    }

    const nextOnion = onionPixels ?? null;
    if (this.onionPixels !== nextOnion) {
      this.onionPixels = nextOnion;
      this.onionDirty = true;
      changed = true;
    }

    if (activeLayerPixels !== undefined && this.activeLayerPixels !== activeLayerPixels) {
      this.activeLayerPixels = activeLayerPixels ?? null;
      this.activeDirty = true;
      changed = true;
    }

    if (changed) this.notify();
  }

  public setActiveLayerPixels(pixels: PixelMap | null): void {
    if (this.activeLayerPixels === pixels) return;
    this.activeLayerPixels = pixels;
    this.activeProvider = null;
    this.activeDirty = true;
    this.notify();
  }

  /**
   * Registers where the moving-layer highlight comes from, without computing it. The
   * provider only runs when the highlight is actually about to be drawn (SHIFT held), so
   * playback and ordinary painting never pay for it.
   */
  public setActiveLayerSource(stamp: string, provider: () => PixelMap | null): void {
    if (this.activeStamp === stamp) return;
    this.activeStamp = stamp;
    this.activeProvider = provider;
    this.activeLayerPixels = null;
    this.activeDirty = true;
  }

  public getActiveLayerPixels(): PixelMap | null {
    return this.activeLayerPixels;
  }

  public getFramePixels(): PixelMap {
    return this.framePixels;
  }

  /**
   * Paints or erases a single pixel in the working frame map for immediate feedback,
   * ahead of the project service committing the stroke.
   */
  public paintPixel(x: number, y: number, color: string | null): void {
    const key = `${x},${y}`;
    // Copy on write: the map handed over by the project service is not ours to mutate.
    if (!this.ownsFramePixels) {
      this.framePixels = { ...this.framePixels };
      this.ownsFramePixels = true;
    }
    if (color === null || color === ERASER) {
      if (this.framePixels[key] === undefined) return;
      delete this.framePixels[key];
    } else {
      if (this.framePixels[key] === color) return;
      this.framePixels[key] = color;
    }
    this.spriteDirty = true;
    this.notify();
  }

  public setPivot(pivot: { x: number; y: number } | null): void {
    const same =
      (!pivot && !this.pivot) ||
      (!!pivot && !!this.pivot && this.pivot.x === pivot.x && this.pivot.y === pivot.y);
    if (same) return;
    this.pivot = pivot ? { ...pivot } : null;
    this.notify();
  }

  public getPivot(): { x: number; y: number } | null {
    return this.pivot;
  }

  public setPivotMode(enabled: boolean): void {
    if (this.isSettingPivot === enabled) return;
    this.isSettingPivot = enabled;
    this.notify();
  }

  public isPivotMode(): boolean {
    return this.isSettingPivot;
  }

  public setHoverPixel(pixel: { x: number; y: number } | null): void {
    const same =
      (!pixel && !this.hoverPixel) ||
      (!!pixel && !!this.hoverPixel && this.hoverPixel.x === pixel.x && this.hoverPixel.y === pixel.y);
    if (same) return;
    this.hoverPixel = pixel;
    this.notify();
  }

  public getHoverPixel(): { x: number; y: number } | null {
    return this.hoverPixel;
  }

  public resetView(viewportWidth: number = 800, viewportHeight: number = 600): void {
    const padding = 60;
    const availW = Math.max(100, viewportWidth - padding * 2);
    const availH = Math.max(100, viewportHeight - padding * 2);
    const fitZoom = Math.floor(Math.min(availW / this.spriteWidth, availH / this.spriteHeight));
    this.zoom = Math.max(MIN_ZOOM, Math.min(fitZoom, 24)) || 6;
    this.panX = 0;
    this.panY = 0;
    this.emitZoom();
    this.notify();
  }

  public zoomAtPoint(factor: number, clientX: number, clientY: number, containerRect: DOMRect): void {
    const oldZoom = this.zoom;
    const newZoom = Math.max(MIN_ZOOM, Math.min(this.zoom * factor, MAX_ZOOM));
    if (newZoom === oldZoom) return;

    const mouseX = clientX - containerRect.left - containerRect.width / 2;
    const mouseY = clientY - containerRect.top - containerRect.height / 2;

    this.panX = mouseX - (mouseX - this.panX) * (newZoom / oldZoom);
    this.panY = mouseY - (mouseY - this.panY) * (newZoom / oldZoom);
    this.zoom = newZoom;

    this.emitZoom();
    this.notify();
  }

  /** Top-left corner of the artboard, in CSS pixels relative to the viewport element. */
  private getArtboardOrigin(viewWidth: number, viewHeight: number): { x: number; y: number } {
    return {
      x: viewWidth / 2 + this.panX - (this.spriteWidth * this.zoom) / 2,
      y: viewHeight / 2 + this.panY - (this.spriteHeight * this.zoom) / 2,
    };
  }

  public getSpritePixelAtPointer(
    clientX: number,
    clientY: number,
    containerRect: DOMRect
  ): { x: number; y: number } | null {
    const origin = this.getArtboardOrigin(containerRect.width, containerRect.height);
    const pixelX = Math.floor((clientX - containerRect.left - origin.x) / this.zoom);
    const pixelY = Math.floor((clientY - containerRect.top - origin.y) / this.zoom);

    if (pixelX >= 0 && pixelX < this.spriteWidth && pixelY >= 0 && pixelY < this.spriteHeight) {
      return { x: pixelX, y: pixelY };
    }
    return null;
  }

  private refreshBuffers(): void {
    if (this.spriteDirty) {
      this.spriteBuffer = this.spriteBuffer || createBuffer();
      composePixelBuffer(this.spriteBuffer, this.spriteWidth, this.spriteHeight, this.framePixels);
      this.spriteDirty = false;
    }
    if (this.onionDirty) {
      this.onionBuffer = this.onionBuffer || createBuffer();
      composePixelBuffer(this.onionBuffer, this.spriteWidth, this.spriteHeight, this.onionPixels, '#0284c7');
      this.onionDirty = false;
    }
  }

  /** Resolves and composes the moving-layer highlight on first use after a change. */
  private ensureActiveBuffer(): boolean {
    if (this.activeDirty) {
      if (this.activeProvider) this.activeLayerPixels = this.activeProvider();
      this.activeBuffer = this.activeBuffer || createBuffer();
      composePixelBuffer(this.activeBuffer, this.spriteWidth, this.spriteHeight, this.activeLayerPixels, '#38bdf8');
      this.activeOutline = buildClusterOutline(this.activeLayerPixels);
      this.activeDirty = false;
    }
    return !!this.activeLayerPixels && this.activeOutline.length > 0;
  }

  /**
   * Repaints the viewport. `w`/`h` are the CSS-pixel size of the canvas; the context is
   * expected to already carry the device-pixel-ratio scale.
   */
  public redraw(ctx: CanvasRenderingContext2D, w: number, h: number, modifiers: RedrawModifiers = {}): void {
    if (w <= 0 || h <= 0) return;

    this.refreshBuffers();
    ctx.clearRect(0, 0, w, h);

    const origin = this.getArtboardOrigin(w, h);
    const boardW = this.spriteWidth * this.zoom;
    const boardH = this.spriteHeight * this.zoom;

    // 1. Artboard with a soft drop shadow.
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(origin.x, origin.y, boardW, boardH);
    ctx.restore();

    ctx.imageSmoothingEnabled = false;

    // 2. Onion skin ghost, then the current frame — one blit each.
    if (this.onionBuffer && this.onionPixels) {
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.drawImage(this.onionBuffer, origin.x, origin.y, boardW, boardH);
      ctx.restore();
    }
    if (this.spriteBuffer) {
      ctx.drawImage(this.spriteBuffer, origin.x, origin.y, boardW, boardH);
    }

    // 3. Pixel grid — only once, and only when a cell is big enough to be worth it.
    if (this.zoom >= GRID_MIN_ZOOM) {
      drawPixelGrid(ctx, origin.x, origin.y, this.spriteWidth, this.spriteHeight, this.zoom, 'rgba(0, 0, 0, 0.08)');
    }

    // 4. Artboard border.
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1;
    ctx.strokeRect(origin.x + 0.5, origin.y + 0.5, boardW - 1, boardH - 1);

    // 5. Rotation axis (pivot) gizmo.
    if (this.pivot) {
      drawPivotGizmo(ctx, origin.x, origin.y, this.pivot.x, this.pivot.y, this.zoom, this.isSettingPivot);
    }

    // 6. Hover feedback: SHIFT highlights the layer cluster, CTRL a loose pixel,
    //    otherwise the paint cursor.
    if (!this.hoverPixel || modifiers.isDragging) {
      return;
    }

    if (modifiers.isShiftHeld) {
      if (this.ensureActiveBuffer() && this.activeBuffer) {
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.drawImage(this.activeBuffer, origin.x, origin.y, boardW, boardH);
        ctx.restore();
        drawClusterOutline(ctx, this.activeOutline, origin.x, origin.y, this.zoom, '#38bdf8', 2);
      }
      return;
    }

    if (modifiers.isCtrlHeld) {
      if (this.framePixels[`${this.hoverPixel.x},${this.hoverPixel.y}`]) {
        const x = origin.x + this.hoverPixel.x * this.zoom;
        const y = origin.y + this.hoverPixel.y * this.zoom;
        ctx.save();
        ctx.fillStyle = 'rgba(2, 132, 199, 0.25)';
        ctx.fillRect(x, y, this.zoom, this.zoom);
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, this.zoom, this.zoom);
        ctx.restore();
      }
      return;
    }

    const hoverColor = this.primaryColor === ERASER ? 'rgba(239, 68, 68, 0.5)' : this.primaryColor;
    drawPixelCursor(ctx, origin.x, origin.y, this.hoverPixel.x, this.hoverPixel.y, this.zoom, hoverColor);
  }
}

export const canvasService = new CanvasService();
