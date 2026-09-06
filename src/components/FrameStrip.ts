/**
 * FrameStrip Component — Frame-by-frame animation timeline with live thumbnails,
 * drag-and-drop frame reordering, and multi-frame motion interpolation.
 * STRICT RULE: Only imports from helpers/ or other components/.
 */
import { formatFrame } from '../helpers/format.helper';
import { renderThumbnailToCanvas } from '../helpers/canvas.helper';

export interface FrameGroupItem {
  id: string;
  layer_id: string;
  start_frame: number;
  end_frame: number;
  name?: string;
  pivot?: { x: number; y: number };
}

export interface AnimationClipItem {
  id: string;
  name: string;
  fps: number;
  total_frames: number;
}

export interface FrameStripOptions {
  totalFrames?: number;
  currentFrame?: number;
  isPlaying?: boolean;
  onionSkin?: boolean;
  spriteWidth?: number;
  spriteHeight?: number;
  framePixels?: Record<number, Record<string, string>>;
  animations?: AnimationClipItem[];
  activeAnimationId?: string;
  layerGroups?: FrameGroupItem[];
  activeGroup?: FrameGroupItem | null;
  isPivotMode?: boolean;

  onSelectFrame?: (frameIndex: number) => void;
  onSelectRange?: (start: number, end: number) => void;
  onAddFrame?: (targetIndex?: number) => void;
  onReorderFrame?: (fromIndex: number, toIndex: number) => void;
  onInterpolateFrames?: (startFrame: number, endFrame: number) => void;
  onDuplicateFrame?: () => void;
  onDeleteFrame?: () => void;
  onTogglePlay?: () => void;
  onToggleOnionSkin?: (enabled: boolean) => void;
  onStep?: (delta: number) => void;

  // Layer Frame Group callbacks
  onGroupFrames?: (startFrame: number, endFrame: number) => void;
  onUngroupFrames?: (groupId: string) => void;
  onToggleGroupPivotMode?: () => void;
  onInterpolateGroup?: (groupId: string) => void;

  // Animation clips callbacks
  onSelectAnimation?: (animId: string) => void;
  onAddAnimation?: () => void;
  onRenameAnimation?: (animId: string, name: string) => void;
  onDeleteAnimation?: (animId: string) => void;
}

export class FrameStrip {
  private element: HTMLElement;
  private totalFrames: number;
  private currentFrame: number;
  private isPlaying: boolean;
  private onionSkin: boolean;
  private spriteWidth: number;
  private spriteHeight: number;
  private framePixels: Record<number, Record<string, string>>;
  private animations: AnimationClipItem[] = [];
  private activeAnimationId: string = '';
  private layerGroups: FrameGroupItem[] = [];
  private activeGroup: FrameGroupItem | null = null;
  private isPivotMode: boolean = false;

  private selectedRange: { start: number; end: number } | null = null;
  private lastClickedFrame: number = 0;

  private onSelectFrame?: (idx: number) => void;
  private onSelectRange?: (start: number, end: number) => void;
  private onAddFrame?: (targetIndex?: number) => void;
  private onReorderFrame?: (fromIndex: number, toIndex: number) => void;
  private onInterpolateFrames?: (startFrame: number, endFrame: number) => void;
  private onDuplicateFrame?: () => void;
  private onDeleteFrame?: () => void;
  private onTogglePlay?: () => void;
  private onToggleOnionSkin?: (enabled: boolean) => void;
  private onStep?: (delta: number) => void;

  private onGroupFrames?: (startFrame: number, endFrame: number) => void;
  private onUngroupFrames?: (groupId: string) => void;
  private onToggleGroupPivotMode?: () => void;
  private onInterpolateGroup?: (groupId: string) => void;
  private onSelectAnimation?: (animId: string) => void;
  private onAddAnimation?: () => void;
  private onRenameAnimation?: (animId: string, name: string) => void;
  private onDeleteAnimation?: (animId: string) => void;

  constructor(options: FrameStripOptions = {}) {
    this.totalFrames = options.totalFrames ?? 4;
    this.currentFrame = options.currentFrame ?? 0;
    this.isPlaying = options.isPlaying ?? false;
    this.onionSkin = options.onionSkin ?? true;
    this.spriteWidth = options.spriteWidth ?? 64;
    this.spriteHeight = options.spriteHeight ?? 64;
    this.framePixels = options.framePixels ?? {};
    this.animations = options.animations ?? [];
    this.activeAnimationId = options.activeAnimationId ?? '';
    this.layerGroups = options.layerGroups ?? [];
    this.activeGroup = options.activeGroup ?? null;
    this.isPivotMode = options.isPivotMode ?? false;

    this.onSelectFrame = options.onSelectFrame;
    this.onSelectRange = options.onSelectRange;
    this.onAddFrame = options.onAddFrame;
    this.onReorderFrame = options.onReorderFrame;
    this.onInterpolateFrames = options.onInterpolateFrames;
    this.onDuplicateFrame = options.onDuplicateFrame;
    this.onDeleteFrame = options.onDeleteFrame;
    this.onTogglePlay = options.onTogglePlay;
    this.onToggleOnionSkin = options.onToggleOnionSkin;
    this.onStep = options.onStep;

    this.onGroupFrames = options.onGroupFrames;
    this.onUngroupFrames = options.onUngroupFrames;
    this.onToggleGroupPivotMode = options.onToggleGroupPivotMode;
    this.onInterpolateGroup = options.onInterpolateGroup;
    this.onSelectAnimation = options.onSelectAnimation;
    this.onAddAnimation = options.onAddAnimation;
    this.onRenameAnimation = options.onRenameAnimation;
    this.onDeleteAnimation = options.onDeleteAnimation;

    this.element = document.createElement('div');
    this.element.className = 'framestrip-container';
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public update(
    currentFrame: number,
    totalFrames: number,
    isPlaying: boolean,
    framePixels?: Record<number, Record<string, string>>,
    spriteWidth?: number,
    spriteHeight?: number,
    animations?: AnimationClipItem[],
    activeAnimationId?: string,
    layerGroups?: FrameGroupItem[],
    activeGroup?: FrameGroupItem | null,
    isPivotMode?: boolean
  ): void {
    this.currentFrame = currentFrame;
    this.totalFrames = totalFrames;
    this.isPlaying = isPlaying;
    if (framePixels !== undefined) this.framePixels = framePixels;
    if (spriteWidth !== undefined) this.spriteWidth = spriteWidth;
    if (spriteHeight !== undefined) this.spriteHeight = spriteHeight;
    if (animations !== undefined) this.animations = animations;
    if (activeAnimationId !== undefined) this.activeAnimationId = activeAnimationId;
    if (layerGroups !== undefined) this.layerGroups = layerGroups;
    if (activeGroup !== undefined) this.activeGroup = activeGroup;
    if (isPivotMode !== undefined) this.isPivotMode = isPivotMode;
    this.render();
  }

  private render(): void {
    const hasRangeSelection =
      this.selectedRange !== null && this.selectedRange.end > this.selectedRange.start;

    const rangeStart = this.selectedRange ? this.selectedRange.start : 0;
    const rangeEnd = this.selectedRange ? this.selectedRange.end : 0;

    const getIcon = (name: string): string => {
      const lower = name.toLowerCase();
      if (lower.includes('walk')) return '🚶';
      if (lower.includes('run')) return '🏃';
      if (lower.includes('jump')) return '🦘';
      if (lower.includes('attack') || lower.includes('slash')) return '⚔️';
      if (lower.includes('hurt') || lower.includes('die')) return '💥';
      return '🧍';
    };

    this.element.innerHTML = `
      <div class="animation-tabs-strip">
        <div class="anim-tabs-list">
          ${this.animations
            .map(
              (a) => `
            <button class="btn-anim-tab ${a.id === this.activeAnimationId ? 'active' : ''}" data-anim-id="${a.id}" title="${a.name} (${a.total_frames} frames)">
              <span class="anim-tab-icon">${getIcon(a.name)}</span>
              <span class="anim-tab-name">${a.name}</span>
              <span class="anim-tab-badge">${a.total_frames}f</span>
            </button>
          `
            )
            .join('')}
        </div>
        <button class="btn-anim-tab-new" title="Crear nueva secuencia de animación para este personaje">+ Nueva Animación</button>
      </div>

      <div class="framestrip-toolbar">
        <div class="transport-group">
          <button class="btn-tool btn-play ${this.isPlaying ? 'active' : ''}" title="Play / Pause">
            ${this.isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <button class="btn-tool btn-prev" title="Previous Frame">⏮</button>
          <button class="btn-tool btn-next" title="Next Frame">⏭</button>
        </div>

        <div class="frame-actions-group">
          <button class="btn-tool btn-add primary" title="Add new frame (copies previous)">
            + Add Frame
          </button>
          <button class="btn-tool btn-duplicate" title="Duplicate selected frame">
            Duplicate
          </button>
          <button class="btn-tool btn-delete" title="Delete current frame" ${this.totalFrames <= 1 ? 'disabled' : ''}>
            Delete
          </button>
          <button class="btn-tool btn-onion ${this.onionSkin ? 'active' : ''}" title="Toggle Onion Skinning">
            🧅 Onion Skin
          </button>

          ${
            hasRangeSelection
              ? `<button class="btn-tool btn-group-selection primary" title="Crear grupo de fotogramas en esta capa con pivote e interpolación independiente">
                   📦 Agrupar (${rangeStart + 1}..${rangeEnd + 1})
                 </button>`
              : this.activeGroup
              ? `<div class="active-group-pill">
                   <span class="group-pill-name">📦 ${this.activeGroup.name || 'Grupo'} (${this.activeGroup.start_frame + 1}..${this.activeGroup.end_frame + 1})</span>
                   <button class="btn-tool btn-group-pivot ${this.isPivotMode ? 'active' : ''}" title="Ubicar eje de giro (pivote) en el canvas para este grupo">
                     📍 ${this.activeGroup.pivot ? `Pivote [${this.activeGroup.pivot.x}, ${this.activeGroup.pivot.y}]` : 'Ubicar Pivote'}
                   </button>
                   <button class="btn-tool btn-group-interpolate" title="Interpolar fotogramas intermedios de este grupo" ${this.activeGroup.end_frame - this.activeGroup.start_frame < 2 ? 'disabled' : ''}>
                     ⚡ Interpolar
                   </button>
                   <button class="btn-tool btn-group-ungroup" title="Desagrupar fotogramas">✕ Desagrupar</button>
                 </div>`
              : ''
          }
        </div>

        <div class="frame-indicator">
          <span>Frame: ${Math.round(this.currentFrame) + 1} / ${Math.max(1, this.totalFrames)}</span>
        </div>
      </div>

      <div class="frames-reel"></div>
    `;

    // Bind animation tabs
    this.element.querySelectorAll('.btn-anim-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const animId = (tab as HTMLElement).dataset.animId;
        if (animId) this.onSelectAnimation?.(animId);
      });
      tab.addEventListener('dblclick', () => {
        const animId = (tab as HTMLElement).dataset.animId;
        const currentName = tab.querySelector('.anim-tab-name')?.textContent || '';
        const newName = prompt('Renombrar animación:', currentName);
        if (newName && animId) {
          this.onRenameAnimation?.(animId, newName.trim());
        }
      });
    });

    this.element.querySelector('.btn-anim-tab-new')?.addEventListener('click', () => {
      this.onAddAnimation?.();
    });

    // Bind toolbar buttons
    this.element.querySelector('.btn-play')?.addEventListener('click', () => this.onTogglePlay?.());
    this.element.querySelector('.btn-prev')?.addEventListener('click', () => this.onStep?.(-1));
    this.element.querySelector('.btn-next')?.addEventListener('click', () => this.onStep?.(1));
    this.element.querySelector('.btn-add')?.addEventListener('click', () => this.onAddFrame?.());
    this.element.querySelector('.btn-duplicate')?.addEventListener('click', () => this.onDuplicateFrame?.());
    this.element.querySelector('.btn-delete')?.addEventListener('click', () => this.onDeleteFrame?.());

    if (hasRangeSelection) {
      this.element.querySelector('.btn-group-selection')?.addEventListener('click', () => {
        if (this.selectedRange) {
          const s = this.selectedRange.start;
          const e = this.selectedRange.end;
          this.selectedRange = null;
          this.onGroupFrames?.(s, e);
        }
      });
    }

    if (this.activeGroup) {
      const grpId = this.activeGroup.id;
      this.element.querySelector('.btn-group-pivot')?.addEventListener('click', () => {
        this.onToggleGroupPivotMode?.();
      });
      this.element.querySelector('.btn-group-interpolate')?.addEventListener('click', () => {
        this.onInterpolateGroup?.(grpId);
      });
      this.element.querySelector('.btn-group-ungroup')?.addEventListener('click', () => {
        this.onUngroupFrames?.(grpId);
      });
    }

    const onionBtn = this.element.querySelector('.btn-onion') as HTMLElement;
    onionBtn?.addEventListener('click', () => {
      this.onionSkin = !this.onionSkin;
      onionBtn.classList.toggle('active', this.onionSkin);
      this.onToggleOnionSkin?.(this.onionSkin);
    });

    // Populate frame buttons
    const reel = this.element.querySelector('.frames-reel') as HTMLElement;
    const activeIntFrame = Math.round(this.currentFrame);
    const cellElements: HTMLElement[] = [];

    // Track insertion slot indicator
    let currentSlot: HTMLElement | null = null;
    let targetInsertIndex: number | null = null;

    const setInsertIndicator = (index: number | null) => {
      if (targetInsertIndex === index) return;
      targetInsertIndex = index;

      if (currentSlot) {
        currentSlot.remove();
        currentSlot = null;
      }

      if (index !== null) {
        currentSlot = document.createElement('div');
        currentSlot.className = 'frame-insert-slot';
        if (index < cellElements.length) {
          reel.insertBefore(currentSlot, cellElements[index]);
        } else {
          reel.insertBefore(currentSlot, newCell);
        }
      }
    };

    const cleanupDrag = () => {
      cellElements.forEach((c) => c.classList.remove('is-dragging'));
      newCell.classList.remove('is-dragging');
      reel.classList.remove('reel-drag-active');
      setInsertIndicator(null);
    };

    // 1. Create standard existing frame cells with miniature canvas preview & reorder drag
    for (let i = 0; i < this.totalFrames; i++) {
      const cell = document.createElement('button');
      const isActive = i === activeIntFrame;
      const isInRange =
        this.selectedRange !== null && i >= this.selectedRange.start && i <= this.selectedRange.end;

      const cellGroup = this.layerGroups.find((g) => i >= g.start_frame && i <= g.end_frame);
      const inGroup = !!cellGroup;
      const isGroupStart = inGroup && i === cellGroup.start_frame;
      const isGroupEnd = inGroup && i === cellGroup.end_frame;
      const hasGroupPivot = inGroup && !!cellGroup.pivot;

      cell.className = `frame-cell ${isActive ? 'active' : ''} ${isInRange ? 'in-range-selected' : ''} ${inGroup ? 'in-group' : ''} ${isGroupStart ? 'group-start' : ''} ${isGroupEnd ? 'group-end' : ''}`;
      cell.dataset.frameIndex = String(i);
      cell.setAttribute('draggable', 'true');
      cell.setAttribute(
        'title',
        inGroup
          ? `Frame ${i + 1} (${cellGroup.name || 'Grupo'}${hasGroupPivot ? ` • Pivote: [${cellGroup.pivot!.x}, ${cellGroup.pivot!.y}]` : ''})`
          : `Frame ${i + 1} (Shift+Click to select range, Drag to reorder)`
      );

      // Frame number badge
      const numSpan = document.createElement('span');
      numSpan.className = 'cell-num';
      numSpan.textContent = String(i + 1);
      cell.appendChild(numSpan);

      if (hasGroupPivot) {
        const pivotDot = document.createElement('span');
        pivotDot.className = 'cell-pivot-dot';
        pivotDot.setAttribute('title', `Pivote: [${cellGroup!.pivot!.x}, ${cellGroup!.pivot!.y}]`);
        pivotDot.textContent = '📍';
        cell.appendChild(pivotDot);
      }

      // Thumbnail canvas displaying crisp pixel miniature preview
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.className = 'cell-thumb-canvas';
      thumbCanvas.width = 44;
      thumbCanvas.height = 44;
      renderThumbnailToCanvas(
        thumbCanvas,
        this.framePixels[i] || {},
        this.spriteWidth,
        this.spriteHeight
      );
      cell.appendChild(thumbCanvas);

      // Frame selection / range selection
      cell.addEventListener('click', (e: MouseEvent) => {
        if (cell.classList.contains('is-dragging')) return;

        if (e.shiftKey) {
          const start = Math.min(this.lastClickedFrame, i);
          const end = Math.max(this.lastClickedFrame, i);
          this.selectedRange = { start, end };
          this.currentFrame = i;
          this.render();
          this.onSelectRange?.(start, end);
        } else {
          this.selectedRange = null;
          this.lastClickedFrame = i;
          this.currentFrame = i;
          this.render();
          this.onSelectFrame?.(i);
        }
      });

      // Dragstart for reordering existing frame
      cell.addEventListener('dragstart', (e: DragEvent) => {
        cell.classList.add('is-dragging');
        reel.classList.add('reel-drag-active');
        if (e.dataTransfer) {
          e.dataTransfer.setData('application/json', JSON.stringify({ type: 'reorder', fromIndex: i }));
          e.dataTransfer.effectAllowed = 'move';
        }
      });

      cell.addEventListener('dragend', () => {
        cleanupDrag();
      });

      // Dragover on existing cell to position insertion point before or after
      cell.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        const rect = cell.getBoundingClientRect();
        const isRightHalf = e.clientX > rect.left + rect.width / 2;
        const insertIdx = isRightHalf ? i + 1 : i;
        setInsertIndicator(insertIdx);
      });

      reel.appendChild(cell);
      cellElements.push(cell);
    }

    // 2. Create .frame-cell.new at the right of the last frame cell
    const newCell = document.createElement('button');
    newCell.className = 'frame-cell new';
    newCell.setAttribute('draggable', 'true');
    newCell.setAttribute('title', 'Click to append frame, or drag to insert between existing frames');
    newCell.innerHTML = `
      <span class="cell-num">+</span>
      <div class="cell-preview-thumb cell-new-thumb">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </div>
    `;

    // Click handler for appending at end
    newCell.addEventListener('click', () => {
      if (newCell.classList.contains('is-dragging')) return;
      this.onAddFrame?.();
    });

    // HTML5 Drag and Drop events for new frame insertion
    newCell.addEventListener('dragstart', (e: DragEvent) => {
      newCell.classList.add('is-dragging');
      reel.classList.add('reel-drag-active');
      if (e.dataTransfer) {
        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'new' }));
        e.dataTransfer.effectAllowed = 'copy';
      }
    });

    newCell.addEventListener('dragend', () => {
      cleanupDrag();
    });

    // Handle reel drag events for gap/boundary zones
    reel.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      if (e.target === newCell) {
        setInsertIndicator(this.totalFrames);
      }
    });

    reel.addEventListener('dragleave', (e: DragEvent) => {
      if (!reel.contains(e.relatedTarget as Node)) {
        setInsertIndicator(null);
      }
    });

    reel.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      const insertAt = targetInsertIndex;
      let dragData: { type: string; fromIndex?: number } | null = null;
      try {
        const raw = e.dataTransfer?.getData('application/json');
        if (raw) dragData = JSON.parse(raw);
      } catch {
        // ignore
      }

      cleanupDrag();

      if (dragData?.type === 'reorder' && typeof dragData.fromIndex === 'number') {
        const from = dragData.fromIndex;
        let to = typeof insertAt === 'number' ? insertAt : this.totalFrames - 1;
        // Adjust destination index if dragging forward
        if (from < to) {
          to = to - 1;
        }
        to = Math.max(0, Math.min(this.totalFrames - 1, to));
        if (from !== to) {
          this.onReorderFrame?.(from, to);
        }
      } else {
        // Add new frame
        if (typeof insertAt === 'number') {
          this.onAddFrame?.(insertAt);
        } else {
          this.onAddFrame?.();
        }
      }
    });

    // Touch Drag support for mobile, tablet, and PWA environments
    let touchGhost: HTMLElement | null = null;
    let touchMoved = false;
    let touchStartX = 0;
    let touchStartY = 0;

    const findTouchInsertIndex = (clientX: number, clientY: number): number | null => {
      const hitElement = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      if (!hitElement) return null;

      const hitCell = hitElement.closest('.frame-cell') as HTMLElement | null;
      if (hitCell && hitCell !== newCell) {
        const frameIdxStr = hitCell.dataset.frameIndex;
        if (frameIdxStr !== undefined) {
          const idx = parseInt(frameIdxStr, 10);
          const rect = hitCell.getBoundingClientRect();
          return clientX > rect.left + rect.width / 2 ? idx + 1 : idx;
        }
      } else if (hitElement.closest('.frames-reel')) {
        return this.totalFrames;
      }
      return null;
    };

    newCell.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchMoved = false;
      },
      { passive: true }
    );

    newCell.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const dist = Math.hypot(touch.clientX - touchStartX, touch.clientY - touchStartY);

        if (dist > 8) {
          touchMoved = true;
          e.preventDefault();

          if (!touchGhost) {
            newCell.classList.add('is-dragging');
            touchGhost = document.createElement('div');
            touchGhost.className = 'frame-drag-ghost';
            touchGhost.textContent = '+';
            document.body.appendChild(touchGhost);
          }

          touchGhost.style.left = `${touch.clientX}px`;
          touchGhost.style.top = `${touch.clientY}px`;

          const targetIdx = findTouchInsertIndex(touch.clientX, touch.clientY);
          setInsertIndicator(targetIdx);
        }
      },
      { passive: false }
    );

    const endTouchDrag = (e: TouchEvent) => {
      if (touchGhost) {
        touchGhost.remove();
        touchGhost = null;
      }
      newCell.classList.remove('is-dragging');

      if (touchMoved) {
        e.preventDefault();
        const insertAt = targetInsertIndex;
        setInsertIndicator(null);
        if (typeof insertAt === 'number') {
          this.onAddFrame?.(insertAt);
        }
      }
    };

    newCell.addEventListener('touchend', endTouchDrag);
    newCell.addEventListener('touchcancel', endTouchDrag);

    reel.appendChild(newCell);
  }
}
