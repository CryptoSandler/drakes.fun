// What can be checked live, on the last few hours, with nothing but the events.
//
// Caller: `app/api/verify/recent/route.ts`, which `/verify` calls on load.
//
// **The division of labour, and it is the whole design of the verify page.**
//
// The survivor permutation cannot be checked from a window: which piece hour N
// issued depends on every take before it, so verifying it needs the whole
// history. That is the job (`scripts/verify-full.ts`) and the published command.
//
// The *holder* derivation needs no history at all. `point` is a pure function of
// the revealed value and the eligible supply, both of which the event carries:
//
//     point == uniformIndex(randomness_value, eligible_supply, HOLDER_DOMAIN)
//
// So the last 24 hours can be checked in a second, from the chain, in the
// browser's own request — and the check is complete for what it claims rather
// than a sample of something larger. A page that offered a partial permutation
// replay would be offering a check that cannot fail honestly.

import { HOLDER_DOMAIN, uniformIndex } from '../protocol/survivors.ts'
import type { SettledEvent } from './events.ts'

export interface RecentRow {
  hour: string
  minted: boolean
  pieceId: number
  /** The point the program recorded. */
  point: string
  /** The point recomputed from the revealed value and the eligible supply. */
  derived: string
  agrees: boolean
}

export interface RecentReport {
  rows: RecentRow[]
  agreed: number
  checked: number
  /** Piece ids repeated inside the window. Empty is the only acceptable answer. */
  repeated: number[]
}

export function verifyRecent(events: SettledEvent[]): RecentReport {
  const rows: RecentRow[] = []
  const seen = new Map<number, string>()
  const repeated: number[] = []

  for (const event of events) {
    const derived =
      event.eligibleSupply > 0n
        ? uniformIndex(event.randomnessValue, event.eligibleSupply, HOLDER_DOMAIN)
        : 0n
    rows.push({
      hour: event.hour.toString(),
      minted: event.minted,
      pieceId: event.pieceId,
      point: event.point.toString(),
      derived: derived.toString(),
      agrees: derived === event.point,
    })
    if (event.minted) {
      if (seen.has(event.pieceId)) repeated.push(event.pieceId)
      seen.set(event.pieceId, event.hour.toString())
    }
  }

  return {
    rows,
    agreed: rows.filter((r) => r.agrees).length,
    checked: rows.length,
    repeated,
  }
}
