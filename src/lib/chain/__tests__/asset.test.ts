// The check that would have caught the defect, driven against the account that
// carried it.

import { describe, expect, it } from 'vitest'
import { checkAsset, claimedPiece, decodeAsset, type CoreAsset } from '../asset.ts'

// `62zrUBQY2eq8NtX9bnhDiQzQaPjbCk9SL9kRkuBEnuHC`, read from devnet 2026-09-02.
// The asset minted at hour 378, which issued piece 2951 and says otherwise.
function realAsset(): Uint8Array {
  const name = Buffer.from('Drake #379', 'utf8')
  const uri = Buffer.from('https://drakes.fun/a/379', 'utf8')
  const out = Buffer.alloc(1 + 32 + 1 + 32 + 4 + name.length + 4 + uri.length + 1)
  let at = 0
  out[at] = 1 // AssetV1
  at += 1
  Buffer.from(new Uint8Array(32).fill(7)).copy(out, at) // owner
  at += 32
  out[at] = 2 // update authority: Collection
  at += 1
  Buffer.from(new Uint8Array(32).fill(9)).copy(out, at)
  at += 32
  out.writeUInt32LE(name.length, at)
  at += 4
  name.copy(out, at)
  at += name.length
  out.writeUInt32LE(uri.length, at)
  at += 4
  uri.copy(out, at)
  return new Uint8Array(out)
}

const decoded = () => decodeAsset('62zrUBQY2eq8NtX9bnhDiQzQaPjbCk9SL9kRkuBEnuHC', realAsset())!

describe('an mpl-core asset', () => {
  it('decodes the name and the uri past the update-authority enum', () => {
    const asset = decoded()
    expect(asset.name).toBe('Drake #379')
    expect(asset.uri).toBe('https://drakes.fun/a/379')
    expect(asset.updateAuthority).not.toBe(null)
  })

  it('is not a collection account', () => {
    // The settle transaction carries the collection too. Only AssetV1 decodes.
    const collection = realAsset()
    collection[0] = 5
    expect(decodeAsset('x', collection)).toBe(null)
  })

  it('refuses a string that runs past the account', () => {
    // A layout that moved reads a length from the wrong offset, and the
    // resulting "name" is whatever follows. Better to throw than to report it.
    const broken = realAsset()
    broken[66] = 0xff
    expect(() => decodeAsset('x', broken)).toThrow(/ran past the account/)
  })
})

describe('the check', () => {
  it('fails the asset that named the hour instead of the piece', () => {
    // The real defect: hour 378 issued 2951 and the asset says 379.
    const verdict = checkAsset(378n, 2951, decoded())
    expect(verdict.agrees).toBe(false)
    expect(verdict.why).toContain('the event issued piece 2951')
    expect(verdict.why).toContain('379')
  })

  it('passes an asset that names its own piece, both ways', () => {
    const good: CoreAsset = {
      address: 'x', owner: 'o', updateAuthority: 'c',
      name: 'Drake #2951', uri: 'https://gateway.example/META/2951.json',
    }
    expect(checkAsset(378n, 2951, good).agrees).toBe(true)
  })

  it('fails when the name is right and the uri is not', () => {
    // The failure a single-field check would wave through.
    const half: CoreAsset = {
      address: 'x', owner: 'o', updateAuthority: 'c',
      name: 'Drake #2951', uri: 'https://gateway.example/META/0379.json',
    }
    const verdict = checkAsset(378n, 2951, half)
    expect(verdict.agrees).toBe(false)
    expect(verdict.why).toContain('379')
  })

  it('reads a zero-padded uri as its number', () => {
    expect(claimedPiece({
      address: 'x', owner: 'o', updateAuthority: null,
      name: 'Drake #7', uri: 'ar://x/0007.json',
    })).toEqual({ fromName: 7, fromUri: 7 })
  })

  it('fails loudly when there is no asset at all', () => {
    // Not "nothing to check": a settled hour that minted has an asset.
    expect(checkAsset(1n, 5, null).agrees).toBe(false)
  })

  it('fails when neither string carries a number', () => {
    expect(checkAsset(1n, 5, {
      address: 'x', owner: 'o', updateAuthority: null, name: 'Drake', uri: 'ar://x/',
    }).agrees).toBe(false)
  })
})
