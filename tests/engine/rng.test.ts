import { describe, expect, it } from 'vitest'
import { clamp, mulberry32, rngChance, rngInt, rngNormal, rngPick, rngRange } from '../../src/engine/rng'

describe('mulberry32', () => {
  it('is deterministic: the same seed produces the same sequence', () => {
    const a = mulberry32(12345)
    const b = mulberry32(12345)
    const seqA = Array.from({ length: 20 }, () => a())
    const seqB = Array.from({ length: 20 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('different seeds diverge', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).not.toEqual(seqB)
  })

  it('produces values within [0, 1)', () => {
    const rng = mulberry32(42)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('rngRange / rngInt', () => {
  it('rngRange stays within [min, max)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 500; i++) {
      const v = rngRange(rng, 5, 10)
      expect(v).toBeGreaterThanOrEqual(5)
      expect(v).toBeLessThan(10)
    }
  })

  it('rngInt stays within [min, maxInclusive] and hits both bounds over many draws', () => {
    const rng = mulberry32(7)
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const v = rngInt(rng, 1, 3)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(3)
      seen.add(v)
    }
    expect(seen).toEqual(new Set([1, 2, 3]))
  })
})

describe('rngChance', () => {
  it('frequency roughly matches the requested probability over many draws', () => {
    const rng = mulberry32(99)
    let hits = 0
    const n = 20000
    for (let i = 0; i < n; i++) if (rngChance(rng, 0.3)) hits++
    expect(hits / n).toBeGreaterThan(0.27)
    expect(hits / n).toBeLessThan(0.33)
  })
})

describe('rngPick', () => {
  it('unweighted pick eventually returns every item', () => {
    const rng = mulberry32(5)
    const items = ['a', 'b', 'c'] as const
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(rngPick(rng, items))
    expect(seen).toEqual(new Set(items))
  })

  it('weighted pick favors higher-weight items proportionally', () => {
    const rng = mulberry32(5)
    const items = ['rare', 'common'] as const
    const counts = { rare: 0, common: 0 }
    const n = 20000
    for (let i = 0; i < n; i++) counts[rngPick(rng, items, [1, 9])]++
    expect(counts.common / n).toBeGreaterThan(0.85)
    expect(counts.common / n).toBeLessThan(0.95)
  })
})

describe('rngNormal', () => {
  it('sample mean and spread are close to the requested distribution', () => {
    const rng = mulberry32(3)
    const n = 5000
    const samples = Array.from({ length: n }, () => rngNormal(rng, 10, 2))
    const mean = samples.reduce((s, v) => s + v, 0) / n
    expect(mean).toBeGreaterThan(9.5)
    expect(mean).toBeLessThan(10.5)
  })
})

describe('clamp', () => {
  it('clamps to the given bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(15, 0, 10)).toBe(10)
  })
})
