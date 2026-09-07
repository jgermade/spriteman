/**
 * Cel encoding for the v2 document format.
 *
 * A cel is one layer's pixels on one frame. In memory it stays a `"x,y" -> "#rrggbb"`
 * map, which is what painting works on; on disk it becomes a small palette plus a
 * run-length encoding in row-major order, which is roughly ten times smaller because
 * pixel art is mostly transparent and mostly runs of one colour.
 *
 * ```jsonc
 * { "p": ["#3a5f8a", "#e43b44"],  // palette; index 0 in `r` means transparent
 *   "r": [128, 0, 4, 1, 60, 0] }  // pairs of [run length, palette index + 1]
 * ```
 *
 * The runs always describe exactly `width * height` pixels, so a decoder needs nothing
 * but the canvas size from the document metadata.
 */

export type PixelMap = Record<string, string>;

export interface EncodedCel {
  /** Colours used by this cel, in first-appearance order. */
  p: string[];
  /** Flat `[runLength, paletteIndex, …]` pairs; index 0 is transparent. */
  r: number[];
}

/**
 * Packs a pixel map into palette + runs. Returns null for an empty cel so callers can
 * leave it out of the document entirely.
 *
 * Pixels outside the canvas are dropped: they cannot be seen, and keeping them would
 * make the run length disagree with the canvas size.
 */
export function encodeCel(pixels: PixelMap | undefined | null, width: number, height: number): EncodedCel | null {
  if (!pixels) return null;
  const keys = Object.keys(pixels);
  if (keys.length === 0) return null;

  const palette: string[] = [];
  const paletteIndex = new Map<string, number>();
  const indexOf = (color: string): number => {
    let index = paletteIndex.get(color);
    if (index === undefined) {
      index = palette.length;
      palette.push(color);
      paletteIndex.set(color, index);
    }
    return index + 1; // 0 is reserved for transparent
  };

  const runs: number[] = [];
  let runLength = 0;
  let runValue = 0;
  let painted = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = pixels[`${x},${y}`];
      const value = color === undefined ? 0 : indexOf(color);
      if (value !== 0) painted++;
      if (value === runValue) {
        runLength++;
      } else {
        if (runLength > 0) runs.push(runLength, runValue);
        runValue = value;
        runLength = 1;
      }
    }
  }
  if (runLength > 0) runs.push(runLength, runValue);

  // Everything the map held was out of bounds.
  if (painted === 0) return null;

  return { p: palette, r: runs };
}

/**
 * Rebuilds a pixel map from palette + runs. Trailing runs beyond the canvas and unknown
 * palette indices are ignored rather than throwing, so one damaged cel cannot take a
 * whole project down with it.
 */
export function decodeCel(cel: EncodedCel | null | undefined, width: number, height: number): PixelMap {
  const pixels: PixelMap = {};
  if (!cel || !Array.isArray(cel.r)) return pixels;

  const palette = Array.isArray(cel.p) ? cel.p : [];
  const total = width * height;
  let position = 0;

  for (let i = 0; i + 1 < cel.r.length; i += 2) {
    const runLength = cel.r[i];
    const value = cel.r[i + 1];
    if (!(runLength > 0)) continue;

    const end = Math.min(position + runLength, total);
    if (value > 0) {
      const color = palette[value - 1];
      if (color !== undefined) {
        for (let at = position; at < end; at++) {
          pixels[`${at % width},${Math.floor(at / width)}`] = color;
        }
      }
    }
    position = end;
    if (position >= total) break;
  }

  return pixels;
}
