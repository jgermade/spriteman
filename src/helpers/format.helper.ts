/**
 * Pure formatting helpers for UI display, times, and matrices.
 */

export function formatFrame(frame: number, totalFrames: number): string {
  return `${frame.toFixed(1)} / ${totalFrames}`;
}

export function formatTime(frame: number, fps: number): string {
  const seconds = frame / Math.max(fps, 1);
  return `${seconds.toFixed(2)}s`;
}

export function formatMatrix(matrix: [number, number, number, number, number, number]): string {
  const [a, b, c, d, tx, ty] = matrix;
  return `[${a.toFixed(2)}, ${b.toFixed(2)}, ${c.toFixed(2)}, ${d.toFixed(2)} | tx:${tx.toFixed(1)}, ty:${ty.toFixed(1)}]`;
}
