import { nextPeriod } from './clock'
import type { GameEvent, GameState, TeamRuntimeState } from './types'

function otherTeamId(state: GameState, teamId: string): string {
  return state.home.teamId === teamId ? state.away.teamId : state.home.teamId
}

function getTeam(state: GameState, teamId: string): TeamRuntimeState {
  if (state.home.teamId === teamId) return state.home
  if (state.away.teamId === teamId) return state.away
  throw new Error(`Unknown team id: ${teamId}`)
}

function withTeam(state: GameState, teamId: string, patch: Partial<TeamRuntimeState>): GameState {
  const team = { ...getTeam(state, teamId), ...patch }
  return state.home.teamId === teamId ? { ...state, home: team } : { ...state, away: team }
}

function withPlayer(
  state: GameState,
  teamId: string,
  playerId: string,
  patch: Partial<TeamRuntimeState['players'][string]>,
): GameState {
  const team = getTeam(state, teamId)
  const player = team.players[playerId]
  if (!player) throw new Error(`Unknown player id: ${playerId} on team ${teamId}`)
  return withTeam(state, teamId, { players: { ...team.players, [playerId]: { ...player, ...patch } } })
}

/**
 * Pure reducer: applies one already-decided GameEvent's effects to GameState (score, fouls,
 * substitutions, clock, completion). Never decides basketball outcomes — that's resolvePossession's
 * job — this only folds a fact that already happened into the running state.
 */
export function applyEvent(state: GameState, event: GameEvent): GameState {
  const clock =
    event.type === 'quarter-end'
      ? nextPeriod(state.clock)
      : { ...state.clock, quarter: event.gameClock.quarter, gameSecondsRemaining: event.gameClock.gameSecondsRemaining }

  let next: GameState = { ...state, clock, events: [...state.events, event] }

  switch (event.type) {
    case 'possession-start': {
      next = {
        ...next,
        clock: { ...next.clock, shotClockSeconds: event.shotClockSeconds },
        possessionTeamId: event.offenseTeamId,
      }
      break
    }
    case 'score-update': {
      next = {
        ...next,
        home: { ...next.home, score: event.newScore.home },
        away: { ...next.away, score: event.newScore.away },
      }
      break
    }
    case 'foul': {
      const foulTeam = getTeam(next, event.foulTeamId)
      const fouler = foulTeam.players[event.foulerId]
      if (!fouler) throw new Error(`Unknown fouler id: ${event.foulerId}`)
      next = withPlayer(next, event.foulTeamId, event.foulerId, { fouls: fouler.fouls + 1 })
      // Offensive fouls don't count toward the defense's team-foul bonus threshold.
      if (event.foulType !== 'offensive') {
        next = withTeam(next, event.foulTeamId, {
          teamFoulsThisQuarter: getTeam(next, event.foulTeamId).teamFoulsThisQuarter + 1,
        })
      }
      break
    }
    case 'substitution': {
      const team = getTeam(next, event.teamId)
      next = withTeam(next, event.teamId, {
        onCourt: team.onCourt.filter((id) => id !== event.outPlayerId).concat(event.inPlayerId),
        bench: team.bench.filter((id) => id !== event.inPlayerId).concat(event.outPlayerId),
      })
      next = withPlayer(next, event.teamId, event.outPlayerId, { onCourt: false })
      next = withPlayer(next, event.teamId, event.inPlayerId, { onCourt: true })
      break
    }
    case 'quarter-end': {
      next = {
        ...next,
        home: { ...next.home, teamFoulsThisQuarter: 0 },
        away: { ...next.away, teamFoulsThisQuarter: 0 },
      }
      break
    }
    case 'game-end': {
      next = { ...next, isComplete: true }
      break
    }
    default:
      break
  }

  return next
}

export { otherTeamId }
