import { describe, expect, it } from 'vitest'
import { ironhawks, thunderbolts } from '../../src/data/teams'
import { applyEvent } from '../../src/engine/reducer'
import { mulberry32 } from '../../src/engine/rng'
import { initGameState } from '../../src/engine/state'
import type { GameEvent } from '../../src/engine/types'

function baseState() {
  return initGameState(ironhawks, thunderbolts, 1, mulberry32(1))
}

function ev<E extends GameEvent>(partial: E): E {
  return partial
}

describe('applyEvent', () => {
  it('score-update sets both scores directly from the event', () => {
    const state = baseState()
    const next = applyEvent(
      state,
      ev({
        id: 'ev-1',
        type: 'score-update',
        gameClock: { quarter: 1, gameSecondsRemaining: 700 },
        possessionId: 'p1',
        teamId: 'ironhawks',
        points: 2,
        newScore: { home: 2, away: 0 },
      }),
    )
    expect(next.home.score).toBe(2)
    expect(next.away.score).toBe(0)
  })

  it('foul increments the fouler personal fouls and the team foul count (non-offensive)', () => {
    const state = baseState()
    const next = applyEvent(
      state,
      ev({
        id: 'ev-1',
        type: 'foul',
        gameClock: { quarter: 1, gameSecondsRemaining: 700 },
        possessionId: 'p1',
        teamId: 'thunderbolts',
        foulerId: 'thb-5',
        foulTeamId: 'thunderbolts',
        foulType: 'shooting',
        isBonus: false,
      }),
    )
    expect(next.away.players['thb-5']!.fouls).toBe(1)
    expect(next.away.teamFoulsThisQuarter).toBe(1)
  })

  it('offensive fouls count toward personal fouls but not the team-foul bonus count', () => {
    const state = baseState()
    const next = applyEvent(
      state,
      ev({
        id: 'ev-1',
        type: 'foul',
        gameClock: { quarter: 1, gameSecondsRemaining: 700 },
        possessionId: 'p1',
        teamId: 'ironhawks',
        foulerId: 'irh-1',
        foulTeamId: 'ironhawks',
        foulType: 'offensive',
        isBonus: false,
      }),
    )
    expect(next.home.players['irh-1']!.fouls).toBe(1)
    expect(next.home.teamFoulsThisQuarter).toBe(0)
  })

  it('substitution swaps onCourt/bench membership and per-player onCourt flags', () => {
    const state = baseState()
    expect(state.home.onCourt).toContain('irh-1')
    expect(state.home.bench).toContain('irh-6')

    const next = applyEvent(
      state,
      ev({
        id: 'ev-1',
        type: 'substitution',
        gameClock: { quarter: 1, gameSecondsRemaining: 700 },
        possessionId: 'p1',
        teamId: 'ironhawks',
        outPlayerId: 'irh-1',
        inPlayerId: 'irh-6',
        reason: 'fatigue',
      }),
    )
    expect(next.home.onCourt).not.toContain('irh-1')
    expect(next.home.onCourt).toContain('irh-6')
    expect(next.home.bench).toContain('irh-1')
    expect(next.home.bench).not.toContain('irh-6')
    expect(next.home.players['irh-1']!.onCourt).toBe(false)
    expect(next.home.players['irh-6']!.onCourt).toBe(true)
  })

  it('quarter-end resets both teams team-foul counts and advances the clock to the next period', () => {
    let state = baseState()
    state = { ...state, home: { ...state.home, teamFoulsThisQuarter: 4 }, away: { ...state.away, teamFoulsThisQuarter: 3 } }

    const next = applyEvent(
      state,
      ev({
        id: 'ev-1',
        type: 'quarter-end',
        gameClock: { quarter: 1, gameSecondsRemaining: 0 },
        possessionId: 'p1',
        teamId: 'ironhawks',
        quarter: 1,
        scoreSnapshot: { home: 10, away: 8 },
      }),
    )
    expect(next.home.teamFoulsThisQuarter).toBe(0)
    expect(next.away.teamFoulsThisQuarter).toBe(0)
    expect(next.clock.quarter).toBe(2)
    expect(next.clock.gameSecondsRemaining).toBe(720)
  })

  it('game-end marks the game complete', () => {
    const state = baseState()
    const next = applyEvent(
      state,
      ev({
        id: 'ev-1',
        type: 'game-end',
        gameClock: { quarter: 4, gameSecondsRemaining: 0 },
        possessionId: 'p1',
        teamId: 'ironhawks',
        finalScore: { home: 101, away: 97 },
        wentToOvertime: false,
      }),
    )
    expect(next.isComplete).toBe(true)
  })

  it('possession-start sets the shot clock and current possession owner', () => {
    const state = baseState()
    const next = applyEvent(
      state,
      ev({
        id: 'ev-1',
        type: 'possession-start',
        gameClock: { quarter: 1, gameSecondsRemaining: 690 },
        possessionId: 'p2',
        teamId: 'thunderbolts',
        offenseTeamId: 'thunderbolts',
        defenseTeamId: 'ironhawks',
        lineupOffense: state.away.onCourt,
        lineupDefense: state.home.onCourt,
        shotClockSeconds: 14,
      }),
    )
    expect(next.clock.shotClockSeconds).toBe(14)
    expect(next.possessionTeamId).toBe('thunderbolts')
  })

  it('syncs the game clock quarter/seconds from each event snapshot', () => {
    const state = baseState()
    const next = applyEvent(
      state,
      ev({
        id: 'ev-1',
        type: 'turnover',
        gameClock: { quarter: 2, gameSecondsRemaining: 333 },
        possessionId: 'p1',
        teamId: 'ironhawks',
        playerId: 'irh-1',
        cause: 'bad-pass',
      }),
    )
    expect(next.clock.quarter).toBe(2)
    expect(next.clock.gameSecondsRemaining).toBe(333)
  })
})
