// Domain-separated Merkle over the eligibility snapshot (DESIGN.md §4).
//
// Without distinct prefixes a node can be presented as a leaf, which is the
// classic second-preimage on a Merkle tree and it is cheap to prevent.
//
// Caller: `buildSnapshot` below it, `scripts/rebuild-snapshot.ts`, and the
// program, which verifies the same hashing in `settle_issuance` (B4).

import { createHash } from 'node:crypto'

const LEAF = 0x00
const NODE = 0x01
const COMMITMENT = 0x02

const sha256 = (...parts: Uint8Array[]): Uint8Array => {
  const h = createHash('sha256')
  for (const p of parts) h.update(p)
  return new Uint8Array(h.digest())
}

const byte = (n: number): Uint8Array => Uint8Array.of(n)

export const u64le = (value: bigint): Uint8Array => {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) throw new RangeError('not a u64')
  const b = new Uint8Array(8)
  new DataView(b.buffer).setBigUint64(0, value, true)
  return b
}

export interface Leaf {
  /** 32-byte owner address. */
  owner: Uint8Array
  balance: bigint
  rangeStart: bigint
  /** Exclusive. */
  rangeEnd: bigint
}

export function hashLeaf(leaf: Leaf): Uint8Array {
  if (leaf.owner.length !== 32) throw new RangeError('owner must be 32 bytes')
  return sha256(
    byte(LEAF),
    leaf.owner,
    u64le(leaf.balance),
    u64le(leaf.rangeStart),
    u64le(leaf.rangeEnd),
  )
}

/** Sorted-pair node hashing, so a proof carries siblings and no direction bits. */
export function hashNode(a: Uint8Array, b: Uint8Array): Uint8Array {
  const [lo, hi] = compare(a, b) <= 0 ? [a, b] : [b, a]
  return sha256(byte(NODE), lo, hi)
}

export function merkleRoot(leafHashes: Uint8Array[]): Uint8Array {
  if (leafHashes.length === 0) throw new RangeError('an empty snapshot has no root')
  let level = leafHashes
  while (level.length > 1) {
    const next: Uint8Array[] = []
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!
      const right = level[i + 1]
      // ponytail: an odd node is promoted rather than duplicated. Duplicating
      // is the well-known CVE-2012-2459 shape, where two distinct trees share
      // a root; promotion has no such collision.
      next.push(right === undefined ? left : hashNode(left, right))
    }
    level = next
  }
  return level[0]!
}

export function merkleProof(leafHashes: Uint8Array[], index: number): Uint8Array[] {
  if (index < 0 || index >= leafHashes.length) throw new RangeError('index out of range')
  const proof: Uint8Array[] = []
  let level = leafHashes
  let i = index
  while (level.length > 1) {
    const sibling = i % 2 === 0 ? level[i + 1] : level[i - 1]
    if (sibling !== undefined) proof.push(sibling)
    const next: Uint8Array[] = []
    for (let j = 0; j < level.length; j += 2) {
      const left = level[j]!
      const right = level[j + 1]
      next.push(right === undefined ? left : hashNode(left, right))
    }
    level = next
    i = Math.floor(i / 2)
  }
  return proof
}

export function verifyProof(leaf: Leaf, proof: Uint8Array[], root: Uint8Array): boolean {
  let node = hashLeaf(leaf)
  for (const sibling of proof) node = hashNode(node, sibling)
  return compare(node, root) === 0
}

/**
 * What goes on chain. Binding the slot and the index into the commitment makes
 * a root self-contained on the verify page and stops a root built for one hour
 * being presented for another.
 */
export function snapshotCommitment(args: {
  root: Uint8Array
  eligibleSupply: bigint
  slot: bigint
  index: bigint
}): Uint8Array {
  return sha256(
    byte(COMMITMENT),
    args.root,
    u64le(args.eligibleSupply),
    u64le(args.slot),
    u64le(args.index),
  )
}

function compare(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const d = a[i]! - b[i]!
    if (d !== 0) return d
  }
  return a.length - b.length
}

export const toHex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
