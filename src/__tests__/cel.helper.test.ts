import { describe, expect, it } from 'vitest';
import { decodeCel, encodeCel } from '../helpers/cel.helper';

const W = 8;
const H = 8;

describe('encodeCel / decodeCel', () => {
  it('round-trips an ordinary cel', () => {
    const pixels = { '0,0': '#ff0000', '1,0': '#ff0000', '3,2': '#00ff00', '7,7': '#0000ff' };
    const encoded = encodeCel(pixels, W, H)!;
    expect(decodeCel(encoded, W, H)).toEqual(pixels);
  });

  it('round-trips a fully painted cel', () => {
    const pixels: Record<string, string> = {};
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) pixels[`${x},${y}`] = x % 2 ? '#111111' : '#222222';
    expect(decodeCel(encodeCel(pixels, W, H)!, W, H)).toEqual(pixels);
  });

  it('returns null for an empty cel so it can be left out of the document', () => {
    expect(encodeCel({}, W, H)).toBeNull();
    expect(encodeCel(null, W, H)).toBeNull();
  });

  it('builds a palette of distinct colours in first-appearance order', () => {
    const encoded = encodeCel({ '1,0': '#aaaaaa', '2,0': '#bbbbbb', '3,0': '#aaaaaa' }, W, H)!;
    expect(encoded.p).toEqual(['#aaaaaa', '#bbbbbb']);
  });

  it('describes exactly width * height pixels', () => {
    const encoded = encodeCel({ '0,0': '#ffffff' }, W, H)!;
    const covered = encoded.r.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
    expect(covered).toBe(W * H);
  });

  it('drops pixels outside the canvas instead of shifting the rest', () => {
    const encoded = encodeCel({ '2,2': '#123456', '99,0': '#ffffff', '-1,4': '#ffffff' }, W, H)!;
    expect(decodeCel(encoded, W, H)).toEqual({ '2,2': '#123456' });
  });

  it('survives a damaged cel rather than throwing', () => {
    expect(decodeCel({ p: [], r: [] }, W, H)).toEqual({});
    expect(decodeCel({ p: ['#fff'], r: [999, 1] }, W, H)['7,7']).toBe('#fff');
    expect(decodeCel({ p: ['#fff'], r: [4, 9] }, W, H)).toEqual({}); // unknown palette index
    expect(decodeCel(null, W, H)).toEqual({});
  });

  it('is much smaller than the plain coordinate map it replaces', () => {
    const pixels: Record<string, string> = {};
    for (let y = 10; y < 40; y++) for (let x = 10; x < 40; x++) pixels[`${x},${y}`] = '#3a5f8a';
    const plain = JSON.stringify(pixels).length;
    const encoded = JSON.stringify(encodeCel(pixels, 64, 64)).length;
    expect(encoded).toBeLessThan(plain / 10);
  });
});
