// The document C2 commits, and the one property it has to have: it changes when
// the collection changes, and it is not the other manifest.

import { describe, expect, it } from 'vitest'
import { buildCollection } from '../traits.ts'
import { canonical, finalManifest, metadataFor, pieceFile, sha256Hex, type Allocation } from '../manifest.ts'
import { findBanned } from '../../copy/lexicon.ts'

const pieces = buildCollection(1)
const allocation: Allocation = {
  version: 1, seed: 1, collectionSize: pieces.length,
  tiers: { Whelp: 2400 }, pieces,
}
const built = () =>
  finalManifest({ allocation, images: 'IMAGES_TX', metadata: 'META_TX', gateway: 'https://gateway.irys.xyz' })

describe('the final manifest', () => {
  it('gives every piece a URI under the metadata transaction', () => {
    const manifest = built()
    expect(manifest.pieces).toHaveLength(4000)
    expect(manifest.pieces[0]!.uri).toBe('https://gateway.irys.xyz/META_TX/0000.json')
    expect(manifest.pieces[3999]!.uri).toBe('https://gateway.irys.xyz/META_TX/3999.json')
    expect(new Set(manifest.pieces.map((p) => p.uri)).size).toBe(4000)
  })

  it('keeps the allocation intact rather than rebuilding it', () => {
    // The tiers were fixed by the published seed before anyone knew who would
    // be issued anything (D13). An upload may add URIs and may not touch that.
    const manifest = built()
    expect(manifest.pieces.map((p) => p.tier)).toEqual(pieces.map((p) => p.tier))
    expect(manifest.pieces.map((p) => p.id)).toEqual(pieces.map((p) => p.id))
    expect(manifest.seed).toBe(1)
  })

  it('hashes to something other than the allocation, which is the point', () => {
    // Handing C2 the allocation's hash would commit a manifest with no URIs in
    // it, and the program's InitializeParams says the hash covers the URI.
    expect(sha256Hex(canonical(built()))).not.toBe(sha256Hex(canonical(allocation)))
  })

  it('changes when a trait changes, and when an upload address changes', () => {
    const base = sha256Hex(canonical(built()))
    const moved = finalManifest({ allocation, images: 'OTHER', metadata: 'META_TX', gateway: 'https://gateway.irys.xyz' })
    expect(sha256Hex(canonical(moved))).not.toBe(base)

    const edited = structuredClone(allocation)
    edited.pieces[7]!.traits.body = 'something-else'
    const changed = finalManifest({ allocation: edited, images: 'IMAGES_TX', metadata: 'META_TX', gateway: 'https://gateway.irys.xyz' })
    expect(sha256Hex(canonical(changed))).not.toBe(base)
  })

  it('is stable across runs, so two operators get the same hash', () => {
    expect(sha256Hex(canonical(built()))).toBe(sha256Hex(canonical(built())))
  })

  it('drops a trailing slash on the gateway rather than producing a double one', () => {
    const manifest = finalManifest({ allocation, images: 'I', metadata: 'M', gateway: 'https://g.example/' })
    expect(manifest.pieces[0]!.uri).toBe('https://g.example/M/0000.json')
  })
})

describe('a piece of metadata', () => {
  const metadata = metadataFor(pieces[0]!, 'https://gateway.irys.xyz/IMAGES_TX')

  it('names the piece and points at its image', () => {
    expect(metadata.name).toBe('Drake #0')
    expect(metadata.image).toBe('https://gateway.irys.xyz/IMAGES_TX/0000.png')
    expect(metadata.properties.files[0]!.uri).toBe(metadata.image)
  })

  it('leads with the tier and carries every layer', () => {
    expect(metadata.attributes[0]).toEqual({ trait_type: 'Tier', value: pieces[0]!.tier })
    expect(metadata.attributes).toHaveLength(1 + Object.keys(pieces[0]!.traits).length)
  })

  it('says rarity is cosmetic and promises nothing', () => {
    // This description is reprinted by every marketplace that ever lists a
    // piece. D13 is in it; §7's vocabulary is not.
    expect(metadata.description).toMatch(/differ in appearance and in nothing else/)
    expect(metadata.description).not.toMatch(/backed|floor|worth|guarantee|redeem/i)
  })

  it('uses none of the banned vocabulary, across every tier', () => {
    const shapes = ['Whelp', 'Wyrm', 'Elder', 'Ancient', 'Sovereign']
      .map((tier) => pieces.find((p) => p.tier === tier)!)
      .map((piece) => metadataFor(piece, 'https://g.example/I'))
    for (const shape of shapes) expect(findBanned(JSON.stringify(shape))).toEqual([])
    // The control: the scanner works on this shape of input.
    expect(findBanned(JSON.stringify({ description: 'a raffle' }))).not.toEqual([])
  })
})

describe('the file names', () => {
  it('pad to four so a folder sorts the way a person expects', () => {
    expect(pieceFile(0, 'png')).toBe('0000.png')
    expect(pieceFile(42, 'json')).toBe('0042.json')
    expect(pieceFile(3999, 'png')).toBe('3999.png')
  })
})
