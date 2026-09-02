// The gate that decides whether a post may name a piece's tier.
//
// Caller: `scripts/xbot.ts`, once, at start-up.
//
// **Why this is a gate and not a lookup.** `placeholderTier` exists so the
// gallery can be designed; the real tiers are fixed by the manifest whose hash
// `initialize` commits, and until that manifest exists a tier in a post is a
// claim a reader could check against the chain and find false — which is the
// exact dishonesty `/verify` exists to make impossible (D13).
//
// So the comparison is absolute: the 32 bytes the config carries, against the
// sha256 of the file we are about to read tiers from. Not a version number, not
// a filename convention, not "the operator passed --manifest so it must be the
// right one".

import { createHash } from 'node:crypto'

export interface TierGate {
  open: boolean
  /** Null whenever the gate is closed, so a caller cannot use it by accident. */
  lookup: ((pieceId: number) => string | null) | null
  why: string
  /** The sha256 of the file, for the log. */
  fileHash?: string
}

/** 32 zero bytes: `initialize` ran without a manifest to commit. */
const UNCOMMITTED = '0'.repeat(64)

export function tierGate(args: { manifestText?: string; chainHash: string }): TierGate {
  if (args.manifestText === undefined) {
    return { open: false, lookup: null, why: 'no manifest was given' }
  }
  if (args.chainHash === '' || args.chainHash === UNCOMMITTED) {
    // An empty or zeroed hash compared against a file hash would never match
    // anyway — but saying WHY is the difference between "there is no manifest
    // on chain" and "ours is the wrong one", and an operator needs to know
    // which.
    return { open: false, lookup: null, why: 'the chain has committed no manifest' }
  }

  const fileHash = createHash('sha256').update(args.manifestText).digest('hex')
  if (fileHash !== args.chainHash) {
    return {
      open: false, lookup: null, fileHash,
      why: `the manifest hashes to ${fileHash} and the chain committed ${args.chainHash}`,
    }
  }

  let pieces: { id: number; tier: string }[]
  try {
    pieces = (JSON.parse(args.manifestText) as { pieces?: { id: number; tier: string }[] }).pieces ?? []
  } catch {
    // The hash matched and the bytes are not JSON. That is not a mismatch to
    // report, it is a manifest committed on chain that nothing can read.
    return { open: false, lookup: null, fileHash, why: 'the manifest matches the chain and is not JSON' }
  }
  if (pieces.length === 0) {
    return { open: false, lookup: null, fileHash, why: 'the manifest carries no pieces' }
  }

  const byId = new Map(pieces.map((p) => [p.id, p.tier]))
  return {
    open: true,
    lookup: (pieceId) => byId.get(pieceId) ?? null,
    fileHash,
    why: 'the manifest is the one the chain committed',
  }
}
