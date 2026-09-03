import type { PlayerRuntimeState, TeamRuntimeState } from './types'

export interface SubstitutionDecision {
  outPlayerId: string
  inPlayerId: string
  reason: 'fatigue' | 'foul-trouble'
}

const FATIGUE_SUB_THRESHOLD = 75
const FATIGUE_REST_THRESHOLD = 40
const FOUL_TROUBLE_THRESHOLD = 5
const FOUL_OUT_THRESHOLD = 6

/**
 * Decides which on-court/bench swaps should happen right now. Pure and stateless — rate-limiting
 * how often this is actually acted on (so lineups don't churn every possession) is the driver's
 * job, since that requires tracking state across possessions that this function doesn't see.
 */
export function checkSubstitutions(team: TeamRuntimeState, quarter: number): SubstitutionDecision[] {
  const decisions: SubstitutionDecision[] = []
  const usedBench = new Set<string>()
  const usedOnCourt = new Set<string>()

  // Foul trouble (and foul-outs, which are mandatory) take priority. In the 4th quarter+ we let
  // merely foul-troubled (not fouled-out) players stay in — that's when they matter most.
  for (const outId of team.onCourt) {
    const player = team.players[outId]!
    const fouledOut = player.fouls >= FOUL_OUT_THRESHOLD
    const inFoulTrouble = player.fouls >= FOUL_TROUBLE_THRESHOLD && quarter < 4
    if (!fouledOut && !inFoulTrouble) continue

    // Mandatory — this player has to leave, so fall back to whoever's freshest even if nobody's
    // fully rested.
    const bench = pickBenchPlayer(team, usedBench, outId, { requireRested: false })
    if (!bench) continue
    decisions.push({ outPlayerId: outId, inPlayerId: bench.playerId, reason: 'foul-trouble' })
    usedBench.add(bench.playerId)
    usedOnCourt.add(outId)
  }

  // Fatigue-based rest: at most one per check, and only if a bench player is genuinely rested —
  // no point swapping one gassed player for another.
  const tiredestFirst = team.onCourt
    .filter((id) => !usedOnCourt.has(id) && team.players[id]!.fatigue > FATIGUE_SUB_THRESHOLD)
    .sort((a, b) => team.players[b]!.fatigue - team.players[a]!.fatigue)

  if (tiredestFirst.length > 0) {
    const outId = tiredestFirst[0]!
    const bench = pickBenchPlayer(team, usedBench, outId, { requireRested: true })
    if (bench) decisions.push({ outPlayerId: outId, inPlayerId: bench.playerId, reason: 'fatigue' })
  }

  return decisions
}

function pickBenchPlayer(
  team: TeamRuntimeState,
  used: Set<string>,
  outId: string,
  options: { requireRested: boolean },
): PlayerRuntimeState | undefined {
  const outPosition = team.players[outId]!.position
  const candidates = team.bench.filter((id) => !used.has(id)).map((id) => team.players[id]!)
  if (candidates.length === 0) return undefined

  const restedEnough = candidates.filter((p) => p.fatigue < FATIGUE_REST_THRESHOLD)
  if (options.requireRested && restedEnough.length === 0) return undefined

  const pool = options.requireRested ? restedEnough : (restedEnough.length > 0 ? restedEnough : candidates)
  const samePosition = pool.filter((p) => p.position === outPosition)
  const finalPool = samePosition.length > 0 ? samePosition : pool

  return finalPool.reduce((best, p) => (p.fatigue < best.fatigue ? p : best))
}
