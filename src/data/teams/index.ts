import type { TeamDef } from '../../engine/types'
import { ironhawks } from './ironhawks'
import { thunderbolts } from './thunderbolts'

export const ALL_TEAMS: TeamDef[] = [ironhawks, thunderbolts]

export { ironhawks, thunderbolts }

export function getTeamById(id: string): TeamDef {
  const team = ALL_TEAMS.find((t) => t.id === id)
  if (!team) throw new Error(`Unknown team id: ${id}`)
  return team
}
