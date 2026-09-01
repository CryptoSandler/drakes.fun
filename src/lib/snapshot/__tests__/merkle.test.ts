import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  hashLeaf,
  hashNode,
  merkleProof,
  merkleRoot,
  snapshotCommitment,
  toHex,
  u64le,
  verifyProof,
  type Leaf,
} from '../merkle.ts'

const owner = (n: number) => Uint8Array.from({ length: 32 }, (_, i) => (n * 13 + i) % 256)
const leaf = (n: number, balance: bigint, start: bigint): Leaf => ({
  owner: owner(n),
  balance,
  rangeStart: start,
  rangeEnd: start + balance,
})

describe('merkle', () => {
  // The control: hash one leaf by hand, with the prefix written out, so the
  // implementation is checked against the spec and not against itself.
  it('hashes a leaf as sha256(0x00 || owner || balance || start || end)', () => {
    const l = leaf(1, 5n, 0n)
    const expected = createHash('sha256')
      .update(Uint8Array.of(0x00))
      .update(l.owner)
      .update(u64le(5n))
      .update(u64le(0n))
      .update(u64le(5n))
      .digest('hex')
    expect(toHex(hashLeaf(l))).toBe(expected)
  })

  // Domain separation is the whole reason for the prefixes: a node must not be
  // presentable as a leaf. Falsify by deleting the prefix bytes and watching
  // these two collide.
  it('cannot present a node as a leaf', () => {
    const a = hashLeaf(leaf(1, 1n, 0n))
    const b = hashLeaf(leaf(2, 1n, 1n))
    const node = hashNode(a, b)
    const asLeafOfSameBytes = createHash('sha256')
      .update(Uint8Array.of(0x00))
      .update(a)
      .update(b)
      .digest('hex')
    expect(toHex(node)).not.toBe(asLeafOfSameBytes)
  })

  it('verifies a proof for every leaf, at every tree size that changes shape', () => {
    for (const size of [1, 2, 3, 4, 5, 7, 8, 9, 1_000]) {
      let cursor = 0n
      const leaves = Array.from({ length: size }, (_, i) => {
        const l = leaf(i, BigInt(i + 1), cursor)
        cursor = l.rangeEnd
        return l
      })
      const hashes = leaves.map(hashLeaf)
      const root = merkleRoot(hashes)
      for (let i = 0; i < size; i += 1) {
        expect(verifyProof(leaves[i]!, merkleProof(hashes, i), root)).toBe(true)
      }
    }
  })

  it('rejects a proof for a leaf whose balance was altered', () => {
    const leaves = [leaf(1, 10n, 0n), leaf(2, 20n, 10n), leaf(3, 30n, 30n)]
    const hashes = leaves.map(hashLeaf)
    const root = merkleRoot(hashes)
    const tampered = { ...leaves[1]!, balance: 21n }
    expect(verifyProof(tampered, merkleProof(hashes, 1), root)).toBe(false)
  })

  it('rejects a proof taken from a different tree', () => {
    const a = [leaf(1, 10n, 0n), leaf(2, 20n, 10n)]
    const b = [leaf(3, 10n, 0n), leaf(4, 20n, 10n)]
    const rootA = merkleRoot(a.map(hashLeaf))
    expect(verifyProof(b[0]!, merkleProof(b.map(hashLeaf), 0), rootA)).toBe(false)
  })

  it('binds the commitment to the supply, the slot and the index', () => {
    const root = merkleRoot([hashLeaf(leaf(1, 1n, 0n))])
    const base = { root, eligibleSupply: 1n, slot: 10n, index: 3n }
    const c = toHex(snapshotCommitment(base))
    expect(toHex(snapshotCommitment({ ...base, slot: 11n }))).not.toBe(c)
    expect(toHex(snapshotCommitment({ ...base, index: 4n }))).not.toBe(c)
    expect(toHex(snapshotCommitment({ ...base, eligibleSupply: 2n }))).not.toBe(c)
  })

  it('has no root for an empty snapshot', () => {
    expect(() => merkleRoot([])).toThrow(/empty snapshot/)
  })
})
