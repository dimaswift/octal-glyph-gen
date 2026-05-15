import type { ArmMap, GlyphFont, GlyphSpecies, Point } from './types'
import { SPECIES_DIGIT_COUNTS } from './types'
import { createRegularCoreGeometry, insetConvexPolygon } from './coreGeometry'

const defaultCoreGeometry = createRegularCoreGeometry({
  origin: { x: 0, y: 0 },
  digitsPerGlyph: 7,
  socketWidth: 16,
  coreRadius: 41.57,
  angleOffsetDeg: 0,
})

export const DEFAULT_CORE_HOLE: Point[] = [
  { x: 27.95, y: 1.45 },
  { x: 25.81, y: 10.82 },
  { x: 16.29, y: 22.75 },
  { x: 7.63, y: 26.92 },
  { x: -7.63, y: 26.92 },
  { x: -16.29, y: 22.75 },
  { x: -25.81, y: 10.82 },
  { x: -27.95, y: 1.45 },
]

export const DEFAULT_ARMS: ArmMap = {
  0: [
    { x: -8, y: 0 },
    { x: 8, y: 0 },
  ],
  1: [
    { x: -8, y: 0 },
    { x: -24, y: 27.71 },
    { x: -16, y: 41.57 },
    { x: 8, y: 0 },
  ],
  2: [
    { x: -8, y: 0 },
    { x: -8, y: 96.99 },
    { x: 0, y: 110.85 },
    { x: 8, y: 96.99 },
    { x: 8, y: 0 },
  ],
  3: [
    { x: -8, y: 0 },
    { x: -40, y: 55.42 },
    { x: -8, y: 110.85 },
    { x: 0, y: 96.99 },
    { x: -24, y: 55.42 },
    { x: 8, y: 0 },
  ],
  4: [
    { x: -8, y: 0 },
    { x: 16, y: 41.57 },
    { x: 24, y: 27.71 },
    { x: 8, y: 0 },
  ],
  5: [
    { x: -8, y: 0 },
    { x: -40, y: 55.42 },
    { x: 24, y: 55.42 },
    { x: 32, y: 41.57 },
    { x: -16, y: 41.57 },
    { x: 8, y: 0 },
  ],
  6: [
    { x: -8, y: 0 },
    { x: -8, y: 138.56 },
    { x: 32, y: 69.28 },
    { x: 24, y: 55.42 },
    { x: 8, y: 83.14 },
    { x: 8, y: 0 },
  ],
  7: [
    { x: -8, y: 0 },
    { x: -40, y: 55.42 },
    { x: 0, y: 124.71 },
    { x: 32, y: 69.28 },
    { x: 24, y: 55.42 },
    { x: 0, y: 96.99 },
    { x: -24, y: 55.42 },
    { x: 8, y: 0 },
  ],
}

function makeDefaultSpecies(digitsPerGlyph: number): GlyphSpecies {
  const geometry = createRegularCoreGeometry({
    origin: { x: 0, y: 0 },
    digitsPerGlyph,
    socketWidth: 16,
    coreRadius: 41.57,
    angleOffsetDeg: 0,
  })
  const core = {
    origin: { x: 0, y: 0 },
    polygon: geometry.polygon,
    holes: [digitsPerGlyph === 7 ? DEFAULT_CORE_HOLE : insetConvexPolygon(geometry.polygon, 14)],
    socketStart: geometry.socketStart,
    socketEnd: geometry.socketEnd,
    sockets: geometry.sockets,
    customCore: false,
    digitsPerGlyph: geometry.digitsPerGlyph,
    rotationStepDeg: geometry.rotationStepDeg,
    socketWidth: geometry.socketWidth,
    coreRadius: geometry.coreRadius,
    angleOffsetDeg: geometry.angleOffsetDeg,
    glyphSpacing: 340,
  }

  return {
    name: speciesName(digitsPerGlyph),
    digitsPerGlyph,
    digitOrder: Array.from({ length: digitsPerGlyph }, (_, index) => digitsPerGlyph - 1 - index),
    core,
  }
}

function speciesName(digitsPerGlyph: number) {
  if (digitsPerGlyph === 3) return 'Tripod'
  if (digitsPerGlyph === 4) return 'Tetrapod'
  if (digitsPerGlyph === 5) return 'Pentapod'
  if (digitsPerGlyph === 6) return 'Hexapod'
  if (digitsPerGlyph === 7) return 'Heptapod'
  if (digitsPerGlyph === 8) return 'Octapod'
  return `${digitsPerGlyph}-pod`
}

const DEFAULT_SPECIES = Object.fromEntries(
  SPECIES_DIGIT_COUNTS.map((digitsPerGlyph) => [String(digitsPerGlyph), makeDefaultSpecies(digitsPerGlyph)]),
)

export const DEFAULT_FONT: GlyphFont = {
  version: 'octal-glyph-font/v1',
  name: 'Octal Glyph universal font',
  units: 256,
  core: {
    origin: { x: 0, y: 0 },
    polygon: defaultCoreGeometry.polygon,
    holes: [DEFAULT_CORE_HOLE],
    socketStart: defaultCoreGeometry.socketStart,
    socketEnd: defaultCoreGeometry.socketEnd,
    sockets: defaultCoreGeometry.sockets,
    customCore: false,
    digitsPerGlyph: defaultCoreGeometry.digitsPerGlyph,
    rotationStepDeg: defaultCoreGeometry.rotationStepDeg,
    socketWidth: defaultCoreGeometry.socketWidth,
    coreRadius: defaultCoreGeometry.coreRadius,
    angleOffsetDeg: defaultCoreGeometry.angleOffsetDeg,
    glyphSpacing: 340,
  },
  armsCoordinateMode: 'socket',
  defaultSpeciesDigits: 7,
  species: DEFAULT_SPECIES,
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
