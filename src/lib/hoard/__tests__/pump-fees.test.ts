import { describe, expect, it } from 'vitest'
import {
  CREATOR_FEE_BANDS, DOCUMENTED_CURVE_CREATOR_PERCENT, RECORDED_SCHEDULE, creatorFeePercent,
  hoardPerVolume, MAX_CREATOR_PERCENT, MIN_CREATOR_PERCENT,
} from '../pump-fees.ts'

describe("pump.fun's creator fee", () => {
  it('is 0.300% on the curve and 0.300% in the first band — in the DOCUMENTATION', () => {
    expect(DOCUMENTED_CURVE_CREATOR_PERCENT).toBe(0.3)
    expect(creatorFeePercent(0)).toBe(0.3)
    expect(creatorFeePercent(419)).toBe(0.3)
  })

  it('is 0.05% everywhere ON THE CHAIN, which is what anyone actually pays', () => {
    // Read 2026-09-02 from `Global` under the curve and `GlobalConfig` under
    // the AMM, on both clusters. The documented tiers are not deployed: no
    // FeeConfig account exists to hold them.
    expect(RECORDED_SCHEDULE.creatorFeeBps).toBe(5)
    expect(RECORDED_SCHEDULE.curveCreatorFeeBps).toBe(5)
    expect(RECORDED_SCHEDULE.tiered).toBe(false)
    // The gap the guard exists for: six times what the docs promise on the
    // curve, and nineteen times at the top of the documented table.
    expect(DOCUMENTED_CURVE_CREATOR_PERCENT / (RECORDED_SCHEDULE.curveCreatorFeeBps / 100)).toBeCloseTo(6, 10)
  })

  it('rises to its maximum between 420 and 1,470 SOL of market cap', () => {
    // The counter-intuitive part, pinned: it goes UP before it goes down.
    expect(creatorFeePercent(420)).toBe(0.95)
    expect(creatorFeePercent(1469)).toBe(0.95)
    expect(creatorFeePercent(1470)).toBe(0.9)
    expect(MAX_CREATOR_PERCENT).toBe(0.95)
  })

  it('decays to a twentieth of that at the top', () => {
    expect(creatorFeePercent(98_240)).toBe(0.05)
    expect(creatorFeePercent(10_000_000)).toBe(0.05)
    expect(MIN_CREATOR_PERCENT).toBe(0.05)
    expect(MAX_CREATOR_PERCENT / MIN_CREATOR_PERCENT).toBeCloseTo(19, 10)
  })

  it('never returns undefined, whatever the market cap', () => {
    for (let mcap = 0; mcap < 120_000; mcap += 137) {
      expect(typeof creatorFeePercent(mcap)).toBe('number')
    }
  })

  it('is monotonically non-increasing after the peak band', () => {
    const after = CREATOR_FEE_BANDS.slice(1).map(([, p]) => p)
    for (let i = 1; i < after.length; i += 1) expect(after[i]!).toBeLessThanOrEqual(after[i - 1]!)
  })

  it('refuses a market cap it cannot read rather than rendering a rate', () => {
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(() => creatorFeePercent(bad)).toThrow()
    }
  })

  it('is far below the 1.6% the hoard was originally sized on, at scale', () => {
    // The number the round exists to make impossible to forget.
    expect(hoardPerVolume(10_000, 100_000)).toBe(5)
    expect(hoardPerVolume(10_000, 100_000) * 32).toBe(160) // what 1.6% would have been
  })
})
