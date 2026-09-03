import type { GameClock } from './types'

export const QUARTER_SECONDS = 12 * 60
export const OVERTIME_SECONDS = 5 * 60
export const FULL_SHOT_CLOCK = 24
export const OFFENSIVE_REBOUND_SHOT_CLOCK = 14
export const REGULATION_QUARTERS = 4

export function initGameClock(): GameClock {
  return {
    quarter: 1,
    gameSecondsRemaining: QUARTER_SECONDS,
    shotClockSeconds: FULL_SHOT_CLOCK,
    isOvertime: false,
  }
}

export function isPeriodOver(clock: GameClock): boolean {
  return clock.gameSecondsRemaining <= 0
}

/** The effective shot-clock ceiling can't exceed however much game time is left in the period. */
export function effectiveShotClock(clock: GameClock): number {
  return Math.min(clock.shotClockSeconds, clock.gameSecondsRemaining)
}

/** Advances to the next period: quarter 2-4 restart the game clock; quarter 5+ are 5-minute OT periods. */
export function nextPeriod(clock: GameClock): GameClock {
  const quarter = clock.quarter + 1
  const isOvertime = quarter > REGULATION_QUARTERS
  return {
    quarter,
    gameSecondsRemaining: isOvertime ? OVERTIME_SECONDS : QUARTER_SECONDS,
    shotClockSeconds: FULL_SHOT_CLOCK,
    isOvertime,
  }
}
