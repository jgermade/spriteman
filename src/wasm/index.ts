/**
 * WebAssembly engine wrapper and initializer.
 */
import initWasm, { SpritemotionWasm } from './pkg/spritemotion.js';
import wasmUrl from './pkg/spritemotion_bg.wasm?url';

export interface RenderItem {
  layer_id: string;
  layer_name: string;
  sheet_id: string | null;
  frame_id: string | null;
  source_rect: [number, number, number, number] | null;
  matrix: [number, number, number, number, number, number];
  opacity: number;
  z_index: number;
  pivot_world: { x: number; y: number };
}

export interface ResolvedFrame {
  frame: number;
  items: RenderItem[];
}

let wasmInitPromise: Promise<void> | null = null;

export async function ensureWasmInitialized(): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = initWasm(wasmUrl).then(() => undefined);
  }
  return wasmInitPromise;
}

export { SpritemotionWasm };
