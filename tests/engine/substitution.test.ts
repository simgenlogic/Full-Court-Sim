import { describe, expect, it } from 'vitest'
import { ironhawks, thunderbolts } from '../../src/data/teams'
import { mulberry32 } from '../../src/engine/rng'
import { initGameState } from '../../src/engine/state'
import { checkSubstitutions } from '../../src/engine/substitution'
import type { GameState, TeamRuntimeState } from '../../src/engine/types'

function withPlayerPatch(state: GameState, playerId: string, patch: Partial<TeamRuntimeState['players'][string]>): GameState {
  const isHome = playerId in state.home.players
  const team = isHome ? state.home : state.away
  const nextTeam = { ...team, players: { ...team.players, [playerId]: { ...team.players[playerId]!, ...patch } } }
  return isHome ? { ...state, home: nextTeam } : { ...state, away: nextTeam }
}

describe('checkSubstitutions', () => {
  it('subs out a fatigued starter for the freshest rested bench player at the same position', () => {
    let state = initGameState(ironhawks, thunderbolts, 1, mulberry32(1))
    const starterId = state.home.onCourt[0]! // irh-1, PG
    state = withPlayerPatch(state, starterId, { fatigue: 90 })
    // bench PG is irh-6
    state = withPlayerPatch(state, 'irh-6', { fatigue: 10 })

    const decisions = checkSubstitutions(state.home, 1)
    expect(decisions).toContainEqual({ outPlayerId: starterId, inPlayerId: 'irh-6', reason: 'fatigue' })
  })

  it('does not sub a fresh lineup', () => {
    const state = initGameState(ironhawks, thunderbolts, 1, mulberry32(1))
    expect(checkSubstitutions(state.home, 1)).toEqual([])
  })

  it('forces out a fouled-out player (6 fouls) regardless of quarter', () => {
    let state = initGameState(ironhawks, thunderbolts, 1, mulberry32(1))
    const starterId = state.home.onCourt[0]!
    state = withPlayerPatch(state, starterId, { fouls: 6 })
    const decisions = checkSubstitutions(state.home, 4)
    expect(decisions.some((d) => d.outPlayerId === starterId && d.reason === 'foul-trouble')).toBe(true)
  })

  it('benches a foul-troubled (5-foul) player before the 4th quarter but leaves them in during it', () => {
    let state = initGameState(ironhawks, thunderbolts, 1, mulberry32(1))
    const starterId = state.home.onCourt[0]!
    state = withPlayerPatch(state, starterId, { fouls: 5 })

    const early = checkSubstitutions(state.home, 2)
    expect(early.some((d) => d.outPlayerId === starterId)).toBe(true)

    const late = checkSubstitutions(state.home, 4)
    expect(late.some((d) => d.outPlayerId === starterId)).toBe(false)
  })

  it('only proposes one fatigue substitution per check', () => {
    let state = initGameState(ironhawks, thunderbolts, 1, mulberry32(1))
    for (const id of state.home.onCourt) {
      state = withPlayerPatch(state, id, { fatigue: 95 })
    }
    for (const id of state.home.bench) {
      state = withPlayerPatch(state, id, { fatigue: 5 })
    }
    const decisions = checkSubstitutions(state.home, 1).filter((d) => d.reason === 'fatigue')
    expect(decisions).toHaveLength(1)
  })

  it('does not propose a fatigue substitution when no bench player is genuinely rested', () => {
    let state = initGameState(ironhawks, thunderbolts, 1, mulberry32(1))
    const starterId = state.home.onCourt[0]!
    state = withPlayerPatch(state, starterId, { fatigue: 90 })
    for (const id of state.home.bench) {
      state = withPlayerPatch(state, id, { fatigue: 90 })
    }
    expect(checkSubstitutions(state.home, 1)).toEqual([])
  })

  it('still forces out a fouled-out player even when no bench player is rested', () => {
    let state = initGameState(ironhawks, thunderbolts, 1, mulberry32(1))
    const starterId = state.home.onCourt[0]!
    state = withPlayerPatch(state, starterId, { fouls: 6 })
    for (const id of state.home.bench) {
      state = withPlayerPatch(state, id, { fatigue: 90 })
    }
    const decisions = checkSubstitutions(state.home, 1)
    expect(decisions.some((d) => d.outPlayerId === starterId && d.reason === 'foul-trouble')).toBe(true)
  })
})
