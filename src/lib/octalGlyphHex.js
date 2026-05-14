import { union } from 'polygon-clipping'
import defaultHexFont from '../../fonts/octal-glyph-hex.json'

const DIGIT_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7']
const DEFAULT_BOUNDS = {
  minX: -90,
  minY: -180,
  maxX: 90,
  maxY: 90,
  width: 180,
  height: 270,
}

const DEFAULT_FONT = normalizeFont(defaultHexFont)

function render(value, options = {}) {
  const font = normalizeFont(options.font ?? DEFAULT_FONT)
  const input = valueToOctalString(value)
  const chunks = splitOctalChunks(input, font.core.digitsPerGlyph)
  const polygons = []

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
  const precision = numberOr(options.precision, font.renderer.precision)
  const padding = numberOr(options.padding, font.renderer.padding)
  const fill = stringOr(options.fill, font.renderer.fill)
  const path = multiPolygonToPath(multiPolygon, precision)
  const viewBox = boundsToViewBox(bounds, padding, precision)
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

function normalizeFont(rawInput = {}) {
  const fallback = typeof defaultHexFont === 'object' ? defaultHexFont : {}
  const raw = isRecord(rawInput) ? rawInput : {}
  const rawCore = isRecord(raw.core) ? raw.core : {}
  const rawArms = isRecord(raw.arms) ? raw.arms : {}
  const rawRenderer = isRecord(raw.renderer) ? raw.renderer : {}
  const fallbackCore = isRecord(fallback.core) ? fallback.core : {}
  const fallbackRenderer = isRecord(fallback.renderer) ? fallback.renderer : {}
  const fallbackArms = isRecord(fallback.arms) ? fallback.arms : {}

  const font = {
    version: 'octal-glyph-font/v1',
    name: typeof raw.name === 'string' ? raw.name : stringOr(fallback.name, 'Hex octal glyph font'),
    units: numberOr(raw.units, numberOr(fallback.units, 256)),
    core: {
      origin: pointOr(rawCore.origin, fallbackCore.origin, { x: 0, y: 0 }),
      polygon: pointArrayOr(rawCore.polygon, fallbackCore.polygon, []),
      holes: pointArrayListOr(rawCore.holes, fallbackCore.holes, []),
      socketStart: pointOr(rawCore.socketStart, fallbackCore.socketStart, { x: -8, y: -41.57 }),
      socketEnd: pointOr(rawCore.socketEnd, fallbackCore.socketEnd, { x: 8, y: -41.57 }),
      digitsPerGlyph: clampInteger(
        numberOr(rawCore.digitsPerGlyph, numberOr(fallbackCore.digitsPerGlyph, 6)),
        1,
        32,
      ),
      rotationStepDeg: numberOr(rawCore.rotationStepDeg, numberOr(fallbackCore.rotationStepDeg, 60)),
      glyphSpacing: numberOr(rawCore.glyphSpacing, numberOr(fallbackCore.glyphSpacing, 340)),
    },
    renderer: {
      fill: stringOr(rawRenderer.fill, stringOr(fallbackRenderer.fill, '#000000')),
      padding: numberOr(rawRenderer.padding, numberOr(fallbackRenderer.padding, 18)),
      precision: numberOr(rawRenderer.precision, numberOr(fallbackRenderer.precision, 2)),
    },
    arms: {},
  }

  DIGIT_KEYS.forEach((digit) => {
    const sourceArm = isPointArray(rawArms[digit]) ? rawArms[digit] : fallbackArms[digit]
    font.arms[digit] = alignArmEndpoints(font, isPointArray(sourceArm) ? sourceArm : [])
  })

  return font
}

function valueToOctalString(value) {
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

  const cleaned = String(value ?? '0')
    .replace(/\s+/g, '')
    .replace(/[^0-7]/g, '')
  return cleaned || '0'
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
  if (!Array.isArray(points) || points.length < 2) {
    return [clone(font.core.socketStart), clone(font.core.socketEnd)]
  }

  const next = points.map((point) => ({ ...point }))
  next[0] = clone(font.core.socketStart)
  next[next.length - 1] = clone(font.core.socketEnd)
  return next
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

function pointListToRing(points) {
  return points.map((point) => [round(point.x), round(point.y)])
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

function getMultiPolygonBounds(multiPolygon) {
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
    const req =
      typeof module !== 'undefined' && module.require
        ? module.require.bind(module)
        : typeof require !== 'undefined'
          ? require
          : null

    if (!req) {
      return null
    }

    const fs = req('fs/promises')
    return fs.readFile(path, 'utf8')
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
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

function pointOr(value, fallback, defaultValue) {
  if (isPoint(value)) {
    return clone(value)
  }
  if (isPoint(fallback)) {
    return clone(fallback)
  }
  return clone(defaultValue)
}

function pointArrayOr(value, fallback, defaultValue) {
  if (isPointArray(value)) {
    return clone(value)
  }
  if (isPointArray(fallback)) {
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
  loadFont,
  normalizeFont,
  render,
  renderSvg,
  renderSvgWithFontFile,
  splitOctalChunks,
  valueToOctalString,
}
