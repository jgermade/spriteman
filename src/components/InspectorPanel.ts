/**
 * InspectorPanel Component.
 * STRICT RULE: Only imports from helpers/ or other components/.
 */
import { formatMatrix } from '../helpers/format.helper';

export interface InspectorItem {
  layer_id: string;
  layer_name: string;
  matrix: [number, number, number, number, number, number];
  opacity: number;
  z_index: number;
  pivot_world?: { x: number; y: number };
}

export class InspectorPanel {
  private element: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'inspector-panel';
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public update(item?: InspectorItem | null): void {
    if (!item) {
      this.element.innerHTML = `
        <div class="panel-header">
          <span class="panel-title">Layer Inspector</span>
        </div>
        <div class="panel-empty">No layer selected</div>
      `;
      return;
    }

    const [a, b, c, d, tx, ty] = item.matrix;

    this.element.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Inspector: ${item.layer_name}</span>
        <span class="badge">Z: ${item.z_index}</span>
      </div>
      <div class="inspector-props">
        <div class="prop-row">
          <span class="prop-label">Opacity:</span>
          <span class="prop-val">${(item.opacity * 100).toFixed(0)}%</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">World TX, TY:</span>
          <span class="prop-val">${tx.toFixed(1)}, ${ty.toFixed(1)}</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Transform Matrix:</span>
        </div>
        <pre class="matrix-code">${formatMatrix(item.matrix)}</pre>
      </div>
    `;
  }
}
