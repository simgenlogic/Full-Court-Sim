import { describe, expect, it } from 'vitest'
import { ironhawks, thunderbolts } from '../../src/data/teams'
import { simulateGame } from '../../src/engine/simulateGame'
import type { GameEvent } from '../../src/engine/types'

const SEED_COUNT = 100

function shotSplits(events: GameEvent[], teamId: string) {
  const attempts = events.filter((e): e is Extract<GameEvent, { type: 'shot-attempt' }> => e.type === 'shot-attempt' && e.teamId === teamId)
  const byType = (shotType: 'rim' | 'mid' | 'three') => {
    const shots = attempts.filter((e) => e.shotType === shotType)
    return { made: shots.filter((e) => e.made).length, attempted: shots.length }
  }
  return { rim: byType('rim'), mid: byType('mid'), three: byType('three'), all: attempts.length }
}

/** Ironhawks (home) stays the offense of interest across a batch of seeded games while a single
 * tactic knob is varied — isolates that knob's effect on Ironhawks' own shot profile. */
function runBatch(options: Parameters<typeof simulateGame>[3]) {
  const totals = { rimMade: 0, rimAttempted: 0, threeMade: 0, threeAttempted: 0, allAttempted: 0 }
  for (let seed = 1; seed <= SEED_COUNT; seed++) {
    const state = simulateGame(ironhawks, thunderbolts, seed, options)
    const splits = shotSplits(state.events, ironhawks.id)
    totals.rimMade += splits.rim.made
    totals.rimAttempted += splits.rim.attempted
    totals.threeMade += splits.three.made
    totals.threeAttempted += splits.three.attempted
    totals.allAttempted += splits.all
  }
  return totals
}

describe("defense style visibly shifts the offense's shot quality (openness)", () => {
  // Computed once here (test collection time) and shared by both assertions below — same
  // coverage as calling runBatch inside each `it`, half the simulated games.
  const vsDrop = runBatch({ awayDefenseStyle: 'drop' })
  const vsHelpHeavy = runBatch({ awayDefenseStyle: 'help-heavy' })

  it("help-heavy defense suppresses rim FG% versus drop defense", () => {
    const rimPct = (t: typeof vsDrop) => t.rimMade / t.rimAttempted
    expect(rimPct(vsHelpHeavy)).toBeLessThan(rimPct(vsDrop))
  })

  it('help-heavy defense opens up three-point looks versus drop defense', () => {
    const threePct = (t: typeof vsDrop) => t.threeMade / t.threeAttempted
    expect(threePct(vsHelpHeavy)).toBeGreaterThan(threePct(vsDrop))
  })
})

describe("offense style visibly shifts the team's own shot selection", () => {
  const motion = runBatch({ homeOffenseStyle: 'motion' })
  const pickAndRoll = runBatch({ homeOffenseStyle: 'pick-and-roll' })

  it('a motion-heavy offense takes a bigger share of threes than a pick-and-roll-heavy offense', () => {
    const threePointAttemptRate = (t: typeof motion) => t.threeAttempted / t.allAttempted
    expect(threePointAttemptRate(motion)).toBeGreaterThan(threePointAttemptRate(pickAndRoll))
  })
})
