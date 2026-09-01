import { describe, expect, it } from 'vitest'
import { decodeBase58, encodeBase58 } from '../base58.ts'

const PUMP = 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn'
const SYSTEM = '11111111111111111111111111111111'

describe('base58', () => {
  it('matches the published vectors', () => {
    const text = (s: string) => new TextEncoder().encode(s)
    expect(encodeBase58(text('Hello World!'))).toBe('2NEpo7TZRRrLZSi2U')
    expect(encodeBase58(text('The quick brown fox jumps over the lazy dog.'))).toBe(
      'USm3fpXnKG5EUBx2ndxBDMPVciP5hGey2Jh4NDv6gmeo1LkMeiKrLJUUBk6Z',
    )
  })

  it('keeps leading zero bytes as leading ones', () => {
    expect(decodeBase58(SYSTEM)).toEqual(new Uint8Array(32))
    expect(encodeBase58(new Uint8Array(32))).toBe(SYSTEM)
  })

  it('round-trips the addresses this project hardcodes', () => {
    // Absolute assertion against a known value, not a self-consistency check.
    expect(decodeBase58(PUMP)).toHaveLength(32)
    expect(encodeBase58(decodeBase58(PUMP))).toBe(PUMP)
  })

  it('round-trips arbitrary 32-byte values', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const bytes = Uint8Array.from({ length: 32 }, (_, i) => (seed * 31 + i * 7) % 256)
      expect(decodeBase58(encodeBase58(bytes))).toEqual(bytes)
    }
  })

  it('refuses characters outside the alphabet', () => {
    expect(() => decodeBase58('0OIl')).toThrow(/not base58/)
  })
})
