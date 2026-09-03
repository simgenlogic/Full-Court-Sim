import { OVERTIME_SECONDS, QUARTER_SECONDS, REGULATION_QUARTERS } from './clock'
import type { GameEvent } from './types'

export interface PlayerGameStats {
  playerId: string
  teamId: string
  points: number
  fgMade: number
  fgAttempted: number
  threeMade: number
  threeAttempted: number
  ftMade: number
  ftAttempted: number
  assists: number
  offensiveRebounds: number
  defensiveRebounds: number
  turnovers: number
  personalFouls: number
  secondsPlayed: number
}

export interface TeamGameStats {
  teamId: string
  points: number
  fgMade: number
  fgAttempted: number
  threeMade: number
  threeAttempted: number
  ftMade: number
  ftAttempted: number
  assists: number
  offensiveRebounds: number
  defensiveRebounds: number
  turnovers: number
  personalFouls: number
}

export interface BoxScore {
  home: { team: TeamGameStats; players: PlayerGameStats[] }
  away: { team: TeamGameStats; players: PlayerGameStats[] }
}

function totalElapsedSeconds(gameClock: { quarter: number; gameSecondsRemaining: number }): number {
  if (gameClock.quarter <= REGULATION_QUARTERS) {
    return (gameClock.quarter - 1) * QUARTER_SECONDS + (QUARTER_SECONDS - gameClock.gameSecondsRemaining)
  }
  const regulationSeconds = REGULATION_QUARTERS * QUARTER_SECONDS
  const otSoFar = (gameClock.quarter - REGULATION_QUARTERS - 1) * OVERTIME_SECONDS
  return regulationSeconds + otSoFar + (OVERTIME_SECONDS - gameClock.gameSecondsRemaining)
}

function emptyPlayerStats(playerId: string, teamId: string): PlayerGameStats {
  return {
    playerId,
    teamId,
    points: 0,
    fgMade: 0,
    fgAttempted: 0,
    threeMade: 0,
    threeAttempted: 0,
    ftMade: 0,
    ftAttempted: 0,
    assists: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    turnovers: 0,
    personalFouls: 0,
    secondsPlayed: 0,
  }
}

function emptyTeamStats(teamId: string): TeamGameStats {
  return {
    teamId,
    points: 0,
    fgMade: 0,
    fgAttempted: 0,
    threeMade: 0,
    threeAttempted: 0,
    ftMade: 0,
    ftAttempted: 0,
    assists: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    turnovers: 0,
    personalFouls: 0,
  }
}

/**
 * Pure reduction of the event log into a box score — points, shooting splits, rebounds,
 * assists, turnovers, fouls, and seconds played are all derived here, never tracked as a
 * separate mutable structure during simulation, so a displayed box score can never drift from
 * what the event log says actually happened. Works equally well on a prefix of the log (a "live"
 * box score during animated playback) or the complete log (the final box score).
 */
export function deriveBoxScore(events: GameEvent[], homeTeamId: string, awayTeamId: string): BoxScore {
  const players = new Map<string, PlayerGameStats>()
  const teamOf = new Map<string, string>()

  const ensurePlayer = (playerId: string, teamId: string): PlayerGameStats => {
    teamOf.set(playerId, teamId)
    let stats = players.get(playerId)
    if (!stats) {
      stats = emptyPlayerStats(playerId, teamId)
      players.set(playerId, stats)
    }
    return stats
  }

  let activeOnCourt: { home: Set<string>; away: Set<string> } | null = null
  let lastElapsed = 0

  for (const event of events) {
    const elapsedNow = totalElapsedSeconds(event.gameClock)
    const delta = elapsedNow - lastElapsed
    if (delta > 0 && activeOnCourt) {
      for (const id of activeOnCourt.home) ensurePlayer(id, homeTeamId).secondsPlayed += delta
      for (const id of activeOnCourt.away) ensurePlayer(id, awayTeamId).secondsPlayed += delta
    }
    lastElapsed = elapsedNow

    switch (event.type) {
      case 'possession-start': {
        const isHomeOffense = event.offenseTeamId === homeTeamId
        const homeLineup = isHomeOffense ? event.lineupOffense : event.lineupDefense
        const awayLineup = isHomeOffense ? event.lineupDefense : event.lineupOffense
        activeOnCourt = { home: new Set(homeLineup), away: new Set(awayLineup) }
        for (const id of homeLineup) ensurePlayer(id, homeTeamId)
        for (const id of awayLineup) ensurePlayer(id, awayTeamId)
        break
      }
      case 'shot-attempt': {
        const teamId = event.teamId
        const shooter = ensurePlayer(event.shooterId, teamId)
        shooter.fgAttempted += 1
        if (event.shotType === 'three') shooter.threeAttempted += 1
        if (event.made) {
          const points = event.shotType === 'three' ? 3 : 2
          shooter.fgMade += 1
          shooter.points += points
          if (event.shotType === 'three') shooter.threeMade += 1
          if (event.assistedBy) ensurePlayer(event.assistedBy, teamId).assists += 1
        }
        break
      }
      case 'free-throw': {
        const shooter = players.get(event.shooterId)
        if (!shooter) break
        shooter.ftAttempted += 1
        if (event.made) {
          shooter.ftMade += 1
          shooter.points += 1
        }
        break
      }
      case 'rebound': {
        const rebounder = ensurePlayer(event.playerId, event.teamId)
        if (event.isOffensive) rebounder.offensiveRebounds += 1
        else rebounder.defensiveRebounds += 1
        break
      }
      case 'turnover': {
        ensurePlayer(event.playerId, event.teamId).turnovers += 1
        break
      }
      case 'foul': {
        ensurePlayer(event.foulerId, event.foulTeamId).personalFouls += 1
        break
      }
      default:
        break
    }
  }

  const homePlayers = [...players.values()].filter((p) => p.teamId === homeTeamId)
  const awayPlayers = [...players.values()].filter((p) => p.teamId === awayTeamId)

  return {
    home: { team: sumTeamStats(homeTeamId, homePlayers), players: homePlayers },
    away: { team: sumTeamStats(awayTeamId, awayPlayers), players: awayPlayers },
  }
}

function sumTeamStats(teamId: string, players: PlayerGameStats[]): TeamGameStats {
  const team = emptyTeamStats(teamId)
  for (const p of players) {
    team.points += p.points
    team.fgMade += p.fgMade
    team.fgAttempted += p.fgAttempted
    team.threeMade += p.threeMade
    team.threeAttempted += p.threeAttempted
    team.ftMade += p.ftMade
    team.ftAttempted += p.ftAttempted
    team.assists += p.assists
    team.offensiveRebounds += p.offensiveRebounds
    team.defensiveRebounds += p.defensiveRebounds
    team.turnovers += p.turnovers
    team.personalFouls += p.personalFouls
  }
  return team
}
