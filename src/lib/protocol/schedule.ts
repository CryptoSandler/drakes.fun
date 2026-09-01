// The schedule of DESIGN.md §2: anchored to an instant computed from the index,
// never to when the previous issuance settled, so a late one cannot push it.
//
// Caller: `scripts/verify-issuance.ts` and the cranker (B4).

/** Mainnet is 3,600. A rehearsal cluster runs a short period; see the runbook. */
export const MAINNET_PERIOD_SECONDS = 3_600

export interface Schedule {
  /** Unix seconds of index 0. */
  genesisUnix: number
  periodSeconds: number
}

/** `issue_at(n) = genesis + n * period`, in unix seconds. */
export function issueAt(schedule: Schedule, index: number): number {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError('index must be a non-negative integer')
  }
  return schedule.genesisUnix + index * schedule.periodSeconds
}

/** True when `request_issuance` for this index would pass its time check. */
export function isRequestable(schedule: Schedule, index: number, nowUnix: number): boolean {
  return nowUnix >= issueAt(schedule, index)
}

/**
 * The window an index may still be requested in. It closes when the NEXT
 * index becomes requestable: past that instant the hour is skipped, the index
 * does not advance, and completion moves out by one period (DESIGN.md §2, T11).
 *
 * This function is why the completion date is a floor. It returns a window,
 * not a deadline the protocol enforces on itself.
 */
export function requestWindow(schedule: Schedule, index: number): { opensAt: number; closesAt: number } {
  return { opensAt: issueAt(schedule, index), closesAt: issueAt(schedule, index + 1) }
}

/** Earliest possible completion. Every skipped period pushes it out by one. */
export function earliestCompletionUnix(schedule: Schedule, collectionSize: number): number {
  return issueAt(schedule, collectionSize)
}
