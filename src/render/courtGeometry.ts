import type { CourtPoint } from '../engine'

export const COURT_LENGTH_FT = 94
export const COURT_WIDTH_FT = 50

/**
 * Court feet -> canvas pixels. `mirror` flips the attacking direction (the engine always models
 * the offense attacking high-x; the renderer mirrors whichever team is on defense so the two
 * teams visually attack opposite baskets, like a real broadcast top-down view).
 */
export function toCanvasXY(point: CourtPoint, canvasWidth: number, canvasHeight: number, mirror: boolean): CourtPoint {
  const x = mirror ? COURT_LENGTH_FT - point.x : point.x
  return {
    x: (x / COURT_LENGTH_FT) * canvasWidth,
    y: (point.y / COURT_WIDTH_FT) * canvasHeight,
  }
}

export function lerpPoint(from: CourtPoint, to: CourtPoint, t: number): CourtPoint {
  const clamped = Math.min(1, Math.max(0, t))
  return { x: from.x + (to.x - from.x) * clamped, y: from.y + (to.y - from.y) * clamped }
}
