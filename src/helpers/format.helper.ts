/**
 * Pure formatting helpers for UI display.
 */

export function formatMatrix(matrix: [number, number, number, number, number, number]): string {
  const [a, b, c, d, tx, ty] = matrix;
  return `[${a.toFixed(2)}, ${b.toFixed(2)}, ${c.toFixed(2)}, ${d.toFixed(2)} | tx:${tx.toFixed(1)}, ty:${ty.toFixed(1)}]`;
}
