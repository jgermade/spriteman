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
  onReorderLayer?: (layerId: string, targetIndex: number, newParentId: string | null) => void;
}

export class HierarchyTree {
  private element: HTMLElement;
  private onSelectLayer?: (layerId: string) => void;
  private onAddLayer?: () => void;
  private onTogglePivotMode?: () => void;
  private onToggleLayerRelative?: (layerId: string) => void;
  private onReorderLayer?: (layerId: string, targetIndex: number, newParentId: string | null) => void;
  private isPivotModeActive: boolean = false;

  constructor(options: HierarchyTreeOptions = {}) {
    this.onSelectLayer = options.onSelectLayer;
    this.onAddLayer = options.onAddLayer;
    this.onTogglePivotMode = options.onTogglePivotMode;
    this.onToggleLayerRelative = options.onToggleLayerRelative;
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

      item.className = `layer-item ${isSelected ? 'active' : ''} ${isChild ? 'is-child' : ''}`;
      item.dataset.layerId = layer.id;
      item.dataset.index = String(index);
      item.setAttribute('draggable', 'true');
      item.setAttribute('title', 'Arrastra para reordenar capas o anidar como hija');

      item.innerHTML = `
        <div class="layer-title-group">
          <span class="layer-drag-handle" title="Arrastrar para reordenar">⋮⋮</span>
          <span class="layer-name">
            ${isChild ? '↳ ' : '● '}${layer.name}
          </span>
        </div>
        <div class="layer-actions">
          ${
            isChild
              ? `<button class="btn-relative-toggle ${layer.relative_to_parent !== false ? 'active' : ''}" title="Posición relativa a la capa padre (Clic para alternar relativo/absoluto)">
                   ${layer.relative_to_parent !== false ? '🔗 Rel' : '🔓 Abs'}
                 </button>`
              : ''
          }
          ${
            isSelected
              ? `<button class="btn-pivot-toggle ${this.isPivotModeActive ? 'active' : ''}" title="Definir eje de giro (pivote) en el canvas">
                   📍 Pivote
                 </button>`
              : ''
          }
          <span class="layer-z">Z: ${layer.z_index}</span>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (item.classList.contains('is-dragging')) return;
        if ((e.target as HTMLElement).closest('.btn-relative-toggle')) {
          e.stopPropagation();
          this.onToggleLayerRelative?.(layer.id);
          return;
        }
        // If clicking pivot button, don't re-select layer
        if ((e.target as HTMLElement).closest('.btn-pivot-toggle')) {
          e.stopPropagation();
          this.onTogglePivotMode?.();
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
