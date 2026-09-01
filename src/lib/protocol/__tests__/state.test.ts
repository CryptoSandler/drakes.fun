import { describe, expect, it } from 'vitest'
import {
  COLLECTION_SIZE,
  feeSplit,
  mintsOnIssuance,
  protocolState,
} from '../state.ts'

// The table is DESIGN.md §2, transcribed. If the two ever disagree, one of them
// is a bug and this file is where it shows.
describe('the state machine', () => {
  it.each([
    { issuedCount: 0, liveSupply: 0, state: 'minting' },
    { issuedCount: 1, liveSupply: 1, state: 'minting' },
    { issuedCount: 3_999, liveSupply: 0, state: 'minting' },
    { issuedCount: 4_000, liveSupply: 4_000, state: 'mature' },
    { issuedCount: 4_000, liveSupply: 1, state: 'mature' },
    { issuedCount: 4_000, liveSupply: 0, state: 'exhausted' },
  ])('$issuedCount issued, $liveSupply live -> $state', ({ issuedCount, liveSupply, state }) => {
    expect(protocolState({ issuedCount, liveSupply })).toBe(state)
  })

  // The one that is easy to get wrong: before the collection fills, every piece
  // can be burned and the protocol is still Minting, not Exhausted. Exhausted
  // is reachable only through Mature.
  it('is Minting, not Exhausted, when everything issued so far has been burned', () => {
    expect(protocolState({ issuedCount: 12, liveSupply: 0 })).toBe('minting')
  })

  it('splits fees as D4 and D10 say', () => {
    expect(feeSplit('minting')).toEqual({ reserve: 85, creator: 15 })
    expect(feeSplit('mature')).toEqual({ reserve: 100, creator: 0 })
    expect(feeSplit('exhausted')).toBeNull()
  })

  it('mints only while Minting, though issuance fires in every state', () => {
    expect(mintsOnIssuance('minting')).toBe(true)
    expect(mintsOnIssuance('mature')).toBe(false)
    expect(mintsOnIssuance('exhausted')).toBe(false)
  })

  it('refuses counters that cannot come from a correct chain read', () => {
    expect(() => protocolState({ issuedCount: 1, liveSupply: 2 })).toThrow(/liveSupply/)
    expect(() => protocolState({ issuedCount: -1, liveSupply: 0 })).toThrow(/negative/)
    expect(() => protocolState({ issuedCount: COLLECTION_SIZE + 1, liveSupply: 0 })).toThrow(
      /exceed/,
    )
    expect(() => protocolState({ issuedCount: 1.5, liveSupply: 0 })).toThrow(/integers/)
  })
})
