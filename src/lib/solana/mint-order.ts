// The one property of the mint that cannot be fixed after the pool exists.
//
// Caller: `scripts/check-mint-order.ts` (the deploy checklist) and
// `src/lib/__tests__/mint-order.test.ts`.
//
// **It lives in `src/` and not in `scripts/` for a deployment reason worth
// recording**: `.vercelignore` excludes `scripts/`, so a test under `src/` that
// imported from there built locally and failed on Vercel with "Deployment has
// failed". That is the second time an exclusion in `.vercelignore` produced a
// break that only exists on the deploy. Library logic lives in `src/`; a script
// is a thin CLI over it.
//
// **Why it matters.** DAMM v2 sorts the pair by pubkey bytes and
// `collect_fee_mode = 1` collects in **token B**. If `$DRAKES` sorts above the
// quote mint, the fee arrives in `$DRAKES` and the whole fee design inverts
// (`DESIGN.md` T10). Unrepairable once the pool exists; free to fix before, by
// grinding another keypair.

import { decodeBase58 } from './base58.ts'

/** Native SOL's mint. A literal, on purpose (CLAUDE.md: never a bare `==`). */
export const WSOL_MINT = 'So11111111111111111111111111111111111111112'
/** `$PUMP`, kept for the record: the pair this project was designed against first. */
export const PUMP_MINT = 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn'

export interface OrderVerdict {
  ok: boolean
  base: string
  quote: string
  /** Which side the base mint lands on. `collect_fee_mode = 1` pays token B. */
  baseIs: 'A' | 'B'
  why: string
}

/**
 * The base mint must sort BELOW the quote mint, so the quote is token B and the
 * fee arrives in the quote token.
 */
export function checkOrder(baseMint: string, quoteMint: string): OrderVerdict {
  const base = Buffer.from(decodeBase58(baseMint))
  const quote = Buffer.from(decodeBase58(quoteMint))
  if (base.length !== 32) throw new RangeError('base mint is not an address')
  if (quote.length !== 32) throw new RangeError('quote mint is not an address')
  if (base.equals(quote)) throw new RangeError('base and quote are the same mint')

  const below = Buffer.compare(base, quote) < 0
  return {
    ok: below,
    base: baseMint,
    quote: quoteMint,
    baseIs: below ? 'A' : 'B',
    why: below
      ? 'the base mint sorts below the quote, so the quote is token B and the fee arrives in the quote token'
      : 'THE BASE MINT SORTS ABOVE THE QUOTE: the fee would arrive in the base token and the design inverts',
  }
}
