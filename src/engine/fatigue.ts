import { clamp } from './rng'
import type { GameState, TeamRuntimeState } from './types'

const BENCH_RECOVERY_PER_SECOND = 0.08

/** Higher stamina rating = slower fatigue accrual per second on court. */
export function fatigueGainPerSecond(staminaRating: number): number {
  return 0.015 * (1 - staminaRating / 150)
}

/**
 * Bulk fatigue update for one possession's elapsed time: on-court players for both teams accrue
 * fatigue (slower for higher-stamina players), bench players recover. Applied by the driver
 * after each possession — not part of resolvePossession's per-event stream.
 */
export function applyPossessionFatigue(state: GameState, durationSeconds: number): GameState {
  return { ...state, home: applyTeamFatigue(state.home, durationSeconds), away: applyTeamFatigue(state.away, durationSeconds) }
}

function applyTeamFatigue(team: TeamRuntimeState, durationSeconds: number): TeamRuntimeState {
  const players = { ...team.players }

  for (const id of team.onCourt) {
    const p = players[id]!
    const gain = fatigueGainPerSecond(p.ratings.stamina) * durationSeconds
    players[id] = { ...p, fatigue: clamp(p.fatigue + gain, 0, 100), secondsOnCourt: p.secondsOnCourt + durationSeconds }
  }
  for (const id of team.bench) {
    const p = players[id]!
    players[id] = { ...p, fatigue: clamp(p.fatigue - BENCH_RECOVERY_PER_SECOND * durationSeconds, 0, 100) }
  }

  return { ...team, players }
}
