import { describe, expect, it } from 'vitest'
import { ironhawks, thunderbolts } from '../../src/data/teams'
import { FULL_SHOT_CLOCK, OFFENSIVE_REBOUND_SHOT_CLOCK } from '../../src/engine/clock'
import { applyEvent } from '../../src/engine/reducer'
import { mulberry32 } from '../../src/engine/rng'
import { simulatePossession } from '../../src/engine/resolvePossession'
import { initGameState } from '../../src/engine/state'
import type { GameEvent, GameState } from '../../src/engine/types'

const TERMINAL_TYPES = new Set(['score-update', 'rebound', 'turnover', 'shot-clock-violation'])

/** Mirrors what the eventual simulateGame driver will do: run possessions back to back, deciding
 * the next possession's offense team / shot clock / fast-break flag from how the last one ended. */
function runPossessions(seed: number, count: number): { state: GameState; possessions: GameEvent[][] } {
  const rng = mulberry32(seed)
  let state = initGameState(ironhawks, thunderbolts, seed, rng)
  let offenseTeamId = state.possessionTeamId
  let shotClockSeconds = FULL_SHOT_CLOCK
  let liveTurnover = false
  const possessions: GameEvent[][] = []

  for (let i = 0; i < count; i++) {
    if (state.clock.gameSecondsRemaining <= 0) break
    const events: GameEvent[] = []
    for (const event of simulatePossession(state, offenseTeamId, shotClockSeconds, liveTurnover, rng)) {
      state = applyEvent(state, event)
      events.push(event)
    }
    possessions.push(events)
    const last = events[events.length - 1]!
    const defenseTeamId = offenseTeamId === state.home.teamId ? state.away.teamId : state.home.teamId

    if (last.type === 'rebound' && last.isOffensive) {
      shotClockSeconds = OFFENSIVE_REBOUND_SHOT_CLOCK
      liveTurnover = false
      // offenseTeamId unchanged
    } else if (last.type === 'rebound') {
      offenseTeamId = last.teamId
      shotClockSeconds = FULL_SHOT_CLOCK
      liveTurnover = true
    } else if (last.type === 'turnover' || last.type === 'shot-clock-violation') {
      offenseTeamId = defenseTeamId
      shotClockSeconds = FULL_SHOT_CLOCK
      liveTurnover = true
    } else {
      offenseTeamId = defenseTeamId
      shotClockSeconds = FULL_SHOT_CLOCK
      liveTurnover = false
    }
  }

  return { state, possessions }
}

describe('simulatePossession', () => {
  it('always ends with exactly one of the four terminal event types', () => {
    const { possessions } = runPossessions(1, 60)
    for (const events of possessions) {
      const last = events[events.length - 1]!
      expect(TERMINAL_TYPES.has(last.type)).toBe(true)
    }
  })

  it('every possession starts with possession-start and ends before the next one starts', () => {
    const { possessions } = runPossessions(2, 30)
    for (const events of possessions) {
      expect(events[0]!.type).toBe('possession-start')
      const startCount = events.filter((e) => e.type === 'possession-start').length
      expect(startCount).toBe(1)
    }
  })

  it('shot-attempt probabilities stay within the bounded [0.05, 0.9] range', () => {
    const { possessions } = runPossessions(3, 80)
    for (const events of possessions) {
      for (const event of events) {
        if (event.type === 'shot-attempt') {
          expect(event.probability).toBeGreaterThanOrEqual(0.05)
          expect(event.probability).toBeLessThanOrEqual(0.9)
        }
      }
    }
  })

  it('is fully deterministic given the same seed', () => {
    const a = runPossessions(42, 40)
    const b = runPossessions(42, 40)
    expect(JSON.stringify(a.possessions)).toEqual(JSON.stringify(b.possessions))
  })

  it('produces a believable shot mix over many possessions (smoke check, not the final calibration gate)', () => {
    // This harness doesn't yet advance quarters (that's simulateGame.ts, task 8), so each seed
    // naturally stops after one 12-minute quarter's worth of possessions; pool several seeds for
    // a large enough sample that per-seed variance doesn't make this flaky. The real calibration
    // gate (aggregate FG%/3P%/FT% bounds across ~200 full games) lands with simulateGame in task 8.
    const attempts = Array.from({ length: 10 }, (_, seed) => runPossessions(seed + 100, 300).possessions)
      .flat()
      .flat()
      .filter((e) => e.type === 'shot-attempt')
    expect(attempts.length).toBeGreaterThan(200)
    const madeCount = attempts.filter((e) => e.type === 'shot-attempt' && e.made).length
    const fgPct = madeCount / attempts.length
    expect(fgPct).toBeGreaterThan(0.25)
    expect(fgPct).toBeLessThan(0.65)
  })

  it('never runs the game clock past zero or above what was left when the possession began', () => {
    const rng = mulberry32(9)
    const initial = initGameState(ironhawks, thunderbolts, 9, rng)
    const state: GameState = { ...initial, clock: { ...initial.clock, gameSecondsRemaining: 5 } }
    const events = [...simulatePossession(state, state.possessionTeamId, FULL_SHOT_CLOCK, false, rng)]
    for (const event of events) {
      expect(event.gameClock.gameSecondsRemaining).toBeGreaterThanOrEqual(0)
      expect(event.gameClock.gameSecondsRemaining).toBeLessThanOrEqual(5)
    }
  })

  it('produces shooting fouls, non-shooting fouls, and offensive fouls over enough possessions', () => {
    const allEvents = Array.from({ length: 15 }, (_, seed) => runPossessions(seed + 200, 300).possessions)
      .flat()
      .flat()
    const fouls = allEvents.filter((e) => e.type === 'foul')
    expect(fouls.length).toBeGreaterThan(0)
    const foulTypes = new Set(fouls.map((f) => (f.type === 'foul' ? f.foulType : undefined)))
    expect(foulTypes.has('shooting')).toBe(true)
    expect(foulTypes.has('non-shooting')).toBe(true)
    expect(foulTypes.has('offensive')).toBe(true)
  })

  it('free-throw trips always carry a consistent attempt count for their situation', () => {
    const allEvents = Array.from({ length: 15 }, (_, seed) => runPossessions(seed + 300, 300).possessions)
      .flat()
      .flat()
    const freeThrows = allEvents.filter((e) => e.type === 'free-throw')
    expect(freeThrows.length).toBeGreaterThan(0)
    for (const ft of freeThrows) {
      if (ft.type !== 'free-throw') continue
      expect([1, 2, 3]).toContain(ft.totalAttempts)
      expect(ft.attemptNumber).toBeGreaterThanOrEqual(1)
      expect(ft.attemptNumber).toBeLessThanOrEqual(ft.totalAttempts)
    }
  })

  it('a made shot paired with a shooting foul (and-one) awards exactly one free throw', () => {
    const allEvents = Array.from({ length: 15 }, (_, seed) => runPossessions(seed + 400, 300).possessions).flat()
    for (const events of allEvents) {
      const shotIndex = events.findIndex((e) => e.type === 'shot-attempt' && e.made && e.fouled)
      if (shotIndex === -1) continue
      const trailingFreeThrows = events.slice(shotIndex).filter((e) => e.type === 'free-throw')
      expect(trailingFreeThrows).toHaveLength(1)
    }
  })

  it('a missed shot paired with a shooting foul awards 2 free throws (or 3 for a three-point attempt)', () => {
    const allEvents = Array.from({ length: 15 }, (_, seed) => runPossessions(seed + 500, 300).possessions).flat()
    for (const events of allEvents) {
      const shot = events.find((e) => e.type === 'shot-attempt' && !e.made && e.fouled)
      if (!shot || shot.type !== 'shot-attempt') continue
      const freeThrows = events.filter((e) => e.type === 'free-throw')
      expect(freeThrows).toHaveLength(shot.shotType === 'three' ? 3 : 2)
    }
  })
})
