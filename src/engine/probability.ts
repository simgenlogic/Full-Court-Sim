import { clamp, rngNormal } from './rng'
import type { RNG } from './rng'
import type { ActionType, DefenseStyle, PlayerRuntimeState, ShotType } from './types'

// League-average-ish anchors, tuned so aggregate simulated stat lines land in believable ranges
// (validated by the statistical-bounds tests in tests/engine/simulateGame.stats.test.ts).
const BASE_SHOT_RATE: Record<ShotType, number> = { rim: 0.58, mid: 0.4, three: 0.35 }

export function computeShotProbability(params: {
  shooterRating: number
  defenderRating: number
  openness: number
  fatigue: number
  shotType: ShotType
}): number {
  const { shooterRating, defenderRating, openness, fatigue, shotType } = params
  const skillShift = ((shooterRating - defenderRating) / 100) * 0.2
  const opennessShift = (openness - 0.5) * 0.3
  const fatiguePenalty = (fatigue / 100) * 0.12
  const raw = BASE_SHOT_RATE[shotType] + skillShift + opennessShift - fatiguePenalty
  return clamp(raw, 0.05, 0.9)
}

const BASE_OPENNESS: Record<ActionType, number> = {
  transition: 0.65,
  'pick-and-roll': 0.4,
  'drive-and-kick': 0.6,
  motion: 0.55,
  'post-up': 0.35,
}

/** Where offense/defense tactics actually show up: openness shifts by shot type and defense style. */
export function computeOpenness(params: {
  action: ActionType
  shotType: ShotType
  defenseStyle: DefenseStyle
  ballHandlingRating: number
  perimeterDefenseRating: number
  rng: RNG
}): number {
  const { action, shotType, defenseStyle, ballHandlingRating, perimeterDefenseRating, rng } = params
  let openness = BASE_OPENNESS[action]

  if (defenseStyle === 'help-heavy') {
    if (shotType === 'rim') openness -= 0.15
    if (shotType === 'three') openness += 0.15
  }
  if (defenseStyle === 'switch') {
    if (action === 'drive-and-kick' || action === 'pick-and-roll') openness -= 0.1
    if (action === 'post-up') openness += 0.1
  }
  if (defenseStyle === 'drop') {
    if (shotType === 'mid') openness += 0.1
    if (shotType === 'rim' || shotType === 'three') openness -= 0.1
  }

  openness += clamp((ballHandlingRating - perimeterDefenseRating) / 100, -1, 1) * 0.1
  openness += rngNormal(rng, 0, 0.05)

  return clamp(openness, 0, 1)
}

export function passSuccessProbability(passerRating: number, defenderRating: number, contest = 0): number {
  return clamp(0.9 + (passerRating - defenderRating) / 400 - contest, 0.75, 0.98)
}

export function driveTurnoverProbability(ballHandlingRating: number, defenderPerimeterDefense: number): number {
  return clamp(0.12 - (ballHandlingRating - defenderPerimeterDefense) / 500, 0.04, 0.2)
}

const BASE_POSSESSION_DURATION: Record<ActionType, number> = {
  transition: 7,
  'pick-and-roll': 15,
  'drive-and-kick': 13,
  motion: 17,
  'post-up': 12,
}

/** Modeled possession length in seconds — not real time, just how long this action takes to develop. */
export function possessionDuration(action: ActionType, rng: RNG): number {
  return clamp(rngNormal(rng, BASE_POSSESSION_DURATION[action], 3), 3, 24)
}

export function resolveRebound(
  offensePlayers: PlayerRuntimeState[],
  defensePlayers: PlayerRuntimeState[],
  rng: RNG,
): { playerId: string; teamId: string; isOffensive: boolean } {
  const candidates = [
    ...offensePlayers.map((p) => ({ playerId: p.playerId, teamId: p.teamId, isOffensive: true, weight: reboundWeight(p) })),
    ...defensePlayers.map((p) => ({ playerId: p.playerId, teamId: p.teamId, isOffensive: false, weight: reboundWeight(p) * 1.4 })),
  ]
  const weights = candidates.map((c) => Math.max(c.weight, 1))
  const total = weights.reduce((sum, w) => sum + w, 0)
  let roll = rng() * total
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]!
    if (roll <= 0) return candidates[i]!
  }
  return candidates[candidates.length - 1]!
}

function reboundWeight(p: PlayerRuntimeState): number {
  return p.ratings.rebounding * (1 - (p.fatigue / 100) * 0.25)
}
