// The register's ordering and its dates, which are the two things a timeline
// can get wrong without looking wrong.

import { describe, expect, it } from 'vitest'
import { buildTimeline, shortSignature, stamp, type RawConversion, type RawIssuance } from '../timeline.ts'

const schedule = { genesisUnix: 1_788_281_174, periodSeconds: 3_600 }

const issuance = (hour: number, over: Partial<RawIssuance> = {}): RawIssuance => ({
  hour, minted: true, pieceId: 1000 + hour,
  recipient: '2B7taMK2LvaJx7Rsf3cX4vUQAJbXbkX6FFH7Ud1ZfxHu',
  signature: `sig-${hour}`,
  ...over,
})

const conversion = (over: Partial<RawConversion> = {}): RawConversion => ({
  signature: 'conv-1', sol_spent: '5000000000', pump_received: '123456',
  block_time: '2026-09-01T12:00:00.000Z', slot: '1', funded_by: 'fees',
  ...over,
})

describe('the register', () => {
  it('dates an issuance by the schedule and not by anything else', () => {
    // genesis + hour * period. The same definition the program uses, imported
    // from the same module rather than repeated here.
    const [row] = buildTimeline({ schedule, issuances: [issuance(2)], conversions: [] })
    expect(row!.at).toBe(1_788_281_174 + 2 * 3_600)
  })

  it('puts the newest first, whatever order it was handed', () => {
    const rows = buildTimeline({
      schedule,
      issuances: [issuance(1), issuance(9), issuance(4)],
      conversions: [],
    })
    expect(rows.map((r) => (r.kind === 'issuance' ? r.hour : -1))).toEqual([9, 4, 1])
  })

  it('interleaves conversions with issuances by time', () => {
    // The whole point of the view: one chronology, not two lists.
    const rows = buildTimeline({
      schedule,
      issuances: [issuance(0), issuance(100)],
      conversions: [conversion({ block_time: new Date((schedule.genesisUnix + 50 * 3600) * 1000).toISOString() })],
    })
    expect(rows.map((r) => r.kind)).toEqual(['issuance', 'conversion', 'issuance'])
  })

  it('carries a signature on every row', () => {
    const rows = buildTimeline({ schedule, issuances: [issuance(1)], conversions: [conversion()] })
    expect(rows.every((r) => r.signature.length > 0)).toBe(true)
  })

  it('links an issuance to its own permalink', () => {
    const [row] = buildTimeline({ schedule, issuances: [issuance(378)], conversions: [] })
    expect(row?.kind === 'issuance' ? row.href : null).toBe('/verify/378')
  })

  it('marks an hour that issued nothing rather than inventing a piece', () => {
    const rows = buildTimeline({
      schedule,
      issuances: [issuance(3, { minted: false, pieceId: 0xffff })],
      conversions: [],
    })
    const first = rows[0]
    expect(first?.kind === 'issuance' ? first.pieceId : 'not an issuance').toBe(null)
  })

  it('drops a conversion with no block time instead of dating it zero', () => {
    // A row dated 0 sorts to the bottom of time and reads as an event from
    // 1970. Deriving one from `slot` would be arithmetic over a number that is
    // not a clock.
    const rows = buildTimeline({ schedule, issuances: [], conversions: [conversion({ block_time: null })] })
    expect(rows).toEqual([])
    expect(buildTimeline({ schedule, issuances: [], conversions: [conversion({ block_time: 'nonsense' })] })).toEqual([])
  })

  it('passes an unrecorded source through as a fault, never as fees', () => {
    // The migration-0004 incident: a ternary has two branches and there are
    // three cases (src/lib/site/provenance.ts).
    const rows = buildTimeline({ schedule, issuances: [], conversions: [conversion({ funded_by: undefined })] })
    const only = rows[0]
    expect(only?.kind === 'conversion' ? only.source.kind : 'not a conversion').toBe('unknown')
  })

  it('orders deterministically when two things share a second', () => {
    const at = new Date((schedule.genesisUnix + 3600) * 1000).toISOString()
    const once = buildTimeline({
      schedule, issuances: [issuance(1)],
      conversions: [conversion({ block_time: at, signature: 'aaa' }), conversion({ block_time: at, signature: 'bbb' })],
    })
    const twice = buildTimeline({
      schedule, issuances: [issuance(1)],
      conversions: [conversion({ block_time: at, signature: 'bbb' }), conversion({ block_time: at, signature: 'aaa' })],
    })
    expect(once.map((r) => r.signature)).toEqual(twice.map((r) => r.signature))
  })
})

describe('how a row reads', () => {
  it('stamps in UTC, with no locale in it', () => {
    // Computed, not recalled: `date -u -r 1788281174` and python3 both give
    // this, and the first version of this line was a guess that was eight
    // hours out. That is the devnet rig's genesis instant.
    expect(stamp(1_788_281_174)).toBe('2026-09-01 16:46 UTC')
  })

  it('shortens a signature without making it mistakable for the whole', () => {
    expect(shortSignature('3YAeuFw7n4itwcMXNjNkjWzBMohtPrDxNNUcpPNX87MkQX5mxGkpRM87rAqK4gk5q19ZxuDBkEEJgpVxZa2nXDJU'))
      .toBe('3YAeuFw7…nXDJU')
    expect(shortSignature('short')).toBe('short')
  })
})
