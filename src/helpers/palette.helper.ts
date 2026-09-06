/**
 * Pixel art palette and standard canvas dimensions helper.
 */

export interface CanvasSizePreset {
  label: string;
  width: number;
  height: number;
}

export const STANDARD_PIXEL_SIZES: CanvasSizePreset[] = [
  { label: '16 × 16 (Mini)', width: 16, height: 16 },
  { label: '24 × 24 (Tiny)', width: 24, height: 24 },
  { label: '32 × 32 (Classic)', width: 32, height: 32 },
  { label: '48 × 48 (Medium)', width: 48, height: 48 },
  { label: '64 × 64 (Standard)', width: 64, height: 64 },
  { label: '128 × 128 (Detailed)', width: 128, height: 128 },
];

/**
 * Curated 32-color pixel art palette (harmonious tones for retro characters & games).
 */
export const PIXEL_ART_PALETTE: string[] = [
  '#000000', '#222034', '#45283c', '#663931', '#8f563b', '#df7126', '#d9a066', '#eec39a',
  '#fbf236', '#99e550', '#6abe30', '#37946e', '#4b692f', '#524b24', '#323c39', '#3f3f74',
  '#306082', '#5b6ee1', '#639bff', '#5fcde4', '#cbdbfc', '#ffffff', '#9badb7', '#847e87',
  '#696a6a', '#595652', '#76428a', '#ac3232', '#d95763', '#d77643', '#ead4aa', '#e43b44'
];

export function getDefaultPixelSize(): CanvasSizePreset {
  return STANDARD_PIXEL_SIZES[4]; // 64x64
}
