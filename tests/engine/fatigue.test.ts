import { describe, expect, it } from 'vitest'
import { ironhawks, thunderbolts } from '../../src/data/teams'
import { applyPossessionFatigue, fatigueGainPerSecond } from '../../src/engine/fatigue'
import { mulberry32 } from '../../src/engine/rng'
import { initGameState } from '../../src/engine/state'

describe('fatigueGainPerSecond', () => {
  it('is lower for higher-stamina players', () => {
    expect(fatigueGainPerSecond(90)).toBeLessThan(fatigueGainPerSecond(50))
  })

  it('is always positive for any in-range stamina rating', () => {
    expect(fatigueGainPerSecond(100)).toBeGreaterThan(0)
    expect(fatigueGainPerSecond(0)).toBeGreaterThan(0)
  })
})

describe('applyPossessionFatigue', () => {
  it('increases fatigue for on-court players and tracks seconds played', () => {
    const state = initGameState(ironhawks, thunderbolts, 1, mulberry32(1))
    const onCourtId = state.home.onCourt[0]!
    const next = applyPossessionFatigue(state, 60)
    expect(next.home.players[onCourtId]!.fatigue).toBeGreaterThan(0)
    expect(next.home.players[onCourtId]!.secondsOnCourt).toBe(60)
  })

  it('recovers fatigue for bench players and never drops below zero', () => {
    let state = initGameState(ironhawks, thunderbolts, 1, mulberry32(1))
    const benchId = state.home.bench[0]!
    state = { ...state, home: { ...state.home, players: { ...state.home.players, [benchId]: { ...state.home.players[benchId]!, fatigue: 5 } } } }
    const next = applyPossessionFatigue(state, 1000)
    expect(next.home.players[benchId]!.fatigue).toBe(0)
  })

  it('never pushes fatigue above 100 no matter how long the stretch', () => {
    const state = initGameState(ironhawks, thunderbolts, 1, mulberry32(1))
    const next = applyPossessionFatigue(state, 100000)
    for (const id of next.home.onCourt) {
      expect(next.home.players[id]!.fatigue).toBeLessThanOrEqual(100)
    }
  })

  it('does not touch players on the other team differently from their own on/off-court status', () => {
    const state = initGameState(ironhawks, thunderbolts, 1, mulberry32(1))
    const next = applyPossessionFatigue(state, 60)
    for (const id of state.away.onCourt) expect(next.away.players[id]!.fatigue).toBeGreaterThan(0)
    for (const id of state.away.bench) expect(next.away.players[id]!.fatigue).toBe(0)
  })
})
