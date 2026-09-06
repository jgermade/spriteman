/**
 * ProjectModal Component — Dialog for creating or opening projects.
 * STRICT RULE: Only imports from helpers/ or other components/.
 */
import { STANDARD_PIXEL_SIZES, CanvasSizePreset } from '../helpers/palette.helper';

export interface SavedFileItem {
  name: string;
  updatedAt: number;
}

export interface ProjectModalOptions {
  onCreate?: (name: string, width: number, height: number, fps: number) => void;
  onOpen?: (filename: string) => void;
  onLoadSample?: () => void;
  onImportJson?: (json: string) => void;
}

export class ProjectModal {
  private overlay: HTMLElement;
  private options: ProjectModalOptions;
  private currentTab: 'new' | 'open' = 'new';
  private savedFiles: SavedFileItem[] = [];

  constructor(options: ProjectModalOptions = {}) {
    this.options = options;
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-backdrop';
    this.overlay.style.display = 'none';
    this.render();
  }

  public getElement(): HTMLElement {
    return this.overlay;
  }

  public setFiles(files: SavedFileItem[]): void {
    this.savedFiles = files;
    if (this.currentTab === 'open') {
      this.render();
    }
  }

  public show(tab: 'new' | 'open' = 'new'): void {
    this.currentTab = tab;
    this.overlay.style.display = 'flex';
    this.render();
  }

  public hide(): void {
    this.overlay.style.display = 'none';
  }

  private render(): void {
    this.overlay.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <div class="modal-tabs">
            <button class="modal-tab ${this.currentTab === 'new' ? 'active' : ''}" data-tab="new">
              📄 New Project
            </button>
            <button class="modal-tab ${this.currentTab === 'open' ? 'active' : ''}" data-tab="open">
              📁 Open Project (${this.savedFiles.length})
            </button>
          </div>
          <button class="modal-close" title="Close">✕</button>
        </div>

        <div class="modal-body">
          ${this.currentTab === 'new' ? this.renderNewTab() : this.renderOpenTab()}
        </div>
      </div>
    `;

    // Bind tab switching
    this.overlay.querySelectorAll('.modal-tab').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = (e.currentTarget as HTMLElement).dataset.tab as 'new' | 'open';
        this.currentTab = tab;
        this.render();
      });
    });

    // Close button
    this.overlay.querySelector('.modal-close')?.addEventListener('click', () => this.hide());

    // Tab-specific bindings
    if (this.currentTab === 'new') {
      const btnSubmit = this.overlay.querySelector('#btn-create-project') as HTMLButtonElement;
      btnSubmit?.addEventListener('click', () => {
        const nameInput = this.overlay.querySelector('#input-project-name') as HTMLInputElement;
        const sizeSelect = this.overlay.querySelector('#select-project-size') as HTMLSelectElement;
        const fpsSelect = this.overlay.querySelector('#select-project-fps') as HTMLSelectElement;

        const name = nameInput.value.trim() || 'pixel_sprite';
        const [w, h] = sizeSelect.value.split('x').map(Number);
        const fps = parseInt(fpsSelect.value, 10) || 12;

        this.options.onCreate?.(name, w, h, fps);
        this.hide();
      });
    } else {
      // Bind open buttons
      this.overlay.querySelectorAll('.btn-open-file').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const filename = (e.currentTarget as HTMLElement).dataset.filename;
          if (filename) {
            this.options.onOpen?.(filename);
            this.hide();
          }
        });
      });

      // Sample project button
      this.overlay.querySelector('#btn-open-sample')?.addEventListener('click', () => {
        this.options.onLoadSample?.();
        this.hide();
      });

      // File upload
      const fileInput = this.overlay.querySelector('#file-upload-json') as HTMLInputElement;
      fileInput?.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            const text = reader.result as string;
            this.options.onImportJson?.(text);
            this.hide();
          };
          reader.readAsText(file);
        }
      });
    }
  }

  private renderNewTab(): string {
    return `
      <div class="form-group">
        <label class="form-label">Project Name:</label>
        <input id="input-project-name" type="text" class="form-input" value="sprite_character_1" placeholder="e.g. hero_idle" />
      </div>

      <div class="form-group">
        <label class="form-label">Pixel Canvas Size:</label>
        <select id="select-project-size" class="form-select">
          ${STANDARD_PIXEL_SIZES.map(
            (p: CanvasSizePreset) =>
              `<option value="${p.width}x${p.height}" ${p.width === 64 ? 'selected' : ''}>${p.label}</option>`
          ).join('')}
        </select>
        <span class="form-hint">Starts with 1 initial frame and centered base layer.</span>
      </div>

      <div class="form-group">
        <label class="form-label">Animation Speed (FPS):</label>
        <select id="select-project-fps" class="form-select">
          <option value="6">6 FPS (Retro slow)</option>
          <option value="8">8 FPS (Classic walk)</option>
          <option value="12" selected>12 FPS (Standard pixel art)</option>
          <option value="16">16 FPS (Smooth retro)</option>
          <option value="24">24 FPS (Cinematic)</option>
        </select>
      </div>

      <div class="modal-footer">
        <button id="btn-create-project" class="btn-primary">
          ✨ Create Project
        </button>
      </div>
    `;
  }

  private renderOpenTab(): string {
    const fileListHtml =
      this.savedFiles.length === 0
        ? `<div class="empty-file-list">No saved projects found in WASMFS yet.</div>`
        : `<div class="file-list">
            ${this.savedFiles
              .map(
                (f) => `
                <div class="file-item">
                  <div class="file-info">
                    <span class="file-name">📄 ${f.name}</span>
                    <span class="file-date">${new Date(f.updatedAt).toLocaleDateString()}</span>
                  </div>
                  <button class="btn-open-file" data-filename="${f.name}">Open</button>
                </div>
              `
              )
              .join('')}
          </div>`;

    return `
      <div class="open-section">
        <span class="section-title">Saved in WASMFS</span>
        ${fileListHtml}

        <div class="divider"></div>

        <div class="external-actions">
          <button id="btn-open-sample" class="btn-secondary">
            🌟 Open Sample Walk Project
          </button>

          <label class="btn-secondary file-upload-label">
            📥 Import JSON File
            <input id="file-upload-json" type="file" accept=".json" style="display: none;" />
          </label>
        </div>
      </div>
    `;
  }
}
