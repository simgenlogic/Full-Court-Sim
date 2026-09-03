import type { GameEvent } from '../engine'

export type PlayerNameLookup = (playerId: string) => string

/** Converts one event into a human-readable play-by-play line, or null for events that aren't
 * worth their own line (action-selected, move-to-position, completed passes, score-update —
 * scoring is already implied by the shot-attempt/free-throw line right before it). */
export function eventToPlayByPlayText(event: GameEvent, nameOf: PlayerNameLookup): string | null {
  switch (event.type) {
    case 'pass':
      return event.completed ? null : `${nameOf(event.fromPlayerId)} throws it away`
    case 'drive':
      return event.beatDefender ? `${nameOf(event.playerId)} drives past the defender` : null
    case 'shot-attempt': {
      const shooter = nameOf(event.shooterId)
      const kind = event.shotType === 'three' ? 'three-pointer' : event.shotType === 'rim' ? 'shot at the rim' : 'mid-range jumper'
      if (event.made) {
        const assist = event.assistedBy ? ` (assist: ${nameOf(event.assistedBy)})` : ''
        return `${shooter} makes the ${kind}${assist}${event.fouled ? ' — and a foul!' : ''}`
      }
      return `${shooter} misses the ${kind}${event.fouled ? ' — fouled' : ''}`
    }
    case 'free-throw':
      return `${nameOf(event.shooterId)} ${event.made ? 'makes' : 'misses'} free throw ${event.attemptNumber}/${event.totalAttempts}`
    case 'rebound':
      return `${nameOf(event.playerId)} grabs the ${event.isOffensive ? 'offensive' : 'defensive'} rebound`
    case 'turnover': {
      const cause = event.cause === 'bad-pass' ? 'bad pass' : event.cause === 'offensive-foul' ? 'offensive foul' : 'turnover'
      return `${nameOf(event.playerId)} — ${cause}`
    }
    case 'foul':
      return `Foul on ${nameOf(event.foulerId)}${event.isBonus ? ' (bonus)' : ''}`
    case 'shot-clock-violation':
      return 'Shot clock violation'
    case 'substitution':
      return `Substitution: ${nameOf(event.inPlayerId)} in for ${nameOf(event.outPlayerId)}`
    case 'quarter-end':
      return `End of Q${event.quarter} — ${event.scoreSnapshot.home}-${event.scoreSnapshot.away}`
    case 'game-end':
      return `FINAL: ${event.finalScore.home}-${event.finalScore.away}`
    default:
      return null
  }
}
