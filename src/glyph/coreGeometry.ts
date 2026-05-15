import type { CoreGeometry, Point, SocketSegment } from './types'

export const MIN_CORE_DIGITS = 3
export const MAX_CORE_DIGITS = 32
export const DEFAULT_SOCKET_WIDTH = 16
export const DEFAULT_CORE_RADIUS = 41.57
export const DEFAULT_ANGLE_OFFSET_DEG = 0

export type RegularCoreInput = {
  origin: Point
  digitsPerGlyph: number
  socketWidth: number
  coreRadius: number
  angleOffsetDeg: number
}

export function createRegularCoreGeometry(input: RegularCoreInput): Pick<
  CoreGeometry,
  | 'polygon'
  | 'socketStart'
  | 'socketEnd'
  | 'sockets'
  | 'customCore'
  | 'digitsPerGlyph'
  | 'rotationStepDeg'
  | 'socketWidth'
  | 'coreRadius'
  | 'angleOffsetDeg'
> {
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
  const sockets: SocketSegment[] = []

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

export function socketsToPolygon(sockets: SocketSegment[]) {
  return sockets.flatMap((socket) => [socket.start, socket.end])
}

export function normalizeSockets(sockets: SocketSegment[], fallback: SocketSegment[], digitsPerGlyph: number) {
  return Array.from({ length: digitsPerGlyph }, (_, index) => {
    const socket = sockets[index] ?? fallback[index] ?? fallback[0]
    return {
      start: roundPoint(socket?.start ?? { x: 0, y: 0 }),
      end: roundPoint(socket?.end ?? { x: 0, y: 0 }),
    }
  })
}

export function inferSocketWidth(socketStart: Point | null | undefined, socketEnd: Point | null | undefined) {
  if (!socketStart || !socketEnd) {
    return DEFAULT_SOCKET_WIDTH
  }

  return Math.max(0.01, distance(socketStart, socketEnd))
}

export function inferCoreRadius(origin: Point, socketStart: Point | null | undefined, socketEnd: Point | null | undefined) {
  if (!socketStart || !socketEnd) {
    return DEFAULT_CORE_RADIUS
  }

  return Math.max(0.01, distance(origin, midpoint(socketStart, socketEnd)))
}

export function inferAngleOffsetDeg(origin: Point, socketStart: Point | null | undefined, socketEnd: Point | null | undefined) {
  if (!socketStart || !socketEnd) {
    return DEFAULT_ANGLE_OFFSET_DEG
  }

  const center = midpoint(socketStart, socketEnd)
  const dx = center.x - origin.x
  const dy = center.y - origin.y
  if (dx === 0 && dy === 0) {
    return DEFAULT_ANGLE_OFFSET_DEG
  }

  return normalizeDegrees((Math.atan2(dy, dx) * 180) / Math.PI + 90)
}

export function insetConvexPolygon(points: Point[], thickness: number): Point[] {
  if (points.length < 3 || thickness <= 0) {
    return points.map((point) => ({ ...point }))
  }

  const area = signedArea(points)
  const inwardSign = area >= 0 ? 1 : -1
  const lines = points.map((point, index) => {
    const next = points[(index + 1) % points.length]
    const dx = next.x - point.x
    const dy = next.y - point.y
    const length = Math.hypot(dx, dy) || 1
    const normal = {
      x: (-dy / length) * inwardSign,
      y: (dx / length) * inwardSign,
    }

    return {
      point: {
        x: point.x + normal.x * thickness,
        y: point.y + normal.y * thickness,
      },
      direction: { x: dx, y: dy },
    }
  })

  return points.map((point, index) => {
    const previous = lines[(index + lines.length - 1) % lines.length]
    const current = lines[index]
    return roundPoint(intersectLines(previous.point, previous.direction, current.point, current.direction) ?? point)
  })
}

function rotatePoint(point: Point, degrees: number, origin: Point): Point {
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

function intersectLines(pointA: Point, directionA: Point, pointB: Point, directionB: Point) {
  const cross = directionA.x * directionB.y - directionA.y * directionB.x
  if (Math.abs(cross) < 0.000001) {
    return null
  }

  const delta = { x: pointB.x - pointA.x, y: pointB.y - pointA.y }
  const t = (delta.x * directionB.y - delta.y * directionB.x) / cross
  return {
    x: pointA.x + directionA.x * t,
    y: pointA.y + directionA.y * t,
  }
}

function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  }
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function signedArea(points: Point[]) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length]
    return area + point.x * next.y - next.x * point.y
  }, 0)
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360
}

function roundPoint(point: Point): Point {
  return {
    x: roundForGeometry(point.x),
    y: roundForGeometry(point.y),
  }
}

function roundForGeometry(value: number) {
  return Number.parseFloat(value.toFixed(2))
}

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}
