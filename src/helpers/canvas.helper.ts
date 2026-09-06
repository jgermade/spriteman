/**
 * Pure canvas drawing helpers for pixel art rendering, checkerboard, onion skinning, and gizmos.
 */

export interface CanvasRenderItem {
  layer_id: string;
  matrix: [number, number, number, number, number, number];
  opacity: number;
  color?: string;
}

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
 * Draws discrete 1x1 sprite pixels from a coordinate map (e.g. "x,y" => "#color").
 */
export function drawPixels(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  pixels: Record<string, string>,
  alphaOverride?: number,
  tintColor?: string
): void {
  ctx.save();
  if (typeof alphaOverride === 'number') {
    ctx.globalAlpha = alphaOverride;
  }
  for (const key of Object.keys(pixels)) {
    const comma = key.indexOf(',');
    if (comma === -1) continue;
    const x = parseInt(key.slice(0, comma), 10);
    const y = parseInt(key.slice(comma + 1), 10);
    ctx.fillStyle = tintColor || pixels[key];
    ctx.fillRect(startX + x, startY + y, 1, 1);
  }
  ctx.restore();
}

/**
 * Draws a 1x1 pixel hover highlight showing the target cell and active color with dual outline.
 */
export function drawPixelCursor(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  px: number,
  py: number,
  color: string,
  zoom: number
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(startX + px, startY + py, 1, 1);
  ctx.globalAlpha = 1.0;
  // Dual-stroke border: visible on both white and dark pixels
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.7)';
  ctx.lineWidth = 1.5 / zoom;
  ctx.strokeRect(startX + px, startY + py, 1, 1);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.75 / zoom;
  ctx.strokeRect(startX + px, startY + py, 1, 1);
  ctx.restore();
}

/**
 * Draws a pixel art transparency checkerboard strictly aligned with the sprite pixel resolution.
 * In local sprite coordinates, each checker square is exactly 1x1 sprite pixel.
 */
export function drawPixelCheckerboard(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  spriteWidth: number,
  spriteHeight: number,
  c1: string = '#111823',
  c2: string = '#192332'
): void {
  ctx.save();
  for (let y = 0; y < spriteHeight; y++) {
    for (let x = 0; x < spriteWidth; x++) {
      const isEven = (x + y) % 2 === 0;
      ctx.fillStyle = isEven ? c1 : c2;
      ctx.fillRect(startX + x, startY + y, 1, 1);
    }
  }
  ctx.restore();
}

/**
 * Draws pixel grid lines for precision alignment strictly matching sprite pixel resolution.
 */
export function drawPixelGrid(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  spriteWidth: number,
  spriteHeight: number,
  lineWidth: number = 0.08,
  lineColor: string = 'rgba(255, 255, 255, 0.08)'
): void {
  ctx.save();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (let x = 0; x <= spriteWidth; x++) {
    ctx.moveTo(startX + x, startY);
    ctx.lineTo(startX + x, startY + spriteHeight);
  }
  for (let y = 0; y <= spriteHeight; y++) {
    ctx.moveTo(startX, startY + y);
    ctx.lineTo(startX + spriteWidth, startY + y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws the rotation axis / pivot point gizmo for a layer.
 */
export function drawPivotGizmo(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  px: number,
  py: number,
  zoom: number,
  isEditing: boolean = false
): void {
  ctx.save();
  const centerX = startX + px;
  const centerY = startY + py;

  // Outer ring
  ctx.beginPath();
  ctx.arc(centerX, centerY, 5 / zoom, 0, Math.PI * 2);
  ctx.strokeStyle = isEditing ? '#fbf236' : '#e43b44';
  ctx.lineWidth = 1.5 / zoom;
  ctx.stroke();

  // Center solid pivot dot
  ctx.beginPath();
  ctx.arc(centerX, centerY, 2.5 / zoom, 0, Math.PI * 2);
  ctx.fillStyle = '#e43b44';
  ctx.fill();

  // Crosshairs
  ctx.strokeStyle = isEditing ? '#f59e0b' : 'rgba(15, 23, 42, 0.7)';
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  ctx.moveTo(centerX - 7 / zoom, centerY);
  ctx.lineTo(centerX + 7 / zoom, centerY);
  ctx.moveTo(centerX, centerY - 7 / zoom);
  ctx.lineTo(centerX, centerY + 7 / zoom);
  ctx.stroke();

  ctx.restore();
}

/**
 * Renders a frame's pixel map into a small thumbnail canvas with crisp pixel scaling.
 */
export function renderThumbnailToCanvas(
  targetCanvas: HTMLCanvasElement,
  pixels: Record<string, string>,
  spriteWidth: number,
  spriteHeight: number
): void {
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  const tw = targetCanvas.width;
  const th = targetCanvas.height;
  ctx.clearRect(0, 0, tw, th);

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, tw, th);

  const scaleX = tw / Math.max(1, spriteWidth);
  const scaleY = th / Math.max(1, spriteHeight);

  ctx.imageSmoothingEnabled = false;

  for (const key of Object.keys(pixels)) {
    const comma = key.indexOf(',');
    if (comma === -1) continue;
    const x = parseInt(key.slice(0, comma), 10);
    const y = parseInt(key.slice(comma + 1), 10);
    ctx.fillStyle = pixels[key];
    ctx.fillRect(Math.floor(x * scaleX), Math.floor(y * scaleY), Math.ceil(scaleX), Math.ceil(scaleY));
  }
}

/**
 * Renders a single layer item transform onto the canvas (no placeholder rectangles, purely pivot / transform).
 */
export function drawRenderItem(
  ctx: CanvasRenderingContext2D,
  item: CanvasRenderItem,
  isSelected: boolean = false,
  tintColor?: string,
  alphaOverride?: number
): void {
  // Purely handles layer transform context if needed; placeholder rectangles removed.
  ctx.save();
  const [a, b, c, d, tx, ty] = item.matrix;
  ctx.transform(a, b, c, d, tx, ty);
  ctx.globalAlpha = alphaOverride ?? item.opacity;

  // If selected layer, render its pivot point dot
  if (isSelected) {
    ctx.fillStyle = '#e43b44';
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
