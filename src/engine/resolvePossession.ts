import { selectAction } from './actionSelect'
import { effectiveShotClock } from './clock'
import { actionWaypoints, shotSpot } from './courtSpots'
import {
  computeOpenness,
  computeShotProbability,
  driveTurnoverProbability,
  passSuccessProbability,
  possessionDuration,
  resolveRebound,
} from './probability'
import { effectiveRating, getOnCourtPlayers, pickThreePointThreat } from './ratings'
import type { RNG } from './rng'
import { rngChance } from './rng'
import type { ActionType, GameEvent, GameState, PlayerRuntimeState, ShotType, TeamRuntimeState } from './types'

type ShotRole = 'primary' | 'secondary' | 'kickOut'

const SHOT_TABLE: Record<ActionType, { role: ShotRole; shotType: ShotType; weight: number }[]> = {
  transition: [
    { role: 'primary', shotType: 'rim', weight: 0.7 },
    { role: 'kickOut', shotType: 'three', weight: 0.3 },
  ],
  'pick-and-roll': [
    { role: 'primary', shotType: 'mid', weight: 0.45 },
    { role: 'secondary', shotType: 'rim', weight: 0.35 },
    { role: 'kickOut', shotType: 'three', weight: 0.2 },
  ],
  'drive-and-kick': [
    { role: 'primary', shotType: 'rim', weight: 0.3 },
    { role: 'secondary', shotType: 'three', weight: 0.55 },
    { role: 'primary', shotType: 'mid', weight: 0.15 },
  ],
  motion: [
    { role: 'secondary', shotType: 'three', weight: 0.6 },
    { role: 'primary', shotType: 'mid', weight: 0.25 },
    { role: 'primary', shotType: 'rim', weight: 0.15 },
  ],
  'post-up': [
    { role: 'secondary', shotType: 'rim', weight: 0.7 },
    { role: 'primary', shotType: 'three', weight: 0.3 },
  ],
}

function shooterRatingForShot(shooter: PlayerRuntimeState, shotType: ShotType): number {
  const base =
    shotType === 'three'
      ? shooter.ratings.threePoint
      : shotType === 'rim'
        ? shooter.ratings.finishing
        : (shooter.ratings.finishing + shooter.ratings.threePoint) / 2
  return effectiveRating(base, shooter.fatigue)
}

function defenderRatingForShot(defender: PlayerRuntimeState, shotType: ShotType): number {
  const base = shotType === 'rim' ? defender.ratings.interiorDefense : defender.ratings.perimeterDefense
  return effectiveRating(base, defender.fatigue)
}

/**
 * Simulates one possession (one shot-clock cycle) as a sequence of structured events, given
 * an explicit offense/shot-clock/fast-break context rather than reading it off GameState — the
 * driver (simulateGame.ts) decides that context possession-to-possession based on how the
 * previous one ended, and folds each yielded event back into GameState via applyEvent.
 */
export function* simulatePossession(
  state: GameState,
  offenseTeamId: string,
  shotClockSeconds: number,
  lastPossessionWasLiveTurnover: boolean,
  rng: RNG,
): Generator<GameEvent> {
  const offense: TeamRuntimeState = state.home.teamId === offenseTeamId ? state.home : state.away
  const defense: TeamRuntimeState = offense === state.home ? state.away : state.home
  const offensePlayers = getOnCourtPlayers(offense)
  const defensePlayers = getOnCourtPlayers(defense)

  // Rough man-to-man matchups: pair on-court arrays positionally.
  const defenderOf = new Map<string, PlayerRuntimeState>()
  offense.onCourt.forEach((offId, i) => {
    const defId = defense.onCourt[i % defense.onCourt.length]!
    defenderOf.set(offId, defense.players[defId]!)
  })

  let eventSeq = state.events.length
  const possessionId = `poss-${eventSeq}`
  const nextId = () => `ev-${String(eventSeq++).padStart(5, '0')}`

  let secondsRemaining = state.clock.gameSecondsRemaining
  const snapshot = () => ({ quarter: state.clock.quarter, gameSecondsRemaining: Math.round(secondsRemaining) })
  const base = () => ({ gameClock: snapshot(), possessionId, teamId: offenseTeamId })

  yield {
    ...base(),
    id: nextId(),
    type: 'possession-start',
    offenseTeamId,
    defenseTeamId: defense.teamId,
    lineupOffense: offense.onCourt,
    lineupDefense: defense.onCourt,
    shotClockSeconds,
  }

  const ceiling = effectiveShotClock({ ...state.clock, shotClockSeconds, gameSecondsRemaining: secondsRemaining })
  const { action, primaryPlayerId, secondaryPlayerId } = selectAction(offense, defense, ceiling, lastPossessionWasLiveTurnover, rng)

  yield { ...base(), id: nextId(), type: 'action-selected', action, primaryPlayerId, secondaryPlayerId }

  for (const wp of actionWaypoints(action, primaryPlayerId, secondaryPlayerId, rng)) {
    yield { ...base(), id: nextId(), type: 'move-to-position', playerId: wp.playerId, fromXY: wp.fromXY, toXY: wp.toXY, durationMs: wp.durationMs }
  }

  const drawnDuration = possessionDuration(action, rng)
  if (drawnDuration >= ceiling) {
    secondsRemaining = Math.max(0, secondsRemaining - ceiling)
    yield { ...base(), id: nextId(), gameClock: snapshot(), type: 'shot-clock-violation' }
    return
  }
  secondsRemaining = Math.max(0, secondsRemaining - drawnDuration)

  const primary = offense.players[primaryPlayerId]!
  const primaryDefender = defenderOf.get(primaryPlayerId)!

  // A baseline chance the offense simply loses the ball before ever getting a shot off.
  const baselineTurnoverProb = driveTurnoverProbability(
    effectiveRating(primary.ratings.ballHandling, primary.fatigue),
    effectiveRating(primaryDefender.ratings.perimeterDefense, primaryDefender.fatigue),
  )
  if (rngChance(rng, baselineTurnoverProb)) {
    yield { ...base(), id: nextId(), type: 'turnover', playerId: primaryPlayerId, cause: 'lost-ball' }
    return
  }

  const entry = SHOT_TABLE[action]
  const pick = weightedPick(rng, entry)
  let shooterId: string
  let passedFrom: string | undefined
  if (pick.role === 'primary') {
    shooterId = primaryPlayerId
  } else if (pick.role === 'secondary' && secondaryPlayerId) {
    shooterId = secondaryPlayerId
    passedFrom = primaryPlayerId
  } else {
    const exclude = [primaryPlayerId, ...(secondaryPlayerId ? [secondaryPlayerId] : [])]
    shooterId = pickThreePointThreat(offensePlayers, exclude).playerId
    passedFrom = secondaryPlayerId ?? primaryPlayerId
  }

  if (passedFrom) {
    const passer = offense.players[passedFrom]!
    const shooterDefender = defenderOf.get(shooterId)!
    const passProb = passSuccessProbability(
      effectiveRating(passer.ratings.passing, passer.fatigue),
      effectiveRating(shooterDefender.ratings.perimeterDefense, shooterDefender.fatigue),
    )
    const completed = rngChance(rng, passProb)
    yield { ...base(), id: nextId(), type: 'pass', fromPlayerId: passedFrom, toPlayerId: shooterId, completed }
    if (!completed) {
      yield { ...base(), id: nextId(), type: 'turnover', playerId: passedFrom, cause: 'bad-pass' }
      return
    }
  }

  const shooter = offense.players[shooterId]!
  const shooterDefender = defenderOf.get(shooterId)!
  const shotType = pick.shotType

  const openness = computeOpenness({
    action,
    shotType,
    defenseStyle: defense.defenseStyle,
    ballHandlingRating: effectiveRating(shooter.ratings.ballHandling, shooter.fatigue),
    perimeterDefenseRating: effectiveRating(shooterDefender.ratings.perimeterDefense, shooterDefender.fatigue),
    rng,
  })

  const probability = computeShotProbability({
    shooterRating: shooterRatingForShot(shooter, shotType),
    defenderRating: defenderRatingForShot(shooterDefender, shotType),
    openness,
    fatigue: shooter.fatigue,
    shotType,
  })
  const made = rngChance(rng, probability)
  const assistedBy = made ? passedFrom : undefined

  yield {
    ...base(),
    id: nextId(),
    type: 'shot-attempt',
    shooterId,
    defenderId: shooterDefender.playerId,
    shotType,
    xy: shotSpot(shotType, rng),
    openness,
    probability,
    made,
    assistedBy,
    fouled: false,
  }

  if (made) {
    const points = shotType === 'three' ? 3 : 2
    const newScore = {
      home: state.home.teamId === offenseTeamId ? state.home.score + points : state.home.score,
      away: state.away.teamId === offenseTeamId ? state.away.score + points : state.away.score,
    }
    yield { ...base(), id: nextId(), type: 'score-update', points, newScore }
    return
  }

  const rebound = resolveRebound(offensePlayers, defensePlayers, rng)
  // teamId here is the rebounding team (which may be offense on an ORB or defense on a DRB) —
  // more useful to a consumer than always echoing the possession's offense team.
  yield { ...base(), teamId: rebound.teamId, id: nextId(), type: 'rebound', playerId: rebound.playerId, isOffensive: rebound.isOffensive }
}

function weightedPick<T extends { weight: number }>(rng: RNG, items: T[]): T {
  const total = items.reduce((sum, i) => sum + i.weight, 0)
  let roll = rng() * total
  for (const item of items) {
    roll -= item.weight
    if (roll <= 0) return item
  }
  return items[items.length - 1]!
}
