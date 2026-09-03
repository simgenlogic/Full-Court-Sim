// Core domain types for the simulation engine. Pure data — no behavior here.

export interface PlayerRatings {
  finishing: number // 0-100, at-rim/close shot conversion
  threePoint: number // 0-100
  passing: number // 0-100, assist generation, turnover avoidance on passes
  ballHandling: number // 0-100, turnover avoidance while driving/handling
  perimeterDefense: number // 0-100
  interiorDefense: number // 0-100
  rebounding: number // 0-100
  speed: number // 0-100, transition/closeout speed
  stamina: number // 0-100, higher = slower fatigue accrual, faster recovery
}

export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C'

export interface PlayerDef {
  id: string // stable id, e.g. "ironhawks-1"
  name: string
  number: number
  position: Position
  ratings: PlayerRatings
}

export type OffenseStyle = 'balanced' | 'pick-and-roll' | 'drive-and-kick' | 'motion'
export type DefenseStyle = 'drop' | 'switch' | 'help-heavy'

export interface TeamDef {
  id: string
  name: string
  abbreviation: string
  primaryColor: string
  secondaryColor: string
  defaultOffenseStyle: OffenseStyle
  defaultDefenseStyle: DefenseStyle
  players: PlayerDef[] // starters first (5), then bench
}

export type ActionType = 'transition' | 'pick-and-roll' | 'drive-and-kick' | 'motion' | 'post-up'
export type ShotType = 'rim' | 'mid' | 'three'

// ---- Runtime per-player / per-team state (mutated across the game via applyEvent) ----

export interface PlayerRuntimeState {
  playerId: string
  teamId: string
  stamina: number // 0-100, current effective stamina
  fatigue: number // 0-100, accrues on court, recovers on bench
  fouls: number // personal fouls, 0-6 (foul out at 6)
  secondsOnCourt: number // cumulative, drives substitution decisions
  onCourt: boolean
}

export interface TeamRuntimeState {
  teamId: string
  score: number
  teamFoulsThisQuarter: number // resets each quarter; >=5 triggers bonus free throws
  offenseStyle: OffenseStyle
  defenseStyle: DefenseStyle
  onCourt: string[] // 5 player ids
  bench: string[]
  players: Record<string, PlayerRuntimeState>
}

export interface GameClock {
  quarter: number // 1-4, then 5+ for OT periods
  gameSecondsRemaining: number // seconds left in the current quarter/OT period
  shotClockSeconds: number // 24, or 14 after an offensive rebound
  isOvertime: boolean
}

export interface GameState {
  seed: number
  clock: GameClock
  home: TeamRuntimeState
  away: TeamRuntimeState
  possessionTeamId: string
  lastPossessionWasLiveTurnover: boolean // fast-break bias for the next possession's action selection
  events: GameEvent[] // append-only log; the source of truth for animation and box score alike
  isComplete: boolean
}

// ---- Event log ----

export interface CourtPoint {
  x: number // feet, 0-94 (full court length)
  y: number // feet, 0-50 (full court width)
}

interface BaseEvent {
  id: string // monotonic, e.g. "ev-0042"
  gameClock: { quarter: number; gameSecondsRemaining: number } // snapshot at event time
  possessionId: string // groups events belonging to one possession
  teamId: string // team "owning" this event (offense, in most cases)
}

export interface PossessionStartEvent extends BaseEvent {
  type: 'possession-start'
  offenseTeamId: string
  defenseTeamId: string
  lineupOffense: string[]
  lineupDefense: string[]
}

export interface ActionSelectedEvent extends BaseEvent {
  type: 'action-selected'
  action: ActionType
  primaryPlayerId: string
  secondaryPlayerId?: string
}

export interface MoveToPositionEvent extends BaseEvent {
  type: 'move-to-position'
  playerId: string
  fromXY: CourtPoint
  toXY: CourtPoint
  durationMs: number // animation-only hint, decoupled from game-clock seconds
}

export interface PassEvent extends BaseEvent {
  type: 'pass'
  fromPlayerId: string
  toPlayerId: string
  completed: boolean
}

export interface DriveEvent extends BaseEvent {
  type: 'drive'
  playerId: string
  defenderId: string | null
  fromXY: CourtPoint
  toXY: CourtPoint
  beatDefender: boolean
}

export interface ShotAttemptEvent extends BaseEvent {
  type: 'shot-attempt'
  shooterId: string
  defenderId: string | null
  shotType: ShotType
  xy: CourtPoint
  openness: number // 0-1, used in the probability calc (kept for UI/debug)
  probability: number
  made: boolean
  assistedBy?: string
  fouled: boolean
}

export interface ReboundEvent extends BaseEvent {
  type: 'rebound'
  playerId: string
  isOffensive: boolean
}

export type TurnoverCause = 'bad-pass' | 'lost-ball' | 'offensive-foul' | 'shot-clock-violation'

export interface TurnoverEvent extends BaseEvent {
  type: 'turnover'
  playerId: string
  cause: TurnoverCause
}

export type FoulType = 'shooting' | 'non-shooting' | 'offensive'

export interface FoulEvent extends BaseEvent {
  type: 'foul'
  foulerId: string
  foulTeamId: string
  drawnById?: string
  foulType: FoulType
  isBonus: boolean
}

export interface FreeThrowEvent extends BaseEvent {
  type: 'free-throw'
  shooterId: string
  attemptNumber: number
  totalAttempts: number
  made: boolean
}

export interface ScoreUpdateEvent extends BaseEvent {
  type: 'score-update'
  points: number
  newScore: { home: number; away: number }
}

export interface ShotClockViolationEvent extends BaseEvent {
  type: 'shot-clock-violation'
}

export interface SubstitutionEvent extends BaseEvent {
  type: 'substitution'
  outPlayerId: string
  inPlayerId: string
  reason: 'fatigue' | 'foul-trouble'
}

export interface QuarterEndEvent extends BaseEvent {
  type: 'quarter-end'
  quarter: number
  scoreSnapshot: { home: number; away: number }
}

export interface GameEndEvent extends BaseEvent {
  type: 'game-end'
  finalScore: { home: number; away: number }
  wentToOvertime: boolean
}

export type GameEvent =
  | PossessionStartEvent
  | ActionSelectedEvent
  | MoveToPositionEvent
  | PassEvent
  | DriveEvent
  | ShotAttemptEvent
  | ReboundEvent
  | TurnoverEvent
  | FoulEvent
  | FreeThrowEvent
  | ScoreUpdateEvent
  | ShotClockViolationEvent
  | SubstitutionEvent
  | QuarterEndEvent
  | GameEndEvent
