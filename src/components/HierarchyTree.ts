/**
 * HierarchyTree Component — Layer hierarchy with Add Layer placeholder,
 * Pivot Gizmo toggle, and Drag-and-Drop layer reordering / reparenting.
 * STRICT RULE: Only imports from helpers/ or other components/.
 */

export interface LayerNode {
  id: string;
  name: string;
  parent_id: string | null;
  z_index: number;
  visible: boolean;
  pivot?: { x: number; y: number };
  relative_to_parent?: boolean;
}

export interface HierarchyTreeOptions {
  onSelectLayer?: (layerId: string) => void;
  onAddLayer?: () => void;
  onTogglePivotMode?: () => void;
  onToggleLayerRelative?: (layerId: string) => void;
  onToggleLayerVisibility?: (layerId: string) => void;
  onRenameLayer?: (layerId: string, name: string) => void;
  onDeleteLayer?: (layerId: string) => void;
  onReorderLayer?: (layerId: string, targetIndex: number, newParentId: string | null) => void;
}

export class HierarchyTree {
  private element: HTMLElement;
  private onSelectLayer?: (layerId: string) => void;
  private onAddLayer?: () => void;
  private onTogglePivotMode?: () => void;
  private onToggleLayerRelative?: (layerId: string) => void;
  private onToggleLayerVisibility?: (layerId: string) => void;
  private onRenameLayer?: (layerId: string, name: string) => void;
  private onDeleteLayer?: (layerId: string) => void;
  private onReorderLayer?: (layerId: string, targetIndex: number, newParentId: string | null) => void;
  private isPivotModeActive: boolean = false;

  constructor(options: HierarchyTreeOptions = {}) {
    this.onSelectLayer = options.onSelectLayer;
    this.onAddLayer = options.onAddLayer;
    this.onTogglePivotMode = options.onTogglePivotMode;
    this.onToggleLayerRelative = options.onToggleLayerRelative;
    this.onToggleLayerVisibility = options.onToggleLayerVisibility;
    this.onRenameLayer = options.onRenameLayer;
    this.onDeleteLayer = options.onDeleteLayer;
    this.onReorderLayer = options.onReorderLayer;
    this.element = document.createElement('div');
    this.element.className = 'hierarchy-panel';
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public update(layers: LayerNode[], selectedId?: string | null, isPivotMode: boolean = false): void {
    this.isPivotModeActive = isPivotMode;

    this.element.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Layer Hierarchy</span>
        <span class="badge">${layers.length} Layers</span>
      </div>
      <div class="layer-list"></div>
    `;

    const list = this.element.querySelector('.layer-list')!;
    const itemElements: HTMLElement[] = [];

    const clearDropClasses = () => {
      itemElements.forEach((el) => {
        el.classList.remove('drop-before', 'drop-after', 'drop-child', 'is-dragging');
      });
    };

    // Render layers
    layers.forEach((layer, index) => {
      const item = document.createElement('div');
      const isSelected = layer.id === selectedId;
      const isChild = !!layer.parent_id;
      const isVisible = layer.visible !== false;

      item.className = `layer-item ${isSelected ? 'active' : ''} ${isChild ? 'is-child' : ''} ${!isVisible ? 'is-hidden' : ''}`;
      item.dataset.layerId = layer.id;
      item.dataset.index = String(index);
      item.setAttribute('draggable', 'true');
      item.setAttribute('title', 'Arrastra para reordenar capas o anidar como hija');

      item.innerHTML = `
        <div class="layer-title-group">
          <button class="btn-layer-action btn-layer-visibility ${isVisible ? 'is-visible' : 'is-hidden'}" title="${isVisible ? 'Ocultar capa' : 'Mostrar capa'}">
            ${
              isVisible
                ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                     <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                     <circle cx="12" cy="12" r="3"></circle>
                   </svg>`
                : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                     <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                     <line x1="1" y1="1" x2="23" y2="23"></line>
                   </svg>`
            }
          </button>
          <span class="layer-drag-handle" title="Arrastrar para reordenar">⋮⋮</span>
          <span class="layer-name-container">
            ${isChild ? '<span class="layer-child-arrow">↳</span>' : ''}
            <span class="layer-name" title="Doble clic para renombrar">${layer.name}</span>
          </span>
        </div>
        <div class="layer-actions">
          ${
            isChild
              ? `<button class="btn-layer-action btn-relative-toggle ${layer.relative_to_parent !== false ? 'rel-parent' : 'free-movement'}" title="${layer.relative_to_parent !== false ? 'Movimiento relativo al padre (clic para movimiento libre)' : 'Movimiento libre (clic para relativo al padre)'}">
                   ${
                     layer.relative_to_parent !== false
                       ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                          </svg>`
                       : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="5 9 2 12 5 15"></polyline>
                            <polyline points="9 5 12 2 15 5"></polyline>
                            <polyline points="15 19 12 22 9 19"></polyline>
                            <polyline points="19 9 22 12 19 15"></polyline>
                            <line x1="2" y1="12" x2="22" y2="12"></line>
                            <line x1="12" y1="2" x2="12" y2="22"></line>
                          </svg>`
                   }
                 </button>`
              : ''
          }
          <button class="btn-layer-action btn-layer-delete" title="Borrar capa" ${layers.length <= 1 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
          <span class="layer-z">Z:${layer.z_index}</span>
        </div>
      `;

      // Inline rename on double click
      const nameSpan = item.querySelector('.layer-name') as HTMLElement;
      nameSpan?.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        item.setAttribute('draggable', 'false');

        const currentName = layer.name;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'layer-rename-input';
        input.value = currentName;

        nameSpan.replaceWith(input);
        input.focus();
        input.select();

        let committed = false;
        const commit = () => {
          if (committed) return;
          committed = true;
          const newName = input.value.trim();
          if (newName && newName !== currentName) {
            this.onRenameLayer?.(layer.id, newName);
          } else {
            input.replaceWith(nameSpan);
            item.setAttribute('draggable', 'true');
          }
        };

        const cancel = () => {
          if (committed) return;
          committed = true;
          input.replaceWith(nameSpan);
          item.setAttribute('draggable', 'true');
        };

        input.addEventListener('keydown', (ke) => {
          ke.stopPropagation();
          if (ke.key === 'Enter') {
            commit();
          } else if (ke.key === 'Escape') {
            cancel();
          }
        });
        input.addEventListener('click', (ke) => ke.stopPropagation());
        input.addEventListener('blur', () => {
          commit();
        });
      });

      item.addEventListener('click', (e) => {
        if (item.classList.contains('is-dragging')) return;
        const target = e.target as HTMLElement;

        if (target.closest('.btn-layer-visibility')) {
          e.stopPropagation();
          this.onToggleLayerVisibility?.(layer.id);
          return;
        }
        if (target.closest('.btn-relative-toggle')) {
          e.stopPropagation();
          this.onToggleLayerRelative?.(layer.id);
          return;
        }
        if (target.closest('.btn-layer-delete')) {
          e.stopPropagation();
          if (layers.length > 1) {
            this.onDeleteLayer?.(layer.id);
          }
          return;
        }
        if (target.closest('.layer-rename-input')) {
          return;
        }
        this.onSelectLayer?.(layer.id);
      });

      // HTML5 Drag & Drop listeners
      item.addEventListener('dragstart', (e: DragEvent) => {
        item.classList.add('is-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/plain', layer.id);
          e.dataTransfer.effectAllowed = 'move';
        }
      });

      item.addEventListener('dragend', () => {
        clearDropClasses();
      });

      item.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

        const rect = item.getBoundingClientRect();
        const relY = (e.clientY - rect.top) / rect.height;

        item.classList.remove('drop-before', 'drop-after', 'drop-child');
        if (relY < 0.28) {
          item.classList.add('drop-before');
        } else if (relY > 0.72) {
          item.classList.add('drop-after');
        } else {
          item.classList.add('drop-child');
        }
      });

      item.addEventListener('dragleave', (e: DragEvent) => {
        if (!item.contains(e.relatedTarget as Node)) {
          item.classList.remove('drop-before', 'drop-after', 'drop-child');
        }
      });

      item.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault();
        const fromId = e.dataTransfer?.getData('text/plain');
        if (!fromId || fromId === layer.id) {
          clearDropClasses();
          return;
        }

        const isBefore = item.classList.contains('drop-before');
        const isAfter = item.classList.contains('drop-after');
        const isChildDrop = item.classList.contains('drop-child');
        clearDropClasses();

        const fromIndex = layers.findIndex((l) => l.id === fromId);
        if (fromIndex === -1) return;

        let targetIndex: number;
        let newParentId: string | null = null;

        if (isChildDrop) {
          // Nest as child of this layer
          newParentId = layer.id;
          targetIndex = fromIndex < index ? index : index + 1;
        } else if (isBefore) {
          newParentId = layer.parent_id;
          targetIndex = fromIndex < index ? index - 1 : index;
        } else {
          // After
          newParentId = layer.parent_id;
          targetIndex = fromIndex < index ? index : index + 1;
        }

        targetIndex = Math.max(0, Math.min(layers.length - 1, targetIndex));
        this.onReorderLayer?.(fromId, targetIndex, newParentId);
      });

      list.appendChild(item);
      itemElements.push(item);
    });

    // Add Layer placeholder at the bottom of the layer list (.layer-item.new)
    const newLayerBtn = document.createElement('button');
    newLayerBtn.className = 'layer-item new';
    newLayerBtn.setAttribute('title', 'Añadir nueva capa');
    newLayerBtn.innerHTML = `
      <span class="layer-new-icon">+</span>
      <span class="layer-new-text">Añadir Capa</span>
    `;

    newLayerBtn.addEventListener('click', () => {
      this.onAddLayer?.();
    });

    list.appendChild(newLayerBtn);
  }
}
