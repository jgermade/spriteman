/**
 * WebAssembly engine wrapper and initializer.
 *
 * Frame evaluation reads plain numbers out of WASM memory through a `Float32Array` view
 * instead of serializing every frame to JSON in Rust and parsing it back in JS.
 */
import initWasm, { SpritemotionWasm } from './pkg/spritemotion.js';
import wasmUrl from './pkg/spritemotion_bg.wasm?url';

/** One layer as the engine sees it. Only changes when a project is loaded. */
export interface EngineLayer {
  id: string;
  name: string;
  z_index: number;
}

/** A single evaluated layer, materialized from the frame buffer on demand. */
export interface RenderItem {
  layer_id: string;
  layer_name: string;
  z_index: number;
  matrix: [number, number, number, number, number, number];
  opacity: number;
  pivot_world: { x: number; y: number };
}

/**
 * An evaluated frame held as packed numbers. `data` holds `count * stride` values;
 * use `readRenderItem` to turn one record into an object.
 */
export interface ResolvedFrame {
  frame: number;
  count: number;
  stride: number;
  data: Float32Array;
  layers: EngineLayer[];
}

let wasmInitPromise: Promise<WebAssembly.Memory | null> | null = null;
let wasmMemory: WebAssembly.Memory | null = null;

export async function ensureWasmInitialized(): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = initWasm({ module_or_path: wasmUrl })
      .then((exports: any) => {
        wasmMemory = exports?.memory ?? null;
        return wasmMemory;
      })
      .catch((err) => {
        wasmInitPromise = null;
        throw err;
      });
  }
  await wasmInitPromise;
}

// The view onto WASM memory is cached: rebuilding it every tick allocates for nothing,
// and it only becomes invalid when the buffer moves, resizes, or memory growth detaches it.
let cachedView: Float32Array | null = null;
let cachedBuffer: ArrayBufferLike | null = null;
let cachedPointer = -1;

function frameView(pointer: number, length: number): Float32Array | null {
  if (!wasmMemory) return null;
  const buffer = wasmMemory.buffer;
  const stale =
    !cachedView ||
    cachedBuffer !== buffer ||
    cachedPointer !== pointer ||
    cachedView.length !== length ||
    cachedView.byteLength === 0;

  if (stale) {
    cachedView = new Float32Array(buffer, pointer, length);
    cachedBuffer = buffer;
    cachedPointer = pointer;
  }
  return cachedView;
}

/**
 * Copies the frame the engine just evaluated out of WASM memory.
 *
 * The copy is deliberate: the view aliases the engine's buffer, which the next call
 * overwrites and a memory growth would detach. Both the view and the destination are
 * reused, so steady-state playback allocates nothing on either side of the boundary.
 */
export function readFrameBuffer(engine: SpritemotionWasm, count: number, stride: number, into?: Float32Array): Float32Array {
  const length = count * stride;
  const target = into && into.length === length ? into : new Float32Array(length);
  if (length === 0) return target;

  const view = frameView(engine.frame_buffer_ptr(), length);
  if (view) target.set(view);
  return target;
}

/** Materializes one record of a resolved frame as a render item. */
export function readRenderItem(frame: ResolvedFrame, index: number): RenderItem | null {
  if (index < 0 || index >= frame.count) return null;
  const base = index * frame.stride;
  const layerIndex = frame.data[base];
  const layer = layerIndex >= 0 ? frame.layers[layerIndex] : undefined;

  return {
    layer_id: layer?.id ?? '',
    layer_name: layer?.name ?? '',
    z_index: layer?.z_index ?? 0,
    matrix: [
      frame.data[base + 1],
      frame.data[base + 2],
      frame.data[base + 3],
      frame.data[base + 4],
      frame.data[base + 5],
      frame.data[base + 6],
    ],
    opacity: frame.data[base + 7],
    pivot_world: { x: frame.data[base + 8], y: frame.data[base + 9] },
  };
}

/** Finds the evaluated item for a layer, without materializing the others. */
export function findRenderItem(frame: ResolvedFrame | null, layerId: string | null): RenderItem | null {
  if (!frame || !layerId) return null;
  const layerIndex = frame.layers.findIndex((layer) => layer.id === layerId);
  if (layerIndex === -1) return null;

  for (let i = 0; i < frame.count; i++) {
    if (frame.data[i * frame.stride] === layerIndex) {
      return readRenderItem(frame, i);
    }
  }
  return null;
}

export { SpritemotionWasm };
