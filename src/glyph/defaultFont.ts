import type { ArmMap, GlyphFont, Point } from './types'

const socketStart: Point = { x: -18, y: -52 }
const socketEnd: Point = { x: 18, y: -52 }

export const DEFAULT_CORE_HOLE: Point[] = [
  { x: 0, y: -38 },
  { x: 38, y: 0 },
  { x: 0, y: 38 },
  { x: -38, y: 0 },
]

export const DEFAULT_ARMS: ArmMap = {
  0: [socketStart, socketEnd],
  1: [
    socketStart,
    { x: -18, y: -124 },
    { x: 18, y: -124 },
    socketEnd,
  ],
  2: [
    socketStart,
    { x: -18, y: -118 },
    { x: 52, y: -118 },
    { x: 52, y: -92 },
    { x: 18, y: -92 },
    socketEnd,
  ],
  3: [
    socketStart,
    { x: -18, y: -92 },
    { x: -54, y: -92 },
    { x: -54, y: -118 },
    { x: 18, y: -118 },
    socketEnd,
  ],
  4: [
    socketStart,
    { x: -18, y: -98 },
    { x: 0, y: -130 },
    { x: 18, y: -98 },
    socketEnd,
  ],
  5: [
    socketStart,
    { x: 20, y: -112 },
    { x: 46, y: -96 },
    socketEnd,
  ],
  6: [
    socketStart,
    { x: -48, y: -96 },
    { x: -22, y: -112 },
    socketEnd,
  ],
  7: [
    socketStart,
    { x: -48, y: -104 },
    { x: 0, y: -132 },
    { x: 48, y: -104 },
    socketEnd,
  ],
}

export const DEFAULT_FONT: GlyphFont = {
  version: 'octal-glyph-font/v1',
  name: 'Default octal glyph font',
  units: 256,
  core: {
    origin: { x: 0, y: 0 },
    polygon: [
      { x: 0, y: -64 },
      { x: 64, y: 0 },
      { x: 0, y: 64 },
      { x: -64, y: 0 },
    ],
    holes: [],
    socketStart,
    socketEnd,
    digitsPerGlyph: 4,
    rotationStepDeg: 45,
    glyphSpacing: 185,
  },
  arms: DEFAULT_ARMS,
  renderer: {
    fill: '#111827',
    padding: 18,
    precision: 2,
  },
}

export function cloneDefaultFont() {
  return structuredClone(DEFAULT_FONT)
}
