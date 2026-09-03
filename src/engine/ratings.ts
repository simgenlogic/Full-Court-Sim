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

/** Best ball handler on the floor: ballHandling + passing composite, nudged toward guards. */
export function pickBallHandler(players: PlayerRuntimeState[]): PlayerRuntimeState {
  return maxBy(players, (p) => {
    const composite = effectiveRating(p.ratings.ballHandling, p.fatigue) * 0.5 + effectiveRating(p.ratings.passing, p.fatigue) * 0.5
    return composite + (GUARD_BONUS[p.position] ?? 0)
  })
}

/** Best screener/roll-man proxy: interior defense + rebounding composite (a stand-in for size/post skill). */
export function pickScreener(players: PlayerRuntimeState[], excludeId: string): PlayerRuntimeState {
  const pool = players.filter((p) => p.playerId !== excludeId)
  return maxBy(pool, (p) => effectiveRating(p.ratings.interiorDefense, p.fatigue) * 0.5 + effectiveRating(p.ratings.rebounding, p.fatigue) * 0.5)
}

export function pickThreePointThreat(players: PlayerRuntimeState[], excludeIds: string[]): PlayerRuntimeState {
  const pool = players.filter((p) => !excludeIds.includes(p.playerId))
  const candidates = pool.length > 0 ? pool : players
  return maxBy(candidates, (p) => effectiveRating(p.ratings.threePoint, p.fatigue))
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
