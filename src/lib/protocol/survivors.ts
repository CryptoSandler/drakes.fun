// The two derivations of DESIGN.md §3.3, and the survivor set of D19.
//
// One revealed value answers two independent questions -- *which piece* and *to
// whom* -- so they are domain-separated. Without that, one number does two jobs
// and the two answers are functions of each other.
//
// Caller: `scripts/crank.ts` and `scripts/snapshot.ts`; the program performs
// the identical arithmetic in `settle_issuance`, and the vectors in
// `programs/issuance/src/lib.rs` are what keeps the two honest.

import { createHash } from 'node:crypto'

export const PIECE_DOMAIN = 0x03
export const HOLDER_DOMAIN = 0x04

/** Bounds the rejection loop. A single rejection has probability ~2^-244. */
const MAX_ROUNDS = 8

/**
 * A uniform integer in `[0, modulus)` from a 32-byte value, exactly — no
 * modulo bias at all, not even the negligible kind.
 *
 * `floor(2^256 / m) * m` is the largest multiple of `m` that fits, and
 * `2^256 - (2^256 mod m)` is the same number. A sample at or above it is
 * discarded and the hash is taken again with the round counter appended.
 *
 * In practice the first round always succeeds; the loop exists so the claim on
 * the verify page is "uniform" rather than "uniform to 244 bits".
 */
export function uniformIndex(value: Uint8Array, modulus: bigint, domain: number): bigint {
  if (value.length !== 32) throw new RangeError('value must be 32 bytes')
  if (modulus <= 0n) throw new RangeError('modulus must be positive')
  const limit = (1n << 256n) - ((1n << 256n) % modulus)
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const h = createHash('sha256')
      .update(Uint8Array.of(domain))
      .update(value)
      .update(Uint8Array.of(round))
      .digest()
    const sample = BigInt(`0x${h.toString('hex')}`)
    if (sample < limit) return sample % modulus
  }
  // Reaching here is a 2^-1952 event, so it is a bug rather than misfortune.
  throw new Error('rejection sampling did not terminate')
}

/**
 * Fisher-Yates, swap-with-last, over the unissued pieces.
 *
 * The array is stored one-based so that a zeroed account reads as the identity
 * permutation: `0` means "never written, so this slot still holds its own
 * index". That removes a 4,000-iteration initialisation from `initialize` and
 * it is the same trick the program uses, byte for byte.
 */
export class SurvivorSet {
  private readonly slots: Uint16Array
  readonly size: number
  remaining: number

  // Written out rather than a parameter property: the whole snapshot path has
  // to run under plain `node`, and strip-only type removal rejects those.
  constructor(size: number) {
    if (size <= 0 || size > 0xffff) throw new RangeError('size out of range')
    this.size = size
    this.slots = new Uint16Array(size)
    this.remaining = size
  }

  private read(i: number): number {
    const v = this.slots[i]!
    return v === 0 ? i : v - 1
  }

  private write(i: number, v: number): void {
    this.slots[i] = v + 1
  }

  /** Takes the piece at `point` and closes the gap with the last survivor. */
  take(point: bigint): number {
    if (this.remaining === 0) throw new RangeError('no survivors left')
    const j = Number(point)
    if (j < 0 || j >= this.remaining) throw new RangeError('point outside the survivor set')
    const picked = this.read(j)
    this.write(j, this.read(this.remaining - 1))
    this.remaining -= 1
    return picked
  }

  /**
   * Adopts the array exactly as the chain holds it — same one-based slots, same
   * `remaining`. The cranker syncs from the account at startup rather than
   * replaying, because it only needs to agree with the chain going forward.
   *
   * The **verify page does the opposite**: it replays from the events, because
   * a reader must be able to derive the state without trusting the account we
   * wrote. The two paths meeting on the same array is the check.
   */
  static fromSlots(slots: Uint16Array, remaining: number): SurvivorSet {
    const set = new SurvivorSet(slots.length)
    if (remaining > slots.length) throw new RangeError('remaining exceeds the collection')
    set.slots.set(slots)
    set.remaining = remaining
    return set
  }

  /** Resolves a revealed value straight to a piece id. */
  issue(value: Uint8Array): number {
    // Checked before sampling, so an exhausted set says so instead of
    // complaining about a zero modulus three frames down.
    if (this.remaining === 0) throw new RangeError('no survivors left')
    return this.take(uniformIndex(value, BigInt(this.remaining), PIECE_DOMAIN))
  }
}

/**
 * The published rebuild: the survivor array's state is not stored anywhere a
 * reader can fetch, it is *derived* by replaying every settled issuance in
 * order. This is what the verify page runs, and it is why the events emit the
 * randomness value.
 */
export function replaySurvivors(size: number, values: Uint8Array[]): number[] {
  const set = new SurvivorSet(size)
  return values.map((v) => set.issue(v))
}
