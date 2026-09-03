import { describe, expect, it } from 'vitest'
import {
  FULL_SHOT_CLOCK,
  OVERTIME_SECONDS,
  QUARTER_SECONDS,
  effectiveShotClock,
  initGameClock,
  isPeriodOver,
  nextPeriod,
} from '../../src/engine/clock'

describe('initGameClock', () => {
  it('starts quarter 1 with a full quarter and shot clock', () => {
    const clock = initGameClock()
    expect(clock).toEqual({
      quarter: 1,
      gameSecondsRemaining: QUARTER_SECONDS,
      shotClockSeconds: FULL_SHOT_CLOCK,
      isOvertime: false,
    })
  })
})

describe('isPeriodOver', () => {
  it('is true only once time hits zero', () => {
    expect(isPeriodOver({ quarter: 1, gameSecondsRemaining: 1, shotClockSeconds: 24, isOvertime: false })).toBe(false)
    expect(isPeriodOver({ quarter: 1, gameSecondsRemaining: 0, shotClockSeconds: 24, isOvertime: false })).toBe(true)
    expect(isPeriodOver({ quarter: 1, gameSecondsRemaining: -3, shotClockSeconds: 24, isOvertime: false })).toBe(true)
  })
})

describe('effectiveShotClock', () => {
  it('is capped by whichever of shot clock / game clock is smaller', () => {
    expect(effectiveShotClock({ quarter: 4, gameSecondsRemaining: 10, shotClockSeconds: 24, isOvertime: false })).toBe(10)
    expect(effectiveShotClock({ quarter: 1, gameSecondsRemaining: 500, shotClockSeconds: 14, isOvertime: false })).toBe(14)
  })
})

describe('nextPeriod', () => {
  it('advances quarters 1-3 into a fresh regulation quarter', () => {
    const clock = nextPeriod({ quarter: 1, gameSecondsRemaining: 0, shotClockSeconds: 3, isOvertime: false })
    expect(clock).toEqual({ quarter: 2, gameSecondsRemaining: QUARTER_SECONDS, shotClockSeconds: FULL_SHOT_CLOCK, isOvertime: false })
  })

  it('transitions quarter 4 into a 5-minute overtime period', () => {
    const clock = nextPeriod({ quarter: 4, gameSecondsRemaining: 0, shotClockSeconds: 0, isOvertime: false })
    expect(clock).toEqual({ quarter: 5, gameSecondsRemaining: OVERTIME_SECONDS, shotClockSeconds: FULL_SHOT_CLOCK, isOvertime: true })
  })

  it('chains through multiple overtime periods', () => {
    const clock = nextPeriod({ quarter: 5, gameSecondsRemaining: 0, shotClockSeconds: 0, isOvertime: true })
    expect(clock).toEqual({ quarter: 6, gameSecondsRemaining: OVERTIME_SECONDS, shotClockSeconds: FULL_SHOT_CLOCK, isOvertime: true })
  })
})
