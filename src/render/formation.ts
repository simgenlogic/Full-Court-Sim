import type { CourtPoint, Position } from '../engine'

// Only the two "featured" players in an action get explicit move-to-position events from the
// engine — the other eight on-court players (teammates off the ball, defenders) still need a
// plausible spot to stand. This is a pure rendering default, not a simulation decision: it never
// affects anything the engine computes, just where an unfeatured player's dot sits.

const OFFENSE_SPOTS: Record<Position, CourtPoint> = {
  PG: { x: 72, y: 25 },
  SG: { x: 68, y: 42 },
  SF: { x: 68, y: 8 },
  PF: { x: 81, y: 33 },
  C: { x: 90, y: 17 },
}

export function offenseFormationSpot(position: Position): CourtPoint {
  return OFFENSE_SPOTS[position]
}

/** A defender's default spot: their assignment's spot, shaded a few feet toward the rim and paint. */
export function defenseFormationSpot(assignedOffensePosition: Position): CourtPoint {
  const spot = OFFENSE_SPOTS[assignedOffensePosition]
  return {
    x: Math.min(94, spot.x + 4),
    y: spot.y + (spot.y < 25 ? 3 : spot.y > 25 ? -3 : 0),
  }
}
