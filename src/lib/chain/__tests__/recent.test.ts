// The live check is arithmetic on published values, so it can be driven with
// the real recorded events and made to fail on purpose.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { decodeSettled, type SettledEvent } from '../events.ts'
import { verifyRecent } from '../recent.ts'

const fixture = fileURLToPath(new URL('../../../../scripts/__tests__/fixtures/rehearsal-settled.json', import.meta.url))
const recorded = JSON.parse(readFileSync(fixture, 'utf8')) as {
  events: { signature: string; slot: number; data: string }[]
}
const events: SettledEvent[] = recorded.events.map((row) => {
  const decoded = decodeSettled(new Uint8Array(Buffer.from(row.data, 'base64')))
  if (decoded === null) throw new Error('fixture did not decode')
  return { ...decoded, signature: row.signature, txSlot: BigInt(row.slot) }
})

describe('the live window check', () => {
  it('agrees with the program on every recorded hour', () => {
    // The control: an empty fixture would pass the "no disagreement" half
    // silently, so the count is asserted too.
    expect(events.length).toBe(51)
    const report = verifyRecent(events)
    expect(report.checked).toBe(51)
    expect(report.agreed).toBe(51)
    expect(report.repeated).toEqual([])
  })

  it('catches a point that does not follow from the revealed value', () => {
    const doctored = events.map((e, i) => (i === 3 ? { ...e, point: e.point + 1n } : e))
    const report = verifyRecent(doctored)
    expect(report.agreed).toBe(50)
    expect(report.rows[3]!.agrees).toBe(false)
    expect(report.rows[3]!.derived).not.toBe(report.rows[3]!.point)
  })

  it('catches a piece repeated inside the window', () => {
    const doctored = [...events, { ...events[0]!, hour: 999n }]
    expect(verifyRecent(doctored).repeated).toEqual([events[0]!.pieceId])
  })

  it('does not claim to check the permutation', () => {
    // The window cannot: which piece an hour issued depends on every take
    // before it. The rows carry the piece id the program emitted and never a
    // derived one, so nothing here can be read as a permutation check.
    const report = verifyRecent(events.slice(-3))
    expect(report.checked).toBe(3)
    expect(Object.keys(report.rows[0]!)).not.toContain('derivedPieceId')
  })
})
