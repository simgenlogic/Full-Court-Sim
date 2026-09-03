import { describe, expect, it } from 'vitest'
import { ALL_TEAMS } from '../../src/data/teams'

const RATING_KEYS = [
  'finishing',
  'threePoint',
  'passing',
  'ballHandling',
  'perimeterDefense',
  'interiorDefense',
  'rebounding',
  'speed',
  'stamina',
] as const

describe('hard-coded team data', () => {
  it('has exactly two distinct teams', () => {
    expect(ALL_TEAMS).toHaveLength(2)
    expect(new Set(ALL_TEAMS.map((t) => t.id)).size).toBe(2)
  })

  for (const team of ALL_TEAMS) {
    describe(team.name, () => {
      it('has at least 5 players (a full starting lineup)', () => {
        expect(team.players.length).toBeGreaterThanOrEqual(5)
      })

      it('has unique player ids', () => {
        const ids = team.players.map((p) => p.id)
        expect(new Set(ids).size).toBe(ids.length)
      })

      it('rates every player on all nine attributes within 0-100', () => {
        for (const player of team.players) {
          for (const key of RATING_KEYS) {
            const value = player.ratings[key]
            expect(value, `${player.name}.${key}`).toBeGreaterThanOrEqual(0)
            expect(value, `${player.name}.${key}`).toBeLessThanOrEqual(100)
          }
        }
      })
    })
  }
})
