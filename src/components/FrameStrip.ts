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

  // History callbacks
  onUndo?: () => void;
  onRedo?: () => void;
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
  private canUndo: boolean = false;
  private canRedo: boolean = false;

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
  private onUndo?: () => void;
  private onRedo?: () => void;

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
    this.onUndo = options.onUndo;
    this.onRedo = options.onRedo;

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
    isPivotMode?: boolean,
    canUndo?: boolean,
    canRedo?: boolean
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
    if (canUndo !== undefined) this.canUndo = canUndo;
    if (canRedo !== undefined) this.canRedo = canRedo;
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

        <div class="history-actions-group">
          <button class="btn-tool icon-only btn-undo" title="Deshacer (Cmd+Z / Ctrl+Z)" ${!this.canUndo ? 'disabled' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7v6h6"></path>
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
            </svg>
          </button>
          <button class="btn-tool icon-only btn-redo" title="Rehacer (Cmd+Shift+Z / Ctrl+Shift+Z)" ${!this.canRedo ? 'disabled' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 7v6h-6"></path>
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"></path>
            </svg>
          </button>
        </div>

        <div class="frame-actions-group">
          <button class="btn-tool icon-only btn-duplicate" title="Duplicar fotograma actual">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button class="btn-tool icon-only btn-delete" title="Eliminar fotograma actual" ${this.totalFrames <= 1 ? 'disabled' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
          <button class="btn-tool icon-only btn-onion ${this.onionSkin ? 'active' : ''}" title="Papel cebolla (Onion Skinning)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2C12 2 8 6 8 6C5.5 8.5 4 11.5 4 14.5C4 19 7.6 22 12 22C16.4 22 20 19 20 14.5C20 11.5 18.5 8.5 16 6L12 2Z"></path>
              <path d="M12 6C12 6 9.5 9 9.5 9C8 10.5 7 12.5 7 14.5C7 17.5 9.2 19.5 12 19.5C14.8 19.5 17 17.5 17 14.5C17 12.5 16 10.5 14.5 9L12 6Z" opacity="0.5"></path>
            </svg>
          </button>

          ${
            hasRangeSelection
              ? `<button class="btn-tool icon-only btn-group-selection primary" title="Agrupar fotogramas seleccionados (${rangeStart + 1}..${rangeEnd + 1}) con pivote e interpolación automática">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                     <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                     <polyline points="3.29 7 12 12 20.71 7"></polyline>
                     <line x1="12" y1="22" x2="12" y2="12"></line>
                   </svg>
                 </button>`
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
    this.element.querySelector('.btn-undo')?.addEventListener('click', () => this.onUndo?.());
    this.element.querySelector('.btn-redo')?.addEventListener('click', () => this.onRedo?.());
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

    const buildCell = (i: number, cellGroup?: FrameGroupItem, isIntermediate: boolean = false): HTMLElement => {
      const cell = document.createElement('button');
      const isActive = i === activeIntFrame;
      const isInRange =
        this.selectedRange !== null && i >= this.selectedRange.start && i <= this.selectedRange.end;

      const inGroup = !!cellGroup;
      const isGroupStart = inGroup && i === cellGroup.start_frame;
      const isGroupEnd = inGroup && i === cellGroup.end_frame;
      const hasGroupPivot = inGroup && !!cellGroup.pivot;

      cell.className = `frame-cell ${isActive ? 'active' : ''} ${isInRange ? 'in-range-selected' : ''} ${inGroup ? 'in-group' : ''} ${isGroupStart ? 'group-start' : ''} ${isGroupEnd ? 'group-end' : ''} ${isIntermediate ? 'group-intermediate' : ''}`;
      cell.dataset.frameIndex = String(i);
      if (!isIntermediate) {
        cell.setAttribute('draggable', 'true');
      }
      cell.setAttribute(
        'title',
        isIntermediate
          ? `Fotograma ${i + 1} (Intermedio automático de ${cellGroup?.name || 'Grupo'}, no editable)`
          : inGroup
          ? `Frame ${i + 1} (${cellGroup?.name || 'Grupo'}${hasGroupPivot ? ` • Pivote: [${cellGroup?.pivot!.x}, ${cellGroup?.pivot!.y}]` : ''})`
          : `Frame ${i + 1} (Shift+Click to select range, Drag to reorder)`
      );

      // Frame number badge
      const numSpan = document.createElement('span');
      numSpan.className = 'cell-num';
      numSpan.textContent = String(i + 1);
      cell.appendChild(numSpan);

      if (isIntermediate) {
        const lockBadge = document.createElement('span');
        lockBadge.className = 'cell-intermediate-lock';
        lockBadge.textContent = '🔒';
        cell.appendChild(lockBadge);
      } else if (hasGroupPivot) {
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

        if (e.shiftKey && !isIntermediate) {
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

      if (!isIntermediate) {
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
      }

      return cell;
    };

    // 1. Create standard existing frame cells or group-intermediate-wrapper
    let frameIdx = 0;
    while (frameIdx < this.totalFrames) {
      const matchingGroup = this.layerGroups.find(
        (g) => frameIdx > g.start_frame && frameIdx < g.end_frame
      );

      if (matchingGroup && frameIdx === matchingGroup.start_frame + 1) {
        // Build the group-intermediate-wrapper containing the pill on top and intermediate cells underneath
        const groupWrapper = document.createElement('div');
        groupWrapper.className = 'group-intermediate-wrapper';

        const isGroupActive = this.activeGroup?.id === matchingGroup.id;

        const pill = document.createElement('div');
        pill.className = `active-group-pill in-reel ${isGroupActive ? 'active' : ''}`;
        pill.innerHTML = `
          <span class="group-pill-name" title="${matchingGroup.name || 'Grupo'} (Fotogramas ${matchingGroup.start_frame + 1}..${matchingGroup.end_frame + 1})">⚡ ${matchingGroup.name || 'Grupo'}</span>
          <div class="group-pill-actions">
            <button class="btn-group-action btn-group-pivot ${this.isPivotMode && isGroupActive ? 'active' : ''}" title="Ubicar eje de giro (pivote) en el canvas">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <line x1="12" y1="2" x2="12" y2="6"></line>
                <line x1="12" y1="18" x2="12" y2="22"></line>
                <line x1="2" y1="12" x2="6" y2="12"></line>
                <line x1="18" y1="12" x2="22" y2="12"></line>
              </svg>
            </button>
            <button class="btn-group-action btn-group-ungroup" title="Desagrupar fotogramas">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        `;

        pill.querySelector('.btn-group-pivot')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onToggleGroupPivotMode?.();
        });

        pill.querySelector('.btn-group-ungroup')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onUngroupFrames?.(matchingGroup.id);
        });

        pill.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('.btn-group-action')) return;
          this.currentFrame = matchingGroup.start_frame;
          this.render();
          this.onSelectFrame?.(matchingGroup.start_frame);
        });

        groupWrapper.appendChild(pill);

        const cellsContainer = document.createElement('div');
        cellsContainer.className = 'group-intermediate-cells';

        // Add all intermediate cells for this group
        while (frameIdx < matchingGroup.end_frame && frameIdx < this.totalFrames) {
          const cell = buildCell(frameIdx, matchingGroup, true);
          cellsContainer.appendChild(cell);
          cellElements.push(cell);
          frameIdx++;
        }

        groupWrapper.appendChild(cellsContainer);
        reel.appendChild(groupWrapper);
      } else {
        const cellGroup = this.layerGroups.find((g) => frameIdx >= g.start_frame && frameIdx <= g.end_frame);
        const cell = buildCell(frameIdx, cellGroup, false);
        reel.appendChild(cell);
        cellElements.push(cell);
        frameIdx++;
      }
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
