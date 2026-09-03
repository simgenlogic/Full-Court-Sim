import type { RNG } from './rng'
import { rngPick } from './rng'
import type { ActionType, CourtPoint, ShotType } from './types'

// Court modeled in feet, 94 (length, x) x 50 (width, y). The offense always attacks the
// basket at the right end (high x) — a full-court model isn't needed for a possession-based
// sim, this just gives the renderer plausible, readable spots to animate players between.

export const RIM: CourtPoint = { x: 89, y: 25 }
export const TOP_OF_KEY: CourtPoint = { x: 72, y: 25 }
export const BACKCOURT: CourtPoint = { x: 20, y: 25 }

const LEFT = {
  wing: { x: 68, y: 8 },
  elbow: { x: 81, y: 17 },
  corner: { x: 92, y: 4 },
  block: { x: 90, y: 16 },
} satisfies Record<string, CourtPoint>

const RIGHT = {
  wing: { x: 68, y: 42 },
  elbow: { x: 81, y: 33 },
  corner: { x: 92, y: 46 },
  block: { x: 90, y: 34 },
} satisfies Record<string, CourtPoint>

export interface MoveWaypoint {
  playerId: string
  fromXY: CourtPoint
  toXY: CourtPoint
  durationMs: number
}

/** Animation-flavor waypoints for the two featured players in an action. Picks a side at random. */
export function actionWaypoints(
  action: ActionType,
  primaryPlayerId: string,
  secondaryPlayerId: string | undefined,
  rng: RNG,
): MoveWaypoint[] {
  const side = rngPick(rng, [LEFT, RIGHT] as const)

  switch (action) {
    case 'transition':
      return [{ playerId: primaryPlayerId, fromXY: BACKCOURT, toXY: RIM, durationMs: 1400 }]
    case 'pick-and-roll':
      return [
        { playerId: primaryPlayerId, fromXY: TOP_OF_KEY, toXY: side.elbow, durationMs: 1600 },
        ...(secondaryPlayerId
          ? [{ playerId: secondaryPlayerId, fromXY: side.block, toXY: RIM, durationMs: 1400 }]
          : []),
      ]
    case 'drive-and-kick':
      return [
        { playerId: primaryPlayerId, fromXY: TOP_OF_KEY, toXY: RIM, durationMs: 1200 },
        ...(secondaryPlayerId
          ? [{ playerId: secondaryPlayerId, fromXY: side.corner, toXY: side.wing, durationMs: 1000 }]
          : []),
      ]
    case 'motion':
      return [
        { playerId: primaryPlayerId, fromXY: TOP_OF_KEY, toXY: side.wing, durationMs: 1500 },
        ...(secondaryPlayerId
          ? [{ playerId: secondaryPlayerId, fromXY: side.elbow, toXY: side.corner, durationMs: 1500 }]
          : []),
      ]
    case 'post-up':
      return [
        { playerId: primaryPlayerId, fromXY: TOP_OF_KEY, toXY: side.wing, durationMs: 1200 },
        ...(secondaryPlayerId
          ? [{ playerId: secondaryPlayerId, fromXY: side.elbow, toXY: side.block, durationMs: 1400 }]
          : []),
      ]
  }
}

export function shotSpot(shotType: ShotType, rng: RNG): CourtPoint {
  const side = rngPick(rng, [LEFT, RIGHT] as const)
  if (shotType === 'rim') return RIM
  if (shotType === 'mid') return side.elbow
  return rngPick(rng, [side.corner, side.wing] as const)
}
