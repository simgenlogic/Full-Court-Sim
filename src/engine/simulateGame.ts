import { FULL_SHOT_CLOCK, OFFENSIVE_REBOUND_SHOT_CLOCK, REGULATION_QUARTERS, isPeriodOver } from './clock'
import { applyPossessionFatigue } from './fatigue'
import { applyEvent, otherTeamId } from './reducer'
import { simulatePossession } from './resolvePossession'
import type { RNG } from './rng'
import { mulberry32 } from './rng'
import type { InitGameOptions } from './state'
import { initGameState } from './state'
import { checkSubstitutions } from './substitution'
import type { GameClock, GameEvent, GameState } from './types'
import type { TeamDef } from './types'

const MIN_POSSESSIONS_BETWEEN_SUBS = 2

function makeEventId(state: GameState): string {
  return `ev-${String(state.events.length).padStart(5, '0')}`
}

function applyDriverEvent(state: GameState, event: GameEvent): GameState {
  return applyEvent(state, event)
}

/**
 * Runs a complete game from tip-off to final buzzer, given two rosters and a seed. This is the
 * only place that decides possession-to-possession context (who's on offense, the shot clock,
 * whether the next action gets a fast-break bias) — resolvePossession stays a pure function of
 * whatever context it's handed. Synchronous and fast: the whole game is computed upfront, and
 * animated playback (src/render) replays the resulting event log afterward.
 */
export function simulateGame(homeTeam: TeamDef, awayTeam: TeamDef, seed: number, options?: InitGameOptions): GameState {
  const rng: RNG = mulberry32(seed)
  let state = initGameState(homeTeam, awayTeam, seed, rng, options)

  let offenseTeamId = state.possessionTeamId
  let shotClockSeconds = FULL_SHOT_CLOCK
  let lastPossessionWasLiveTurnover = false
  const possessionsSinceSub: Record<string, number> = { [state.home.teamId]: MIN_POSSESSIONS_BETWEEN_SUBS, [state.away.teamId]: MIN_POSSESSIONS_BETWEEN_SUBS }

  while (!state.isComplete) {
    const clockBefore = state.clock.gameSecondsRemaining
    const possessionEvents: GameEvent[] = []

    for (const event of simulatePossession(state, offenseTeamId, shotClockSeconds, lastPossessionWasLiveTurnover, rng)) {
      state = applyDriverEvent(state, event)
      possessionEvents.push(event)
    }

    const elapsed = Math.max(0, clockBefore - state.clock.gameSecondsRemaining)
    state = applyPossessionFatigue(state, elapsed)

    for (const team of [state.home, state.away]) {
      possessionsSinceSub[team.teamId] = (possessionsSinceSub[team.teamId] ?? 0) + 1
      if (possessionsSinceSub[team.teamId]! < MIN_POSSESSIONS_BETWEEN_SUBS) continue
      const decisions = checkSubstitutions(team, state.clock.quarter)
      for (const decision of decisions) {
        state = applyDriverEvent(state, {
          id: makeEventId(state),
          gameClock: { quarter: state.clock.quarter, gameSecondsRemaining: state.clock.gameSecondsRemaining },
          possessionId: `admin-${state.events.length}`,
          teamId: team.teamId,
          type: 'substitution',
          outPlayerId: decision.outPlayerId,
          inPlayerId: decision.inPlayerId,
          reason: decision.reason,
        })
        possessionsSinceSub[team.teamId] = 0
      }
    }

    const lastEvent = possessionEvents[possessionEvents.length - 1]!
    const defenseTeamId = otherTeamId(state, offenseTeamId)

    if (lastEvent.type === 'rebound' && lastEvent.isOffensive) {
      shotClockSeconds = OFFENSIVE_REBOUND_SHOT_CLOCK
      lastPossessionWasLiveTurnover = false
      // offenseTeamId stays the same — the offense kept the ball off its own miss.
    } else if (lastEvent.type === 'rebound') {
      offenseTeamId = lastEvent.teamId
      shotClockSeconds = FULL_SHOT_CLOCK
      lastPossessionWasLiveTurnover = true
    } else if (lastEvent.type === 'turnover' || lastEvent.type === 'shot-clock-violation') {
      offenseTeamId = defenseTeamId
      shotClockSeconds = FULL_SHOT_CLOCK
      lastPossessionWasLiveTurnover = true
    } else {
      // score-update: a make (from the field or the free-throw line) — dead-ball change of possession.
      offenseTeamId = defenseTeamId
      shotClockSeconds = FULL_SHOT_CLOCK
      lastPossessionWasLiveTurnover = false
    }

    if (isPeriodOver(state.clock)) {
      const endedQuarter = state.clock.quarter
      const endedClock: GameClock = state.clock
      state = applyDriverEvent(state, {
        id: makeEventId(state),
        gameClock: { quarter: endedClock.quarter, gameSecondsRemaining: 0 },
        possessionId: `admin-${state.events.length}`,
        teamId: state.home.teamId,
        type: 'quarter-end',
        quarter: endedQuarter,
        scoreSnapshot: { home: state.home.score, away: state.away.score },
      })

      const gameCouldEnd = endedQuarter >= REGULATION_QUARTERS
      const isTied = state.home.score === state.away.score
      if (gameCouldEnd && !isTied) {
        state = applyDriverEvent(state, {
          id: makeEventId(state),
          gameClock: { quarter: endedClock.quarter, gameSecondsRemaining: 0 },
          possessionId: `admin-${state.events.length}`,
          teamId: state.home.teamId,
          type: 'game-end',
          finalScore: { home: state.home.score, away: state.away.score },
          wentToOvertime: endedQuarter > REGULATION_QUARTERS,
        })
        break
      }

      shotClockSeconds = FULL_SHOT_CLOCK
      lastPossessionWasLiveTurnover = false
    }
  }

  return state
}
