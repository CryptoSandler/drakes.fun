// The gate, in both directions. It is the only thing standing between a post
// and a rarity claim nobody can check.

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { tierGate } from '../tiers.ts'

const manifest = JSON.stringify({ pieces: [{ id: 0, tier: 'Whelp' }, { id: 7, tier: 'Sovereign' }] })
const hashOf = (s: string) => createHash('sha256').update(s).digest('hex')

describe('the tier gate', () => {
  it('opens only when the file is the one the chain committed', () => {
    const gate = tierGate({ manifestText: manifest, chainHash: hashOf(manifest) })
    expect(gate.open).toBe(true)
    expect(gate.lookup!(7)).toBe('Sovereign')
    expect(gate.lookup!(0)).toBe('Whelp')
    expect(gate.lookup!(4000)).toBe(null)
  })

  it('stays shut on a manifest that is not the committed one', () => {
    const gate = tierGate({ manifestText: manifest, chainHash: hashOf('something else') })
    expect(gate.open).toBe(false)
    expect(gate.lookup).toBe(null)
    expect(gate.why).toMatch(/the chain committed/)
  })

  it('stays shut when one byte of the manifest changed', () => {
    // The failure this exists for: a manifest edited after it was committed.
    const edited = manifest.replace('Whelp', 'Elder')
    expect(tierGate({ manifestText: edited, chainHash: hashOf(manifest) }).open).toBe(false)
  })

  it('stays shut when the chain has committed nothing', () => {
    // A zeroed hash against a file hash would never match anyway. It is
    // reported separately because "no manifest on chain" and "yours is wrong"
    // need different actions from an operator.
    const gate = tierGate({ manifestText: manifest, chainHash: '0'.repeat(64) })
    expect(gate.open).toBe(false)
    expect(gate.why).toMatch(/committed no manifest/)
    expect(tierGate({ manifestText: manifest, chainHash: '' }).open).toBe(false)
  })

  it('stays shut with no manifest at all, which is the default', () => {
    const gate = tierGate({ chainHash: hashOf(manifest) })
    expect(gate.open).toBe(false)
    expect(gate.lookup).toBe(null)
  })

  it('refuses a manifest that matches the chain but cannot be read', () => {
    const nonsense = 'not json at all'
    const gate = tierGate({ manifestText: nonsense, chainHash: hashOf(nonsense) })
    expect(gate.open).toBe(false)
    expect(gate.why).toMatch(/not JSON/)
  })

  it('refuses a manifest that matches the chain and carries no pieces', () => {
    const empty = JSON.stringify({ pieces: [] })
    expect(tierGate({ manifestText: empty, chainHash: hashOf(empty) }).open).toBe(false)
  })
})
