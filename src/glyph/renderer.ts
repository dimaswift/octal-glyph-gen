import { union, type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping'
import {
  createRegularCoreGeometry,
  DEFAULT_ANGLE_OFFSET_DEG,
  DEFAULT_CORE_RADIUS,
  DEFAULT_SOCKET_WIDTH,
  inferAngleOffsetDeg,
  inferCoreRadius,
  inferSocketWidth,
  MAX_CORE_DIGITS,
  MIN_CORE_DIGITS,
  normalizeSockets,
  socketsToPolygon,
} from './coreGeometry'
import { DEFAULT_FONT } from './defaultFont'
import {
  DIGIT_KEYS,
  SPECIES_DIGIT_COUNTS,
  type DigitKey,
  type DigitOrder,
  type GlyphFont,
  type GlyphSpecies,
  type GlyphSpeciesMap,
  type Point,
  type SocketSegment,
} from './types'

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

export type SocketFrame = {
  segment: SocketSegment
  center: Point
  tangent: Point
  outward: Point
  length: number
}

const DEFAULT_BOUNDS: Bounds = {
  minX: -90,
  minY: -150,
  maxX: 90,
  maxY: 90,
  width: 180,
  height: 240,
}

const SPECIES_NAMES: Record<number, string> = {
  3: 'Tripod',
  4: 'Tetrapod',
  5: 'Pentapod',
  6: 'Hexapod',
  7: 'Heptapod',
  8: 'Octapod',
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

export function decimalToOctalString(value: string | number | bigint) {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new Error('Octal glyph values must be non-negative.')
    }
    return value.toString(8)
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('Octal glyph values must be finite non-negative numbers.')
    }
    return Math.trunc(value).toString(8)
  }

  const compact = String(value ?? '0').replace(/\s+/g, '')
  if (!/^\d+$/.test(compact)) {
    throw new Error('Decimal glyph values must contain only digits 0-9.')
  }
  return BigInt(compact || '0').toString(8)
}

export function valueToOctalString(value: string | number | bigint, inputBase: 'octal' | 'decimal' = 'octal') {
  if (typeof value === 'string') {
    return inputBase === 'decimal' ? decimalToOctalString(value) : sanitizeOctalInput(value) || '0'
  }

  return decimalToOctalString(value)
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

export function getSpeciesName(digitsPerGlyph: number) {
  return SPECIES_NAMES[digitsPerGlyph] ?? `${digitsPerGlyph}-pod`
}

export function buildDefaultDigitOrder(digitsPerGlyph: number): DigitOrder {
  const size = clampInteger(digitsPerGlyph, MIN_CORE_DIGITS, MAX_CORE_DIGITS)
  return Array.from({ length: size }, (_, index) => size - 1 - index)
}

export function normalizeDigitOrder(rawOrder: unknown, digitsPerGlyph: number): DigitOrder {
  const fallback = buildDefaultDigitOrder(digitsPerGlyph)
  if (Array.isArray(rawOrder)) {
    const normalized = rawOrder
      .map((value) => (typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : Number.NaN))
      .filter((value) => Number.isInteger(value) && value >= 0 && value < digitsPerGlyph)
    return normalized.length === digitsPerGlyph ? normalized : fallback
  }

  if (typeof rawOrder === 'string') {
    const compact = rawOrder.replace(/\s+/g, '')
    const normalized = compact.split('').map((value) => Number.parseInt(value, 10))
    if (
      normalized.length === digitsPerGlyph &&
      normalized.every((value) => Number.isInteger(value) && value >= 0 && value < digitsPerGlyph)
    ) {
      return normalized
    }
  }

  return fallback
}

export function getSocketDigits(paddedValue: string, digitOrder: DigitOrder): DigitKey[] {
  return digitOrder.map((digitIndex) => {
    const digit = paddedValue[digitIndex]
    return (DIGIT_KEYS.includes(digit as DigitKey) ? digit : '0') as DigitKey
  })
}

export function alignArmEndpoints(font: GlyphFont, points: Point[]) {
  const halfWidth = font.core.socketWidth / 2
  const start = { x: -halfWidth, y: 0 }
  const end = { x: halfWidth, y: 0 }

  if (points.length === 0) {
    return [start, end]
  }

  if (points.length === 1) {
    return [start, end]
  }

  const next = points.map((point) => ({ ...point }))
  next[0] = start
  next[next.length - 1] = end
  return next
}

export function getSocketSegment(font: GlyphFont, socketIndex: number): SocketSegment {
  const socket = font.core.sockets[socketIndex]
  if (socket) {
    return socket
  }

  const rotation = socketIndex * font.core.rotationStepDeg
  return {
    start: rotatePoint(font.core.socketStart, rotation, font.core.origin),
    end: rotatePoint(font.core.socketEnd, rotation, font.core.origin),
  }
}

export function getSocketFrame(font: GlyphFont, socketIndex: number): SocketFrame {
  const segment = getSocketSegment(font, socketIndex)
  const center = midpoint(segment.start, segment.end)
  const dx = segment.end.x - segment.start.x
  const dy = segment.end.y - segment.start.y
  const length = Math.hypot(dx, dy) || 1
  const tangent = { x: dx / length, y: dy / length }
  const centerVector = { x: center.x - font.core.origin.x, y: center.y - font.core.origin.y }
  let outward = { x: tangent.y, y: -tangent.x }
  if (outward.x * centerVector.x + outward.y * centerVector.y < 0) {
    outward = { x: -outward.x, y: -outward.y }
  }

  return { segment, center, tangent, outward, length }
}

export function socketLocalToWorld(font: GlyphFont, point: Point, socketIndex: number): Point {
  const frame = getSocketFrame(font, socketIndex)
  return {
    x: frame.center.x + frame.tangent.x * point.x + frame.outward.x * point.y,
    y: frame.center.y + frame.tangent.y * point.x + frame.outward.y * point.y,
  }
}

export function socketWorldToLocal(font: GlyphFont, point: Point, socketIndex: number): Point {
  const frame = getSocketFrame(font, socketIndex)
  const dx = point.x - frame.center.x
  const dy = point.y - frame.center.y
  return {
    x: round(dx * frame.tangent.x + dy * frame.tangent.y),
    y: round(dx * frame.outward.x + dy * frame.outward.y),
  }
}

export function armToWorldPoints(font: GlyphFont, points: Point[], socketIndex: number) {
  const frame = getSocketFrame(font, socketIndex)
  const arm = alignArmEndpoints(font, points)
  const next = arm.map((point) => ({ ...point }))
  if (next.length >= 2) {
    next[0] = { x: -frame.length / 2, y: 0 }
    next[next.length - 1] = { x: frame.length / 2, y: 0 }
  }
  return next.map((point) => socketLocalToWorld(font, point, socketIndex))
}

function normalizeCoreGeometry(rawCoreInput: Record<string, unknown>, fallbackCoreInput: GlyphFont['core']) {
  const rawCore = rawCoreInput
  const fallbackCore = fallbackCoreInput
  const origin = isPoint(rawCore.origin) ? rawCore.origin : fallbackCore.origin
  const rawSocketStart = isPoint(rawCore.socketStart) ? rawCore.socketStart : null
  const rawSocketEnd = isPoint(rawCore.socketEnd) ? rawCore.socketEnd : null
  const rawSockets = isSocketArray(rawCore.sockets) ? rawCore.sockets : []
  const digitsPerGlyph = isFiniteNumber(rawCore.digitsPerGlyph)
    ? clampInteger(rawCore.digitsPerGlyph, MIN_CORE_DIGITS, MAX_CORE_DIGITS)
    : fallbackCore.digitsPerGlyph
  const generatedCore = createRegularCoreGeometry({
    origin,
    digitsPerGlyph,
    socketWidth: isFiniteNumber(rawCore.socketWidth)
      ? rawCore.socketWidth
      : rawSocketStart && rawSocketEnd
        ? inferSocketWidth(rawSocketStart, rawSocketEnd)
        : fallbackCore.socketWidth ?? DEFAULT_SOCKET_WIDTH,
    coreRadius: isFiniteNumber(rawCore.coreRadius)
      ? rawCore.coreRadius
      : rawSocketStart && rawSocketEnd
        ? inferCoreRadius(origin, rawSocketStart, rawSocketEnd)
        : fallbackCore.coreRadius ?? DEFAULT_CORE_RADIUS,
    angleOffsetDeg: isFiniteNumber(rawCore.angleOffsetDeg)
      ? rawCore.angleOffsetDeg
      : rawSocketStart && rawSocketEnd
        ? inferAngleOffsetDeg(origin, rawSocketStart, rawSocketEnd)
        : fallbackCore.angleOffsetDeg ?? DEFAULT_ANGLE_OFFSET_DEG,
  })
  const customCore = rawCore.customCore === true
  const sockets = customCore ? normalizeSockets(rawSockets, generatedCore.sockets, digitsPerGlyph) : generatedCore.sockets
  const polygon = customCore ? socketsToPolygon(sockets) : generatedCore.polygon

  return {
    ...fallbackCore,
    ...rawCore,
    origin,
    polygon,
    holes: isPointArrayList(rawCore.holes) ? rawCore.holes : fallbackCore.holes,
    socketStart: sockets[0]?.start ?? generatedCore.socketStart,
    socketEnd: sockets[0]?.end ?? generatedCore.socketEnd,
    sockets,
    customCore,
    digitsPerGlyph: generatedCore.digitsPerGlyph,
    rotationStepDeg: generatedCore.rotationStepDeg,
    socketWidth: generatedCore.socketWidth,
    coreRadius: generatedCore.coreRadius,
    angleOffsetDeg: generatedCore.angleOffsetDeg,
    glyphSpacing: isFiniteNumber(rawCore.glyphSpacing) ? rawCore.glyphSpacing : fallbackCore.glyphSpacing,
  }
}

function buildFallbackSpeciesMap(font: GlyphFont): GlyphSpeciesMap {
  const digits = font.defaultSpeciesDigits ?? font.core.digitsPerGlyph
  return {
    [String(digits)]: {
      name: getSpeciesName(digits),
      digitsPerGlyph: digits,
      digitOrder: buildDefaultDigitOrder(digits),
      core: font.core,
    },
  }
}

function normalizeSpeciesMap(rawSpeciesInput: unknown, fallbackSpeciesMap: GlyphSpeciesMap, baseCore: GlyphFont['core']) {
  const rawSpecies = isRecord(rawSpeciesInput) ? rawSpeciesInput : {}
  const normalized: GlyphSpeciesMap = {}
  const keys = new Set<string>([
    ...SPECIES_DIGIT_COUNTS.map(String),
    ...Object.keys(fallbackSpeciesMap),
    ...Object.keys(rawSpecies),
  ])

  keys.forEach((key) => {
    const rawEntry = isRecord(rawSpecies[key]) ? rawSpecies[key] : {}
    const fallbackEntry = fallbackSpeciesMap[key]
    const rawCore = isRecord(rawEntry.core) ? rawEntry.core : {}
    const fallbackDigits = clampInteger(Number.parseInt(key, 10), MIN_CORE_DIGITS, MAX_CORE_DIGITS)
    const fallbackCore =
      fallbackEntry?.core ??
      (fallbackDigits === baseCore.digitsPerGlyph
        ? baseCore
        : {
            ...baseCore,
            digitsPerGlyph: fallbackDigits,
            holes: [],
          })
    const core = normalizeCoreGeometry(rawCore, fallbackCore)
    const digitsPerGlyph = core.digitsPerGlyph
    normalized[String(digitsPerGlyph)] = {
      name:
        typeof rawEntry.name === 'string'
          ? rawEntry.name
          : fallbackEntry?.name ?? getSpeciesName(digitsPerGlyph),
      digitsPerGlyph,
      digitOrder: normalizeDigitOrder(rawEntry.digitOrder ?? fallbackEntry?.digitOrder, digitsPerGlyph),
      core,
    }
  })

  if (Object.keys(normalized).length === 0) {
    normalized[String(baseCore.digitsPerGlyph)] = {
      name: getSpeciesName(baseCore.digitsPerGlyph),
      digitsPerGlyph: baseCore.digitsPerGlyph,
      digitOrder: buildDefaultDigitOrder(baseCore.digitsPerGlyph),
      core: baseCore,
    }
  }

  if (!normalized[String(baseCore.digitsPerGlyph)]) {
    normalized[String(baseCore.digitsPerGlyph)] = {
      name: getSpeciesName(baseCore.digitsPerGlyph),
      digitsPerGlyph: baseCore.digitsPerGlyph,
      digitOrder: buildDefaultDigitOrder(baseCore.digitsPerGlyph),
      core: baseCore,
    }
  }

  return normalized
}

export function getGlyphSpecies(fontInput: GlyphFont, digitsPerGlyph = fontInput.defaultSpeciesDigits ?? fontInput.core.digitsPerGlyph): GlyphSpecies {
  const font = normalizeFont(fontInput)
  const species = font.species ?? buildFallbackSpeciesMap(font)
  const digits = clampInteger(digitsPerGlyph, MIN_CORE_DIGITS, MAX_CORE_DIGITS)
  return (
    species[String(digits)] ?? {
      name: getSpeciesName(digits),
      digitsPerGlyph: digits,
      digitOrder: buildDefaultDigitOrder(digits),
      core: normalizeCoreGeometry({ digitsPerGlyph: digits, holes: [] }, { ...font.core, holes: [] }),
    }
  )
}

export function normalizeFont(rawInput: Partial<GlyphFont> | null | undefined = {}): GlyphFont {
  const raw: Record<string, unknown> = isRecord(rawInput) ? rawInput : {}
  const rawArms: Record<string, unknown> = isRecord(raw.arms) ? raw.arms : {}
  const rawRenderer: Record<string, unknown> = isRecord(raw.renderer) ? raw.renderer : {}
  const rawCore: Record<string, unknown> = isRecord(raw.core) ? raw.core : {}
  const fallbackSpecies = DEFAULT_FONT.species ?? buildFallbackSpeciesMap(DEFAULT_FONT)
  const baseCore = normalizeCoreGeometry(rawCore, DEFAULT_FONT.core)
  const rendererGridSize = isFiniteNumber(rawRenderer.gridSize)
    ? rawRenderer.gridSize
    : DEFAULT_FONT.renderer.gridSize
  const rendererPaddingCells = isFiniteNumber(rawRenderer.paddingCells)
    ? rawRenderer.paddingCells
    : isFiniteNumber(rawRenderer.padding)
      ? rawRenderer.padding / rendererGridSize
      : DEFAULT_FONT.renderer.paddingCells
  const merged: GlyphFont = {
    version: 'octal-glyph-font/v1',
    name: typeof raw.name === 'string' ? raw.name : DEFAULT_FONT.name,
    units: isFiniteNumber(raw.units) ? raw.units : DEFAULT_FONT.units,
    armsCoordinateMode: 'socket',
    defaultSpeciesDigits: isFiniteNumber(raw.defaultSpeciesDigits)
      ? clampInteger(raw.defaultSpeciesDigits, MIN_CORE_DIGITS, MAX_CORE_DIGITS)
      : baseCore.digitsPerGlyph,
    core: baseCore,
    renderer: {
      fill: typeof rawRenderer.fill === 'string' ? rawRenderer.fill : DEFAULT_FONT.renderer.fill,
      gridSize: rendererGridSize,
      paddingCells: rendererPaddingCells,
      precision: isFiniteNumber(rawRenderer.precision) ? rawRenderer.precision : DEFAULT_FONT.renderer.precision,
    },
    arms: { ...DEFAULT_FONT.arms },
  }
  merged.species = normalizeSpeciesMap(raw.species, fallbackSpecies, baseCore)
  const defaultSpecies = merged.species[String(merged.defaultSpeciesDigits)] ?? merged.species[String(baseCore.digitsPerGlyph)]
  if (defaultSpecies) {
    merged.defaultSpeciesDigits = defaultSpecies.digitsPerGlyph
    merged.core = defaultSpecies.core
  }

  const armsAreSocketLocal = raw.armsCoordinateMode === 'socket'
  DIGIT_KEYS.forEach((digit) => {
    const arm = rawArms[digit]
    const hasRawArm = isPointArray(arm)
    const sourceArm = hasRawArm ? arm : DEFAULT_FONT.arms[digit]
    const localArm = hasRawArm && !armsAreSocketLocal ? sourceArm.map((point) => socketWorldToLocal(merged, point, 0)) : sourceArm
    merged.arms[digit] = alignArmEndpoints(merged, localArm)
  })

  return merged
}

export function buildGlyphRender(fontInput: GlyphFont, value: string, digitsPerGlyph?: number): GlyphRender {
  const font = normalizeFont(fontInput)
  const species = getGlyphSpecies(font, digitsPerGlyph)
  const renderFont = { ...font, core: species.core }
  const precision = font.renderer.precision
  const input = valueToOctalString(value)
  const chunks = splitOctalChunks(input, species.digitsPerGlyph)
  const polygons: Polygon[] = []

  chunks.forEach((chunk, stackIndex) => {
    const yOffset = stackIndex * species.core.glyphSpacing
    const coreRing = pointListToRing(
      species.core.polygon.map((point) => translatePoint(point, 0, yOffset)),
      precision,
    )
    const coreHoles = species.core.holes
      .map((hole) => pointListToRing(hole.map((point) => translatePoint(point, 0, yOffset)), precision))
      .filter((ring) => ring.length >= 3)
    if (coreRing.length >= 3) {
      polygons.push([coreRing, ...coreHoles])
    }

    getSocketDigits(chunk.padded, species.digitOrder).forEach((digit, socketIndex) => {
      const arm = armToWorldPoints(renderFont, font.arms[digit] ?? [], socketIndex)
      if (arm.length < 3) {
        return
      }

      const armRing = pointListToRing(
        arm.map((point) => translatePoint(point, 0, yOffset)),
        precision,
      )
      if (armRing.length >= 3) {
        polygons.push([armRing])
      }
    })
  })

  const multiPolygon = polygons.length > 0 ? union(polygons[0], ...polygons.slice(1)) : []
  const bounds = getStackedGlyphFrameBounds(renderFont, chunks.length)
  const path = multiPolygonToPath(multiPolygon, precision)
  const viewBox = boundsToViewBox(bounds, 0, precision)
  const svg = renderSvg(path, viewBox, font.renderer.fill)

  return {
    input,
    chunks,
    path,
    svg,
    viewBox,
    bounds,
    multiPolygon,
  }
}

export function getRenderPadding(fontInput: GlyphFont) {
  const font = normalizeFont(fontInput)
  return font.renderer.gridSize * font.renderer.paddingCells
}

export function getGlyphFrameBounds(fontInput: GlyphFont): Bounds {
  const font = normalizeFont(fontInput)
  const origin = font.core.origin
  const points: Point[] = [
    ...font.core.polygon,
    ...font.core.holes.flat(),
    font.core.socketStart,
    font.core.socketEnd,
  ]

  for (let socketIndex = 0; socketIndex < font.core.digitsPerGlyph; socketIndex += 1) {
    DIGIT_KEYS.forEach((digit) => {
      armToWorldPoints(font, font.arms[digit] ?? [], socketIndex).forEach((point) => {
        points.push(point)
      })
    })
  }

  const rawBounds = getPointBounds(points) ?? DEFAULT_BOUNDS
  const gridSize = Math.max(0.0001, font.renderer.gridSize)
  const padding = getRenderPadding(font)
  const halfWidth = round(Math.max(gridSize, Math.ceil(maxDistanceFromOrigin(rawBounds, origin, 'x') / gridSize) * gridSize + padding))
  const halfHeight = round(Math.max(gridSize, Math.ceil(maxDistanceFromOrigin(rawBounds, origin, 'y') / gridSize) * gridSize + padding))

  return {
    minX: origin.x - halfWidth,
    minY: origin.y - halfHeight,
    maxX: origin.x + halfWidth,
    maxY: origin.y + halfHeight,
    width: halfWidth * 2,
    height: halfHeight * 2,
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
  return getTuplePointBounds(multiPolygon.flat(2))
}

function getStackedGlyphFrameBounds(font: GlyphFont, chunkCount: number): Bounds {
  const frame = getGlyphFrameBounds(font)
  const stackHeight = Math.max(0, chunkCount - 1) * font.core.glyphSpacing

  return {
    minX: frame.minX,
    minY: frame.minY,
    maxX: frame.maxX,
    maxY: frame.maxY + stackHeight,
    width: frame.width,
    height: frame.height + stackHeight,
  }
}

function getPointBounds(points: Point[]): Bounds | null {
  if (points.length === 0) {
    return null
  }

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return buildBounds(xs, ys)
}

function getTuplePointBounds(points: number[][]): Bounds | null {
  if (points.length === 0) {
    return null
  }

  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  return buildBounds(xs, ys)
}

function buildBounds(xs: number[], ys: number[]): Bounds {
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

function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  }
}

function maxDistanceFromOrigin(bounds: Bounds, origin: Point, axis: 'x' | 'y') {
  if (axis === 'x') {
    return Math.max(Math.abs(bounds.minX - origin.x), Math.abs(bounds.maxX - origin.x))
  }

  return Math.max(Math.abs(bounds.minY - origin.y), Math.abs(bounds.maxY - origin.y))
}

function pointListToRing(points: Point[], precision: number): Ring {
  return points.map((point) => [roundForBoolean(point.x, precision), roundForBoolean(point.y, precision)])
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

function roundForBoolean(value: number, precision: number) {
  const digits = Math.max(0, Math.min(6, Math.round(precision)))
  return Number.parseFloat(value.toFixed(digits))
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

function isSocketSegment(value: unknown): value is SocketSegment {
  return isRecord(value) && isPoint(value.start) && isPoint(value.end)
}

function isSocketArray(value: unknown): value is SocketSegment[] {
  return Array.isArray(value) && value.every(isSocketSegment)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}
