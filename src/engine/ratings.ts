import type { RNG } from './rng'
import { rngPick } from './rng'
import type { PlayerRatings, PlayerRuntimeState, TeamRuntimeState } from './types'

/** Fatigue-adjusted rating: a fully fatigued player performs meaningfully worse across the board. */
export function effectiveRating(base: number, fatigue: number, weight = 0.25): number {
  const value = base * (1 - (fatigue / 100) * weight)
  return Math.min(100, Math.max(0, value))
}

/** On-court players in the same order as team.onCourt (used for positional matchups). */
export function getOnCourtPlayers(team: TeamRuntimeState): PlayerRuntimeState[] {
  return team.onCourt.map((id) => team.players[id]!)
}

const GUARD_BONUS: Partial<Record<PlayerRuntimeState['position'], number>> = { PG: 10, SG: 5 }

/**
 * Weighted-random role pick rather than a deterministic argmax: over a whole game every on-court
 * player should touch the ball sometimes, just skewed toward whoever's better suited to the role.
 * Squaring the composite score keeps that skew meaningful without making it exclusive.
 */
function weightedPickBy<T>(items: T[], rng: RNG, score: (item: T) => number): T {
  const weights = items.map((item) => Math.max(score(item), 0.01) ** 2)
  return rngPick(rng, items, weights)
}

/** Ball handler for this possession: ballHandling + passing composite, nudged toward guards. */
export function pickBallHandler(players: PlayerRuntimeState[], rng: RNG): PlayerRuntimeState {
  return weightedPickBy(players, rng, (p) => {
    const composite = effectiveRating(p.ratings.ballHandling, p.fatigue) * 0.5 + effectiveRating(p.ratings.passing, p.fatigue) * 0.5
    return composite + (GUARD_BONUS[p.position] ?? 0)
  })
}

/** Screener/roll-man proxy for this possession: interior defense + rebounding composite. */
export function pickScreener(players: PlayerRuntimeState[], excludeId: string, rng: RNG): PlayerRuntimeState {
  const pool = players.filter((p) => p.playerId !== excludeId)
  return weightedPickBy(pool, rng, (p) => effectiveRating(p.ratings.interiorDefense, p.fatigue) * 0.5 + effectiveRating(p.ratings.rebounding, p.fatigue) * 0.5)
}

export function pickThreePointThreat(players: PlayerRuntimeState[], excludeIds: string[], rng: RNG): PlayerRuntimeState {
  const pool = players.filter((p) => !excludeIds.includes(p.playerId))
  const candidates = pool.length > 0 ? pool : players
  return weightedPickBy(candidates, rng, (p) => effectiveRating(p.ratings.threePoint, p.fatigue))
}

export function weakestInteriorDefender(players: PlayerRuntimeState[]): PlayerRuntimeState {
  return minBy(players, (p) => effectiveRating(p.ratings.interiorDefense, p.fatigue))
}

export function averageEffectiveRating(players: PlayerRuntimeState[], key: keyof PlayerRatings): number {
  if (players.length === 0) return 0
  return players.reduce((sum, p) => sum + effectiveRating(p.ratings[key], p.fatigue), 0) / players.length
}

function maxBy<T>(items: T[], score: (item: T) => number): T {
  let best: T = items[0]!
  let bestScore = score(best)
  for (const item of items.slice(1)) {
    const s = score(item)
    if (s > bestScore) {
      best = item
      bestScore = s
    }
  }
  return best
}

function minBy<T>(items: T[], score: (item: T) => number): T {
  return maxBy(items, (item) => -score(item))
}
