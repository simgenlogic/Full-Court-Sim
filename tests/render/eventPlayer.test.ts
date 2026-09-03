import { describe, expect, it } from 'vitest'
import { ironhawks, thunderbolts } from '../../src/data/teams'
import { simulateGame } from '../../src/engine'
import type { GameEvent } from '../../src/engine'
import { EventPlayer } from '../../src/render/EventPlayer'
import type { RenderState } from '../../src/render/EventPlayer'

function playToEnd(player: EventPlayer, maxTicks = 300_000): void {
  player.play()
  for (let i = 0; i < maxTicks; i++) {
    player.tick(16)
  }
}

function capture(player: EventPlayer): { current: RenderState | undefined } {
  const box: { current: RenderState | undefined } = { current: undefined }
  player.onFrame((s) => {
    box.current = s
  })
  return box
}

describe('EventPlayer', () => {
  const state = simulateGame(ironhawks, thunderbolts, 11)

  it('replays a complete game to a final state matching the source GameState', () => {
    const player = new EventPlayer(state.events, ironhawks, thunderbolts)
    const last = capture(player)
    playToEnd(player)

    expect(last.current!.isComplete).toBe(true)
    expect(last.current!.isPlaying).toBe(false)
    expect(last.current!.score.home).toBe(state.home.score)
    expect(last.current!.score.away).toBe(state.away.score)
  })

  it('skipToEnd reaches the same final score instantly, without playing', () => {
    const player = new EventPlayer(state.events, ironhawks, thunderbolts)
    const final = capture(player)
    player.skipToEnd()

    expect(final.current!.score.home).toBe(state.home.score)
    expect(final.current!.score.away).toBe(state.away.score)
    expect(final.current!.isPlaying).toBe(false)
    expect(final.current!.isComplete).toBe(true)
  })

  it('reset returns to the pre-game state', () => {
    const player = new EventPlayer(state.events, ironhawks, thunderbolts)
    player.skipToEnd()
    player.reset()
    const s = capture(player)

    expect(s.current!.score).toEqual({ home: 0, away: 0 })
    expect(s.current!.clock).toEqual({ quarter: 1, gameSecondsRemaining: 720, shotClockSeconds: 24 })
    expect(s.current!.playByPlay).toEqual([])
    expect(s.current!.isComplete).toBe(false)
    expect(s.current!.players).toEqual([])
  })

  it('always shows exactly 10 on-court players once the game has started', () => {
    const player = new EventPlayer(state.events, ironhawks, thunderbolts)
    const s = capture(player)
    player.stepToNextPossession()
    expect(s.current!.players).toHaveLength(10)
  })

  it('stepToNextPossession always advances the cursor and eventually reaches the end', () => {
    const player = new EventPlayer(state.events, ironhawks, thunderbolts)
    const s = capture(player)
    for (let i = 0; i < state.events.length + 5 && !s.current!.isComplete; i++) {
      player.stepToNextPossession()
    }
    expect(s.current!.isComplete).toBe(true)
  })

  it('higher playback speed advances further per tick than 1x', () => {
    const a = new EventPlayer(state.events, ironhawks, thunderbolts)
    const b = new EventPlayer(state.events, ironhawks, thunderbolts)
    const sa = capture(a)
    const sb = capture(b)

    a.setSpeed(1)
    a.play()
    b.setSpeed(8)
    b.play()
    for (let i = 0; i < 200; i++) {
      a.tick(16)
      b.tick(16)
    }
    const totalA = sa.current!.score.home + sa.current!.score.away
    const totalB = sb.current!.score.home + sb.current!.score.away
    expect(totalB).toBeGreaterThanOrEqual(totalA)
  })

  it('onFrame unsubscribe stops further updates', () => {
    const player = new EventPlayer(state.events, ironhawks, thunderbolts)
    let calls = 0
    const unsubscribe = player.onFrame(() => {
      calls++
    })
    expect(calls).toBe(1) // immediate callback on subscribe
    unsubscribe()
    player.skipToEnd()
    expect(calls).toBe(1)
  })

  it('interpolates a player position between fromXY and toXY mid-beat', () => {
    // A small hand-built log rather than digging one out of a real game — deterministic and
    // lets us tick to an exact, known point inside the move's beat.
    const homeStarters = ironhawks.players.slice(0, 5).map((p) => p.id)
    const awayStarters = thunderbolts.players.slice(0, 5).map((p) => p.id)
    const movingPlayerId = homeStarters[0]!
    const events: GameEvent[] = [
      {
        id: 'ev-0',
        gameClock: { quarter: 1, gameSecondsRemaining: 720 },
        possessionId: 'p1',
        teamId: ironhawks.id,
        type: 'possession-start',
        offenseTeamId: ironhawks.id,
        defenseTeamId: thunderbolts.id,
        lineupOffense: homeStarters,
        lineupDefense: awayStarters,
        shotClockSeconds: 24,
      },
      {
        id: 'ev-1',
        gameClock: { quarter: 1, gameSecondsRemaining: 715 },
        possessionId: 'p1',
        teamId: ironhawks.id,
        type: 'move-to-position',
        playerId: movingPlayerId,
        fromXY: { x: 20, y: 25 },
        toXY: { x: 80, y: 25 },
        durationMs: 1000,
      },
    ]

    const player = new EventPlayer(events, ironhawks, thunderbolts)
    const last = capture(player)
    player.play()
    player.tick(250) // consumes the possession-start's fixed pause beat, landing at 0ms into the move
    player.tick(500) // now 500 of 1000ms into the move beat — should be ~halfway

    const moving = last.current!.players.find((p) => p.playerId === movingPlayerId)
    expect(moving).toBeDefined()
    expect(moving!.xy.x).toBeGreaterThan(20)
    expect(moving!.xy.x).toBeLessThan(80)
    expect(moving!.xy.x).toBeCloseTo(50, 0)
  })
})
