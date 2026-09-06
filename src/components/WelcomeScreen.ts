/**
 * WelcomeScreen Component — Displayed when no project is currently open.
 * STRICT RULE: Only imports from helpers/ or other components/.
 */
import { STANDARD_PIXEL_SIZES, CanvasSizePreset } from '../helpers/palette.helper';

export interface WelcomeSavedFile {
  name: string;
  updatedAt: number;
}

export interface WelcomeScreenOptions {
  onCreateProject?: (name: string, width: number, height: number, fps: number) => void;
  onOpenProject?: (filename: string) => void;
  onOpenSample?: () => void;
  onImportJson?: (jsonString: string) => void;
}

export class WelcomeScreen {
  private element: HTMLElement;
  private options: WelcomeScreenOptions;
  private savedFiles: WelcomeSavedFile[] = [];

  constructor(options: WelcomeScreenOptions = {}) {
    this.options = options;
    this.element = document.createElement('div');
    this.element.className = 'welcome-screen-view';
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public setFiles(files: WelcomeSavedFile[]): void {
    this.savedFiles = files;
    this.render();
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="welcome-container">
        <!-- Hero Header -->
        <div class="welcome-hero">
          <div class="welcome-hero-avatar">
            <img src="./icon-192.svg" class="welcome-hero-img" alt="SpriteMotion Icon" width="88" height="88" />
          </div>
          <h1 class="welcome-title">Spritemotion</h1>
          <p class="welcome-subtitle">
            Pixel art animated sprite editor with skeletal hierarchy & WebAssembly engine
          </p>
        </div>

        <!-- Main Cards Grid -->
        <div class="welcome-cards-grid">
          <!-- Card 1: Create New Project -->
          <div class="welcome-card">
            <div class="card-header">
              <h2 class="card-heading">📄 Create New Project</h2>
              <span class="card-hint">Starts with 1 frame</span>
            </div>

            <div class="welcome-form">
              <div class="welcome-field">
                <label class="welcome-label">Project Name:</label>
                <input id="welcome-input-name" type="text" class="welcome-input" value="sprite_character_1" placeholder="e.g. hero_run" />
              </div>

              <div class="welcome-field">
                <label class="welcome-label">Canvas Dimensions (px):</label>
                <select id="welcome-select-size" class="welcome-select">
                  ${STANDARD_PIXEL_SIZES.map(
                    (p: CanvasSizePreset) =>
                      `<option value="${p.width}x${p.height}" ${p.width === 64 ? 'selected' : ''}>${p.label}</option>`
                  ).join('')}
                </select>
              </div>

              <div class="welcome-field">
                <label class="welcome-label">Animation Speed (FPS):</label>
                <select id="welcome-select-fps" class="welcome-select">
                  <option value="6">6 FPS (Retro slow)</option>
                  <option value="8">8 FPS (Classic walk)</option>
                  <option value="12" selected>12 FPS (Standard pixel art)</option>
                  <option value="16">16 FPS (Smooth retro)</option>
                  <option value="24">24 FPS (Cinematic)</option>
                </select>
              </div>

              <button id="welcome-btn-create" class="welcome-btn-primary">
                ✨ Create Project (1 Frame)
              </button>
            </div>
          </div>

          <!-- Card 2: Open Existing Project -->
          <div class="welcome-card">
            <div class="card-header">
              <h2 class="card-heading">📁 Open Saved Project</h2>
              <span class="card-hint">WASMFS Storage</span>
            </div>

            <div class="welcome-saved-list">
              ${
                this.savedFiles.length === 0
                  ? `<div class="welcome-empty">No projects saved in WASMFS yet.</div>`
                  : this.savedFiles
                      .map(
                        (f) => `
                    <div class="welcome-file-item">
                      <div class="welcome-file-info">
                        <span class="welcome-file-name">📄 ${f.name}</span>
                        <span class="welcome-file-date">${new Date(f.updatedAt).toLocaleDateString()}</span>
                      </div>
                      <button class="welcome-btn-open" data-filename="${f.name}">Open</button>
                    </div>
                  `
                      )
                      .join('')
              }
            </div>

            <div class="welcome-extra-actions">
              <button id="welcome-btn-sample" class="welcome-btn-secondary">
                🌟 Open Sample Walk Project
              </button>

              <label class="welcome-btn-secondary upload-btn">
                📥 Import JSON File
                <input id="welcome-input-file" type="file" accept=".json" style="display: none;" />
              </label>
            </div>
          </div>
        </div>
      </div>
    `;

    // Bind Create button
    this.element.querySelector('#welcome-btn-create')?.addEventListener('click', () => {
      const nameInput = this.element.querySelector('#welcome-input-name') as HTMLInputElement;
      const sizeSelect = this.element.querySelector('#welcome-select-size') as HTMLSelectElement;
      const fpsSelect = this.element.querySelector('#welcome-select-fps') as HTMLSelectElement;

      const name = nameInput.value.trim() || 'pixel_sprite';
      const [w, h] = sizeSelect.value.split('x').map(Number);
      const fps = parseInt(fpsSelect.value, 10) || 12;

      this.options.onCreateProject?.(name, w, h, fps);
    });

    // Bind Open File buttons
    this.element.querySelectorAll('.welcome-btn-open').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const fn = (e.currentTarget as HTMLElement).dataset.filename;
        if (fn) {
          this.options.onOpenProject?.(fn);
        }
      });
    });

    // Bind Sample button
    this.element.querySelector('#welcome-btn-sample')?.addEventListener('click', () => {
      this.options.onOpenSample?.();
    });

    // Bind File Import
    const fileInput = this.element.querySelector('#welcome-input-file') as HTMLInputElement;
    fileInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          this.options.onImportJson?.(reader.result as string);
        };
        reader.readAsText(file);
      }
    });
  }
}
