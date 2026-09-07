/**
 * Pure canvas drawing helpers for pixel art rendering, offscreen sprite buffers and gizmos.
 *
 * Everything here draws in *screen space*: the caller keeps the 2D context untransformed
 * (except for the device-pixel-ratio scale) and passes the artboard origin plus the zoom
 * factor. Sprite content itself is never drawn pixel by pixel — it is composed once into
 * an offscreen buffer at sprite resolution and blitted with a single `drawImage`.
 */

export type PixelMap = Record<string, string>;

export function getTouchDistance(t1: { clientX: number; clientY: number }, t2: { clientX: number; clientY: number }): number {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

export function getTouchMidpoint(t1: { clientX: number; clientY: number }, t2: { clientX: number; clientY: number }): { x: number; y: number } {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  };
}

/**
 * Computes all integer pixel points on a line segment using Bresenham's algorithm.
 */
export function getLinePixels(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let currX = x0;
  let currY = y0;

  while (true) {
    points.push({ x: currX, y: currY });
    if (currX === x1 && currY === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      currX += sx;
    }
    if (e2 < dx) {
      err += dx;
      currY += sy;
    }
  }
  return points;
}

/**
 * Parses a `#rgb`, `#rrggbb` or `#rrggbbaa` color into RGBA components.
 * Returns null for anything else so callers can fall back to the slow path.
 */
export function parseHexColor(color: string): [number, number, number, number] | null {
  if (typeof color !== 'string' || color.charCodeAt(0) !== 35 /* # */) return null;
  const hex = color.slice(1);
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return Number.isNaN(r + g + b) ? null : [r, g, b, 255];
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
    return Number.isNaN(r + g + b + a) ? null : [r, g, b, a];
  }
  return null;
}

/**
 * Splits a `"x,y"` pixel key. Returns null when the key is malformed.
 */
export function parsePixelKey(key: string): { x: number; y: number } | null {
  const comma = key.indexOf(',');
  if (comma === -1) return null;
  const x = parseInt(key.slice(0, comma), 10);
  const y = parseInt(key.slice(comma + 1), 10);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return { x, y };
}

/**
 * Composes a pixel map into an offscreen canvas at sprite resolution via a single
 * `putImageData`. `tint` forces every pixel to one color (used for onion skin and for
 * the moving-layer highlight); `alpha` scales the whole buffer.
 *
 * This replaces one `fillRect` per painted pixel on every repaint with one blit.
 */
export function composePixelBuffer(
  target: HTMLCanvasElement,
  spriteWidth: number,
  spriteHeight: number,
  pixels: PixelMap | null,
  tint?: string,
  alpha: number = 1
): void {
  const w = Math.max(1, spriteWidth);
  const h = Math.max(1, spriteHeight);
  if (target.width !== w) target.width = w;
  if (target.height !== h) target.height = h;

  const ctx = target.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  if (!pixels) return;

  const keys = Object.keys(pixels);
  if (keys.length === 0) return;

  const image = ctx.createImageData(w, h);
  const data = image.data;
  const tintRgba = tint ? parseHexColor(tint) : null;
  const globalAlpha = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  const fallback: Array<{ x: number; y: number; color: string }> = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const point = parsePixelKey(key);
    if (!point || point.x < 0 || point.y < 0 || point.x >= w || point.y >= h) continue;

    const rgba = tintRgba || parseHexColor(pixels[key]);
    if (!rgba) {
      fallback.push({ x: point.x, y: point.y, color: pixels[key] });
      continue;
    }

    const offset = (point.y * w + point.x) * 4;
    data[offset] = rgba[0];
    data[offset + 1] = rgba[1];
    data[offset + 2] = rgba[2];
    data[offset + 3] = (rgba[3] * globalAlpha) / 255;
  }

  ctx.putImageData(image, 0, 0);

  // Non-hex colors (named colors, rgba() strings) are rare; draw them the slow way.
  if (fallback.length > 0) {
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const px of fallback) {
      ctx.fillStyle = tint || px.color;
      ctx.fillRect(px.x, px.y, 1, 1);
    }
    ctx.restore();
  }
}

/**
 * Builds the perimeter outline of a pixel cluster, in sprite units, as flat
 * `[x1, y1, x2, y2, …]` segments. Computed once per cluster change instead of per repaint.
 */
export function buildClusterOutline(pixels: PixelMap | null): Float32Array {
  if (!pixels) return new Float32Array(0);
  const keys = Object.keys(pixels);
  if (keys.length === 0) return new Float32Array(0);

  const occupied = new Set<number>();
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < keys.length; i++) {
    const point = parsePixelKey(keys[i]);
    if (!point) continue;
    occupied.add((point.x & 0xffff) | ((point.y & 0xffff) << 16));
    points.push(point);
  }

  const segments: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const { x, y } = points[i];
    if (!occupied.has((x & 0xffff) | (((y - 1) & 0xffff) << 16))) segments.push(x, y, x + 1, y);
    if (!occupied.has((x & 0xffff) | (((y + 1) & 0xffff) << 16))) segments.push(x, y + 1, x + 1, y + 1);
    if (!occupied.has(((x - 1) & 0xffff) | ((y & 0xffff) << 16))) segments.push(x, y, x, y + 1);
    if (!occupied.has(((x + 1) & 0xffff) | ((y & 0xffff) << 16))) segments.push(x + 1, y, x + 1, y + 1);
  }
  return new Float32Array(segments);
}

/**
 * Strokes a precomputed cluster outline, mapping sprite units to screen space.
 */
export function drawClusterOutline(
  ctx: CanvasRenderingContext2D,
  segments: Float32Array,
  originX: number,
  originY: number,
  zoom: number,
  color: string,
  lineWidth: number
): void {
  if (segments.length === 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (let i = 0; i < segments.length; i += 4) {
    ctx.moveTo(originX + segments[i] * zoom, originY + segments[i + 1] * zoom);
    ctx.lineTo(originX + segments[i + 2] * zoom, originY + segments[i + 3] * zoom);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws the pixel grid over the artboard. One stroked path for the whole grid.
 */
export function drawPixelGrid(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  spriteWidth: number,
  spriteHeight: number,
  zoom: number,
  lineColor: string,
  lineWidth: number = 1
): void {
  ctx.save();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  const right = originX + spriteWidth * zoom;
  const bottom = originY + spriteHeight * zoom;
  for (let x = 0; x <= spriteWidth; x++) {
    const sx = Math.round(originX + x * zoom) + 0.5;
    ctx.moveTo(sx, originY);
    ctx.lineTo(sx, bottom);
  }
  for (let y = 0; y <= spriteHeight; y++) {
    const sy = Math.round(originY + y * zoom) + 0.5;
    ctx.moveTo(originX, sy);
    ctx.lineTo(right, sy);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws the 1x1 pixel hover highlight showing the target cell and the active color.
 */
export function drawPixelCursor(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  px: number,
  py: number,
  zoom: number,
  color: string
): void {
  const x = originX + px * zoom;
  const y = originY + py * zoom;
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(x, y, zoom, zoom);
  ctx.globalAlpha = 1;
  // Dual stroke so the cursor reads on both light and dark pixels.
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, zoom, zoom);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, zoom, zoom);
  ctx.restore();
}

/**
 * Draws the rotation axis / pivot point gizmo for the active interpolation group.
 */
export function drawPivotGizmo(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  px: number,
  py: number,
  zoom: number,
  isEditing: boolean = false
): void {
  const centerX = originX + px * zoom;
  const centerY = originY + py * zoom;

  ctx.save();

  ctx.beginPath();
  ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
  ctx.strokeStyle = isEditing ? '#fbf236' : '#e43b44';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(centerX, centerY, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#e43b44';
  ctx.fill();

  ctx.strokeStyle = isEditing ? '#f59e0b' : 'rgba(15, 23, 42, 0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX - 7, centerY);
  ctx.lineTo(centerX + 7, centerY);
  ctx.moveTo(centerX, centerY - 7);
  ctx.lineTo(centerX, centerY + 7);
  ctx.stroke();

  ctx.restore();
}
