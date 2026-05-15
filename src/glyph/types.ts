export type Point = {
  x: number
  y: number
}

export const DIGIT_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7'] as const

export type DigitKey = (typeof DIGIT_KEYS)[number]

export const SPECIES_DIGIT_COUNTS = [3, 4, 5, 6, 7, 8] as const

export type SpeciesDigitCount = (typeof SPECIES_DIGIT_COUNTS)[number]

export type ArmMap = Record<DigitKey, Point[]>

export type SocketSegment = {
  start: Point
  end: Point
}

export type CoreGeometry = {
  origin: Point
  polygon: Point[]
  holes: Point[][]
  socketStart: Point
  socketEnd: Point
  sockets: SocketSegment[]
  customCore: boolean
  digitsPerGlyph: number
  rotationStepDeg: number
  socketWidth: number
  coreRadius: number
  angleOffsetDeg: number
  glyphSpacing: number
}

export type DigitOrder = number[]

export type GlyphSpecies = {
  name: string
  digitsPerGlyph: number
  digitOrder: DigitOrder
  core: CoreGeometry
}

export type GlyphSpeciesMap = Record<string, GlyphSpecies>

export type GlyphRendererSettings = {
  fill: string
  gridSize: number
  paddingCells: number
  precision: number
}

export type GlyphFont = {
  version: 'octal-glyph-font/v1'
  name: string
  units: number
  armsCoordinateMode: 'socket'
  core: CoreGeometry
  species?: GlyphSpeciesMap
  defaultSpeciesDigits?: number
  arms: ArmMap
  renderer: GlyphRendererSettings
}
