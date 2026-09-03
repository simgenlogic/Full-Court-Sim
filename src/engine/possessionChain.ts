import { shotSpot, TOP_OF_KEY } from './courtSpots'
import { passSuccessProbability, stageDuration } from './probability'
import { effectiveRating, pickThreePointThreat } from './ratings'
import type { RNG } from './rng'
import { rngChance } from './rng'
import type { ActionType, GameEvent, PlayerRuntimeState, ShotType, TeamRuntimeState } from './types'

type ChainRole = 'primary' | 'secondary' | 'kickOut' | 'reset'

interface ChainStage {
  role: ChainRole
  shotType: ShotType
  /** Chance the ball moves on past this stage instead of a shot going up here. */
  continueProbability: number
}

// Per-action "playbooks": how many beats a possession typically takes to develop, and how much
// the ball actually moves. transition/post-up stay quick (0-1 pass); pick-and-roll is a mid-length
// read; drive-and-kick and especially motion are built around extra ball movement, matching what
// those offense styles mean in real basketball.
const PLAYBOOKS: Record<ActionType, ChainStage[]> = {
  transition: [
    { role: 'primary', shotType: 'rim', continueProbability: 0.25 },
    { role: 'kickOut', shotType: 'three', continueProbability: 0 },
  ],
  'pick-and-roll': [
    { role: 'primary', shotType: 'mid', continueProbability: 0.55 },
    { role: 'secondary', shotType: 'rim', continueProbability: 0.45 },
    { role: 'kickOut', shotType: 'three', continueProbability: 0.25 },
    { role: 'reset', shotType: 'three', continueProbability: 0 },
  ],
  'drive-and-kick': [
    { role: 'primary', shotType: 'rim', continueProbability: 0.5 },
    { role: 'secondary', shotType: 'three', continueProbability: 0.35 },
    { role: 'reset', shotType: 'three', continueProbability: 0.15 },
    { role: 'kickOut', shotType: 'mid', continueProbability: 0 },
  ],
  motion: [
    { role: 'primary', shotType: 'mid', continueProbability: 0.75 },
    { role: 'secondary', shotType: 'three', continueProbability: 0.55 },
    { role: 'kickOut', shotType: 'three', continueProbability: 0.35 },
    { role: 'reset', shotType: 'three', continueProbability: 0 },
  ],
  'post-up': [
    { role: 'secondary', shotType: 'rim', continueProbability: 0.35 },
    { role: 'reset', shotType: 'three', continueProbability: 0 },
  ],
}

interface BaseFields {
  gameClock: { quarter: number; gameSecondsRemaining: number }
  possessionId: string
  teamId: string
}

export interface ChainParams {
  action: ActionType
  primaryPlayerId: string
  secondaryPlayerId: string | undefined
  offense: TeamRuntimeState
  offensePlayers: PlayerRuntimeState[]
  defenderOf: Map<string, PlayerRuntimeState>
  /** Shared mutable clock: both this chain and the caller read/write the same object, so events
   * emitted from here carry an accurate, already-decreasing game-clock snapshot. */
  timeBox: { value: number }
  /** Seconds of shot clock left for this chain to spend (the caller has already deducted setup time). */
  budgetSeconds: number
  base: () => BaseFields
  nextId: () => string
  rng: RNG
}

export type ChainResult =
  | { outcome: 'shot'; shooterId: string; shotType: ShotType; passedFrom: string | undefined }
  | { outcome: 'turnover' }
  | { outcome: 'shot-clock-violation' }

/**
 * Walks a per-action playbook, moving the ball stage to stage (with a real chance of a failed
 * pass ending the possession, and a real chance of running out of shot clock mid-read) until
 * someone decides to shoot. This is what gives a possession actual flow — 0 to 3 passes depending
 * on the action, rather than the single shooter-role roll the engine used to make.
 */
export function* resolveOffensiveChain(params: ChainParams): Generator<GameEvent, ChainResult> {
  const { action, primaryPlayerId, secondaryPlayerId, offensePlayers, defenderOf, timeBox, base, nextId, rng } = params
  const playbook = PLAYBOOKS[action]

  let currentHolderId = primaryPlayerId
  let passedFrom: string | undefined
  const touchedIds = new Set<string>([primaryPlayerId])
  let remainingBudget = params.budgetSeconds

  const resolveRole = (role: ChainRole): string => {
    if (role === 'primary') return primaryPlayerId
    if (role === 'secondary' && secondaryPlayerId) return secondaryPlayerId
    return pickThreePointThreat(offensePlayers, [...touchedIds], rng).playerId
  }

  // Below this, there's no time left to even get a rushed shot up — a genuine violation.
  const MIN_TIME_FOR_A_SHOT = 1.5

  for (const stage of playbook) {
    if (remainingBudget <= MIN_TIME_FOR_A_SHOT) {
      timeBox.value = Math.max(0, timeBox.value - remainingBudget)
      yield { ...base(), id: nextId(), type: 'shot-clock-violation' }
      return { outcome: 'shot-clock-violation' }
    }

    const holderForStage = resolveRole(stage.role)

    // This stage's development time — a hold, a screen, a swing pass — whether or not the ball
    // actually moves. Real players don't just freeze when the clock gets tight: if this stage's
    // natural pace would blow the budget, it's clamped and forces a rushed shot right here instead
    // of an automatic violation (which real basketball rarely produces — most possessions still
    // get a shot up, just a worse one).
    const cost = Math.min(stageDuration(rng), remainingBudget)
    const rushed = cost >= remainingBudget - 0.01
    remainingBudget -= cost
    timeBox.value = Math.max(0, timeBox.value - cost)

    if (holderForStage !== currentHolderId) {
      const passer = params.offense.players[currentHolderId]!
      const receiverDefender = defenderOf.get(holderForStage)!
      const passProb = passSuccessProbability(
        effectiveRating(passer.ratings.passing, passer.fatigue),
        effectiveRating(receiverDefender.ratings.perimeterDefense, receiverDefender.fatigue),
      )
      const completed = rngChance(rng, passProb)
      yield { ...base(), id: nextId(), type: 'pass', fromPlayerId: currentHolderId, toPlayerId: holderForStage, completed }
      if (!completed) {
        yield { ...base(), id: nextId(), type: 'turnover', playerId: currentHolderId, cause: 'bad-pass' }
        return { outcome: 'turnover' }
      }
      yield {
        ...base(),
        id: nextId(),
        type: 'move-to-position',
        playerId: holderForStage,
        fromXY: TOP_OF_KEY,
        toXY: shotSpot(stage.shotType, rng),
        durationMs: 900,
      }
      passedFrom = currentHolderId
      currentHolderId = holderForStage
      touchedIds.add(holderForStage)
    }

    if (rushed || !rngChance(rng, stage.continueProbability)) {
      return { outcome: 'shot', shooterId: currentHolderId, shotType: stage.shotType, passedFrom }
    }
  }

  // Defensive fallback — every playbook's last stage has continueProbability 0, so this shouldn't
  // be reachable, but force a shot rather than leaving the possession hanging if it ever is.
  const lastStage = playbook[playbook.length - 1]!
  return { outcome: 'shot', shooterId: currentHolderId, shotType: lastStage.shotType, passedFrom }
}
