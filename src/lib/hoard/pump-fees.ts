// pump.fun's creator fee, which is not one number.
//
// Caller: `app/verify/page.tsx`, to show the rate in force, and `DESIGN.md` §1,
// whose fine print is generated from this table.
//
// **Read from `pump.fun/docs/fees` on 2026-09-02.** It is *their* schedule in
// *their* program, and they can change it — which is the difference between
// this and Meteora's immutable static config. The read date travels with the
// table for that reason, and `/verify` prints it.
//
// **The table below is their documentation and it is NOT what the chain says.**
// Read on 2026-09-02: `GlobalConfig` under the AMM carries a flat
// `coin_creator_fee_basis_points: 5` — 0.05% — and no `FeeConfig` account is
// deployed on either cluster, though both IDLs define one with a `fee_tiers`
// vector. So the tiers exist in the program and are not in force.
//
// The table is kept because it is what the tiers WOULD be if switched on, and
// because the gap between it and the chain is the reason the guard exists. Every
// figure the site shows comes from `RECORDED_SCHEDULE`, which is the chain.

/** When the schedule was last read FROM THE CHAIN. */
export const FEE_TABLE_READ = '2026-09-02'

/**
 * What `GlobalConfig` carried on mainnet when it was last read.
 *
 * **This, not the tier table below, is what anyone is actually paying.** The
 * documentation describes tiers from 0.950% down to 0.050%; the chain carries a
 * flat 5 bps and no `FeeConfig` account exists to hold tiers. Corroborated by
 * watching real PumpSwap trades pay two identical small amounts — the protocol
 * and the creator, both at 5 bps.
 *
 * `scripts/check-pump-schedule.ts` re-reads this and alerts when it moves.
 */
export const RECORDED_SCHEDULE = {
  readAt: '2026-09-02',
  // PumpSwap, after graduation, from `GlobalConfig`.
  lpFeeBps: 20,
  protocolFeeBps: 5,
  creatorFeeBps: 5,
  tiered: false,
  // The bonding curve, from `Global` — where a coin spends its first hours.
  // The documentation says the creator gets 0.300% here. The chain says 5 bps.
  curveCreatorFeeBps: 5,
  curveProtocolFeeBps: 95,
} as const

/** The live creator fee as a percentage, from the recorded on-chain value. */
export const RECORDED_CREATOR_PERCENT = RECORDED_SCHEDULE.creatorFeeBps / 100

/**
 * What the DOCUMENTATION says the creator gets on the curve. **The chain says
 * 0.05%** — `Global.creator_fee_basis_points` is 5 on both clusters, read
 * 2026-09-02, against a 95 bps protocol fee. Kept only so the gap is visible.
 */
export const DOCUMENTED_CURVE_CREATOR_PERCENT = 0.3

/** `[market cap in SOL, exclusive upper bound]` → creator percent on PumpSwap. */
export const CREATOR_FEE_BANDS: readonly (readonly [number, number])[] = [
  [420, 0.3], [1470, 0.95], [2460, 0.9], [3440, 0.85], [4420, 0.8],
  [9820, 0.75], [14740, 0.7], [19650, 0.65], [24560, 0.6], [29470, 0.55],
  [34380, 0.5], [39300, 0.45], [44210, 0.4], [49120, 0.35], [54030, 0.3],
  [58940, 0.275], [63860, 0.25], [68770, 0.225], [73681, 0.2], [78590, 0.175],
  [83500, 0.15], [88400, 0.125], [93330, 0.1], [98240, 0.075],
  [Number.POSITIVE_INFINITY, 0.05],
] as const

export const MAX_CREATOR_PERCENT = 0.95
export const MIN_CREATOR_PERCENT = 0.05

/**
 * The creator's percentage of a trade at a given market cap, in SOL.
 *
 * Throws rather than guessing on a negative or non-finite input: a fee rendered
 * from a market cap nobody could read is a number the page would state as fact.
 */
export function creatorFeePercent(marketCapSol: number): number {
  if (!Number.isFinite(marketCapSol) || marketCapSol < 0) {
    throw new RangeError(`market cap is not a number of SOL: ${marketCapSol}`)
  }
  for (const [upper, percent] of CREATOR_FEE_BANDS) {
    if (marketCapSol < upper) return percent
  }
  // Unreachable: the last band is Infinity. Present so a truncated table fails
  // loudly rather than returning undefined into a rendered percentage.
  throw new Error('the fee table has no band for this market cap')
}

/** What a volume of SOL sends to the hoard at that market cap. */
export function hoardPerVolume(volumeSol: number, marketCapSol: number): number {
  return (volumeSol * creatorFeePercent(marketCapSol)) / 100
}
