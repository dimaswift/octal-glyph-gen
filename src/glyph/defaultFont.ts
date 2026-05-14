import type { ArmMap, GlyphFont, Point } from './types'

const socketStart: Point = { x: -8, y: -41.57 }
const socketEnd: Point = { x: 8, y: -41.57 }

export const DEFAULT_CORE_HOLE: Point[] = [
        {
          "x": 8,
          "y": 0
        },
        {
          "x": 24,
          "y": 0
        },
        {
          "x": 24,
          "y": 13.86
        },
        {
          "x": 0,
          "y": 27.71
        },
        {
          "x": -24,
          "y": 13.86
        },
        {
          "x": -24,
          "y": 0
        },
        {
          "x": -8,
          "y": 0
        }
]

export const DEFAULT_ARMS: ArmMap = {
  0: [
    socketStart,
    { x: -0.19, y: -45.95 },
    socketEnd,
  ],
  1: [
    socketStart,
    { x: -32, y: -83.14 },
    { x: -16, y: -83.14 },
    socketEnd,
  ],
  2: [
    socketStart,
    { x: -8, y: -138.56 },
    { x: 0, y: -152.42 },
    { x: 8, y: -138.56 },
    socketEnd,
  ],
  3: [
    socketStart,
    { x: -40, y: -96.99 },
    { x: -8, y: -152.42 },
    { x: 0, y: -138.56 },
    { x: -24, y: -96.99 },
    socketEnd,
  ],
  4: [
    socketStart,
    { x: 16, y: -83.14 },
    { x: 32, y: -83.14 },
    socketEnd,
  ],
  5: [
    socketStart,
    { x: -40, y: -96.99 },
    { x: 40, y: -96.99 },
    { x: 32, y: -83.14 },
    { x: -16, y: -83.14 },
    socketEnd,
  ],
  6: [
    socketStart,
    { x: -8, y: -180.13 },
    { x: 40, y: -96.99 },
    { x: 32, y: -83.14 },
    { x: 8, y: -124.71 },
    socketEnd,
  ],
  7: [
    socketStart,
    { x: -40, y: -96.99 },
    { x: 0, y: -166.28 },
    { x: 40, y: -96.99 },
    { x: 32, y: -83.14 },
    { x: 0, y: -138.56 },
    { x: -24, y: -96.99 },
    socketEnd,
  ],
}

export const DEFAULT_FONT: GlyphFont = {
  version: 'octal-glyph-font/v1',
  name: 'Hex octal glyph font v2',
  units: 256,
  core: {
    origin: { x: 0, y: 0 },
    polygon: [
      { x: -8, y: -41.57 },
      { x: 8, y: -41.57 },
      { x: 32, y: -27.71 },
      { x: 40, y: -13.86 },
      { x: 40, y: 13.86 },
      { x: 32, y: 27.71 },
      { x: 8, y: 41.57 },
      { x: -8, y: 41.57 },
      { x: -32, y: 27.71 },
      { x: -32, y: 27.71 },
      { x: -40, y: 13.86 },
      { x: -40, y: -13.86 },
      { x: -32, y: -27.71 },
    ],
    holes: [DEFAULT_CORE_HOLE],
    socketStart,
    socketEnd,
    digitsPerGlyph: 6,
    rotationStepDeg: 60,
    glyphSpacing: 340,
  },
  arms: DEFAULT_ARMS,
  renderer: {
    fill: '#000000',
    gridSize: 8,
    paddingCells: 2,
    precision: 2,
  },
}

export function cloneDefaultFont() {
  return structuredClone(DEFAULT_FONT)
}
