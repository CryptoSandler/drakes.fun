import { describe, expect, it } from 'vitest'
import {
  HOLDER_DOMAIN,
  PIECE_DOMAIN,
  SurvivorSet,
  replaySurvivors,
  uniformIndex,
} from '../survivors.ts'

const value = (n: bigint): Uint8Array => {
  const b = new Uint8Array(32)
  const hex = n.toString(16).padStart(64, '0')
  for (let i = 0; i < 32; i += 1) b[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return b
}

describe('uniformIndex', () => {
  it('stays inside the range for every modulus that changes shape', () => {
    for (const m of [1n, 2n, 3n, 4000n, 65_535n, 10_750_001_000_000n]) {
      for (let i = 0n; i < 50n; i += 1n) {
        const x = uniformIndex(value(i * 7919n), m, PIECE_DOMAIN)
        expect(x).toBeGreaterThanOrEqual(0n)
        expect(x).toBeLessThan(m)
      }
    }
  })

  it('separates the two domains', () => {
    for (let i = 0n; i < 100n; i += 1n) {
      const v = value(i * 104_729n)
      // Not a probabilistic claim: different prefixes, different preimages.
      expect(uniformIndex(v, 4_000n, PIECE_DOMAIN)).not.toBe(
        uniformIndex(v, 4_000n, HOLDER_DOMAIN),
      )
    }
  })

  it('is flat enough across a small modulus to be believable', () => {
    const counts = new Array(8).fill(0)
    for (let i = 0n; i < 4_000n; i += 1n) counts[Number(uniformIndex(value(i), 8n, PIECE_DOMAIN))] += 1
    // 4,000 draws over 8 buckets: 500 each, chi-square well inside p=0.05 (14.07).
    const chi = counts.reduce((a, o) => a + (o - 500) ** 2 / 500, 0)
    expect(chi).toBeLessThan(14.07)
  })

  it('refuses a bad value or modulus', () => {
    expect(() => uniformIndex(new Uint8Array(31), 10n, PIECE_DOMAIN)).toThrow(/32 bytes/)
    expect(() => uniformIndex(value(1n), 0n, PIECE_DOMAIN)).toThrow(/positive/)
  })
})

describe('the survivor set', () => {
  it('issues every piece exactly once and then stops', () => {
    const set = new SurvivorSet(50)
    const seen = new Set<number>()
    for (let i = 0; i < 50; i += 1) {
      const id = set.issue(value(BigInt(i) * 7919n))
      expect(id).toBeGreaterThanOrEqual(0)
      expect(id).toBeLessThan(50)
      expect(seen.has(id)).toBe(false)
      seen.add(id)
    }
    expect(seen.size).toBe(50)
    expect(set.remaining).toBe(0)
    expect(() => set.issue(value(1n))).toThrow(/no survivors/)
  })

  it('is a permutation over the full collection size', () => {
    const ids = replaySurvivors(4_000, Array.from({ length: 4_000 }, (_, i) => value(BigInt(i))))
    expect(new Set(ids).size).toBe(4_000)
    expect(Math.min(...ids)).toBe(0)
    expect(Math.max(...ids)).toBe(3_999)
  })

  // The order must not be the identity, or "random survivor" is sequential
  // issuance wearing a hat.
  it('does not issue pieces in order', () => {
    const ids = replaySurvivors(200, Array.from({ length: 200 }, (_, i) => value(BigInt(i) * 31n)))
    expect(ids.filter((id, i) => id === i).length).toBeLessThan(20)
  })

  it('replays deterministically from the same values', () => {
    const vs = Array.from({ length: 100 }, (_, i) => value(BigInt(i) * 13n))
    expect(replaySurvivors(500, vs)).toEqual(replaySurvivors(500, vs))
  })

  it('adopts the chain\'s array and carries on identically', () => {
    const values = Array.from({ length: 40 }, (_, i) => value(BigInt(i) * 7919n))
    const whole = new SurvivorSet(200)
    const first = values.slice(0, 12).map((v) => whole.issue(v))
    // Snapshot the state the way the account holds it, then adopt it.
    const adopted = SurvivorSet.fromSlots(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (whole as any).slots as Uint16Array,
      whole.remaining,
    )
    const restOfWhole = values.slice(12).map((v) => whole.issue(v))
    const restOfAdopted = values.slice(12).map((v) => adopted.issue(v))
    expect(restOfAdopted).toEqual(restOfWhole)
    expect(new Set([...first, ...restOfWhole]).size).toBe(40)
  })

  it('refuses a point outside the remaining set', () => {
    const set = new SurvivorSet(10)
    expect(() => set.take(10n)).toThrow(/outside the survivor set/)
  })
})
