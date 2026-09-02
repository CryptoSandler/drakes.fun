// The guard that exists because a default was rendered as a fact.
//
// On 2026-09-01 `funded_by` was missing from production and the page printed
// `fees` for every row, because the expression had two branches and three
// cases. These tests are about the third case.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { provenanceLabel } from '../provenance.ts'

describe('the provenance label', () => {
  it('names the two values the schema admits', () => {
    expect(provenanceLabel('fees')).toEqual({ kind: 'fees', text: 'fees' })
    expect(provenanceLabel('creator')).toEqual({
      kind: 'creator',
      text: 'seeded by the creator, not from fees',
    })
  })

  it('refuses to call anything else `fees`', () => {
    // The exact shape of the incident: the column did not exist, so the field
    // was absent, so the ternary chose the default.
    for (const value of [undefined, null, '', 'FEES', 'Fees', 'unknown', 0, false, {}, []]) {
      const label = provenanceLabel(value)
      expect(label.kind).toBe('unknown')
      expect(label.text).not.toBe('fees')
      expect(label.text).not.toContain('seeded by the creator')
    }
  })

  it('says the schema might be behind, because that is what it was', () => {
    expect(provenanceLabel(undefined).text).toMatch(/not recorded/)
    expect(provenanceLabel(undefined).text).toMatch(/schema is behind/)
  })
})

describe('the page reads it through the guard', () => {
  const page = readFileSync(new URL('../../../../app/verify/page.tsx', import.meta.url), 'utf8')

  it('never compares funded_by inline', () => {
    // A source assertion: a rendering test passes against a page that has
    // quietly grown a second, ungarded comparison somewhere else.
    expect(page).not.toMatch(/funded_by\s*===/)
    expect(page).toMatch(/provenanceLabel\(b\.funded_by\)/)
  })

  it('does not type the column as the two values the database may not hold', () => {
    expect(page).toMatch(/funded_by: unknown/)
  })
})
