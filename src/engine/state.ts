import { initGameClock } from './clock'
import type { RNG } from './rng'
import { rngPick } from './rng'
import type {
  DefenseStyle,
  GameState,
  OffenseStyle,
  PlayerRuntimeState,
  TeamDef,
  TeamRuntimeState,
} from './types'

export interface InitGameOptions {
  homeOffenseStyle?: OffenseStyle
  homeDefenseStyle?: DefenseStyle
  awayOffenseStyle?: OffenseStyle
  awayDefenseStyle?: DefenseStyle
}

function initTeamRuntimeState(
  team: TeamDef,
  offenseStyle: OffenseStyle,
  defenseStyle: DefenseStyle,
): TeamRuntimeState {
  const starters = team.players.slice(0, 5).map((p) => p.id)
  const bench = team.players.slice(5).map((p) => p.id)
  const players: Record<string, PlayerRuntimeState> = {}
  for (const player of team.players) {
    players[player.id] = {
      playerId: player.id,
      teamId: team.id,
      position: player.position,
      ratings: player.ratings,
      stamina: 100,
      fatigue: 0,
      fouls: 0,
      secondsOnCourt: 0,
      onCourt: starters.includes(player.id),
    }
  }
  return {
    teamId: team.id,
    score: 0,
    teamFoulsThisQuarter: 0,
    offenseStyle,
    defenseStyle,
    onCourt: starters,
    bench,
    players,
  }
}

/** Builds the initial GameState for a new game. Consumes rng draws only for the opening tip. */
export function initGameState(
  homeTeam: TeamDef,
  awayTeam: TeamDef,
  seed: number,
  rng: RNG,
  options: InitGameOptions = {},
): GameState {
  const home = initTeamRuntimeState(
    homeTeam,
    options.homeOffenseStyle ?? homeTeam.defaultOffenseStyle,
    options.homeDefenseStyle ?? homeTeam.defaultDefenseStyle,
  )
  const away = initTeamRuntimeState(
    awayTeam,
    options.awayOffenseStyle ?? awayTeam.defaultOffenseStyle,
    options.awayDefenseStyle ?? awayTeam.defaultDefenseStyle,
  )

  return {
    seed,
    clock: initGameClock(),
    home,
    away,
    possessionTeamId: rngPick(rng, [home.teamId, away.teamId]),
    lastPossessionWasLiveTurnover: false,
    events: [],
    isComplete: false,
  }
}
