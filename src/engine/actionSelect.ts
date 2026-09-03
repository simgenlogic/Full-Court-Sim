import { averageEffectiveRating, effectiveRating, getOnCourtPlayers, pickBallHandler, pickScreener, weakestInteriorDefender } from './ratings'
import type { RNG } from './rng'
import { rngPick } from './rng'
import type { ActionType, OffenseStyle, TeamRuntimeState } from './types'

const BASE_WEIGHTS: Record<OffenseStyle, Record<ActionType, number>> = {
  balanced: { transition: 0.15, 'pick-and-roll': 0.25, 'drive-and-kick': 0.25, motion: 0.25, 'post-up': 0.1 },
  'pick-and-roll': { transition: 0.1, 'pick-and-roll': 0.5, 'drive-and-kick': 0.15, motion: 0.15, 'post-up': 0.1 },
  'drive-and-kick': { transition: 0.1, 'pick-and-roll': 0.15, 'drive-and-kick': 0.5, motion: 0.15, 'post-up': 0.1 },
  motion: { transition: 0.1, 'pick-and-roll': 0.15, 'drive-and-kick': 0.15, motion: 0.55, 'post-up': 0.05 },
}

const ACTION_TYPES: ActionType[] = ['transition', 'pick-and-roll', 'drive-and-kick', 'motion', 'post-up']

export interface SelectedAction {
  action: ActionType
  primaryPlayerId: string
  secondaryPlayerId?: string
}

const SHOT_CLOCK_PRESSURE_THRESHOLD = 7

export function selectAction(
  offense: TeamRuntimeState,
  defense: TeamRuntimeState,
  effectiveShotClockSeconds: number,
  lastPossessionWasLiveTurnover: boolean,
  rng: RNG,
): SelectedAction {
  const offensePlayers = getOnCourtPlayers(offense)
  const defensePlayers = getOnCourtPlayers(defense)
  const primary = pickBallHandler(offensePlayers)

  // Under shot-clock pressure, skip the read entirely and just get a quick look off.
  if (effectiveShotClockSeconds < SHOT_CLOCK_PRESSURE_THRESHOLD) {
    return { action: 'transition', primaryPlayerId: primary.playerId }
  }

  const weights = { ...BASE_WEIGHTS[offense.offenseStyle] }

  if (lastPossessionWasLiveTurnover && averageEffectiveRating(offensePlayers, 'speed') > averageEffectiveRating(defensePlayers, 'speed')) {
    weights.transition *= 2.5
  }

  const bestFinisher = offensePlayers.reduce((best, p) =>
    effectiveRating(p.ratings.finishing, p.fatigue) > effectiveRating(best.ratings.finishing, best.fatigue) ? p : best,
  )
  const weakestDefender = weakestInteriorDefender(defensePlayers)
  if (effectiveRating(bestFinisher.ratings.finishing, bestFinisher.fatigue) > effectiveRating(weakestDefender.ratings.interiorDefense, weakestDefender.fatigue) + 15) {
    weights['post-up'] *= 1.8
  }

  const action = rngPick(rng, ACTION_TYPES, ACTION_TYPES.map((a) => weights[a]))

  if (action === 'transition') {
    return { action, primaryPlayerId: primary.playerId }
  }

  // For post-up, "secondary" is the post player who receives the entry pass and is the primary
  // scoring option; "primary" stays the ball handler who makes the entry pass.
  const secondary = pickScreener(offensePlayers, primary.playerId)
  return { action, primaryPlayerId: primary.playerId, secondaryPlayerId: secondary.playerId }
}
