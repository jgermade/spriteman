import { describe, expect, it } from 'vitest';
import {
  buildClusterOutline,
  getLinePixels,
  parseHexColor,
  parsePixelKey,
} from '../helpers/canvas.helper';

describe('getLinePixels', () => {
  it('returns the single pixel for a zero-length line', () => {
    expect(getLinePixels(3, 4, 3, 4)).toEqual([{ x: 3, y: 4 }]);
  });

  it('walks a horizontal run without gaps', () => {
    expect(getLinePixels(0, 0, 3, 0)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it('walks a diagonal in both directions', () => {
    expect(getLinePixels(2, 2, 0, 0)).toEqual([
      { x: 2, y: 2 },
      { x: 1, y: 1 },
      { x: 0, y: 0 },
    ]);
  });
});

describe('parseHexColor', () => {
  it('expands the short form', () => {
    expect(parseHexColor('#f0a')).toEqual([255, 0, 170, 255]);
  });

  it('reads six and eight digit forms', () => {
    expect(parseHexColor('#3a5f8a')).toEqual([58, 95, 138, 255]);
    expect(parseHexColor('#3a5f8a80')).toEqual([58, 95, 138, 128]);
  });

  it('rejects anything it cannot parse, so callers can fall back', () => {
    expect(parseHexColor('rgba(1,2,3,0.5)')).toBeNull();
    expect(parseHexColor('__eraser__')).toBeNull();
    expect(parseHexColor('#zzzzzz')).toBeNull();
  });
});

describe('parsePixelKey', () => {
  it('splits a coordinate key', () => {
    expect(parsePixelKey('12,7')).toEqual({ x: 12, y: 7 });
  });

  it('rejects malformed keys', () => {
    expect(parsePixelKey('12')).toBeNull();
    expect(parsePixelKey('a,b')).toBeNull();
  });
});

describe('buildClusterOutline', () => {
  it('outlines a single pixel with four edges', () => {
    const segments = buildClusterOutline({ '0,0': '#000000' });
    expect(segments.length).toBe(16); // 4 edges x 4 numbers
  });

  it('drops the shared edge between two neighbours', () => {
    const segments = buildClusterOutline({ '0,0': '#000000', '1,0': '#000000' });
    expect(segments.length).toBe(24); // 6 outer edges, the touching pair omitted
  });

  it('returns nothing for an empty cluster', () => {
    expect(buildClusterOutline(null).length).toBe(0);
    expect(buildClusterOutline({}).length).toBe(0);
  });
});
