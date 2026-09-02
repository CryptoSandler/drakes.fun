// The ground mint, as an identity pin and nothing else.
//
// Caller: `scripts/check-ground-mint.ts` (the C3 checklist) and
// `src/lib/__tests__/ground-mint.test.ts`.
//
// **What this file used to be.** It asserted that `$DRAKES` sorts below wSOL,
// because DAMM v2 sorts a pair by pubkey bytes and `collect_fee_mode = 1`
// collects in token B — get it backwards and the fee arrives in `$DRAKES` and
// the whole design inverts. **D30 retired that (2026-09-02): there is no pool
// of ours.** A mint has no sort order to satisfy when there is no pair of ours
// for it to sort in, so the assertion is deleted rather than kept "just in
// case" — a guard nobody can state the failure mode of is a guard that gets
// believed for the wrong reason.
//
// **What survives is the pin.** pump.fun's `create` takes the mint as a
// signer, so a keypair ground and published in advance is a mint nobody can
// claim was swapped at launch. The address below is that publication. The
// secret lives at `~/.local/share/drakes-mainnet/` and is not in this
// repository.
//
// It stays in `src/` and not in `scripts/` for a deployment reason worth
// keeping: `.vercelignore` excludes `scripts/`, so a test under `src/` that
// imported from there built locally and failed on Vercel.

import { decodeBase58 } from './base58.ts'

/**
 * The mint `$DRAKES` launches with. Ground 2026-09-01, published in D26,
 * re-affirmed as an identity pin by D30.
 *
 * A literal, on purpose: this is the absolute assertion CLAUDE.md asks for, and
 * a relative check against another variable cannot answer "is this the right
 * mint".
 */
export const GROUND_MINT = '1212YJcDwzgLXxmwbtmkYaEB53p6y958cn2tENt3C3dM'

export interface PinVerdict {
  ok: boolean
  candidate: string
  why: string
}

/**
 * Is this the mint we published?
 *
 * Refuses an empty candidate loudly rather than comparing it: an unset variable
 * against a constant is the shape of guard that passes when the environment is
 * broken, which is the failure CLAUDE.md names by hand.
 */
export function checkGroundMint(candidate: string | undefined): PinVerdict {
  if (candidate === undefined || candidate === '') {
    throw new RangeError('no candidate mint: an empty value cannot be pinned')
  }
  if (decodeBase58(candidate).length !== 32) {
    throw new RangeError(`${candidate} is not an address`)
  }
  const ok = candidate === GROUND_MINT
  return {
    ok,
    candidate,
    why: ok
      ? 'this is the published ground mint'
      : `THIS IS NOT THE PUBLISHED MINT. Expected ${GROUND_MINT}. ` +
        'Launching on another mint breaks the one promise made before launch: ' +
        'that the address was fixed in advance.',
  }
}
