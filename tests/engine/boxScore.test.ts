import { describe, expect, it } from 'vitest'
import { deriveBoxScore } from '../../src/engine/boxScore'
import type { GameEvent } from '../../src/engine/types'

const HOME = 'H'
const AWAY = 'A'

function gc(gameSecondsRemaining: number) {
  return { quarter: 1, gameSecondsRemaining }
}

// A small, fully hand-computable event log exercising every stat-contributing event type:
// an assisted made three, a missed rim shot + defensive rebound, a fouled mid-range miss that
// goes 1-for-2 from the line with a live rebound off the miss, and a turnover.
const events: GameEvent[] = [
  {
    id: 'ev-0',
    gameClock: gc(720),
    possessionId: 'p1',
    teamId: HOME,
    type: 'possession-start',
    offenseTeamId: HOME,
    defenseTeamId: AWAY,
    lineupOffense: ['h1', 'h2'],
    lineupDefense: ['a1', 'a2'],
    shotClockSeconds: 24,
  },
  {
    id: 'ev-1',
    gameClock: gc(710),
    possessionId: 'p1',
    teamId: HOME,
    type: 'shot-attempt',
    shooterId: 'h1',
    defenderId: 'a1',
    shotType: 'three',
    xy: { x: 92, y: 4 },
    openness: 0.6,
    probability: 0.4,
    made: true,
    assistedBy: 'h2',
    fouled: false,
  },
  {
    id: 'ev-2',
    gameClock: gc(705),
    possessionId: 'p2',
    teamId: AWAY,
    type: 'possession-start',
    offenseTeamId: AWAY,
    defenseTeamId: HOME,
    lineupOffense: ['a1', 'a2'],
    lineupDefense: ['h1', 'h2'],
    shotClockSeconds: 24,
  },
  {
    id: 'ev-3',
    gameClock: gc(700),
    possessionId: 'p2',
    teamId: AWAY,
    type: 'shot-attempt',
    shooterId: 'a1',
    defenderId: 'h1',
    shotType: 'rim',
    xy: { x: 89, y: 25 },
    openness: 0.3,
    probability: 0.5,
    made: false,
    fouled: false,
  },
  {
    id: 'ev-4',
    gameClock: gc(700),
    possessionId: 'p2',
    teamId: HOME,
    type: 'rebound',
    playerId: 'h1',
    isOffensive: false,
  },
  {
    id: 'ev-5',
    gameClock: gc(700),
    possessionId: 'p3',
    teamId: HOME,
    type: 'possession-start',
    offenseTeamId: HOME,
    defenseTeamId: AWAY,
    lineupOffense: ['h1', 'h2'],
    lineupDefense: ['a1', 'a2'],
    shotClockSeconds: 24,
  },
  {
    id: 'ev-6',
    gameClock: gc(690),
    possessionId: 'p3',
    teamId: HOME,
    type: 'shot-attempt',
    shooterId: 'h2',
    defenderId: 'a2',
    shotType: 'mid',
    xy: { x: 81, y: 17 },
    openness: 0.4,
    probability: 0.4,
    made: false,
    fouled: true,
  },
  {
    id: 'ev-7',
    gameClock: gc(690),
    possessionId: 'p3',
    teamId: AWAY,
    type: 'foul',
    foulerId: 'a2',
    foulTeamId: AWAY,
    drawnById: 'h2',
    foulType: 'shooting',
    isBonus: false,
  },
  { id: 'ev-8', gameClock: gc(690), possessionId: 'p3', teamId: HOME, type: 'free-throw', shooterId: 'h2', attemptNumber: 1, totalAttempts: 2, made: true },
  { id: 'ev-9', gameClock: gc(690), possessionId: 'p3', teamId: HOME, type: 'free-throw', shooterId: 'h2', attemptNumber: 2, totalAttempts: 2, made: false },
  {
    id: 'ev-10',
    gameClock: gc(690),
    possessionId: 'p3',
    teamId: AWAY,
    type: 'rebound',
    playerId: 'a1',
    isOffensive: false,
  },
  {
    id: 'ev-11',
    gameClock: gc(680),
    possessionId: 'p3',
    teamId: AWAY,
    type: 'turnover',
    playerId: 'a1',
    cause: 'lost-ball',
  },
]

describe('deriveBoxScore', () => {
  const box = deriveBoxScore(events, HOME, AWAY)

  it('derives correct per-player stats for the shooter and assister', () => {
    const h1 = box.home.players.find((p) => p.playerId === 'h1')!
    expect(h1).toMatchObject({ fgMade: 1, fgAttempted: 1, threeMade: 1, threeAttempted: 1, points: 3, defensiveRebounds: 1, assists: 0 })

    const h2 = box.home.players.find((p) => p.playerId === 'h2')!
    expect(h2).toMatchObject({ fgMade: 0, fgAttempted: 1, points: 1, assists: 1, ftMade: 1, ftAttempted: 2 })
  })

  it('derives correct per-player stats for the miss, foul, and turnover', () => {
    const a1 = box.away.players.find((p) => p.playerId === 'a1')!
    expect(a1).toMatchObject({ fgMade: 0, fgAttempted: 1, points: 0, turnovers: 1, defensiveRebounds: 1 })

    const a2 = box.away.players.find((p) => p.playerId === 'a2')!
    expect(a2).toMatchObject({ personalFouls: 1, points: 0 })
  })

  it('sums team totals from player totals exactly', () => {
    expect(box.home.team).toMatchObject({
      teamId: HOME,
      points: 4,
      fgMade: 1,
      fgAttempted: 2,
      threeMade: 1,
      threeAttempted: 1,
      ftMade: 1,
      ftAttempted: 2,
      assists: 1,
      defensiveRebounds: 1,
      offensiveRebounds: 0,
      turnovers: 0,
      personalFouls: 0,
    })
    expect(box.away.team).toMatchObject({
      teamId: AWAY,
      points: 0,
      fgMade: 0,
      fgAttempted: 1,
      threeMade: 0,
      threeAttempted: 0,
      ftMade: 0,
      ftAttempted: 0,
      assists: 0,
      defensiveRebounds: 1,
      offensiveRebounds: 0,
      turnovers: 1,
      personalFouls: 1,
    })
  })

  it('attributes seconds played evenly to all four players who were on court throughout', () => {
    for (const p of [...box.home.players, ...box.away.players]) {
      expect(p.secondsPlayed).toBe(40)
    }
  })

  it('never double-counts or drops a rebound between offensive and defensive tallies', () => {
    const totalRebounds = box.home.team.offensiveRebounds + box.home.team.defensiveRebounds + box.away.team.offensiveRebounds + box.away.team.defensiveRebounds
    const reboundEventCount = events.filter((e) => e.type === 'rebound').length
    expect(totalRebounds).toBe(reboundEventCount)
  })
})
