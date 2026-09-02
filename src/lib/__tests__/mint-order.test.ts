// The check that cannot be run after the pool exists, so it is run in CI.

import { describe, expect, it } from 'vitest'
import { PUMP_MINT, WSOL_MINT, checkOrder } from '../solana/mint-order.ts'

// Ground 2026-09-01 against wSOL. Its secret lives at
// ~/.local/share/drakes-mainnet/ and is not in this repository.
const DRAKES = '1212YJcDwzgLXxmwbtmkYaEB53p6y958cn2tENt3C3dM'

describe('the pair order', () => {
  it('puts the ground $DRAKES mint below wSOL, so wSOL is token B', () => {
    const v = checkOrder(DRAKES, WSOL_MINT)
    expect(v.ok).toBe(true)
    expect(v.baseIs).toBe('A')
  })

  it('fails loudly when the base sorts above the quote', () => {
    // wSOL against $DRAKES is the same pair, the wrong way round. The verdict
    // must be a failure and not a shrug: past pool creation it is unfixable.
    const v = checkOrder(WSOL_MINT, DRAKES)
    expect(v.ok).toBe(false)
    expect(v.why).toMatch(/SORTS ABOVE/)
  })

  it('still records the order against $PUMP, which is the pair we cannot build', () => {
    // D24: no DAMM v2 pool for $PUMP exists. Kept so that if the badge ever
    // arrives, the answer for this mint is already known rather than re-derived.
    expect(checkOrder(DRAKES, PUMP_MINT).ok).toBe(true)
  })

  it('refuses a mint that is not an address, and a pair with itself', () => {
    expect(() => checkOrder('not-an-address', WSOL_MINT)).toThrow()
    expect(() => checkOrder(WSOL_MINT, WSOL_MINT)).toThrow(/same mint/)
  })
})
