import { describe, expect, it } from 'vitest'
import { encodeBase58 } from '../../solana/base58.ts'
import {
  EmptySnapshotError,
  assertContiguous,
  buildSnapshot,
  resolveRecipient,
  type Holding,
} from '../build.ts'
import { toHex, verifyProof } from '../merkle.ts'
import { HOLDER_DOMAIN, PIECE_DOMAIN, uniformIndex } from '../../protocol/survivors.ts'

const addr = (n: number) => Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? n : 0))
const holding = (n: number, balance: bigint): Holding => ({ owner: addr(n), balance })
const build = (holdings: Holding[], excluded: Uint8Array[] = []) =>
  buildSnapshot({ holdings, excluded, slot: 100n, index: 7n })

const randomness = (n: bigint): Uint8Array => {
  const b = new Uint8Array(32)
  const hex = n.toString(16).padStart(64, '0')
  for (let i = 0; i < 32; i += 1) b[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return b
}

describe('the snapshot', () => {
  it('gives every holder a contiguous range that sums to the eligible supply', () => {
    const s = build([holding(3, 30n), holding(1, 10n), holding(2, 20n)])
    expect(s.eligibleSupply).toBe(60n)
    expect(s.leaves.map((l) => [l.rangeStart, l.rangeEnd])).toEqual([
      [0n, 10n],
      [10n, 30n],
      [30n, 60n],
    ])
    expect(() => assertContiguous(s)).not.toThrow()
  })

  it('sums a holder who holds several token accounts into one leaf', () => {
    const s = build([holding(1, 10n), holding(2, 5n), holding(1, 15n)])
    expect(s.leaves).toHaveLength(2)
    expect(s.leaves.find((l) => l.owner[31] === 1)?.balance).toBe(25n)
    expect(s.eligibleSupply).toBe(30n)
  })

  it('drops the excluded set from the tree and from the denominator', () => {
    const s = build([holding(1, 10n), holding(2, 90n)], [addr(2)])
    expect(s.leaves).toHaveLength(1)
    // The point: pool liquidity must not merely be unable to receive a piece,
    // it must not dilute anybody's share either (DESIGN.md, `initialize`).
    expect(s.eligibleSupply).toBe(10n)
  })

  it('drops zero balances, which would otherwise hold an empty range', () => {
    const s = build([holding(1, 10n), holding(2, 0n)])
    expect(s.leaves).toHaveLength(1)
  })

  it('orders by address bytes, not by the base58 string', () => {
    // 0x00.. encodes with a leading '1' and sorts first by bytes; a base58
    // string sort would put it elsewhere. This is the reproducibility bug a
    // stranger rebuilding the tree would hit.
    const low = new Uint8Array(32)
    const high = Uint8Array.from({ length: 32 }, () => 0xff)
    const s = build([{ owner: high, balance: 1n }, { owner: low, balance: 1n }])
    expect(s.leaves.map((l) => encodeBase58(l.owner))[0]).toBe(encodeBase58(low))
  })

  it('is deterministic regardless of the order the holdings arrive in', () => {
    const holdings = [holding(5, 7n), holding(1, 3n), holding(9, 11n), holding(1, 2n)]
    const a = build(holdings)
    const b = build([...holdings].reverse())
    expect(toHex(a.commitment)).toBe(toHex(b.commitment))
  })

  it('refuses to produce a snapshot with no eligible supply', () => {
    expect(() => build([holding(1, 0n)])).toThrow(EmptySnapshotError)
    expect(() => build([holding(1, 10n)], [addr(1)])).toThrow(EmptySnapshotError)
  })
})

describe('resolving the recipient', () => {
  const s = build([holding(1, 10n), holding(2, 20n), holding(3, 70n)])

  it('always lands in the range that contains the point, with a valid proof', () => {
    for (let i = 0n; i < 200n; i += 1n) {
      const r = resolveRecipient(s, randomness(i * 7919n))
      expect(r.point).toBeGreaterThanOrEqual(r.leaf.rangeStart)
      expect(r.point).toBeLessThan(r.leaf.rangeEnd)
      expect(verifyProof(r.leaf, r.proof, s.root)).toBe(true)
    }
  })

  // The holder half must not be the raw value: that is what "domain-separated"
  // means, and it is what stops one number answering two questions.
  it('is not the raw value modulo the supply', () => {
    const v = randomness(12345n)
    const raw = 12345n % s.eligibleSupply
    expect(resolveRecipient(s, v).point).not.toBe(raw)
  })

  it('disagrees with the piece derivation on the same value', () => {
    const v = randomness(999n)
    const holder = uniformIndex(v, 100n, HOLDER_DOMAIN)
    const piece = uniformIndex(v, 100n, PIECE_DOMAIN)
    expect(holder).not.toBe(piece)
  })

  it('is proportional over the whole space, which is the eligibility claim', () => {
    const counts = new Map<number, number>()
    for (let i = 0n; i < 2_000n; i += 1n) {
      const r = resolveRecipient(s, randomness(i * 7919n))
      counts.set(r.leaf.owner[31]!, (counts.get(r.leaf.owner[31]!) ?? 0) + 1)
    }
    expect(counts.get(3)!).toBeGreaterThan(counts.get(2)!)
    expect(counts.get(2)!).toBeGreaterThan(counts.get(1)!)
  })

  it('refuses randomness that is not 32 bytes', () => {
    expect(() => resolveRecipient(s, new Uint8Array(31))).toThrow(/32 bytes/)
  })
})

describe('the contiguity check the program cannot make', () => {
  it('catches an overlap that would let two holders prove the same point', () => {
    const s = build([holding(1, 10n), holding(2, 20n)])
    s.leaves[1] = { ...s.leaves[1]!, rangeStart: 5n }
    expect(() => assertContiguous(s)).toThrow(/gap or overlap/)
  })

  it('catches a range whose width does not equal the balance', () => {
    const s = build([holding(1, 10n)])
    s.leaves[0] = { ...s.leaves[0]!, rangeEnd: 11n }
    expect(() => assertContiguous(s)).toThrow(/width/)
  })
})
