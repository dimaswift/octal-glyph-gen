export type Point = {
  x: number
  y: number
}

export const DIGIT_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7'] as const

export type DigitKey = (typeof DIGIT_KEYS)[number]

export type ArmMap = Record<DigitKey, Point[]>

export type CoreGeometry = {
  origin: Point
  polygon: Point[]
  holes: Point[][]
  socketStart: Point
  socketEnd: Point
  digitsPerGlyph: number
  rotationStepDeg: number
  glyphSpacing: number
}

export type GlyphRendererSettings = {
  fill: string
  padding: number
  precision: number
}

export type GlyphFont = {
  version: 'octal-glyph-font/v1'
  name: string
  units: number
  core: CoreGeometry
  arms: ArmMap
  renderer: GlyphRendererSettings
}
