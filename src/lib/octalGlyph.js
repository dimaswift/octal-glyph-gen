import { union } from 'polygon-clipping'
import defaultFont from '../../fonts/octal-glyph.json'

const DIGIT_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7']
const SPECIES_DIGIT_COUNTS = [3, 4, 5, 6, 7, 8]
const MIN_CORE_DIGITS = 3
const MAX_CORE_DIGITS = 32
const DEFAULT_SOCKET_WIDTH = 16
const DEFAULT_CORE_RADIUS = 41.57
const DEFAULT_ANGLE_OFFSET_DEG = 0
const DEFAULT_BOUNDS = {
  minX: -90,
  minY: -180,
  maxX: 90,
  maxY: 90,
  width: 180,
  height: 270,
}
const SPECIES_NAMES = {
  3: 'Tripod',
  4: 'Tetrapod',
  5: 'Pentapod',
  6: 'Hexapod',
  7: 'Heptapod',
  8: 'Octapod',
}

const DEFAULT_FONT = normalizeFont(defaultFont)

function render(value, options = {}) {
  const font = normalizeFont(options.font ?? DEFAULT_FONT)
  const species = getGlyphSpecies(font, options.digitsPerGlyph)
  const renderFont = { ...font, core: species.core }
  const input = valueToOctalString(value, options.inputBase ?? 'octal')
  const precision = numberOr(options.precision, font.renderer.precision)
  const chunks = splitOctalChunks(input, species.digitsPerGlyph)
  const polygons = []

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
  const paddingGridSize = numberOr(options.gridSize, font.renderer.gridSize)
  const paddingCells = numberOr(options.paddingCells, font.renderer.paddingCells)
  const padding = numberOr(options.padding, paddingGridSize * paddingCells)
  const bounds = getStackedGlyphFrameBounds(renderFont, chunks.length, padding, paddingGridSize)
  const fill = stringOr(options.fill, font.renderer.fill)
  const path = multiPolygonToPath(multiPolygon, precision)
  const viewBox = boundsToViewBox(bounds, 0, precision)
  const svg = renderSvgString(path, viewBox, {
    ...options,
    fill,
  })

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

function renderSvg(value, options = {}) {
  return render(value, options).svg
}

async function loadFont(source) {
  if (source == null) {
    return clone(DEFAULT_FONT)
  }

  if (typeof source === 'object' && !isBlobLike(source) && !(source instanceof URL)) {
    return normalizeFont(source)
  }

  const text = await readFontText(source)
  return normalizeFont(JSON.parse(text))
}

async function renderSvgWithFontFile(value, fontSource, options = {}) {
  const font = await loadFont(fontSource)
  return renderSvg(value, { ...options, font })
}

function getSpeciesName(digitsPerGlyph) {
  return SPECIES_NAMES[digitsPerGlyph] ?? `${digitsPerGlyph}-pod`
}

function buildDefaultDigitOrder(digitsPerGlyph) {
  const size = clampInteger(digitsPerGlyph, MIN_CORE_DIGITS, MAX_CORE_DIGITS)
  return Array.from({ length: size }, (_, index) => size - 1 - index)
}

function normalizeDigitOrder(rawOrder, digitsPerGlyph) {
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

function getSocketDigits(paddedValue, digitOrder) {
  return digitOrder.map((digitIndex) => {
    const digit = paddedValue[digitIndex]
    return DIGIT_KEYS.includes(digit) ? digit : '0'
  })
}

function normalizeCoreGeometry(rawCoreInput, fallbackCoreInput) {
  const rawCore = isRecord(rawCoreInput) ? rawCoreInput : {}
  const fallbackCore = isRecord(fallbackCoreInput) ? fallbackCoreInput : {}
  const origin = pointOr(rawCore.origin, fallbackCore.origin, { x: 0, y: 0 })
  const rawSocketStart = isPoint(rawCore.socketStart) ? rawCore.socketStart : null
  const rawSocketEnd = isPoint(rawCore.socketEnd) ? rawCore.socketEnd : null
  const rawSockets = isSocketArray(rawCore.sockets) ? rawCore.sockets : []
  const fallbackSocketStart = isPoint(fallbackCore.socketStart) ? fallbackCore.socketStart : null
  const fallbackSocketEnd = isPoint(fallbackCore.socketEnd) ? fallbackCore.socketEnd : null
  const digitsPerGlyph = clampInteger(
    numberOr(rawCore.digitsPerGlyph, numberOr(fallbackCore.digitsPerGlyph, 7)),
    MIN_CORE_DIGITS,
    MAX_CORE_DIGITS,
  )
  const generatedCore = createRegularCoreGeometry({
    origin,
    digitsPerGlyph,
    socketWidth: numberOr(
      rawCore.socketWidth,
      rawSocketStart && rawSocketEnd
        ? inferSocketWidth(rawSocketStart, rawSocketEnd)
        : numberOr(
            fallbackCore.socketWidth,
            fallbackSocketStart && fallbackSocketEnd ? inferSocketWidth(fallbackSocketStart, fallbackSocketEnd) : DEFAULT_SOCKET_WIDTH,
          ),
    ),
    coreRadius: numberOr(
      rawCore.coreRadius,
      rawSocketStart && rawSocketEnd
        ? inferCoreRadius(origin, rawSocketStart, rawSocketEnd)
        : numberOr(
            fallbackCore.coreRadius,
            fallbackSocketStart && fallbackSocketEnd ? inferCoreRadius(origin, fallbackSocketStart, fallbackSocketEnd) : DEFAULT_CORE_RADIUS,
          ),
    ),
    angleOffsetDeg: numberOr(
      rawCore.angleOffsetDeg,
      rawSocketStart && rawSocketEnd
        ? inferAngleOffsetDeg(origin, rawSocketStart, rawSocketEnd)
        : numberOr(
            fallbackCore.angleOffsetDeg,
            fallbackSocketStart && fallbackSocketEnd
              ? inferAngleOffsetDeg(origin, fallbackSocketStart, fallbackSocketEnd)
              : DEFAULT_ANGLE_OFFSET_DEG,
          ),
    ),
  })
  const customCore = rawCore.customCore === true
  const sockets = customCore ? normalizeSockets(rawSockets, generatedCore.sockets, digitsPerGlyph) : generatedCore.sockets
  const polygon = customCore ? socketsToPolygon(sockets) : generatedCore.polygon

  return {
    ...fallbackCore,
    ...rawCore,
    origin,
    polygon,
    holes: pointArrayListOr(rawCore.holes, fallbackCore.holes, []),
    socketStart: sockets[0]?.start ?? generatedCore.socketStart,
    socketEnd: sockets[0]?.end ?? generatedCore.socketEnd,
    sockets,
    customCore,
    digitsPerGlyph: generatedCore.digitsPerGlyph,
    rotationStepDeg: generatedCore.rotationStepDeg,
    socketWidth: generatedCore.socketWidth,
    coreRadius: generatedCore.coreRadius,
    angleOffsetDeg: generatedCore.angleOffsetDeg,
    glyphSpacing: numberOr(rawCore.glyphSpacing, numberOr(fallbackCore.glyphSpacing, 340)),
  }
}

function normalizeSpeciesMap(rawSpeciesInput, fallbackSpeciesInput, baseCore) {
  const rawSpecies = isRecord(rawSpeciesInput) ? rawSpeciesInput : {}
  const fallbackSpecies = isRecord(fallbackSpeciesInput) ? fallbackSpeciesInput : {}
  const normalized = {}
  const keys = new Set([...SPECIES_DIGIT_COUNTS.map(String), ...Object.keys(fallbackSpecies), ...Object.keys(rawSpecies)])

  keys.forEach((key) => {
    const rawEntry = isRecord(rawSpecies[key]) ? rawSpecies[key] : {}
    const fallbackEntry = isRecord(fallbackSpecies[key]) ? fallbackSpecies[key] : {}
    const fallbackDigits = clampInteger(Number.parseInt(key, 10), MIN_CORE_DIGITS, MAX_CORE_DIGITS)
    const fallbackCore = normalizeCoreGeometry(
      fallbackEntry.core,
      fallbackDigits === baseCore.digitsPerGlyph
        ? baseCore
        : {
            ...baseCore,
            digitsPerGlyph: fallbackDigits,
            holes: [],
          },
    )
    const core = normalizeCoreGeometry(rawEntry.core, fallbackCore)
    normalized[String(core.digitsPerGlyph)] = {
      name:
        typeof rawEntry.name === 'string'
          ? rawEntry.name
          : typeof fallbackEntry.name === 'string'
            ? fallbackEntry.name
            : getSpeciesName(core.digitsPerGlyph),
      digitsPerGlyph: core.digitsPerGlyph,
      digitOrder: normalizeDigitOrder(rawEntry.digitOrder ?? fallbackEntry.digitOrder, core.digitsPerGlyph),
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

function getGlyphSpecies(fontInput, digitsPerGlyph = fontInput.defaultSpeciesDigits ?? fontInput.core.digitsPerGlyph) {
  const font = normalizeFont(fontInput)
  const digits = clampInteger(digitsPerGlyph, MIN_CORE_DIGITS, MAX_CORE_DIGITS)
  return (
    font.species[String(digits)] ?? {
      name: getSpeciesName(digits),
      digitsPerGlyph: digits,
      digitOrder: buildDefaultDigitOrder(digits),
      core: normalizeCoreGeometry({ digitsPerGlyph: digits, holes: [] }, { ...font.core, holes: [] }),
    }
  )
}

function normalizeFont(rawInput = {}) {
  const fallback = typeof defaultFont === 'object' ? defaultFont : {}
  const raw = isRecord(rawInput) ? rawInput : {}
  const rawArms = isRecord(raw.arms) ? raw.arms : {}
  const rawRenderer = isRecord(raw.renderer) ? raw.renderer : {}
  const fallbackRenderer = isRecord(fallback.renderer) ? fallback.renderer : {}
  const fallbackArms = isRecord(fallback.arms) ? fallback.arms : {}
  const fallbackCore = isRecord(fallback.core) ? normalizeCoreGeometry(fallback.core, {}) : normalizeCoreGeometry({}, {})
  const rawCore = isRecord(raw.core) ? raw.core : {}
  const baseCore = normalizeCoreGeometry(rawCore, fallbackCore)

  const font = {
    version: 'octal-glyph-font/v1',
    name: typeof raw.name === 'string' ? raw.name : stringOr(fallback.name, 'Octal Glyph font'),
    units: numberOr(raw.units, numberOr(fallback.units, 256)),
    armsCoordinateMode: 'socket',
    defaultSpeciesDigits: clampInteger(numberOr(raw.defaultSpeciesDigits, baseCore.digitsPerGlyph), MIN_CORE_DIGITS, MAX_CORE_DIGITS),
    core: baseCore,
    renderer: {
      fill: stringOr(rawRenderer.fill, stringOr(fallbackRenderer.fill, '#000000')),
      gridSize: numberOr(rawRenderer.gridSize, numberOr(fallbackRenderer.gridSize, 8)),
      paddingCells: numberOr(
        rawRenderer.paddingCells,
        numberOr(rawRenderer.padding, numberOr(fallbackRenderer.padding, 16)) /
          numberOr(rawRenderer.gridSize, numberOr(fallbackRenderer.gridSize, 8)),
      ),
      precision: numberOr(rawRenderer.precision, numberOr(fallbackRenderer.precision, 2)),
    },
    species: normalizeSpeciesMap(raw.species, fallback.species, baseCore),
    arms: {},
  }
  const defaultSpecies = font.species[String(font.defaultSpeciesDigits)] ?? font.species[String(baseCore.digitsPerGlyph)]
  if (defaultSpecies) {
    font.defaultSpeciesDigits = defaultSpecies.digitsPerGlyph
    font.core = defaultSpecies.core
  }

  const armsAreSocketLocal = raw.armsCoordinateMode === 'socket'
  DIGIT_KEYS.forEach((digit) => {
    const hasRawArm = isPointArray(rawArms[digit])
    const sourceArm = hasRawArm ? rawArms[digit] : fallbackArms[digit]
    const safeArm = isPointArray(sourceArm) ? sourceArm : []
    const localArm = hasRawArm && !armsAreSocketLocal ? safeArm.map((point) => socketWorldToLocal(font, point, 0)) : safeArm
    font.arms[digit] = alignArmEndpoints(font, localArm)
  })

  return font
}

function createRegularCoreGeometry(input) {
  const digitsPerGlyph = clampInteger(input.digitsPerGlyph, MIN_CORE_DIGITS, MAX_CORE_DIGITS)
  const coreRadius = Math.max(0.01, input.coreRadius)
  const maxSocketWidth = Math.max(0.01, 2 * coreRadius * Math.tan(Math.PI / digitsPerGlyph) * 0.98)
  const socketWidth = Math.min(Math.max(0.01, input.socketWidth), maxSocketWidth)
  const angleOffsetDeg = normalizeDegrees(input.angleOffsetDeg)
  const rotationStepDeg = 360 / digitsPerGlyph
  const baseStart = { x: input.origin.x - socketWidth / 2, y: input.origin.y - coreRadius }
  const baseEnd = { x: input.origin.x + socketWidth / 2, y: input.origin.y - coreRadius }
  const socketStart = roundPoint(rotatePoint(baseStart, angleOffsetDeg, input.origin))
  const socketEnd = roundPoint(rotatePoint(baseEnd, angleOffsetDeg, input.origin))
  const sockets = []

  for (let socketIndex = 0; socketIndex < digitsPerGlyph; socketIndex += 1) {
    const rotation = angleOffsetDeg + socketIndex * rotationStepDeg
    sockets.push({
      start: roundPoint(rotatePoint(baseStart, rotation, input.origin)),
      end: roundPoint(rotatePoint(baseEnd, rotation, input.origin)),
    })
  }

  return {
    polygon: socketsToPolygon(sockets),
    socketStart,
    socketEnd,
    sockets,
    customCore: false,
    digitsPerGlyph,
    rotationStepDeg,
    socketWidth,
    coreRadius,
    angleOffsetDeg,
  }
}

function socketsToPolygon(sockets) {
  return sockets.flatMap((socket) => [socket.start, socket.end])
}

function normalizeSockets(sockets, fallback, digitsPerGlyph) {
  return Array.from({ length: digitsPerGlyph }, (_, index) => {
    const socket = sockets[index] ?? fallback[index] ?? fallback[0]
    return {
      start: roundPoint(socket?.start ?? { x: 0, y: 0 }),
      end: roundPoint(socket?.end ?? { x: 0, y: 0 }),
    }
  })
}

function inferSocketWidth(socketStart, socketEnd) {
  return Math.max(0.01, Math.hypot(socketStart.x - socketEnd.x, socketStart.y - socketEnd.y))
}

function inferCoreRadius(origin, socketStart, socketEnd) {
  const center = {
    x: (socketStart.x + socketEnd.x) / 2,
    y: (socketStart.y + socketEnd.y) / 2,
  }
  return Math.max(0.01, Math.hypot(center.x - origin.x, center.y - origin.y))
}

function inferAngleOffsetDeg(origin, socketStart, socketEnd) {
  const center = {
    x: (socketStart.x + socketEnd.x) / 2,
    y: (socketStart.y + socketEnd.y) / 2,
  }
  const dx = center.x - origin.x
  const dy = center.y - origin.y
  if (dx === 0 && dy === 0) {
    return DEFAULT_ANGLE_OFFSET_DEG
  }

  return normalizeDegrees((Math.atan2(dy, dx) * 180) / Math.PI + 90)
}

function decimalToOctalString(value) {
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

  const cleaned = String(value ?? '0').replace(/\s+/g, '')
  if (!/^\d+$/.test(cleaned)) {
    throw new Error('Decimal glyph values must contain only digits 0-9.')
  }
  return BigInt(cleaned || '0').toString(8)
}

function valueToOctalString(value, inputBase = 'octal') {
  if (typeof value === 'string') {
    if (inputBase === 'decimal') {
      return decimalToOctalString(value)
    }

    const cleaned = value.replace(/\s+/g, '').replace(/[^0-7]/g, '')
    return cleaned || '0'
  }

  return decimalToOctalString(value)
}

function splitOctalChunks(value, digitsPerGlyph) {
  const clean = valueToOctalString(value)
  const chunkSize = clampInteger(digitsPerGlyph, 1, 32)
  const chunks = []

  for (let end = clean.length; end > 0; end -= chunkSize) {
    const start = Math.max(0, end - chunkSize)
    const raw = clean.slice(start, end)
    const padded = raw.padStart(chunkSize, '0')
    chunks.push({
      raw,
      padded,
      digitsLsbFirst: padded.split('').reverse(),
    })
  }

  return chunks
}

function alignArmEndpoints(font, points) {
  const halfWidth = font.core.socketWidth / 2
  const start = { x: -halfWidth, y: 0 }
  const end = { x: halfWidth, y: 0 }

  if (!Array.isArray(points) || points.length < 2) {
    return [start, end]
  }

  const next = points.map((point) => ({ ...point }))
  next[0] = start
  next[next.length - 1] = end
  return next
}

function getSocketSegment(font, socketIndex) {
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

function getSocketFrame(font, socketIndex) {
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

function socketLocalToWorld(font, point, socketIndex) {
  const frame = getSocketFrame(font, socketIndex)
  return {
    x: frame.center.x + frame.tangent.x * point.x + frame.outward.x * point.y,
    y: frame.center.y + frame.tangent.y * point.x + frame.outward.y * point.y,
  }
}

function socketWorldToLocal(font, point, socketIndex) {
  const frame = getSocketFrame(font, socketIndex)
  const dx = point.x - frame.center.x
  const dy = point.y - frame.center.y
  return {
    x: round(dx * frame.tangent.x + dy * frame.tangent.y),
    y: round(dx * frame.outward.x + dy * frame.outward.y),
  }
}

function armToWorldPoints(font, points, socketIndex) {
  const frame = getSocketFrame(font, socketIndex)
  const arm = alignArmEndpoints(font, points)
  const next = arm.map((point) => ({ ...point }))
  if (next.length >= 2) {
    next[0] = { x: -frame.length / 2, y: 0 }
    next[next.length - 1] = { x: frame.length / 2, y: 0 }
  }
  return next.map((point) => socketLocalToWorld(font, point, socketIndex))
}

function rotatePoint(point, degrees, origin) {
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

function translatePoint(point, dx, dy) {
  return { x: point.x + dx, y: point.y + dy }
}

function pointListToRing(points, precision) {
  return points.map((point) => [roundForBoolean(point.x, precision), roundForBoolean(point.y, precision)])
}

function multiPolygonToPath(multiPolygon, precision = 2) {
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

function getStackedGlyphFrameBounds(font, chunkCount, padding, gridSize) {
  const frame = getGlyphFrameBounds(font, padding, gridSize)
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

function getGlyphFrameBounds(font, padding, gridSize) {
  const origin = font.core.origin
  const points = [
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
  const safeGridSize = Math.max(0.0001, gridSize)
  const halfWidth = round(Math.max(safeGridSize, Math.ceil(maxDistanceFromOrigin(rawBounds, origin, 'x') / safeGridSize) * safeGridSize + padding))
  const halfHeight = round(Math.max(safeGridSize, Math.ceil(maxDistanceFromOrigin(rawBounds, origin, 'y') / safeGridSize) * safeGridSize + padding))

  return {
    minX: origin.x - halfWidth,
    minY: origin.y - halfHeight,
    maxX: origin.x + halfWidth,
    maxY: origin.y + halfHeight,
    width: halfWidth * 2,
    height: halfHeight * 2,
  }
}

function getPointBounds(points) {
  if (points.length === 0) {
    return null
  }

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return buildBounds(xs, ys)
}

function buildBounds(xs, ys) {
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

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  }
}

function maxDistanceFromOrigin(bounds, origin, axis) {
  if (axis === 'x') {
    return Math.max(Math.abs(bounds.minX - origin.x), Math.abs(bounds.maxX - origin.x))
  }

  return Math.max(Math.abs(bounds.minY - origin.y), Math.abs(bounds.maxY - origin.y))
}

function boundsToViewBox(bounds, padding, precision) {
  return [
    bounds.minX - padding,
    bounds.minY - padding,
    Math.max(1, bounds.width + padding * 2),
    Math.max(1, bounds.height + padding * 2),
  ]
    .map((value) => formatNumber(value, precision))
    .join(' ')
}

function renderSvgString(path, viewBox, options) {
  const attributes = {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox,
    role: options.role ?? 'img',
    ...options.attributes,
  }

  if (options.id) {
    attributes.id = options.id
  }
  if (options.className) {
    attributes.class = options.className
  }
  if (options.width) {
    attributes.width = options.width
  }
  if (options.height) {
    attributes.height = options.height
  }

  const title = options.title ? `\n  <title>${escapeText(options.title)}</title>` : ''
  return [
    `<svg ${attributesToString(attributes)}>${title}`,
    `  <path d="${escapeAttribute(path)}" fill="${escapeAttribute(options.fill)}" fill-rule="evenodd" />`,
    `</svg>`,
  ].join('\n')
}

async function readFontText(source) {
  if (typeof source === 'string') {
    const trimmed = source.trim()
    if (trimmed.startsWith('{')) {
      return trimmed
    }

    if (looksLikeUrl(trimmed) && typeof fetch === 'function') {
      const response = await fetch(trimmed)
      if (!response.ok) {
        throw new Error(`Could not load font JSON from ${trimmed}: ${response.status}`)
      }
      return response.text()
    }

    const text = await readNodeFile(trimmed)
    if (text != null) {
      return text
    }

    if (typeof fetch === 'function') {
      const response = await fetch(trimmed)
      if (!response.ok) {
        throw new Error(`Could not load font JSON from ${trimmed}: ${response.status}`)
      }
      return response.text()
    }
  }

  if (source instanceof URL) {
    return readFontText(source.toString())
  }

  if (isBlobLike(source)) {
    return source.text()
  }

  throw new Error('Font source must be a font object, JSON string, URL, File/Blob, or Node file path.')
}

async function readNodeFile(path) {
  try {
    if (typeof document !== 'undefined') {
      return null
    }

    const fs = await import('node:fs/promises')
    return fs.readFile(path, 'utf8')
  } catch (error) {
    if (error && (error.code === 'MODULE_NOT_FOUND' || error.code === 'ERR_MODULE_NOT_FOUND')) {
      return null
    }
    throw error
  }
}

function looksLikeUrl(value) {
  return /^[a-z][a-z\d+.-]*:/i.test(value)
}

function attributesToString(attributes) {
  return Object.entries(attributes)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => `${key}="${escapeAttribute(value)}"`)
    .join(' ')
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function formatNumber(value, precision) {
  return Number.parseFloat(value.toFixed(precision)).toString()
}

function round(value) {
  return Number.parseFloat(value.toFixed(6))
}

function roundPoint(point) {
  return {
    x: roundForGeometry(point.x),
    y: roundForGeometry(point.y),
  }
}

function roundForGeometry(value) {
  return Number.parseFloat(value.toFixed(2))
}

function roundForBoolean(value, precision) {
  const digits = Math.max(0, Math.min(6, Math.round(precision)))
  return Number.parseFloat(value.toFixed(digits))
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360
}

function clampInteger(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function numberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringOr(value, fallback) {
  return typeof value === 'string' ? value : fallback
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isPoint(value) {
  return (
    isRecord(value) &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  )
}

function isPointArray(value) {
  return Array.isArray(value) && value.every(isPoint)
}

function isPointArrayList(value) {
  return Array.isArray(value) && value.every(isPointArray)
}

function isSocketSegment(value) {
  return isRecord(value) && isPoint(value.start) && isPoint(value.end)
}

function isSocketArray(value) {
  return Array.isArray(value) && value.every(isSocketSegment)
}

function pointOr(value, fallback, defaultValue) {
  if (isPoint(value)) {
    return clone(value)
  }
  if (isPoint(fallback)) {
    return clone(fallback)
  }
  return clone(defaultValue)
}

function pointArrayListOr(value, fallback, defaultValue) {
  if (isPointArrayList(value)) {
    return clone(value)
  }
  if (isPointArrayList(fallback)) {
    return clone(fallback)
  }
  return clone(defaultValue)
}

function isBlobLike(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.text === 'function'
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export {
  DEFAULT_FONT,
  DIGIT_KEYS,
  SPECIES_DIGIT_COUNTS,
  decimalToOctalString,
  getGlyphSpecies,
  loadFont,
  normalizeFont,
  render,
  renderSvg,
  renderSvgWithFontFile,
  splitOctalChunks,
  valueToOctalString,
}
