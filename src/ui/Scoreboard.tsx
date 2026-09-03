import type { TeamDef } from '../engine'

interface ScoreboardProps {
  homeTeam: TeamDef
  awayTeam: TeamDef
  score: { home: number; away: number } | null
  clock: { quarter: number; gameSecondsRemaining: number; shotClockSeconds: number } | null
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function periodLabel(quarter: number): string {
  return quarter <= 4 ? `Q${quarter}` : `OT${quarter - 4}`
}

export function Scoreboard({ homeTeam, awayTeam, score, clock }: ScoreboardProps) {
  return (
    <div className="scoreboard">
      <div className="scoreboard-team" style={{ color: homeTeam.primaryColor }}>
        <span className="scoreboard-abbr">{homeTeam.abbreviation}</span>
        <span className="scoreboard-score">{score?.home ?? 0}</span>
      </div>
      <div className="scoreboard-clock">
        <span className="scoreboard-period">{clock ? periodLabel(clock.quarter) : 'Q1'}</span>
        <span className="scoreboard-time">{formatClock(clock?.gameSecondsRemaining ?? 720)}</span>
        <span className="scoreboard-shotclock">:{Math.max(0, Math.ceil(clock?.shotClockSeconds ?? 24))}</span>
      </div>
      <div className="scoreboard-team" style={{ color: awayTeam.primaryColor }}>
        <span className="scoreboard-score">{score?.away ?? 0}</span>
        <span className="scoreboard-abbr">{awayTeam.abbreviation}</span>
      </div>
    </div>
  )
}
