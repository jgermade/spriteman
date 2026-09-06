/**
 * CanvasStage Component — Pixel Art Viewport with Pinch-to-Zoom & Two-Finger Pan Gestures.
 * STRICT RULE: Only imports from helpers/ or other components/.
 */
import {
  drawPixelGrid,
  drawPixels,
  drawPixelCursor,
  drawPivotGizmo,
  getLinePixels,
  CanvasRenderItem,
  getTouchDistance,
  getTouchMidpoint,
} from '../helpers/canvas.helper';

export interface CanvasStageOptions {
  canvasWidth?: number;
  canvasHeight?: number;
  zoom?: number;
  activeColor?: string;
  primaryColor?: string;
  secondaryColor?: string;
  onZoomChange?: (zoom: number) => void;
  onPaintPixel?: (x: number, y: number, color: string) => void;
  onPaintStroke?: (pixels: Array<{ x: number; y: number }>, color: string) => void;
  onSetPivot?: (x: number, y: number) => void;
}

export class CanvasStage {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private hudElement: HTMLElement;

  private spriteWidth: number;
  private spriteHeight: number;
  private zoom: number;
  private panX: number = 0;
  private panY: number = 0;

  // Active dual colors and pixel data
  private primaryColor: string = '#000000';
  private secondaryColor: string = '#ffffff';
  private framePixels: Record<string, string> = {};
  private onionPixels: Record<string, string> | null = null;
  private hoverPixel: { x: number; y: number } | null = null;

  // Modal interaction keys:
  // SHIFT = Grab Mode
  // CTRL = Zoom Mode
  // CMD (Meta) / ALT = Secondary Color Mode (Left Click acts as Right Click)
  private isShiftHeld: boolean = false;
  private isCtrlHeld: boolean = false;
  private isCmdHeld: boolean = false;
  private isAltHeld: boolean = false;
  private isMouseDown: boolean = false;

  // Painting interaction state
  private isPainting: boolean = false;
  private currentPaintColor: string = '#000000';
  private lastPaintedPixel: { x: number; y: number } | null = null;
  private currentStrokePixels: Array<{ x: number; y: number }> = [];

  // Zoom mode scrubby/click drag state
  private isCtrlZooming: boolean = false;
  private zoomOriginX: number = 0;
  private zoomOriginY: number = 0;
  private lastZoomY: number = 0;
  private hasDraggedZoom: boolean = false;

  // Cached render data (vector layer items if any)
  private lastItems: CanvasRenderItem[] = [];
  private lastSelectedId: string | null = null;
  private lastOnionItems: CanvasRenderItem[] | null = null;

  // Touch gesture state
  private initialTouchDistance: number = 0;
  private initialTouchZoom: number = 1;
  private lastTouchMidpoint: { x: number; y: number } | null = null;
  private isTwoFingerGesture: boolean = false;

  // Mouse pan state
  private isMousePanning: boolean = false;
  private mousePanStart: { x: number; y: number } = { x: 0, y: 0 };
  private onZoomChange?: (zoom: number) => void;
  private onPaintPixel?: (x: number, y: number, color: string) => void;
  private onPaintStroke?: (pixels: Array<{ x: number; y: number }>, color: string) => void;
  private onSetPivot?: (x: number, y: number) => void;

  // Layer pivot point (rotation axis)
  private pivot: { x: number; y: number } | null = null;
  private isSettingPivot: boolean = false;

  constructor(options: CanvasStageOptions = {}) {
    this.spriteWidth = options.canvasWidth ?? 64;
    this.spriteHeight = options.canvasHeight ?? 64;
    this.zoom = options.zoom ?? 6;
    this.primaryColor = options.primaryColor ?? options.activeColor ?? '#000000';
    this.secondaryColor = options.secondaryColor ?? '#ffffff';
    this.onZoomChange = options.onZoomChange;
    this.onPaintPixel = options.onPaintPixel;
    this.onPaintStroke = options.onPaintStroke;
    this.onSetPivot = options.onSetPivot;

    this.container = document.createElement('div');
    this.container.className = 'canvas-stage-root';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage-canvas-full';
    this.ctx = this.canvas.getContext('2d')!;

    this.hudElement = document.createElement('div');
    this.hudElement.className = 'canvas-hud-overlay';
    this.hudElement.innerHTML = `
      <div class="hud-left">
        <span class="hud-zoom-badge">${Math.round(this.zoom)}x</span>
        <button class="btn-hud-tool btn-reset-view" title="Recenter View (Double Tap/Click)">🎯 Reset</button>
      </div>
      <div class="hud-hint">Clic Izq: Color 1 • CMD/ALT o Clic Der: Color 2 • SHIFT: Agarre • CTRL: Zoom</div>
    `;

    this.container.appendChild(this.canvas);
    this.container.appendChild(this.hudElement);

    this.updateCursor();
    this.initGestureListeners();
    this.initResizeObserver();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public setCanvasSize(w: number, h: number): void {
    this.spriteWidth = w;
    this.spriteHeight = h;
    this.redraw();
  }

  public setColors(primary: string, secondary: string): void {
    this.primaryColor = primary;
    this.secondaryColor = secondary;
    this.redraw();
  }

  public setPrimaryColor(color: string): void {
    this.primaryColor = color;
    this.redraw();
  }

  public setSecondaryColor(color: string): void {
    this.secondaryColor = color;
    this.redraw();
  }

  public setActiveColor(color: string): void {
    this.primaryColor = color;
    this.redraw();
  }

  public setFramePixels(
    pixels: Record<string, string>,
    onionPixels?: Record<string, string> | null
  ): void {
    this.framePixels = { ...pixels };
    this.onionPixels = onionPixels ? { ...onionPixels } : null;
    this.redraw();
  }

  public setPivot(pivot: { x: number; y: number } | null): void {
    this.pivot = pivot ? { ...pivot } : null;
    this.redraw();
  }

  public setPivotMode(enabled: boolean): void {
    this.isSettingPivot = enabled;
    this.updateCursor();
    this.updateHud();
    this.redraw();
  }

  public isPivotMode(): boolean {
    return this.isSettingPivot;
  }

  public setZoom(zoom: number): void {
    this.zoom = Math.max(1, Math.min(zoom, 32));
    this.updateHud();
    this.redraw();
    this.onZoomChange?.(this.zoom);
  }

  public getZoom(): number {
    return this.zoom;
  }

  public resetView(): void {
    this.panX = 0;
    this.panY = 0;
    this.zoom = 6;
    this.updateHud();
    this.redraw();
    this.onZoomChange?.(this.zoom);
  }

  /**
   * Smoothly zooms anchored at a specific screen coordinate (clientX, clientY).
   */
  public zoomAtPoint(factor: number, clientX: number, clientY: number): void {
    const oldZoom = this.zoom;
    const newZoom = Math.max(1, Math.min(this.zoom * factor, 32));
    if (oldZoom === newZoom) return;

    const rect = this.canvas.getBoundingClientRect();
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Anchor point under cursor
    const scaleRatio = newZoom / oldZoom;
    this.panX = canvasX - w / 2 - (canvasX - w / 2 - this.panX) * scaleRatio;
    this.panY = canvasY - h / 2 - (canvasY - h / 2 - this.panY) * scaleRatio;

    this.zoom = newZoom;
    this.updateHud();
    this.redraw();
    this.onZoomChange?.(this.zoom);
  }

  private updateCursor(): void {
    if (this.isShiftHeld || this.isMousePanning) {
      this.canvas.style.cursor = this.isMouseDown ? 'grabbing' : 'grab';
    } else if (this.isCtrlHeld || this.isCtrlZooming) {
      this.canvas.style.cursor = this.isAltHeld ? 'zoom-out' : 'zoom-in';
    } else if (this.isSettingPivot) {
      this.canvas.style.cursor = 'crosshair';
    } else {
      this.canvas.style.cursor = 'crosshair';
    }
  }

  public getSpritePixelAtPointer(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const centerX = w / 2 + this.panX;
    const centerY = h / 2 + this.panY;

    const stageX = (canvasX - centerX) / this.zoom;
    const stageY = (canvasY - centerY) / this.zoom;

    const halfSw = this.spriteWidth / 2;
    const halfSh = this.spriteHeight / 2;

    const px = Math.floor(stageX + halfSw);
    const py = Math.floor(stageY + halfSh);

    if (px >= 0 && px < this.spriteWidth && py >= 0 && py < this.spriteHeight) {
      return { x: px, y: py };
    }
    return null;
  }

  private updateHud(): void {
    const badge = this.hudElement.querySelector('.hud-zoom-badge');
    if (badge) {
      badge.textContent = `${this.zoom.toFixed(1)}x`;
    }
    const hint = this.hudElement.querySelector('.hud-hint');
    if (hint) {
      hint.textContent = this.isSettingPivot
        ? '📍 Clic en el canvas para posicionar el eje de giro (pivote) • Clic en Pivote para salir'
        : (this.isCmdHeld || this.isAltHeld)
          ? '🎯 Modo Color 2 (Clic Secundario activo por CMD/ALT)'
          : 'Clic Izq: Color 1 • CMD/ALT o Clic Der: Color 2 • SHIFT: Agarre • CTRL: Zoom';
    }
  }

  private initResizeObserver(): void {
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.canvas.width = width;
          this.canvas.height = height;
          this.redraw();
        }
      }
    });
    ro.observe(this.container);
  }

  private initGestureListeners(): void {
    // 1. Window keyboard listeners for SHIFT (Grab), CTRL (Zoom), and CMD/ALT (Secondary color)
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      let changed = false;
      if (e.key === 'Shift' && !this.isShiftHeld) {
        this.isShiftHeld = true;
        changed = true;
      }
      if (e.key === 'Control' && !this.isCtrlHeld) {
        this.isCtrlHeld = true;
        changed = true;
      }
      if ((e.key === 'Meta' || e.metaKey) && !this.isCmdHeld) {
        this.isCmdHeld = true;
        changed = true;
      }
      if (e.key === 'Alt' && !this.isAltHeld) {
        this.isAltHeld = true;
        changed = true;
      }

      if (changed) {
        this.updateCursor();
        this.updateHud();
        this.redraw();
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      let changed = false;
      if (e.key === 'Shift') {
        this.isShiftHeld = false;
        changed = true;
      }
      if (e.key === 'Control') {
        this.isCtrlHeld = false;
        changed = true;
      }
      if (e.key === 'Meta') {
        this.isCmdHeld = false;
        changed = true;
      }
      if (e.key === 'Alt') {
        this.isAltHeld = false;
        changed = true;
      }

      if (changed) {
        this.updateCursor();
        this.updateHud();
        this.redraw();
      }
    });

    window.addEventListener('blur', () => {
      this.isShiftHeld = false;
      this.isCtrlHeld = false;
      this.isCmdHeld = false;
      this.isAltHeld = false;
      this.isMouseDown = false;
      this.isMousePanning = false;
      this.isCtrlZooming = false;
      this.updateCursor();
      this.updateHud();
      this.redraw();
    });

    // 2. Touch gestures (Pinch-to-zoom & Two-finger pan, Single-touch paint)
    this.container.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          this.isTwoFingerGesture = true;
          this.isPainting = false;
          this.initialTouchDistance = getTouchDistance(e.touches[0], e.touches[1]);
          this.initialTouchZoom = this.zoom;
          this.lastTouchMidpoint = getTouchMidpoint(e.touches[0], e.touches[1]);
        } else if (e.touches.length === 1 && !this.isTwoFingerGesture) {
          const pixel = this.getSpritePixelAtPointer(e.touches[0].clientX, e.touches[0].clientY);
          if (pixel) {
            this.isPainting = true;
            this.isEraseMode = false;
            this.lastPaintedPixel = pixel;
            this.currentStrokePixels = [pixel];
            this.framePixels[`${pixel.x},${pixel.y}`] = this.activeColor;
            this.onPaintPixel?.(pixel.x, pixel.y, false);
            this.redraw();
          }
        }
      },
      { passive: false }
    );

    this.container.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        if (this.isTwoFingerGesture && e.touches.length === 2) {
          e.preventDefault();

          // Pinch to Zoom
          const currentDist = getTouchDistance(e.touches[0], e.touches[1]);
          if (this.initialTouchDistance > 0) {
            const scale = currentDist / this.initialTouchDistance;
            this.zoom = Math.max(1, Math.min(this.initialTouchZoom * scale, 32));
            this.updateHud();
            this.onZoomChange?.(this.zoom);
          }

          // Two-Finger Pan
          const currentMid = getTouchMidpoint(e.touches[0], e.touches[1]);
          if (this.lastTouchMidpoint) {
            const dx = currentMid.x - this.lastTouchMidpoint.x;
            const dy = currentMid.y - this.lastTouchMidpoint.y;
            this.panX += dx;
            this.panY += dy;
          }
          this.lastTouchMidpoint = currentMid;

          this.redraw();
        } else if (this.isPainting && e.touches.length === 1) {
          e.preventDefault();
          const pixel = this.getSpritePixelAtPointer(e.touches[0].clientX, e.touches[0].clientY);
          if (pixel) {
            const points = this.lastPaintedPixel
              ? getLinePixels(this.lastPaintedPixel.x, this.lastPaintedPixel.y, pixel.x, pixel.y)
              : [pixel];
            for (const pt of points) {
              this.currentStrokePixels.push(pt);
              this.framePixels[`${pt.x},${pt.y}`] = this.activeColor;
            }
            this.lastPaintedPixel = pixel;
            this.redraw();
          }
        }
      },
      { passive: false }
    );

    const endTouch = (e: TouchEvent) => {
      if (this.isPainting) {
        this.isPainting = false;
        if (this.currentStrokePixels.length > 0) {
          this.onPaintStroke?.(this.currentStrokePixels, false);
          this.currentStrokePixels = [];
        }
        this.lastPaintedPixel = null;
      }
      this.isTwoFingerGesture = false;
      this.lastTouchMidpoint = null;
    };
    this.container.addEventListener('touchend', endTouch);
    this.container.addEventListener('touchcancel', endTouch);

    // 3. Trackpad and Mouse Wheel (Trackpad pinch & 2-finger scroll)
    this.container.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();

        if (e.ctrlKey || e.metaKey) {
          // Trackpad pinch gesture on macOS / Windows
          const zoomDelta = -e.deltaY * 0.02;
          this.zoomAtPoint(Math.exp(zoomDelta), e.clientX, e.clientY);
        } else {
          // Two-finger trackpad scroll or mouse wheel pan
          this.panX -= e.deltaX;
          this.panY -= e.deltaY;
          this.redraw();
        }
      },
      { passive: false }
    );

    // 4. Mouse Down: Grab, Zoom, or Paint
    this.container.addEventListener('mousedown', (e: MouseEvent) => {
      this.isMouseDown = true;
      this.isShiftHeld = e.shiftKey;
      this.isCtrlHeld = e.ctrlKey;
      this.isCmdHeld = e.metaKey;
      this.isAltHeld = e.altKey;

      // Mode A: SHIFT Grab / Pan Mode or Middle Mouse
      if (this.isShiftHeld || e.button === 1) {
        e.preventDefault();
        this.isMousePanning = true;
        this.mousePanStart = { x: e.clientX, y: e.clientY };
        this.updateCursor();
        return;
      }

      // Mode B: CTRL Zoom Mode
      if (this.isCtrlHeld) {
        e.preventDefault();
        this.isCtrlZooming = true;
        this.zoomOriginX = e.clientX;
        this.zoomOriginY = e.clientY;
        this.lastZoomY = e.clientY;
        this.hasDraggedZoom = false;
        this.updateCursor();
        return;
      }

      // Mode C: Pivot Placement Mode
      if (this.isSettingPivot && e.button === 0) {
        e.preventDefault();
        const pixel = this.getSpritePixelAtPointer(e.clientX, e.clientY);
        if (pixel) {
          this.pivot = { x: pixel.x, y: pixel.y };
          this.onSetPivot?.(pixel.x, pixel.y);
          this.redraw();
        }
        return;
      }

      // Mode D: Dual Color Painting Mode (Left click = Color 1, Right click or CMD/ALT + Left click = Color 2)
      if (e.button === 0 || e.button === 2) {
        e.preventDefault();
        const pixel = this.getSpritePixelAtPointer(e.clientX, e.clientY);
        if (pixel) {
          this.isPainting = true;
          const isRightClick = e.button === 2;
          const isCmdAlt = e.metaKey || this.isCmdHeld || e.altKey || this.isAltHeld;
          const useSecondary = isRightClick || isCmdAlt;
          const colorToPaint = useSecondary ? this.secondaryColor : this.primaryColor;
          this.currentPaintColor = colorToPaint;
          this.lastPaintedPixel = pixel;
          this.currentStrokePixels = [pixel];

          this.framePixels[`${pixel.x},${pixel.y}`] = colorToPaint;
          this.onPaintPixel?.(pixel.x, pixel.y, colorToPaint);
          this.redraw();
        }
      }
    });

    window.addEventListener('mousemove', (e: MouseEvent) => {
      this.isShiftHeld = e.shiftKey;
      this.isCtrlHeld = e.ctrlKey;
      this.isCmdHeld = e.metaKey;
      this.isAltHeld = e.altKey;

      // Handle Grab / Pan Mode Drag
      if (this.isMousePanning) {
        const dx = e.clientX - this.mousePanStart.x;
        const dy = e.clientY - this.mousePanStart.y;
        this.panX += dx;
        this.panY += dy;
        this.mousePanStart = { x: e.clientX, y: e.clientY };
        this.redraw();
        return;
      }

      // Handle Zoom Mode Drag (scrubby zoom)
      if (this.isCtrlZooming) {
        const dy = e.clientY - this.lastZoomY;
        if (Math.abs(e.clientY - this.zoomOriginY) > 3) {
          this.hasDraggedZoom = true;
        }
        this.lastZoomY = e.clientY;
        const factor = Math.exp(-dy * 0.015);
        this.zoomAtPoint(factor, this.zoomOriginX, this.zoomOriginY);
        return;
      }

      // Handle Painting Stroke Drag
      if (this.isPainting) {
        const pixel = this.getSpritePixelAtPointer(e.clientX, e.clientY);
        if (pixel) {
          if (!this.lastPaintedPixel || this.lastPaintedPixel.x !== pixel.x || this.lastPaintedPixel.y !== pixel.y) {
            const points = this.lastPaintedPixel
              ? getLinePixels(this.lastPaintedPixel.x, this.lastPaintedPixel.y, pixel.x, pixel.y)
              : [pixel];
            for (const pt of points) {
              this.currentStrokePixels.push(pt);
              this.framePixels[`${pt.x},${pt.y}`] = this.currentPaintColor;
            }
            this.lastPaintedPixel = pixel;
            this.hoverPixel = pixel;
            this.redraw();
          }
        }
        return;
      }

      // Hover cursor indicator (only when not in modifier modes)
      if (!this.isShiftHeld && !this.isCtrlHeld) {
        const hover = this.getSpritePixelAtPointer(e.clientX, e.clientY);
        const changed =
          (!this.hoverPixel && hover) ||
          (this.hoverPixel && !hover) ||
          (this.hoverPixel && hover && (this.hoverPixel.x !== hover.x || this.hoverPixel.y !== hover.y));
        if (changed) {
          this.hoverPixel = hover;
          this.redraw();
        }
      } else if (this.hoverPixel) {
        this.hoverPixel = null;
        this.redraw();
      }

      this.updateCursor();
    });

    this.container.addEventListener('mouseleave', () => {
      if (this.hoverPixel) {
        this.hoverPixel = null;
        this.redraw();
      }
    });

    window.addEventListener('mouseup', (e: MouseEvent) => {
      this.isMouseDown = false;

      if (this.isMousePanning) {
        this.isMousePanning = false;
      }

      if (this.isCtrlZooming) {
        // If clicked without dragging, perform instant click-zoom
        if (!this.hasDraggedZoom) {
          const factor = (e.altKey || this.isAltHeld) ? (1 / 1.35) : 1.35;
          this.zoomAtPoint(factor, e.clientX, e.clientY);
        }
        this.isCtrlZooming = false;
      }

      if (this.isPainting) {
        this.isPainting = false;
        if (this.currentStrokePixels.length > 0) {
          this.onPaintStroke?.(this.currentStrokePixels, this.currentPaintColor);
          this.currentStrokePixels = [];
        }
        this.lastPaintedPixel = null;
      }

      this.updateCursor();
    });

    // Prevent default context menu so right-click erase is smooth
    this.container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Double click to recenter
    this.container.addEventListener('dblclick', () => {
      this.resetView();
    });

    // Reset button in HUD
    this.hudElement.querySelector('.btn-reset-view')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resetView();
    });
  }

  public render(
    items: CanvasRenderItem[],
    selectedId?: string | null,
    onionItems?: CanvasRenderItem[] | null
  ): void {
    this.lastItems = items;
    this.lastSelectedId = selectedId ?? null;
    this.lastOnionItems = onionItems ?? null;
    this.redraw();
  }

  private redraw(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w <= 0 || h <= 0) return;

    this.ctx.clearRect(0, 0, w, h);

    const centerX = w / 2 + this.panX;
    const centerY = h / 2 + this.panY;

    // Viewport matrix with pan and zoom
    this.ctx.save();
    this.ctx.translate(centerX, centerY);
    this.ctx.scale(this.zoom, this.zoom);

    const halfSw = this.spriteWidth / 2;
    const halfSh = this.spriteHeight / 2;

    // 1. Draw light theme artboard with soft drop shadow
    this.ctx.save();
    this.ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
    this.ctx.shadowBlur = 16 / this.zoom;
    this.ctx.shadowOffsetY = 2 / this.zoom;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(-halfSw, -halfSh, this.spriteWidth, this.spriteHeight);
    this.ctx.restore();

    // 2. Draw pixel grid ("sólo rejilla") across the sprite artboard in soft slate
    drawPixelGrid(
      this.ctx,
      -halfSw,
      -halfSh,
      this.spriteWidth,
      this.spriteHeight,
      1 / this.zoom,
      'rgba(0, 0, 0, 0.08)'
    );

    // 3. Draw sprite artboard border
    this.ctx.strokeStyle = '#0284c7';
    this.ctx.lineWidth = 1.2 / this.zoom;
    this.ctx.strokeRect(-halfSw, -halfSh, this.spriteWidth, this.spriteHeight);

    // 4. Render onion skin ghost pixels (previous frame)
    if (this.onionPixels && Object.keys(this.onionPixels).length > 0) {
      drawPixels(this.ctx, -halfSw, -halfSh, this.onionPixels, 0.32, '#0284c7');
    }

    // 5. Render current frame painted pixels (strictly 1:1 sprite resolution)
    if (this.framePixels && Object.keys(this.framePixels).length > 0) {
      drawPixels(this.ctx, -halfSw, -halfSh, this.framePixels);
    }

    // 6. Draw rotation axis (pivot) gizmo if set on active layer
    if (this.pivot) {
      drawPivotGizmo(
        this.ctx,
        -halfSw,
        -halfSh,
        this.pivot.x,
        this.pivot.y,
        this.zoom,
        this.isSettingPivot
      );
    }

    // 7. Overlay subtle grid lines over painted pixels when sufficiently zoomed in
    if (this.zoom >= 3) {
      drawPixelGrid(
        this.ctx,
        -halfSw,
        -halfSh,
        this.spriteWidth,
        this.spriteHeight,
        1 / this.zoom,
        'rgba(0, 0, 0, 0.04)'
      );
    }

    // 8. Draw pixel cursor hover highlight (only in painting mode, not in grab/zoom mode)
    if (this.hoverPixel && !this.isShiftHeld && !this.isCtrlHeld) {
      const hoverColor = (this.isCmdHeld || this.isAltHeld) ? this.secondaryColor : this.primaryColor;
      drawPixelCursor(
        this.ctx,
        -halfSw,
        -halfSh,
        this.hoverPixel.x,
        this.hoverPixel.y,
        hoverColor,
        this.zoom
      );
    }

    this.ctx.restore();
  }
}

