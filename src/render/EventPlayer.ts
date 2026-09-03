import { deriveBoxScore } from '../engine'
import type { BoxScore, CourtPoint, GameEvent, Position, TeamDef } from '../engine'
import { lerpPoint } from './courtGeometry'
import { defenseFormationSpot, offenseFormationSpot } from './formation'
import { eventToPlayByPlayText } from './playByPlayText'

export type PlaybackSpeed = 1 | 2 | 4 | 8

export interface RenderPlayerState {
  playerId: string
  teamId: string
  number: number
  xy: CourtPoint
  hasBall: boolean
}

export interface RenderState {
  players: RenderPlayerState[]
  ballXY: CourtPoint
  mirror: boolean
  score: { home: number; away: number }
  clock: { quarter: number; gameSecondsRemaining: number; shotClockSeconds: number }
  playByPlay: string[] // newest first, capped
  boxScore: BoxScore
  isComplete: boolean
  isPlaying: boolean
}

interface PlayerMeta {
  teamId: string
  name: string
  number: number
  position: Position
}

const PAUSE_MS: Partial<Record<GameEvent['type'], number>> = {
  'shot-attempt': 700,
  'score-update': 350,
  foul: 450,
  turnover: 450,
  rebound: 350,
  'free-throw': 500,
  'possession-start': 250,
  pass: 250,
  drive: 300,
  'shot-clock-violation': 450,
  substitution: 350,
  'quarter-end': 700,
  'game-end': 900,
}
const DEFAULT_PAUSE_MS = 80
const PLAY_BY_PLAY_CAP = 300
const BOX_SCORE_RELEVANT: ReadonlySet<GameEvent['type']> = new Set(['shot-attempt', 'free-throw', 'rebound', 'turnover', 'foul', 'possession-start'])

const MID_COURT: CourtPoint = { x: 47, y: 25 }

/**
 * Steps through a fully-simulated event log and turns it into animated playback: a cursor over
 * the (already-decided) events plus an interpolation clock, never a re-simulation. The engine
 * decided everything that happens; this only sequences and animates it.
 */
export class EventPlayer {
  private readonly events: GameEvent[]
  private readonly homeTeamId: string
  private readonly awayTeamId: string
  private readonly meta = new Map<string, PlayerMeta>()

  private cursor = 0
  private beatElapsedMs = 0
  private playing = false
  private speed: PlaybackSpeed = 1

  private onCourt = new Map<string, { teamId: string; number: number; xy: CourtPoint }>()
  private ballHolderId: string | null = null
  private ballXY: CourtPoint = MID_COURT
  private mirror = false
  private score = { home: 0, away: 0 }
  private clock = { quarter: 1, gameSecondsRemaining: 720, shotClockSeconds: 24 }
  private possessionStartGameSeconds = 720
  private possessionStartShotClock = 24
  private playByPlay: string[] = []
  private boxScore: BoxScore
  private isComplete = false

  private readonly listeners = new Set<(state: RenderState) => void>()

  constructor(events: GameEvent[], homeTeam: TeamDef, awayTeam: TeamDef) {
    this.events = events
    this.homeTeamId = homeTeam.id
    this.awayTeamId = awayTeam.id
    for (const team of [homeTeam, awayTeam]) {
      for (const player of team.players) {
        this.meta.set(player.id, { teamId: team.id, name: player.name, number: player.number, position: player.position })
      }
    }
    this.boxScore = deriveBoxScore([], this.homeTeamId, this.awayTeamId)
  }

  play(): void {
    if (this.cursor >= this.events.length) return
    this.playing = true
    this.emit()
  }

  pause(): void {
    this.playing = false
    this.emit()
  }

  reset(): void {
    this.cursor = 0
    this.beatElapsedMs = 0
    this.playing = false
    this.onCourt = new Map()
    this.ballHolderId = null
    this.ballXY = MID_COURT
    this.mirror = false
    this.score = { home: 0, away: 0 }
    this.clock = { quarter: 1, gameSecondsRemaining: 720, shotClockSeconds: 24 }
    this.possessionStartGameSeconds = 720
    this.possessionStartShotClock = 24
    this.playByPlay = []
    this.isComplete = false
    this.boxScore = deriveBoxScore([], this.homeTeamId, this.awayTeamId)
    this.emit()
  }

  setSpeed(speed: PlaybackSpeed): void {
    this.speed = speed
  }

  /** Advances the animation clock by `deltaMs` of real time (a no-op while paused). */
  tick(deltaMs: number): void {
    if (!this.playing) return
    let remaining = deltaMs * this.speed

    while (remaining > 0 && this.cursor < this.events.length) {
      const event = this.events[this.cursor]!
      const duration = this.beatDuration(event)
      const needed = duration - this.beatElapsedMs

      if (remaining < needed) {
        this.beatElapsedMs += remaining
        this.applyPartial(event, duration === 0 ? 1 : this.beatElapsedMs / duration)
        remaining = 0
      } else {
        remaining -= needed
        this.applyFull(event)
        this.cursor++
        this.beatElapsedMs = 0
      }
    }

    if (this.cursor >= this.events.length) this.playing = false
    this.emit()
  }

  /** Instantly resolves every remaining event up to (and stopping just before) the next
   * possession-start, or the end of the log. */
  stepToNextPossession(): void {
    if (this.cursor >= this.events.length) return
    // Always consume at least one event so calling this on a possession-start boundary advances.
    do {
      this.applyFull(this.events[this.cursor]!)
      this.cursor++
      this.beatElapsedMs = 0
    } while (this.cursor < this.events.length && this.events[this.cursor]!.type !== 'possession-start')
    this.emit()
  }

  skipToEnd(): void {
    while (this.cursor < this.events.length) {
      this.applyFull(this.events[this.cursor]!)
      this.cursor++
    }
    this.beatElapsedMs = 0
    this.playing = false
    this.emit()
  }

  /** Subscribe to render-state updates; returns an unsubscribe function. Calls back immediately
   * with the current state. */
  onFrame(callback: (state: RenderState) => void): () => void {
    this.listeners.add(callback)
    callback(this.snapshot())
    return () => this.listeners.delete(callback)
  }

  private beatDuration(event: GameEvent): number {
    return event.type === 'move-to-position' ? event.durationMs : (PAUSE_MS[event.type] ?? DEFAULT_PAUSE_MS)
  }

  private applyPartial(event: GameEvent, t: number): void {
    if (event.type !== 'move-to-position') return
    const current = this.onCourt.get(event.playerId)
    if (!current) return
    const xy = lerpPoint(event.fromXY, event.toXY, t)
    this.onCourt.set(event.playerId, { ...current, xy })
    if (this.ballHolderId === event.playerId) this.ballXY = xy
  }

  private applyFull(event: GameEvent): void {
    this.clock = { ...this.clock, quarter: event.gameClock.quarter, gameSecondsRemaining: event.gameClock.gameSecondsRemaining }
    this.clock.shotClockSeconds = Math.max(
      0,
      this.possessionStartShotClock - (this.possessionStartGameSeconds - event.gameClock.gameSecondsRemaining),
    )

    switch (event.type) {
      case 'possession-start': {
        this.mirror = event.offenseTeamId !== this.homeTeamId
        this.possessionStartGameSeconds = event.gameClock.gameSecondsRemaining
        this.possessionStartShotClock = event.shotClockSeconds
        this.clock.shotClockSeconds = event.shotClockSeconds
        this.onCourt = new Map()
        event.lineupOffense.forEach((id, i) => {
          const meta = this.meta.get(id)
          if (!meta) return
          this.onCourt.set(id, { teamId: meta.teamId, number: meta.number, xy: offenseFormationSpot(meta.position) })
          const defenderId = event.lineupDefense[i]
          const defenderMeta = defenderId ? this.meta.get(defenderId) : undefined
          if (defenderId && defenderMeta) {
            this.onCourt.set(defenderId, { teamId: defenderMeta.teamId, number: defenderMeta.number, xy: defenseFormationSpot(meta.position) })
          }
        })
        break
      }
      case 'move-to-position': {
        const current = this.onCourt.get(event.playerId)
        if (current) this.onCourt.set(event.playerId, { ...current, xy: event.toXY })
        if (this.ballHolderId === event.playerId) this.ballXY = event.toXY
        break
      }
      case 'action-selected':
        this.setBallHolder(event.primaryPlayerId)
        break
      case 'pass':
        if (event.completed) this.setBallHolder(event.toPlayerId)
        break
      case 'drive':
        this.setBallHolder(event.playerId)
        break
      case 'shot-attempt':
        this.setBallHolder(event.shooterId)
        break
      case 'free-throw':
        this.setBallHolder(event.shooterId)
        break
      case 'rebound':
        this.setBallHolder(event.playerId)
        break
      case 'turnover':
        this.ballHolderId = null
        break
      case 'score-update':
        this.score = { ...event.newScore }
        break
      case 'game-end':
        this.isComplete = true
        break
      default:
        break
    }

    const line = eventToPlayByPlayText(event, (id) => this.meta.get(id)?.name ?? id)
    if (line) {
      this.playByPlay.unshift(line)
      if (this.playByPlay.length > PLAY_BY_PLAY_CAP) this.playByPlay.length = PLAY_BY_PLAY_CAP
    }

    if (BOX_SCORE_RELEVANT.has(event.type)) {
      this.boxScore = deriveBoxScore(this.events.slice(0, this.cursor + 1), this.homeTeamId, this.awayTeamId)
    }
  }

  private setBallHolder(playerId: string): void {
    this.ballHolderId = playerId
    const holder = this.onCourt.get(playerId)
    if (holder) this.ballXY = holder.xy
  }

  private snapshot(): RenderState {
    const players: RenderPlayerState[] = [...this.onCourt.entries()].map(([playerId, p]) => ({
      playerId,
      teamId: p.teamId,
      number: p.number,
      xy: p.xy,
      hasBall: playerId === this.ballHolderId,
    }))
    return {
      players,
      ballXY: this.ballXY,
      mirror: this.mirror,
      score: { ...this.score },
      clock: { ...this.clock },
      playByPlay: this.playByPlay,
      boxScore: this.boxScore,
      isComplete: this.isComplete,
      isPlaying: this.playing,
    }
  }

  private emit(): void {
    const state = this.snapshot()
    for (const listener of this.listeners) listener(state)
  }
}
