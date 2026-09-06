/**
 * CanvasService — Viewport transform, coordinate calculations, and 2D canvas drawing logic.
 */
import {
  drawPixelGrid,
  drawPixels,
  drawPixelCursor,
  drawPivotGizmo,
  getLinePixels,
  CanvasRenderItem,
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

export type CanvasChangeListener = () => void;

class CanvasService {
  private zoom: number = 6;
  private panX: number = 0;
  private panY: number = 0;
  private spriteWidth: number = 64;
  private spriteHeight: number = 64;

  private primaryColor: string = '#000000';
  private secondaryColor: string = '#ffffff';
  private framePixels: Record<string, string> = {};
  private onionPixels: Record<string, string> | null = null;
  private hoverPixel: { x: number; y: number } | null = null;
  private activeLayerPixels: Record<string, string> | null = null;
  private pivot: { x: number; y: number } | null = null;
  private isSettingPivot: boolean = false;

  private lastItems: CanvasRenderItem[] = [];
  private lastSelectedId: string | null = null;
  private lastOnionItems: CanvasRenderItem[] | null = null;

  private listeners: Set<CanvasChangeListener> = new Set();
  private zoomListeners: Set<(zoom: number) => void> = new Set();

  public subscribe(listener: CanvasChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public onZoom(listener: (zoom: number) => void): () => void {
    this.zoomListeners.add(listener);
    return () => this.zoomListeners.delete(listener);
  }

  public notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public getZoom(): number {
    return this.zoom;
  }

  public setZoom(zoom: number): void {
    const clamped = Math.max(1, Math.min(zoom, 32));
    if (this.zoom !== clamped) {
      this.zoom = clamped;
      for (const zl of this.zoomListeners) {
        zl(this.zoom);
      }
      this.notify();
    }
  }

  public getPan(): { x: number; y: number } {
    return { x: this.panX, y: this.panY };
  }

  public setPan(x: number, y: number): void {
    this.panX = x;
    this.panY = y;
    this.notify();
  }

  public pan(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
    this.notify();
  }

  public setCanvasSize(w: number, h: number): void {
    this.spriteWidth = Math.max(1, w);
    this.spriteHeight = Math.max(1, h);
    this.notify();
  }

  public getCanvasSize(): { width: number; height: number } {
    return { width: this.spriteWidth, height: this.spriteHeight };
  }

  public setColors(primary: string, secondary: string): void {
    this.primaryColor = primary;
    this.secondaryColor = secondary;
    this.notify();
  }

  public setPrimaryColor(color: string): void {
    this.primaryColor = color;
    this.notify();
  }

  public setSecondaryColor(color: string): void {
    this.secondaryColor = color;
    this.notify();
  }

  public getColors(): { primary: string; secondary: string } {
    return { primary: this.primaryColor, secondary: this.secondaryColor };
  }

  public setFramePixels(
    currentPixels: Record<string, string>,
    onionPixels?: Record<string, string> | null,
    activeLayerPixels?: Record<string, string> | null
  ): void {
    this.framePixels = { ...currentPixels };
    this.onionPixels = onionPixels ? { ...onionPixels } : null;
    if (activeLayerPixels !== undefined) {
      this.activeLayerPixels = activeLayerPixels ? { ...activeLayerPixels } : null;
    }
    this.notify();
  }

  public setActiveLayerPixels(pixels: Record<string, string> | null): void {
    this.activeLayerPixels = pixels ? { ...pixels } : null;
    this.notify();
  }

  public getActiveLayerPixels(): Record<string, string> | null {
    return this.activeLayerPixels;
  }

  public getFramePixels(): Record<string, string> {
    return this.framePixels;
  }

  public setPivot(pivot: { x: number; y: number } | null): void {
    this.pivot = pivot ? { ...pivot } : null;
    this.notify();
  }

  public getPivot(): { x: number; y: number } | null {
    return this.pivot;
  }

  public setPivotMode(enabled: boolean): void {
    this.isSettingPivot = enabled;
    this.notify();
  }

  public isPivotMode(): boolean {
    return this.isSettingPivot;
  }

  public setHoverPixel(pixel: { x: number; y: number } | null): void {
    const changed =
      (!this.hoverPixel && pixel) ||
      (this.hoverPixel && !pixel) ||
      (this.hoverPixel && pixel && (this.hoverPixel.x !== pixel.x || this.hoverPixel.y !== pixel.y));
    if (changed) {
      this.hoverPixel = pixel;
      this.notify();
    }
  }

  public getHoverPixel(): { x: number; y: number } | null {
    return this.hoverPixel;
  }

  public resetView(viewportWidth: number = 800, viewportHeight: number = 600): void {
    const padding = 60;
    const availW = Math.max(100, viewportWidth - padding * 2);
    const availH = Math.max(100, viewportHeight - padding * 2);
    const fitZoom = Math.floor(Math.min(availW / this.spriteWidth, availH / this.spriteHeight));
    this.zoom = Math.max(1, Math.min(fitZoom, 24)) || 6;
    this.panX = 0;
    this.panY = 0;
    for (const zl of this.zoomListeners) {
      zl(this.zoom);
    }
    this.notify();
  }

  public zoomAtPoint(
    factor: number,
    clientX: number,
    clientY: number,
    containerRect: DOMRect,
    canvasWidth?: number,
    canvasHeight?: number
  ): void {
    const oldZoom = this.zoom;
    const newZoom = Math.max(1, Math.min(this.zoom * factor, 32));
    if (newZoom === oldZoom) return;

    const w = typeof canvasWidth === "number" && canvasWidth > 0 ? canvasWidth : containerRect.width;
    const h = typeof canvasHeight === "number" && canvasHeight > 0 ? canvasHeight : containerRect.height;

    const mouseX = clientX - containerRect.left - w / 2;
    const mouseY = clientY - containerRect.top - h / 2;

    this.panX = mouseX - (mouseX - this.panX) * (newZoom / oldZoom);
    this.panY = mouseY - (mouseY - this.panY) * (newZoom / oldZoom);
    this.zoom = newZoom;

    for (const zl of this.zoomListeners) {
      zl(this.zoom);
    }
    this.notify();
  }

  public getSpritePixelAtPointer(
    clientX: number,
    clientY: number,
    containerRect: DOMRect,
    canvasWidth?: number,
    canvasHeight?: number
  ): { x: number; y: number } | null {
    const mouseX = clientX - containerRect.left;
    const mouseY = clientY - containerRect.top;

    const w = typeof canvasWidth === "number" && canvasWidth > 0 ? canvasWidth : containerRect.width;
    const h = typeof canvasHeight === "number" && canvasHeight > 0 ? canvasHeight : containerRect.height;

    const centerX = w / 2 + this.panX;
    const centerY = h / 2 + this.panY;

    const artboardLeft = centerX - (this.spriteWidth * this.zoom) / 2;
    const artboardTop = centerY - (this.spriteHeight * this.zoom) / 2;

    const pixelX = Math.floor((mouseX - artboardLeft) / this.zoom);
    const pixelY = Math.floor((mouseY - artboardTop) / this.zoom);

    if (pixelX >= 0 && pixelX < this.spriteWidth && pixelY >= 0 && pixelY < this.spriteHeight) {
      return { x: pixelX, y: pixelY };
    }
    return null;
  }

  public render(
    items: CanvasRenderItem[],
    selectedId?: string | null,
    onionItems?: CanvasRenderItem[] | null
  ): void {
    this.lastItems = items;
    this.lastSelectedId = selectedId ?? null;
    this.lastOnionItems = onionItems ?? null;
    this.notify();
  }

  public redraw(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    modifiers: { isShiftHeld?: boolean; isCtrlHeld?: boolean; isCmdHeld?: boolean; isAltHeld?: boolean; isDragging?: boolean } = {}
  ): void {
    if (w <= 0 || h <= 0) return;

    ctx.clearRect(0, 0, w, h);

    const centerX = w / 2 + this.panX;
    const centerY = h / 2 + this.panY;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(this.zoom, this.zoom);

    const halfSw = this.spriteWidth / 2;
    const halfSh = this.spriteHeight / 2;

    // 1. Draw light theme artboard with soft drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
    ctx.shadowBlur = 16 / this.zoom;
    ctx.shadowOffsetY = 2 / this.zoom;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-halfSw, -halfSh, this.spriteWidth, this.spriteHeight);
    ctx.restore();

    // 2. Draw pixel grid across the sprite artboard
    drawPixelGrid(
      ctx,
      -halfSw,
      -halfSh,
      this.spriteWidth,
      this.spriteHeight,
      1 / this.zoom,
      'rgba(0, 0, 0, 0.08)'
    );

    // 3. Draw sprite artboard border
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.2 / this.zoom;
    ctx.strokeRect(-halfSw, -halfSh, this.spriteWidth, this.spriteHeight);

    // 4. Render onion skin ghost pixels
    if (this.onionPixels && Object.keys(this.onionPixels).length > 0) {
      drawPixels(ctx, -halfSw, -halfSh, this.onionPixels, 0.32, '#0284c7');
    }

    // 5. Render current frame painted pixels
    if (this.framePixels && Object.keys(this.framePixels).length > 0) {
      drawPixels(ctx, -halfSw, -halfSh, this.framePixels);
    }

    // 6. Draw rotation axis (pivot) gizmo
    if (this.pivot) {
      drawPivotGizmo(
        ctx,
        -halfSw,
        -halfSh,
        this.pivot.x,
        this.pivot.y,
        this.zoom,
        this.isSettingPivot
      );
    }

    // 7. Overlay subtle grid lines
    if (this.zoom >= 3) {
      drawPixelGrid(
        ctx,
        -halfSw,
        -halfSh,
        this.spriteWidth,
        this.spriteHeight,
        1 / this.zoom,
        'rgba(0, 0, 0, 0.04)'
      );
    }

    // 8. Draw hover highlight: SHIFT (layer & linked children), CTRL (loose pixel), or default cursor
    if (this.hoverPixel && !modifiers.isDragging) {
      if (modifiers.isShiftHeld) {
        const moving = this.activeLayerPixels || {};
        const keys = Object.keys(moving);
        if (keys.length > 0) {
          ctx.save();
          // Fast packed integer coordinates Set for neighbor checks (no string allocations)
          const coordSet = new Set<number>();
          const parsedPixels: Array<{ x: number; y: number }> = [];
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const comma = key.indexOf(",");
            if (comma === -1) continue;
            const px = parseInt(key.slice(0, comma), 10);
            const py = parseInt(key.slice(comma + 1), 10);
            coordSet.add((px & 0xffff) | ((py & 0xffff) << 16));
            parsedPixels.push({ x: px, y: py });
          }

          // 1. Subtle tint over moving layer pixels
          ctx.fillStyle = "rgba(56, 189, 248, 0.18)";
          for (let i = 0; i < parsedPixels.length; i++) {
            const p = parsedPixels[i];
            ctx.fillRect(-halfSw + p.x, -halfSh + p.y, 1, 1);
          }

          // 2. High-contrast perimeter border around the moving cluster
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 1.8 / this.zoom;
          ctx.beginPath();
          for (let i = 0; i < parsedPixels.length; i++) {
            const p = parsedPixels[i];
            const px = p.x;
            const py = p.y;
            const x = -halfSw + px;
            const y = -halfSh + py;

            // Top
            if (!coordSet.has((px & 0xffff) | (((py - 1) & 0xffff) << 16))) {
              ctx.moveTo(x, y);
              ctx.lineTo(x + 1, y);
            }
            // Bottom
            if (!coordSet.has((px & 0xffff) | (((py + 1) & 0xffff) << 16))) {
              ctx.moveTo(x, y + 1);
              ctx.lineTo(x + 1, y + 1);
            }
            // Left
            if (!coordSet.has(((px - 1) & 0xffff) | ((py & 0xffff) << 16))) {
              ctx.moveTo(x, y);
              ctx.lineTo(x, y + 1);
            }
            // Right
            if (!coordSet.has(((px + 1) & 0xffff) | ((py & 0xffff) << 16))) {
              ctx.moveTo(x + 1, y);
              ctx.lineTo(x + 1, y + 1);
            }
          }
          ctx.stroke();
          ctx.restore();
        }
      } else if (modifiers.isCtrlHeld) {
        const hasPixel = this.framePixels[`${this.hoverPixel.x},${this.hoverPixel.y}`];
        if (hasPixel) {
          ctx.save();
          ctx.strokeStyle = "#0284c7";
          ctx.lineWidth = 1.5 / this.zoom;
          ctx.strokeRect(-halfSw + this.hoverPixel.x, -halfSh + this.hoverPixel.y, 1, 1);
          ctx.fillStyle = "rgba(2, 132, 199, 0.25)";
          ctx.fillRect(-halfSw + this.hoverPixel.x, -halfSh + this.hoverPixel.y, 1, 1);
          ctx.restore();
        }
      } else {
        let hoverColor = this.primaryColor;
        if (hoverColor === "__eraser__") hoverColor = "rgba(239, 68, 68, 0.5)";
        drawPixelCursor(
          ctx,
          -halfSw,
          -halfSh,
          this.hoverPixel.x,
          this.hoverPixel.y,
          hoverColor,
          this.zoom
        );
      }
    }

    ctx.restore();
  }
}

export const canvasService = new CanvasService();
