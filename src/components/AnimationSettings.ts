/**
 * AnimationSettings Component.
 * STRICT RULE: Only imports from helpers/ or other components/.
 */
import { STANDARD_PIXEL_SIZES, CanvasSizePreset } from '../helpers/palette.helper';

export interface AnimationSettingsOptions {
  currentWidth?: number;
  currentHeight?: number;
  currentFps?: number;
  currentZoom?: number;
  onChangeCanvasSize?: (width: number, height: number) => void;
  onChangeFps?: (fps: number) => void;
  onChangeZoom?: (zoom: number) => void;
}

export class AnimationSettings {
  private element: HTMLElement;
  private width: number;
  private height: number;
  private fps: number;
  private zoom: number;

  private onChangeCanvasSize?: (w: number, h: number) => void;
  private onChangeFps?: (fps: number) => void;
  private onChangeZoom?: (zoom: number) => void;

  constructor(options: AnimationSettingsOptions = {}) {
    this.width = options.currentWidth ?? 64;
    this.height = options.currentHeight ?? 64;
    this.fps = options.currentFps ?? 12;
    this.zoom = options.currentZoom ?? 6;

    this.onChangeCanvasSize = options.onChangeCanvasSize;
    this.onChangeFps = options.onChangeFps;
    this.onChangeZoom = options.onChangeZoom;

    this.element = document.createElement('div');
    this.element.className = 'settings-panel';
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public setValues(width: number, height: number, fps: number, zoom: number): void {
    this.width = width;
    this.height = height;
    this.fps = fps;
    this.zoom = zoom;
    this.render();
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Sprite & Speed Settings</span>
      </div>
      <div class="settings-grid">
        <!-- Canvas Pixel Size -->
        <div class="setting-item">
          <label class="setting-label">Canvas Size (px):</label>
          <select class="setting-select size-select">
            ${STANDARD_PIXEL_SIZES.map(
              (p: CanvasSizePreset) =>
                `<option value="${p.width}x${p.height}" ${
                  p.width === this.width && p.height === this.height ? 'selected' : ''
                }>${p.label}</option>`
            ).join('')}
          </select>
        </div>

        <!-- FPS Speed -->
        <div class="setting-item">
          <label class="setting-label">Animation Speed (FPS):</label>
          <div class="fps-control-group">
            <select class="setting-select fps-select">
              <option value="6" ${this.fps === 6 ? 'selected' : ''}>6 FPS (Retro slow)</option>
              <option value="8" ${this.fps === 8 ? 'selected' : ''}>8 FPS (Classic walk)</option>
              <option value="12" ${this.fps === 12 ? 'selected' : ''}>12 FPS (Standard anime/game)</option>
              <option value="16" ${this.fps === 16 ? 'selected' : ''}>16 FPS (Smooth retro)</option>
              <option value="24" ${this.fps === 24 ? 'selected' : ''}>24 FPS (Cinematic)</option>
              <option value="30" ${this.fps === 30 ? 'selected' : ''}>30 FPS (Fluid)</option>
            </select>
          </div>
        </div>

        <!-- Pixel Zoom -->
        <div class="setting-item">
          <label class="setting-label">Pixel Zoom:</label>
          <select class="setting-select zoom-select">
            <option value="2" ${this.zoom === 2 ? 'selected' : ''}>2x</option>
            <option value="4" ${this.zoom === 4 ? 'selected' : ''}>4x</option>
            <option value="6" ${this.zoom === 6 ? 'selected' : ''}>6x</option>
            <option value="8" ${this.zoom === 8 ? 'selected' : ''}>8x</option>
            <option value="12" ${this.zoom === 12 ? 'selected' : ''}>12x</option>
          </select>
        </div>
      </div>
    `;

    const sizeSelect = this.element.querySelector('.size-select') as HTMLSelectElement;
    sizeSelect?.addEventListener('change', () => {
      const [w, h] = sizeSelect.value.split('x').map(Number);
      this.width = w;
      this.height = h;
      this.onChangeCanvasSize?.(w, h);
    });

    const fpsSelect = this.element.querySelector('.fps-select') as HTMLSelectElement;
    fpsSelect?.addEventListener('change', () => {
      const fps = parseInt(fpsSelect.value, 10);
      this.fps = fps;
      this.onChangeFps?.(fps);
    });

    const zoomSelect = this.element.querySelector('.zoom-select') as HTMLSelectElement;
    zoomSelect?.addEventListener('change', () => {
      const zoom = parseInt(zoomSelect.value, 10);
      this.zoom = zoom;
      this.onChangeZoom?.(zoom);
    });
  }
}
