// The trait table, and whether the document and the code still agree.
//
// `docs/traits.md` is the argument and `traits.ts` is what runs. Two copies of
// a number drift, and the one that drifts silently is the document — which is
// also the one an illustrator is paid against.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildCollection, countVariants, duplicates, GENERATED_TIERS, LAYERS, POOLS,
  TIER_SIZES, assertPoolsSum, rng, shuffled,
} from '../traits.ts'

const doc = readFileSync(new URL('../../../../docs/traits.md', import.meta.url), 'utf8')

describe('the trait table', () => {
  it('sums to each tier, and to 4,000', () => {
    expect(() => assertPoolsSum()).not.toThrow()
    expect(Object.values(TIER_SIZES).reduce((a, b) => a + b, 0)).toBe(4000)
  })

  it('agrees with docs/traits.md on every count', () => {
    for (const tier of GENERATED_TIERS) {
      for (const layer of LAYERS) {
        for (const [variant, count] of Object.entries(POOLS[tier][layer])) {
          // `slate 500` — the document's own notation.
          const pattern = new RegExp(`${variant}\\s+${count.toLocaleString('en')}\\b`)
          expect(doc, `${tier}.${layer}.${variant} = ${count} is not in docs/traits.md`).toMatch(pattern)
        }
      }
    }
  })

  it('reserves the ten Sovereigns for a person', () => {
    const pieces = buildCollection(1)
    const sovereigns = pieces.filter((p) => p.tier === 'Sovereign')
    expect(sovereigns).toHaveLength(10)
    expect(sovereigns.every((p) => p.handmade)).toBe(true)
    expect(pieces.filter((p) => p.handmade)).toHaveLength(10)
  })
})

describe('the built collection', () => {
  const pieces = buildCollection(1)

  it('is 4,000 pieces with no repeated combination', () => {
    expect(pieces).toHaveLength(4000)
    expect(duplicates(pieces)).toEqual([])
  })

  it('keeps every variant count exact after the de-duplication', () => {
    // The repair swaps between pieces and never overwrites, precisely so this
    // holds. Counted out of the output, not read back from the pools.
    for (const tier of GENERATED_TIERS) {
      for (const layer of LAYERS) {
        expect(countVariants(pieces, tier, layer)).toEqual(POOLS[tier][layer])
      }
    }
  })

  it('is the same collection on every machine for a given seed', () => {
    const again = buildCollection(1)
    expect(JSON.stringify(again)).toBe(JSON.stringify(pieces))
  })

  it('is a different collection for a different seed', () => {
    expect(JSON.stringify(buildCollection(2))).not.toBe(JSON.stringify(pieces))
  })

  it('never uses the retired vocabulary', async () => {
    // `cinder`, `ember`, `ash`, `soot` are the old species' words and are banned
    // in copy AND identifiers. Three trait variants were named from them and the
    // lexicon guard caught it; this is the same check, closer to the data.
    const { findBanned } = await import('../../copy/lexicon.ts')
    const names = GENERATED_TIERS.flatMap((t) =>
      LAYERS.flatMap((l) => Object.keys(POOLS[t][l])),
    )
    expect(findBanned(names.join(' '))).toEqual([])
  })
})

describe('the shuffle', () => {
  it('is a permutation, not a resample', () => {
    const items = Array.from({ length: 200 }, (_, i) => i)
    const out = shuffled(items, rng(7))
    expect([...out].sort((a, b) => a - b)).toEqual(items)
  })
})
