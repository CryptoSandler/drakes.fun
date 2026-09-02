// The pin, and the one thing about it that can rot: the address printed in the
// documents an operator copies from.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GROUND_MINT, checkGroundMint } from '../solana/ground-mint.ts'
import { decodeBase58 } from '../solana/base58.ts'

const ROOT = join(import.meta.dirname, '..', '..', '..')
// The documents that print the mint for a person to copy. `launch-runbook.md`
// is the one an operator has open at C3, which is why it is first.
const PUBLISHED_IN = [
  'docs/launch-runbook.md',
  'docs/decisions.md',
  'docs/batches.md',
  'DESIGN.md',
]

describe('the ground mint', () => {
  it('is a 32-byte address', () => {
    expect(decodeBase58(GROUND_MINT)).toHaveLength(32)
  })

  it('is printed identically in every document that prints it', () => {
    // Anything that starts like the published address. A truncated paste, a
    // transposed character or a stale grind all match this and fail the
    // equality below — which is the failure being hunted, because the operator
    // copies from these files and not from the source.
    const shaped = /1212[1-9A-HJ-NP-Za-km-z]{20,}/g
    const found: { file: string; address: string }[] = []
    for (const file of PUBLISHED_IN) {
      const text = readFileSync(join(ROOT, file), 'utf8')
      for (const match of text.match(shaped) ?? []) found.push({ file, address: match })
    }

    // The control (CLAUDE.md): an empty result reads exactly like agreement.
    // If the documents stop naming the mint at all, this test has stopped
    // testing anything and says so instead of passing.
    expect(found.length).toBeGreaterThanOrEqual(PUBLISHED_IN.length)

    expect(found.filter((f) => f.address !== GROUND_MINT)).toEqual([])
  })

  it('accepts the published mint and refuses any other', () => {
    expect(checkGroundMint(GROUND_MINT).ok).toBe(true)
    const other = checkGroundMint('So11111111111111111111111111111111111111112')
    expect(other.ok).toBe(false)
    expect(other.why).toMatch(/NOT THE PUBLISHED MINT/)
  })

  it('refuses an empty candidate rather than comparing it', () => {
    // `if (mint == expected)` passes when both are unset. The guard throws.
    expect(() => checkGroundMint('')).toThrow(/cannot be pinned/)
    expect(() => checkGroundMint(undefined)).toThrow(/cannot be pinned/)
    // Valid base58, wrong length: this reaches our own check rather than the
    // decoder's, which is the branch worth pinning.
    expect(() => checkGroundMint('abc')).toThrow(/not an address/)
    expect(() => checkGroundMint('not-an-address')).toThrow(/not base58/)
  })
})
