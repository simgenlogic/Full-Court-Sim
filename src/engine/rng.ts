// Deterministic PRNG. The engine must never call Math.random() — every function
// that needs randomness takes an RNG explicitly, so a game seed reproduces an
// identical run byte-for-byte. See scripts/check-boundaries.mjs, which enforces this.

export type RNG = () => number // float in [0, 1)

/** mulberry32 — small, fast, good-enough statistical quality for a game sim (not cryptographic). */
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0
  return function rng() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Uniform float in [min, max). */
export function rngRange(rng: RNG, min: number, max: number): number {
  return min + rng() * (max - min)
}

/** Uniform integer in [min, maxInclusive]. */
export function rngInt(rng: RNG, min: number, maxInclusive: number): number {
  return Math.floor(rngRange(rng, min, maxInclusive + 1))
}

/** True with the given probability (clamped to [0, 1]). */
export function rngChance(rng: RNG, probability: number): boolean {
  return rng() < Math.min(1, Math.max(0, probability))
}

/** Pick one item, optionally weighted. Weights need not sum to 1 — they're normalized. */
export function rngPick<T>(rng: RNG, items: readonly T[], weights?: readonly number[]): T {
  if (items.length === 0) throw new Error('rngPick: items must not be empty')
  if (!weights) return items[rngInt(rng, 0, items.length - 1)] as T

  const total = weights.reduce((sum, w) => sum + w, 0)
  let roll = rng() * total
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i] ?? 0
    if (roll <= 0) return items[i] as T
  }
  return items[items.length - 1] as T
}

/** Normally distributed value via Box-Muller. */
export function rngNormal(rng: RNG, mean: number, stdDev: number): number {
  const u1 = Math.max(rng(), Number.EPSILON)
  const u2 = rng()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return mean + z * stdDev
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
