// The published set, checked against the chain rather than believed.
//
// Caller: `scripts/snapshot.ts` — `pieces` for the permutation, `verify
// --published` for the reconciliation. Nothing else calls this; the B5 site
// reads the chain directly and never runs a reconciliation to render a page.
//
// The distinction this file exists to enforce: **the permutation is a function
// of the chain alone.** The published artifacts are a convenience — they let a
// reader check a single hour offline in a second, and they carry the leaf set,
// which the events do not. They are not an input to the replay. A missing
// artifact is a hole in our record, and the tool says which hole; it is not a
// disagreement, and reporting it as one is how the 2026-09-01 rehearsal spent
// an afternoon looking for a bug in the arithmetic.

import { SurvivorSet } from '../protocol/survivors.ts'
import { buildSnapshot, resolveRecipient } from './build.ts'
import { merkleRoot, snapshotCommitment, toHex, verifyProof } from './merkle.ts'
import { decodeBase58, encodeBase58 } from '../solana/base58.ts'
import type { SettledEvent } from '../chain/events.ts'

/** One published `snap-N.json`, in the shape the cranker writes it. */
export interface PublishedArtifact {
  index: string
  piece?: number
  randomness?: string
  cluster?: string
  mint?: string
  slot?: string
  eligibleSupply?: string
  root?: string
  commitment?: string
  leaves?: { owner: string; balance: string; rangeStart: string; rangeEnd: string }[]
}

export interface ReplayRow {
  hour: bigint
  /** What the survivor replay says, reading no account and no artifact. */
  replayed: number
  /** What the program emitted. */
  emitted: number
  minted: boolean
}

export interface Replay {
  rows: ReplayRow[]
  remaining: number
  size: number
  /** Rows where the replay and the program disagree. Non-empty is a real bug. */
  disagreements: ReplayRow[]
}

/**
 * Rebuilds the permutation from the events, in hour order.
 *
 * **`minted` gates the take.** `settle_issuance` only calls `survivors.take`
 * when `issued_count < collection_size`; an hour that fires past the end of the
 * collection emits an event with `piece_id = u16::MAX` and consumes no
 * survivor. A replay that takes on every event runs one ahead of the chain from
 * the first such hour onward and never recovers — the same failure shape as a
 * missing artifact, from the opposite cause.
 */
export function replayFromChain(events: SettledEvent[], size: number): Replay {
  const set = new SurvivorSet(size)
  const seen = new Map<number, bigint>()
  const rows: ReplayRow[] = []
  for (const event of events) {
    if (!event.minted) {
      rows.push({ hour: event.hour, replayed: NOT_MINTED, emitted: event.pieceId, minted: false })
      continue
    }
    const replayed = set.issue(event.randomnessValue)
    const twice = seen.get(replayed)
    if (twice !== undefined) {
      // Unreachable from chain data: `take` removes the piece it returns, so
      // two takes on one set cannot collide. This is an assertion about
      // `SurvivorSet` itself, and it is here because "a piece was issued twice"
      // is the one failure in this file that must never be reported as a
      // rounding difference.
      throw new Error(`piece ${replayed} issued twice: hours ${twice} and ${event.hour}`)
    }
    seen.set(replayed, event.hour)
    rows.push({ hour: event.hour, replayed, emitted: event.pieceId, minted: true })
  }
  return {
    rows,
    remaining: set.remaining,
    size,
    disagreements: rows.filter((r) => r.minted && r.replayed !== r.emitted),
  }
}

/** The program's `piece_id` for an hour that minted nothing. */
export const NOT_MINTED = 0xffff

export type Verdict = 'ok' | 'missing' | 'partial' | 'disagrees'

export interface ReconcileRow {
  hour: bigint
  verdict: Verdict
  /** What was compared, or what failed. One line, meant to be printed. */
  note: string
}

/**
 * Every settlement on chain, against the artifact we published for it.
 *
 * A settlement with no artifact is `missing` and is named. An artifact that is
 * only the recovery stub — index, piece and randomness, written back from the
 * event after the original was lost — is `partial`: what it carries is checked
 * and the absent leaf set is stated rather than passed off as verified.
 */
export function reconcile(
  events: SettledEvent[],
  published: Map<string, PublishedArtifact>,
): ReconcileRow[] {
  return events.map((event) => {
    const artifact = published.get(event.hour.toString())
    if (artifact === undefined) {
      return { hour: event.hour, verdict: 'missing' as const, note: 'no artifact published' }
    }
    try {
      const checked = compare(event, artifact)
      return {
        hour: event.hour,
        verdict: checked.full ? ('ok' as const) : ('partial' as const),
        note: checked.note,
      }
    } catch (error) {
      return { hour: event.hour, verdict: 'disagrees' as const, note: (error as Error).message }
    }
  })
}

function compare(event: SettledEvent, artifact: PublishedArtifact): { full: boolean; note: string } {
  const must = (label: string, computed: string, published: string | undefined): boolean => {
    if (published === undefined) return false
    if (computed !== published) {
      throw new Error(`${label}: chain says ${computed}, artifact says ${published}`)
    }
    return true
  }

  if (artifact.index !== event.hour.toString()) {
    throw new Error(`index: chain says ${event.hour}, artifact says ${artifact.index}`)
  }
  const parts: string[] = []
  if (artifact.piece !== undefined) {
    if (artifact.piece !== event.pieceId) {
      throw new Error(`piece: chain says ${event.pieceId}, artifact says ${artifact.piece}`)
    }
    parts.push('piece')
  }
  if (must('randomness', toHex(event.randomnessValue), artifact.randomness)) parts.push('randomness')

  if (artifact.leaves === undefined) {
    return { full: false, note: `${parts.join(', ')} — no leaf set, so the root was not checked` }
  }

  // The leaf set is the half of the claim the events cannot carry, so this is
  // the check worth having: rebuild the tree from the published balances and
  // resolve the program's own revealed value against it. If it lands on the
  // recipient the program minted to, at the point the program recorded, the
  // published leaf set IS the one the settlement ran against.
  const rebuilt = buildSnapshot({
    holdings: artifact.leaves.map((l) => ({ owner: decodeBase58(l.owner), balance: BigInt(l.balance) })),
    excluded: [],
    slot: BigInt(artifact.slot ?? event.snapshotSlot.toString()),
    index: event.hour,
  })
  must('root', toHex(merkleRoot(rebuilt.leafHashes)), artifact.root)
  must('root vs chain', toHex(event.root), toHex(rebuilt.root))
  must('eligible supply', rebuilt.eligibleSupply.toString(), event.eligibleSupply.toString())
  if (artifact.commitment !== undefined) {
    must(
      'commitment',
      toHex(snapshotCommitment({
        root: rebuilt.root,
        eligibleSupply: rebuilt.eligibleSupply,
        slot: rebuilt.slot,
        index: rebuilt.index,
      })),
      artifact.commitment,
    )
  }
  parts.push('root', 'commitment', 'eligible supply')

  const resolved = resolveRecipient(rebuilt, event.randomnessValue)
  must('point', resolved.point.toString(), event.point.toString())
  must('recipient', encodeBase58(resolved.leaf.owner), encodeBase58(event.recipient))
  if (!verifyProof(resolved.leaf, resolved.proof, rebuilt.root)) {
    throw new Error('the recipient proof did not verify against the rebuilt root')
  }
  parts.push('point', 'recipient', 'proof')
  return { full: true, note: parts.join(', ') }
}

/** "3 and 4", "3, 4 and 7" — for a sentence, not a machine. */
export function nameHours(hours: bigint[]): string {
  const s = hours.map(String)
  if (s.length === 0) return 'none'
  if (s.length === 1) return s[0]!
  return `${s.slice(0, -1).join(', ')} and ${s[s.length - 1]}`
}
