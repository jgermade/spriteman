/**
 * PixelPalette Component — Dual Color Palette (Primary: Left Click, Secondary: Right Click / CMD / ALT).
 * STRICT RULE: Only imports from helpers/ or other components/.
 */
import { PIXEL_ART_PALETTE } from '../helpers/palette.helper';

export interface PixelPaletteOptions {
  primaryColor?: string;
  secondaryColor?: string;
  onSelectPrimary?: (color: string) => void;
  onSelectSecondary?: (color: string) => void;
  onSelectColors?: (primary: string, secondary: string) => void;
}

export class PixelPalette {
  private element: HTMLElement;
  private primaryColor: string;
  private secondaryColor: string;

  private onSelectPrimary?: (color: string) => void;
  private onSelectSecondary?: (color: string) => void;
  private onSelectColors?: (primary: string, secondary: string) => void;

  constructor(options: PixelPaletteOptions = {}) {
    this.primaryColor = options.primaryColor ?? PIXEL_ART_PALETTE[0];
    this.secondaryColor = options.secondaryColor ?? '#ffffff';
    this.onSelectPrimary = options.onSelectPrimary;
    this.onSelectSecondary = options.onSelectSecondary;
    this.onSelectColors = options.onSelectColors;

    this.element = document.createElement('div');
    this.element.className = 'palette-panel';
    this.initKeyboardShortcut();
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public getPrimaryColor(): string {
    return this.primaryColor;
  }

  public getSecondaryColor(): string {
    return this.secondaryColor;
  }

  public getActiveColor(): string {
    return this.primaryColor;
  }

  public setColors(primary: string, secondary: string): void {
    this.primaryColor = primary;
    this.secondaryColor = secondary;
    this.render();
  }

  public setPrimaryColor(color: string): void {
    this.primaryColor = color;
    this.render();
    this.onSelectPrimary?.(color);
    this.onSelectColors?.(this.primaryColor, this.secondaryColor);
  }

  public setSecondaryColor(color: string): void {
    this.secondaryColor = color;
    this.render();
    this.onSelectSecondary?.(color);
    this.onSelectColors?.(this.primaryColor, this.secondaryColor);
  }

  private isTempSwapped: boolean = false;

  public swapColors(): void {
    const temp = this.primaryColor;
    this.primaryColor = this.secondaryColor;
    this.secondaryColor = temp;
    this.render();
    this.onSelectPrimary?.(this.primaryColor);
    this.onSelectSecondary?.(this.secondaryColor);
    this.onSelectColors?.(this.primaryColor, this.secondaryColor);
  }

  private updateSwapButtonActive(active: boolean): void {
    const btn = this.element.querySelector('.btn-swap-colors');
    if (btn) {
      btn.classList.toggle('active', active);
    }
  }

  private initKeyboardShortcut(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      // 'x' or 'X' swaps primary and secondary colors permanently
      if (e.key === 'x' || e.key === 'X') {
        this.swapColors();
        return;
      }

      // Holding CMD or ALT temporarily activates btn-swap-colors
      if ((e.key === 'Meta' || e.key === 'Alt') && !this.isTempSwapped) {
        this.isTempSwapped = true;
        this.swapColors();
        this.updateSwapButtonActive(true);
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      if (this.isTempSwapped && (e.key === 'Meta' || e.key === 'Alt') && !e.metaKey && !e.altKey) {
        this.isTempSwapped = false;
        this.swapColors();
        this.updateSwapButtonActive(false);
      }
    });

    window.addEventListener('blur', () => {
      if (this.isTempSwapped) {
        this.isTempSwapped = false;
        this.swapColors();
        this.updateSwapButtonActive(false);
      }
    });
  }

  private getColorPreviewStyle(color: string): string {
    if (color === '__eraser__') {
      return 'background: linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%); background-size: 6px 6px; background-position: 0 0, 0 3px, 3px -3px, -3px 0; background-color: #fff;';
    }
    return `background-color: ${color}`;
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="panel-header palette-header-dual">
        <span class="panel-title">Palette</span>
        <div class="dual-color-slots">
          <div class="color-slot-display" title="Color I (Izquierdo): Clic en cualquier muestra">
            <span class="slot-tag">I</span>
            <span class="slot-color-preview" style="${this.getColorPreviewStyle(this.primaryColor)}"></span>
          </div>
          <button class="btn-swap-colors ${this.isTempSwapped ? 'active' : ''}" title="Intercambiar colores [X] (o mantener CMD/ALT)">⇄</button>
          <div class="color-slot-display" title="Color D (Derecho): Clic Derecho en cualquier muestra">
            <span class="slot-tag">D</span>
            <span class="slot-color-preview" style="${this.getColorPreviewStyle(this.secondaryColor)}"></span>
          </div>
        </div>
      </div>
      <div class="palette-swatches"></div>
      <div class="palette-hint-text">Clic Izq: Color I • Clic Der: Color D • CMD/ALT: Intercambio Temp • [X]: Intercambiar</div>
    `;

    this.element.querySelector('.btn-swap-colors')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.swapColors();
    });

    const swatchesContainer = this.element.querySelector('.palette-swatches')!;

    // Eraser swatch — special sentinel color to erase pixels
    const eraserSwatch = document.createElement('button');
    const isEraserPrimary = this.primaryColor === '__eraser__';
    const isEraserSecondary = this.secondaryColor === '__eraser__';
    eraserSwatch.className = `palette-swatch eraser ${isEraserPrimary ? 'selected-primary' : ''} ${isEraserSecondary ? 'selected-secondary' : ''}`;
    eraserSwatch.title = 'Borrador — Borra píxeles\n• Clic Izq: Color I\n• Clic Der: Color D';
    eraserSwatch.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L14.6 1.6c.8-.8 2-.8 2.8 0L21 5.2c.8.8.8 2 0 2.8L11 18"></path><line x1="18" y1="13" x2="11" y2="20"></line></svg>${isEraserPrimary && isEraserSecondary ? '<span class="swatch-badge dual">I|D</span>' : isEraserPrimary ? '<span class="swatch-badge primary">I</span>' : isEraserSecondary ? '<span class="swatch-badge secondary">D</span>' : ''}`;

    eraserSwatch.addEventListener('click', (e: MouseEvent) => {
      if (e.metaKey || e.altKey) {
        this.setSecondaryColor('__eraser__');
      } else {
        this.setPrimaryColor('__eraser__');
      }
    });
    eraserSwatch.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      this.setSecondaryColor('__eraser__');
    });
    swatchesContainer.appendChild(eraserSwatch);

    PIXEL_ART_PALETTE.forEach((color) => {
      const isPrimary = color.toLowerCase() === this.primaryColor.toLowerCase();
      const isSecondary = color.toLowerCase() === this.secondaryColor.toLowerCase();

      const swatch = document.createElement('button');
      swatch.className = `palette-swatch ${isPrimary ? 'selected-primary' : ''} ${isSecondary ? 'selected-secondary' : ''}`;
      swatch.style.backgroundColor = color;
      swatch.title = `${color}\n• Clic Izq: Color I (Izq)\n• Clic Der: Color D (Der)`;

      if (isPrimary && isSecondary) {
        swatch.innerHTML = `<span class="swatch-badge dual">I|D</span>`;
      } else if (isPrimary) {
        swatch.innerHTML = `<span class="swatch-badge primary">I</span>`;
      } else if (isSecondary) {
        swatch.innerHTML = `<span class="swatch-badge secondary">D</span>`;
      }

      // Left click on swatch directly sets Color 1 (or Color 2 if CMD/ALT held)
      swatch.addEventListener('click', (e: MouseEvent) => {
        if (e.metaKey || e.altKey) {
          this.setSecondaryColor(color);
        } else {
          this.setPrimaryColor(color);
        }
      });

      // Right click on swatch directly sets Color 2
      swatch.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault();
        this.setSecondaryColor(color);
      });

      swatchesContainer.appendChild(swatch);
    });
  }
}
