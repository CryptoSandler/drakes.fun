// The state machine of DESIGN.md §2, mirrored off-chain for the verify page.
//
// The program is canonical: it derives the same three states from the same two
// counters at the top of every instruction that cares. This module exists so a
// page can show the state without asking us what it is, and it is deliberately
// a pure function of the same two numbers, so the mirror cannot drift into
// having an opinion of its own.
//
// Caller: `scripts/verify-issuance.ts` today; the site in B6.

export const COLLECTION_SIZE = 4_000

export type ProtocolState = 'minting' | 'mature' | 'exhausted'

export interface Counters {
  /** Pieces issued so far. Only ever rises, and never past COLLECTION_SIZE. */
  issuedCount: number
  /** Pieces issued and not yet burned. */
  liveSupply: number
}

/**
 * DESIGN.md §2. Derived, never set: there is no transition instruction, no
 * setter and no admin call anywhere in the program, so there is none here.
 */
export function protocolState({ issuedCount, liveSupply }: Counters): ProtocolState {
  assertCounters({ issuedCount, liveSupply })
  if (issuedCount < COLLECTION_SIZE) return 'minting'
  return liveSupply === 0 ? 'exhausted' : 'mature'
}

/** Minting 85/15, Mature 100/0, Exhausted refuses (D4, D10). */
export function feeSplit(state: ProtocolState): { reserve: number; creator: number } | null {
  switch (state) {
    case 'minting':
      return { reserve: 85, creator: 15 }
    case 'mature':
      return { reserve: 100, creator: 0 }
    case 'exhausted':
      return null
  }
}

/** Whether an issuance at this state mints anything. It always fires. */
export function mintsOnIssuance(state: ProtocolState): boolean {
  return state === 'minting'
}

function assertCounters({ issuedCount, liveSupply }: Counters): void {
  if (!Number.isInteger(issuedCount) || !Number.isInteger(liveSupply)) {
    throw new RangeError('counters must be integers')
  }
  if (issuedCount < 0 || liveSupply < 0) {
    throw new RangeError('counters cannot be negative')
  }
  if (issuedCount > COLLECTION_SIZE) {
    throw new RangeError(`issuedCount cannot exceed ${COLLECTION_SIZE}`)
  }
  // Burning is the only way live supply falls, and a piece must be issued
  // before it can be burned. More live than issued is a corrupt read, and a
  // corrupt read must not quietly produce a plausible state.
  if (liveSupply > issuedCount) {
    throw new RangeError('liveSupply cannot exceed issuedCount')
  }
}
