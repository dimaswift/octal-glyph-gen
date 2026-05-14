import { union, type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping'
import { DEFAULT_FONT } from './defaultFont'
import { DIGIT_KEYS, type DigitKey, type GlyphFont, type Point } from './types'

export type GlyphChunk = {
  raw: string
  padded: string
  digitsLsbFirst: DigitKey[]
}

export type GlyphRender = {
  input: string
  chunks: GlyphChunk[]
  path: string
  svg: string
  viewBox: string
  bounds: Bounds
  multiPolygon: MultiPolygon
}

export type Bounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

const DEFAULT_BOUNDS: Bounds = {
  minX: -90,
  minY: -150,
  maxX: 90,
  maxY: 90,
  width: 180,
  height: 240,
}

export function rotatePoint(point: Point, degrees: number, origin: Point): Point {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const x = point.x - origin.x
  const y = point.y - origin.y

  return {
    x: origin.x + x * cos - y * sin,
    y: origin.y + x * sin + y * cos,
  }
}

export function translatePoint(point: Point, dx: number, dy: number): Point {
  return { x: point.x + dx, y: point.y + dy }
}

export function pointsToSvg(points: Point[], precision = 2) {
  return points
    .map((point) => `${formatNumber(point.x, precision)},${formatNumber(point.y, precision)}`)
    .join(' ')
}

export function sanitizeOctalInput(value: string) {
  const compact = value.replace(/\s+/g, '')
  return compact.replace(/[^0-7]/g, '')
}

export function hasInvalidOctalDigits(value: string) {
  return /[^0-7\s]/.test(value)
}

export function splitOctalChunks(value: string, digitsPerGlyph = DEFAULT_FONT.core.digitsPerGlyph): GlyphChunk[] {
  const clean = sanitizeOctalInput(value) || '0'
  const chunks: GlyphChunk[] = []
  const chunkSize = clampInteger(digitsPerGlyph, 1, 32)

  for (let end = clean.length; end > 0; end -= chunkSize) {
    const start = Math.max(0, end - chunkSize)
    const raw = clean.slice(start, end)
    const padded = raw.padStart(chunkSize, '0')
    const digitsLsbFirst = padded.split('').reverse() as DigitKey[]
    chunks.push({ raw, padded, digitsLsbFirst })
  }

  return chunks
}

export function alignArmEndpoints(font: GlyphFont, points: Point[]) {
  if (points.length === 0) {
    return [font.core.socketStart, font.core.socketEnd]
  }

  if (points.length === 1) {
    return [font.core.socketStart, font.core.socketEnd]
  }

  const next = points.map((point) => ({ ...point }))
  next[0] = { ...font.core.socketStart }
  next[next.length - 1] = { ...font.core.socketEnd }
  return next
}

export function normalizeFont(rawInput: Partial<GlyphFont> | null | undefined = {}): GlyphFont {
  const raw: Record<string, unknown> = isRecord(rawInput) ? rawInput : {}
  const rawCore: Record<string, unknown> = isRecord(raw.core) ? raw.core : {}
  const rawArms: Record<string, unknown> = isRecord(raw.arms) ? raw.arms : {}
  const rawRenderer: Record<string, unknown> = isRecord(raw.renderer) ? raw.renderer : {}
  const merged: GlyphFont = {
    version: 'octal-glyph-font/v1',
    name: typeof raw.name === 'string' ? raw.name : DEFAULT_FONT.name,
    units: isFiniteNumber(raw.units) ? raw.units : DEFAULT_FONT.units,
    core: {
      ...DEFAULT_FONT.core,
      ...rawCore,
      origin: isPoint(rawCore.origin) ? rawCore.origin : DEFAULT_FONT.core.origin,
      polygon: isPointArray(rawCore.polygon) ? rawCore.polygon : DEFAULT_FONT.core.polygon,
      holes: isPointArrayList(rawCore.holes) ? rawCore.holes : DEFAULT_FONT.core.holes,
      socketStart: isPoint(rawCore.socketStart) ? rawCore.socketStart : DEFAULT_FONT.core.socketStart,
      socketEnd: isPoint(rawCore.socketEnd) ? rawCore.socketEnd : DEFAULT_FONT.core.socketEnd,
      digitsPerGlyph: isFiniteNumber(rawCore.digitsPerGlyph)
        ? clampInteger(rawCore.digitsPerGlyph, 1, 32)
        : DEFAULT_FONT.core.digitsPerGlyph,
      rotationStepDeg: isFiniteNumber(rawCore.rotationStepDeg)
        ? rawCore.rotationStepDeg
        : DEFAULT_FONT.core.rotationStepDeg,
      glyphSpacing: isFiniteNumber(rawCore.glyphSpacing) ? rawCore.glyphSpacing : DEFAULT_FONT.core.glyphSpacing,
    },
    renderer: {
      ...DEFAULT_FONT.renderer,
      ...rawRenderer,
      fill: typeof rawRenderer.fill === 'string' ? rawRenderer.fill : DEFAULT_FONT.renderer.fill,
      padding: isFiniteNumber(rawRenderer.padding) ? rawRenderer.padding : DEFAULT_FONT.renderer.padding,
      precision: isFiniteNumber(rawRenderer.precision) ? rawRenderer.precision : DEFAULT_FONT.renderer.precision,
    },
    arms: { ...DEFAULT_FONT.arms },
  }

  DIGIT_KEYS.forEach((digit) => {
    const arm = rawArms[digit]
    merged.arms[digit] = alignArmEndpoints(merged, isPointArray(arm) ? arm : DEFAULT_FONT.arms[digit])
  })

  return merged
}

export function buildGlyphRender(fontInput: GlyphFont, value: string): GlyphRender {
  const font = normalizeFont(fontInput)
  const chunks = splitOctalChunks(value, font.core.digitsPerGlyph)
  const polygons: Polygon[] = []

  chunks.forEach((chunk, stackIndex) => {
    const yOffset = stackIndex * font.core.glyphSpacing
    const coreRing = pointListToRing(font.core.polygon.map((point) => translatePoint(point, 0, yOffset)))
    const coreHoles = font.core.holes
      .map((hole) => pointListToRing(hole.map((point) => translatePoint(point, 0, yOffset))))
      .filter((ring) => ring.length >= 3)
    if (coreRing.length >= 3) {
      polygons.push([coreRing, ...coreHoles])
    }

    chunk.digitsLsbFirst.forEach((digit, socketIndex) => {
      const arm = alignArmEndpoints(font, font.arms[digit] ?? [])
      if (arm.length < 3) {
        return
      }

      const rotation = socketIndex * font.core.rotationStepDeg
      const armRing = pointListToRing(
        arm.map((point) => translatePoint(rotatePoint(point, rotation, font.core.origin), 0, yOffset)),
      )
      if (armRing.length >= 3) {
        polygons.push([armRing])
      }
    })
  })

  const multiPolygon = polygons.length > 0 ? union(polygons[0], ...polygons.slice(1)) : []
  const bounds = getMultiPolygonBounds(multiPolygon) ?? DEFAULT_BOUNDS
  const precision = font.renderer.precision
  const path = multiPolygonToPath(multiPolygon, precision)
  const viewBox = boundsToViewBox(bounds, font.renderer.padding, precision)
  const svg = renderSvg(path, viewBox, font.renderer.fill)

  return {
    input: sanitizeOctalInput(value) || '0',
    chunks,
    path,
    svg,
    viewBox,
    bounds,
    multiPolygon,
  }
}

export function multiPolygonToPath(multiPolygon: MultiPolygon, precision = 2) {
  return multiPolygon
    .flatMap((polygon) =>
      polygon.map((ring) => {
        const [first, ...rest] = ring
        if (!first) {
          return ''
        }
        const start = `M ${formatNumber(first[0], precision)} ${formatNumber(first[1], precision)}`
        const lines = rest
          .map((point) => `L ${formatNumber(point[0], precision)} ${formatNumber(point[1], precision)}`)
          .join(' ')
        return `${start} ${lines} Z`
      }),
    )
    .filter(Boolean)
    .join(' ')
}

export function getMultiPolygonBounds(multiPolygon: MultiPolygon): Bounds | null {
  const points = multiPolygon.flat(2)
  if (points.length === 0) {
    return null
  }

  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function pointListToRing(points: Point[]): Ring {
  return points.map((point) => [round(point.x), round(point.y)])
}

function boundsToViewBox(bounds: Bounds, padding: number, precision: number) {
  const x = bounds.minX - padding
  const y = bounds.minY - padding
  const width = Math.max(1, bounds.width + padding * 2)
  const height = Math.max(1, bounds.height + padding * 2)
  return [x, y, width, height].map((value) => formatNumber(value, precision)).join(' ')
}

function renderSvg(path: string, viewBox: string, fill: string) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img">`,
    `  <path d="${path}" fill="${fill}" fill-rule="evenodd" />`,
    `</svg>`,
  ].join('\n')
}

function formatNumber(value: number, precision: number) {
  return Number.parseFloat(value.toFixed(precision)).toString()
}

function round(value: number) {
  return Number.parseFloat(value.toFixed(6))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isPoint(value: unknown): value is Point {
  return (
    isRecord(value) &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  )
}

function isPointArray(value: unknown): value is Point[] {
  return Array.isArray(value) && value.every(isPoint)
}

function isPointArrayList(value: unknown): value is Point[][] {
  return Array.isArray(value) && value.every(isPointArray)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}
