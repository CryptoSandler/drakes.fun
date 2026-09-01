// The eligibility snapshot of DESIGN.md §4: every token account at a named
// slot, minus the excluded set, sorted, given contiguous ranges, Merkle-ized.
//
// Recomputable, not trustless, and the site says exactly that. We build the
// tree, so we could lie about it — but the input is public chain state at a
// named slot, so anybody with an archival RPC rebuilds it and compares.
//
// Caller: the cranker before `request_issuance` (B4), and
// `scripts/rebuild-snapshot.ts`, which is the published check.

import { encodeBase58 } from '../solana/base58.ts'
import { HOLDER_DOMAIN, uniformIndex } from '../protocol/survivors.ts'
import {
  hashLeaf,
  merkleProof,
  merkleRoot,
  snapshotCommitment,
  type Leaf,
} from './merkle.ts'

export interface Holding {
  /** 32-byte owner address. */
  owner: Uint8Array
  balance: bigint
}

export interface Snapshot {
  slot: bigint
  index: bigint
  leaves: Leaf[]
  leafHashes: Uint8Array[]
  eligibleSupply: bigint
  root: Uint8Array
  commitment: Uint8Array
}

/**
 * Balances are summed per owner first: one holder with three token accounts is
 * one leaf, or they would appear three times in the tree and the ranges would
 * partition the same supply into a different shape than the balances imply.
 *
 * Ordering is by owner bytes, ascending. It has to be a total order that a
 * stranger reproduces without knowing our insertion order, and address bytes
 * are the only such key on the chain.
 */
export function buildSnapshot(args: {
  holdings: Holding[]
  excluded: Uint8Array[]
  slot: bigint
  index: bigint
}): Snapshot {
  const excluded = new Set(args.excluded.map(encodeBase58))
  const totals = new Map<string, { owner: Uint8Array; balance: bigint }>()
  for (const { owner, balance } of args.holdings) {
    if (owner.length !== 32) throw new RangeError('owner must be 32 bytes')
    if (balance < 0n) throw new RangeError('balance cannot be negative')
    const key = encodeBase58(owner)
    if (excluded.has(key)) continue
    const seen = totals.get(key)
    totals.set(key, { owner, balance: (seen?.balance ?? 0n) + balance })
  }

  const leaves: Leaf[] = []
  let cursor = 0n
  // Ordered by the 32 address bytes, ascending -- NOT by the base58 string.
  // Base58 is a variable-length re-encoding, so its lexicographic order and the
  // byte order disagree, and a stranger rebuilding the tree the obvious way
  // would get a different tree and a mismatching root.
  const ordered = [...totals.values()].sort((a, b) => compareBytes(a.owner, b.owner))
  for (const { owner, balance } of ordered) {
    // A zero balance is not eligible and must not take a range, or the tree
    // holds leaves that can never contain the resolved point.
    if (balance === 0n) continue
    leaves.push({ owner, balance, rangeStart: cursor, rangeEnd: cursor + balance })
    cursor += balance
  }
  if (leaves.length === 0) throw new EmptySnapshotError(args.slot)

  const leafHashes = leaves.map(hashLeaf)
  const root = merkleRoot(leafHashes)
  return {
    slot: args.slot,
    index: args.index,
    leaves,
    leafHashes,
    eligibleSupply: cursor,
    root,
    commitment: snapshotCommitment({
      root,
      eligibleSupply: cursor,
      slot: args.slot,
      index: args.index,
    }),
  }
}

/**
 * Zero eligible supply is not an error state to paper over: DESIGN.md §2 says
 * no piece is issued and the index does not advance. The cranker catches this
 * and does not send a request at all.
 */
export class EmptySnapshotError extends Error {
  readonly slot: bigint
  // Written out rather than a parameter property: everything on the snapshot
  // path has to run under `node` with no build step, and strip-only type
  // removal does not support parameter properties, enums or namespaces. The
  // published verify command is the reason that constraint is worth keeping.
  constructor(slot: bigint) {
    super(`no eligible supply at slot ${slot}`)
    this.name = 'EmptySnapshotError'
    this.slot = slot
  }
}

export interface Resolution {
  point: bigint
  leafIndex: number
  leaf: Leaf
  proof: Uint8Array[]
}

/**
 * The holder half of the revealed value, domain-separated from the piece half
 * so one number is not answering two questions, and rejection-sampled so the
 * distribution is uniform rather than uniform-to-244-bits (`survivors.ts`).
 */
export function resolveRecipient(snapshot: Snapshot, randomness: Uint8Array): Resolution {
  if (randomness.length !== 32) throw new RangeError('randomness must be 32 bytes')
  const point = uniformIndex(randomness, snapshot.eligibleSupply, HOLDER_DOMAIN)
  const leafIndex = snapshot.leaves.findIndex((l) => point >= l.rangeStart && point < l.rangeEnd)
  // ponytail: linear scan. The tree is a few thousand leaves and this runs once
  // an hour; make it a binary search over rangeStart if it ever outgrows that.
  if (leafIndex < 0) throw new Error('resolved point fell outside every range')
  return {
    point,
    leafIndex,
    leaf: snapshot.leaves[leafIndex]!,
    proof: merkleProof(snapshot.leafHashes, leafIndex),
  }
}

/**
 * The property the program cannot check from a single proof: that the ranges
 * partition `[0, eligibleSupply)` with no gap and no overlap. A published root
 * with overlapping ranges would let two holders each prove the same point, so
 * this is what the rebuild script asserts and what makes the root worth
 * checking at all.
 */
export function assertContiguous(snapshot: Snapshot): void {
  let expected = 0n
  for (const leaf of snapshot.leaves) {
    if (leaf.rangeStart !== expected) {
      throw new Error(`range gap or overlap at ${encodeBase58(leaf.owner)}`)
    }
    if (leaf.rangeEnd - leaf.rangeStart !== leaf.balance) {
      throw new Error(`range width does not equal balance at ${encodeBase58(leaf.owner)}`)
    }
    expected = leaf.rangeEnd
  }
  if (expected !== snapshot.eligibleSupply) {
    throw new Error('ranges do not cover the eligible supply')
  }
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i]! - b[i]!
    if (d !== 0) return d
  }
  return 0
}
