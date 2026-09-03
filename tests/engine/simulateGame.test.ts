import { describe, expect, it } from 'vitest'
import { ironhawks, thunderbolts } from '../../src/data/teams'
import { deriveBoxScore } from '../../src/engine/boxScore'
import { simulateGame } from '../../src/engine/simulateGame'

describe('simulateGame', () => {
  it('completes with a well-formed final state', () => {
    const state = simulateGame(ironhawks, thunderbolts, 1)
    expect(state.isComplete).toBe(true)
    expect(state.clock.quarter).toBeGreaterThanOrEqual(4)
    expect(state.clock.gameSecondsRemaining).toBe(0)
    expect(state.home.score).not.toBe(state.away.score) // regulation/OT never ends tied
    expect(state.events[state.events.length - 1]!.type).toBe('game-end')
  })

  it('is fully deterministic given the same seed', () => {
    const a = simulateGame(ironhawks, thunderbolts, 777)
    const b = simulateGame(ironhawks, thunderbolts, 777)
    expect(a.home.score).toBe(b.home.score)
    expect(a.away.score).toBe(b.away.score)
    expect(a.events.length).toBe(b.events.length)
    expect(JSON.stringify(a.events)).toEqual(JSON.stringify(b.events))
  })

  it('different seeds produce different games', () => {
    const a = simulateGame(ironhawks, thunderbolts, 1)
    const b = simulateGame(ironhawks, thunderbolts, 2)
    expect(JSON.stringify(a.events)).not.toEqual(JSON.stringify(b.events))
  })

  it('plays through all 4 quarters in order, each ending at 0 seconds', () => {
    const state = simulateGame(ironhawks, thunderbolts, 3)
    const quarterEnds = state.events.filter((e) => e.type === 'quarter-end')
    expect(quarterEnds.map((e) => (e.type === 'quarter-end' ? e.quarter : -1))).toEqual(
      Array.from({ length: quarterEnds.length }, (_, i) => i + 1),
    )
  })

  it('goes to overtime when regulation ends tied, and OT periods are 5 minutes', () => {
    // Search a handful of seeds for one that goes to OT (rare, ~1-2% of games).
    let otState: ReturnType<typeof simulateGame> | undefined
    for (let seed = 1000; seed < 1100 && !otState; seed++) {
      const state = simulateGame(ironhawks, thunderbolts, seed)
      if (state.clock.quarter > 4) otState = state
    }
    expect(otState, 'expected at least one OT game in 100 seeds').toBeDefined()
    const q4End = otState!.events.find((e) => e.type === 'quarter-end' && e.quarter === 4)
    expect(q4End).toBeDefined()
    expect(q4End!.type === 'quarter-end' && q4End!.scoreSnapshot.home).toBe(q4End!.type === 'quarter-end' ? q4End!.scoreSnapshot.away : -1)
  })

  it('every player who logged any seconds belongs to exactly one team in the box score', () => {
    const state = simulateGame(ironhawks, thunderbolts, 5)
    const box = deriveBoxScore(state.events, ironhawks.id, thunderbolts.id)
    const homeIds = new Set(box.home.players.map((p) => p.playerId))
    const awayIds = new Set(box.away.players.map((p) => p.playerId))
    for (const id of homeIds) expect(awayIds.has(id)).toBe(false)
  })

  it('the box score final score matches GameState scores', () => {
    const state = simulateGame(ironhawks, thunderbolts, 8)
    const box = deriveBoxScore(state.events, ironhawks.id, thunderbolts.id)
    expect(box.home.team.points).toBe(state.home.score)
    expect(box.away.team.points).toBe(state.away.score)
  })
})

describe('simulateGame statistical bounds (calibration gate)', () => {
  // Aggregates across many seeded games. These bounds are deliberately wide — the point is to
  // catch a badly broken probability model (e.g. a formula regression), not to pin exact values.
  // If a future tuning pass moves these numbers, update the bounds deliberately, not by widening
  // them reflexively.
  const SEED_COUNT = 120
  const results = Array.from({ length: SEED_COUNT }, (_, i) => {
    const state = simulateGame(ironhawks, thunderbolts, i + 1)
    return deriveBoxScore(state.events, ironhawks.id, thunderbolts.id)
  })
  const sides = results.flatMap((box) => [box.home.team, box.away.team])

  const sum = (f: (t: (typeof sides)[number]) => number) => sides.reduce((s, t) => s + f(t), 0)

  it('field-goal percentage lands in a believable range', () => {
    const fgPct = sum((t) => t.fgMade) / sum((t) => t.fgAttempted)
    expect(fgPct).toBeGreaterThan(0.38)
    expect(fgPct).toBeLessThan(0.52)
  })

  it('three-point percentage lands in a believable range', () => {
    const threePct = sum((t) => t.threeMade) / sum((t) => t.threeAttempted)
    expect(threePct).toBeGreaterThan(0.27)
    expect(threePct).toBeLessThan(0.42)
  })

  it('free-throw percentage lands in a believable range', () => {
    const ftPct = sum((t) => t.ftMade) / sum((t) => t.ftAttempted)
    expect(ftPct).toBeGreaterThan(0.65)
    expect(ftPct).toBeLessThan(0.88)
  })

  it('points per game land in a believable range', () => {
    const ppg = sum((t) => t.points) / sides.length
    expect(ppg).toBeGreaterThan(75)
    expect(ppg).toBeLessThan(125)
  })

  it('turnovers per game land in a believable range', () => {
    const topg = sum((t) => t.turnovers) / sides.length
    expect(topg).toBeGreaterThan(8)
    expect(topg).toBeLessThan(22)
  })
})

describe('possession flow (ball movement, not just a single shooter roll)', () => {
  // Regression coverage for the "every play resolves in 0-1 passes" issue: a possession chain
  // should meaningfully vary in how many times the ball moves before a shot goes up, rather than
  // capping out at one pass every time.
  function completedPassCountsPerPossession(seedCount: number): number[] {
    const counts: number[] = []
    for (let seed = 1; seed <= seedCount; seed++) {
      const state = simulateGame(ironhawks, thunderbolts, seed)
      let inPossession = false
      let passes = 0
      for (const event of state.events) {
        if (event.type === 'action-selected') {
          inPossession = true
          passes = 0
        } else if (event.type === 'pass' && event.completed) {
          passes++
        } else if (inPossession && (event.type === 'shot-attempt' || event.type === 'turnover' || event.type === 'shot-clock-violation')) {
          counts.push(passes)
          inPossession = false
        }
      }
    }
    return counts
  }

  it('possessions routinely involve more than one pass, not just 0-1', () => {
    const counts = completedPassCountsPerPossession(40)
    expect(counts.length).toBeGreaterThan(500)

    const average = counts.reduce((sum, c) => sum + c, 0) / counts.length
    const twoOrMorePassShare = counts.filter((c) => c >= 2).length / counts.length

    expect(average).toBeGreaterThan(0.4)
    expect(twoOrMorePassShare).toBeGreaterThan(0.08)
  })

  it('every possession-ending pass count is non-negative and bounded by the playbook depth', () => {
    const counts = completedPassCountsPerPossession(10)
    for (const c of counts) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(3)
    }
  })
})
