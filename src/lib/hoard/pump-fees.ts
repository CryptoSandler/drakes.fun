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
// The shape is the finding: the creator's share **rises** to 0.950% between 420
// and 1,470 SOL of market cap and then **decays to 0.050%** above 98,240. Our
// abandoned Meteora plan was a flat 1.6% at any size. So the hoard earns most
// while the coin is small and least when it is large, and no copy anywhere may
// state a rate as if it were fixed.

/** When this table was read from pump.fun's own documentation. */
export const FEE_TABLE_READ = '2026-09-02'

/** On the bonding curve, before graduation: flat, of a 1.25% total. */
export const CURVE_CREATOR_PERCENT = 0.3

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
