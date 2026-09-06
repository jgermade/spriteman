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

  public swapColors(): void {
    const temp = this.primaryColor;
    this.primaryColor = this.secondaryColor;
    this.secondaryColor = temp;
    this.render();
    this.onSelectPrimary?.(this.primaryColor);
    this.onSelectSecondary?.(this.secondaryColor);
    this.onSelectColors?.(this.primaryColor, this.secondaryColor);
  }

  private initKeyboardShortcut(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // 'x' or 'X' swaps primary and secondary colors if not typing in input
      if ((e.key === 'x' || e.key === 'X') && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        this.swapColors();
      }
    });
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="panel-header palette-header-dual">
        <span class="panel-title">Palette</span>
        <div class="dual-color-slots">
          <div class="color-slot-display" title="Color 1: Clic Izquierdo en cualquier muestra">
            <span class="slot-tag">Izq</span>
            <span class="slot-color-preview" style="background-color: ${this.primaryColor}"></span>
          </div>
          <button class="btn-swap-colors" title="Intercambiar colores [X]">⇄</button>
          <div class="color-slot-display" title="Color 2: Clic Derecho o CMD/ALT en cualquier muestra">
            <span class="slot-tag">Der</span>
            <span class="slot-color-preview" style="background-color: ${this.secondaryColor}"></span>
          </div>
        </div>
      </div>
      <div class="palette-swatches"></div>
      <div class="palette-hint-text">Clic Izq: Color 1 • Clic Der o CMD/ALT: Color 2 • [X]: Intercambiar</div>
    `;

    this.element.querySelector('.btn-swap-colors')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.swapColors();
    });

    const swatchesContainer = this.element.querySelector('.palette-swatches')!;

    PIXEL_ART_PALETTE.forEach((color) => {
      const isPrimary = color.toLowerCase() === this.primaryColor.toLowerCase();
      const isSecondary = color.toLowerCase() === this.secondaryColor.toLowerCase();

      const swatch = document.createElement('button');
      swatch.className = `palette-swatch ${isPrimary ? 'selected-primary' : ''} ${isSecondary ? 'selected-secondary' : ''}`;
      swatch.style.backgroundColor = color;
      swatch.title = `${color}\n• Clic Izq: Color 1 (Izq)\n• Clic Der / CMD: Color 2 (Der)`;

      if (isPrimary && isSecondary) {
        swatch.innerHTML = `<span class="swatch-badge dual">1|2</span>`;
      } else if (isPrimary) {
        swatch.innerHTML = `<span class="swatch-badge primary">1</span>`;
      } else if (isSecondary) {
        swatch.innerHTML = `<span class="swatch-badge secondary">2</span>`;
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
