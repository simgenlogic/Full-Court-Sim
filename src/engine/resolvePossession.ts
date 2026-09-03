import { selectAction } from './actionSelect'
import { effectiveShotClock } from './clock'
import { actionWaypoints, BACKCOURT, shotSpot, TOP_OF_KEY } from './courtSpots'
import { resolveOffensiveChain } from './possessionChain'
import {
  computeOpenness,
  computeShotProbability,
  driveTurnoverProbability,
  freeThrowProbability,
  nonShootingFoulProbability,
  resolveRebound,
  setupDuration,
  shootingFoulProbability,
} from './probability'
import { effectiveRating, getOnCourtPlayers } from './ratings'
import type { RNG } from './rng'
import { rngChance } from './rng'
import type { GameEvent, GameState, PlayerRuntimeState, ShotType, TeamRuntimeState } from './types'

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

interface BaseFields {
  gameClock: { quarter: number; gameSecondsRemaining: number }
  possessionId: string
  teamId: string
}

interface FreeThrowParams {
  shooterId: string
  count: number
  shooterFinishing: number
  base: () => BaseFields
  nextId: () => string
  homeScore: number
  awayScore: number
  isHomeOffense: boolean
  rng: RNG
}

/** Resolves a free-throw trip; yields free-throw + score-update events and returns whether the
 * final attempt was made (so the caller knows whether the ball is live for a rebound). */
function* resolveFreeThrows(params: FreeThrowParams): Generator<GameEvent, { finalMade: boolean; homeScore: number; awayScore: number }> {
  const { shooterId, count, shooterFinishing, base, nextId, isHomeOffense, rng } = params
  let { homeScore, awayScore } = params
  const ftProbability = freeThrowProbability(shooterFinishing)
  let finalMade = false

  for (let attemptNumber = 1; attemptNumber <= count; attemptNumber++) {
    const made = rngChance(rng, ftProbability)
    finalMade = made
    yield { ...base(), id: nextId(), type: 'free-throw', shooterId, attemptNumber, totalAttempts: count, made }
    if (made) {
      if (isHomeOffense) homeScore += 1
      else awayScore += 1
      yield { ...base(), id: nextId(), type: 'score-update', points: 1, newScore: { home: homeScore, away: awayScore } }
    }
  }

  return { finalMade, homeScore, awayScore }
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

  // Shared mutable clock: simulatePossession and the delegated chain generator both read/write
  // this same object, so every yielded event carries an accurate, already-decreasing snapshot.
  const timeBox = { value: state.clock.gameSecondsRemaining }
  const snapshot = () => ({ quarter: state.clock.quarter, gameSecondsRemaining: Math.round(timeBox.value) })
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

  const ceiling = effectiveShotClock({ ...state.clock, shotClockSeconds, gameSecondsRemaining: timeBox.value })
  const { action, primaryPlayerId, secondaryPlayerId } = selectAction(offense, defense, ceiling, lastPossessionWasLiveTurnover, rng)

  yield { ...base(), id: nextId(), type: 'action-selected', action, primaryPlayerId, secondaryPlayerId }

  // Bring the ball up before running the halfcourt action — 'transition' already models the full
  // backcourt-to-rim sprint as its own move below, so it skips this separate setup beat.
  if (action !== 'transition') {
    yield { ...base(), id: nextId(), type: 'move-to-position', playerId: primaryPlayerId, fromXY: BACKCOURT, toXY: TOP_OF_KEY, durationMs: 1100 }
  }

  for (const wp of actionWaypoints(action, primaryPlayerId, secondaryPlayerId, rng)) {
    yield { ...base(), id: nextId(), type: 'move-to-position', playerId: wp.playerId, fromXY: wp.fromXY, toXY: wp.toXY, durationMs: wp.durationMs }
  }

  // Transition has no separate "bring it up and set up" phase — the fast break itself is the setup.
  const setupCost = action === 'transition' ? 0 : setupDuration(rng)
  if (setupCost >= ceiling) {
    timeBox.value = Math.max(0, timeBox.value - ceiling)
    yield { ...base(), id: nextId(), type: 'shot-clock-violation' }
    return
  }
  timeBox.value = Math.max(0, timeBox.value - setupCost)

  const primary = offense.players[primaryPlayerId]!
  const primaryDefender = defenderOf.get(primaryPlayerId)!
  const isHomeOffense = state.home.teamId === offenseTeamId

  // An off-ball/loose-ball foul, independent of whatever shot eventually gets taken. In the
  // bonus it's possession-ending free throws; otherwise it's just recorded and play continues.
  if (rngChance(rng, nonShootingFoulProbability(defense.defenseStyle))) {
    const isBonus = defense.teamFoulsThisQuarter + 1 >= 5
    yield {
      ...base(),
      id: nextId(),
      type: 'foul',
      foulerId: primaryDefender.playerId,
      foulTeamId: defense.teamId,
      drawnById: primaryPlayerId,
      foulType: 'non-shooting',
      isBonus,
    }
    if (isBonus) {
      const ftResult = yield* resolveFreeThrows({
        shooterId: primaryPlayerId,
        count: 2,
        shooterFinishing: primary.ratings.finishing,
        base,
        nextId,
        homeScore: state.home.score,
        awayScore: state.away.score,
        isHomeOffense,
        rng,
      })
      if (!ftResult.finalMade) {
        const rebound = resolveRebound(offensePlayers, defensePlayers, rng)
        yield { ...base(), teamId: rebound.teamId, id: nextId(), type: 'rebound', playerId: rebound.playerId, isOffensive: rebound.isOffensive }
      }
      return
    }
  }

  // A baseline chance the offense simply loses the ball before ever getting a shot off — usually
  // a live-ball turnover, occasionally an offensive foul.
  const baselineTurnoverProb = driveTurnoverProbability(
    effectiveRating(primary.ratings.ballHandling, primary.fatigue),
    effectiveRating(primaryDefender.ratings.perimeterDefense, primaryDefender.fatigue),
  )
  if (rngChance(rng, baselineTurnoverProb)) {
    if (rngChance(rng, 0.15)) {
      yield {
        ...base(),
        id: nextId(),
        type: 'foul',
        foulerId: primaryPlayerId,
        foulTeamId: offense.teamId,
        foulType: 'offensive',
        isBonus: false,
      }
      yield { ...base(), id: nextId(), type: 'turnover', playerId: primaryPlayerId, cause: 'offensive-foul' }
    } else {
      yield { ...base(), id: nextId(), type: 'turnover', playerId: primaryPlayerId, cause: 'lost-ball' }
    }
    return
  }

  const chainResult = yield* resolveOffensiveChain({
    action,
    primaryPlayerId,
    secondaryPlayerId,
    offense,
    offensePlayers,
    defenderOf,
    timeBox,
    budgetSeconds: ceiling - setupCost,
    base,
    nextId,
    rng,
  })

  if (chainResult.outcome === 'turnover' || chainResult.outcome === 'shot-clock-violation') {
    return
  }

  const { shooterId, shotType, passedFrom } = chainResult
  const shooter = offense.players[shooterId]!
  const shooterDefender = defenderOf.get(shooterId)!

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
  const fouled = rngChance(rng, shootingFoulProbability(defenderRatingForShot(shooterDefender, shotType), openness))

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
    fouled,
  }

  const points = shotType === 'three' ? 3 : 2
  let homeScore = state.home.score
  let awayScore = state.away.score

  if (made) {
    if (isHomeOffense) homeScore += points
    else awayScore += points
    yield { ...base(), id: nextId(), type: 'score-update', points, newScore: { home: homeScore, away: awayScore } }

    if (fouled) {
      // And-one: the basket already counted, one bonus free throw regardless of make/miss.
      yield {
        ...base(),
        id: nextId(),
        type: 'foul',
        foulerId: shooterDefender.playerId,
        foulTeamId: defense.teamId,
        drawnById: shooterId,
        foulType: 'shooting',
        isBonus: false,
      }
      const ftResult = yield* resolveFreeThrows({
        shooterId,
        count: 1,
        shooterFinishing: shooter.ratings.finishing,
        base,
        nextId,
        homeScore,
        awayScore,
        isHomeOffense,
        rng,
      })
      if (!ftResult.finalMade) {
        const rebound = resolveRebound(offensePlayers, defensePlayers, rng)
        yield { ...base(), teamId: rebound.teamId, id: nextId(), type: 'rebound', playerId: rebound.playerId, isOffensive: rebound.isOffensive }
      }
    }
    return
  }

  if (fouled) {
    yield {
      ...base(),
      id: nextId(),
      type: 'foul',
      foulerId: shooterDefender.playerId,
      foulTeamId: defense.teamId,
      drawnById: shooterId,
      foulType: 'shooting',
      isBonus: false,
    }
    const ftResult = yield* resolveFreeThrows({
      shooterId,
      count: shotType === 'three' ? 3 : 2,
      shooterFinishing: shooter.ratings.finishing,
      base,
      nextId,
      homeScore,
      awayScore,
      isHomeOffense,
      rng,
    })
    if (!ftResult.finalMade) {
      const rebound = resolveRebound(offensePlayers, defensePlayers, rng)
      yield { ...base(), teamId: rebound.teamId, id: nextId(), type: 'rebound', playerId: rebound.playerId, isOffensive: rebound.isOffensive }
    }
    return
  }

  const rebound = resolveRebound(offensePlayers, defensePlayers, rng)
  // teamId here is the rebounding team (which may be offense on an ORB or defense on a DRB) —
  // more useful to a consumer than always echoing the possession's offense team.
  yield { ...base(), teamId: rebound.teamId, id: nextId(), type: 'rebound', playerId: rebound.playerId, isOffensive: rebound.isOffensive }
}
