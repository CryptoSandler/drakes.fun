import { describe, expect, it } from 'vitest'
import {
  CREATOR_FEE_BANDS, CURVE_CREATOR_PERCENT, RECORDED_SCHEDULE, creatorFeePercent, hoardPerVolume,
} from '../pump-fees.ts'

describe("pump.fun's creator fee", () => {
  it('is 0.300% on the bonding curve, and the chain agrees', () => {
    expect(CURVE_CREATOR_PERCENT).toBe(0.3)
    expect(RECORDED_SCHEDULE.curveCreatorBps).toBe(30)
    expect(RECORDED_SCHEDULE.curveProtocolBps).toBe(95)
  })

  it('carries 25 tiers on PumpSwap, peaking at 95 bps', () => {
    // Corrected after being reported as a flat 5 bps: the FeeConfig account is
    // owned by a third program, not by either of the two that declare it.
    expect(RECORDED_SCHEDULE.swapTierCount).toBe(25)
    expect(RECORDED_SCHEDULE.swapCreatorBpsAtZero).toBe(30)
    expect(RECORDED_SCHEDULE.swapCreatorBpsMax).toBe(95)
    expect(RECORDED_SCHEDULE.swapCreatorBpsMin).toBe(5)
  })

  it('has a documented table that matches what the chain carries', () => {
    expect(creatorFeePercent(0)).toBe(RECORDED_SCHEDULE.swapCreatorBpsAtZero / 100)
    expect(creatorFeePercent(420)).toBe(RECORDED_SCHEDULE.swapCreatorBpsMax / 100)
    expect(creatorFeePercent(10_000_000)).toBe(RECORDED_SCHEDULE.swapCreatorBpsMin / 100)
    expect(CREATOR_FEE_BANDS).toHaveLength(RECORDED_SCHEDULE.swapTierCount)
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

  it('is far below the 1.6% the hoard was sized on, at the top', () => {
    expect(hoardPerVolume(10_000, 100_000)).toBe(5)
    expect(hoardPerVolume(10_000, 100_000) * 32).toBe(160)
  })
})
