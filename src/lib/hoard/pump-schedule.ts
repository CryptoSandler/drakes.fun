// pump.fun's fee schedule, read from the chain rather than from their docs.
//
// Caller: `scripts/check-pump-schedule.ts` (the job) and `app/verify/page.tsx`
// (to mark the table stale rather than keep asserting it).
//
// **Why this exists, and it caught me before it caught pump.fun.**
//
// The fee schedule is a config in somebody else's program, so a number this
// project publishes can be false tomorrow with nothing here changing. Building
// this guard is also what exposed my own error: I scanned for the `FeeConfig`
// discriminator under the pump and PumpSwap programs — both of which DECLARE
// the account in their IDL — found none, and reported the fee as a flat 5 bps
// from `GlobalConfig`. The account is **owned by a third program**,
// `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ`, and the only thing that said
// so was a failed `buy`: `AccountOwnedByWrongProgram ... Right: pfeeUxB6...`.
//
// **An IDL says what an account looks like. It never says who owns it.**
//
// Read 2026-09-02 from the real account: the bonding curve pays the creator
// **30 bps**, and PumpSwap carries **25 tiers** from 30 bps at zero market cap
// up to 95 bps between 420 and 1,470 SOL and down to 5 bps at the top —
// which is what pump.fun's documentation said all along.

import { decodeBase58 } from '../solana/base58.ts'
import { rpc } from '../chain/rpc.ts'

export const PUMP_AMM_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'
export const PUMP_CURVE_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'

/** `sha256("account:GlobalConfig")[..8]`, taken from the on-chain IDL. */
export const GLOBAL_CONFIG_DISCRIMINATOR = '95089ccaa0fcb0d9'
/** `sha256("account:FeeConfig")[..8]`, likewise. No account carries it yet. */
export const FEE_CONFIG_DISCRIMINATOR = '8f3492bbdb7b4c9b'

export const FEE_PROGRAM = 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ'

export interface FeeTier {
  /** Market cap in lamports at which this tier starts. */
  thresholdLamports: bigint
  lpBps: number
  protocolBps: number
  creatorBps: number
}

export interface LiveSchedule {
  /** The `FeeConfig` account the numbers came from, under the FEE program. */
  account: string
  /** The bonding curve's schedule: one tier in practice. */
  curve: FeeTier[]
  /** PumpSwap's, after graduation. */
  swap: FeeTier[]
  slot: bigint
}

function readTiers(data: Buffer): { flat: FeeTier; tiers: FeeTier[] } {
  // 8 discriminator, 1 bump, 32 admin, then `flat_fees` and the vectors.
  let o = 8 + 1 + 32
  const fees = (): FeeTier => {
    const t: FeeTier = {
      thresholdLamports: 0n,
      lpBps: Number(data.readBigUInt64LE(o)),
      protocolBps: Number(data.readBigUInt64LE(o + 8)),
      creatorBps: Number(data.readBigUInt64LE(o + 16)),
    }
    o += 24
    return t
  }
  const flat = fees()
  const count = data.readUInt32LE(o)
  o += 4
  const tiers: FeeTier[] = []
  for (let i = 0; i < count; i += 1) {
    const threshold = data.readBigUInt64LE(o)
    o += 16 // u128
    const t = fees()
    t.thresholdLamports = threshold
    tiers.push(t)
  }
  return { flat, tiers }
}

export async function readLiveSchedule(rpcUrl: string): Promise<LiveSchedule> {
  const { PublicKey } = (await import('@solana/web3.js')) as typeof import('@solana/web3.js')
  const pda = (owner: string) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from('fee_config'), new PublicKey(owner).toBytes()],
      new PublicKey(FEE_PROGRAM),
    )[0].toBase58()

  const read = async (owner: string) => {
    const address = pda(owner)
    const account = (await rpc(rpcUrl, 'getAccountInfo', [address, { encoding: 'base64' }])) as {
      context?: { slot: number }
      value?: { owner: string; data: [string, string] } | null
    }
    if (account.value == null) throw new Error(`no FeeConfig at ${address} for ${owner}`)
    if (account.value.owner !== FEE_PROGRAM) {
      throw new Error(`${address} is owned by ${account.value.owner}, not the fee program`)
    }
    return {
      address,
      slot: BigInt(account.context?.slot ?? 0),
      ...readTiers(Buffer.from(account.value.data[0], 'base64')),
    }
  }

  const curve = await read(PUMP_CURVE_PROGRAM)
  const swap = await read(PUMP_AMM_PROGRAM)
  return {
    account: swap.address,
    curve: curve.tiers,
    swap: swap.tiers,
    slot: swap.slot,
  }
}

/** The creator's basis points at a market cap, from the live tiers. */
export function creatorBpsAt(tiers: FeeTier[], marketCapLamports: bigint): number {
  let chosen = tiers[0]
  for (const tier of tiers) if (marketCapLamports >= tier.thresholdLamports) chosen = tier
  if (chosen === undefined) throw new Error('the fee config carries no tier')
  return chosen.creatorBps
}

export interface RecordedSchedule {
  readAt: string
  curveCreatorBps: number
  curveProtocolBps: number
  /** The number of tiers PumpSwap carries, and the ends of the range. */
  swapTierCount: number
  swapCreatorBpsAtZero: number
  swapCreatorBpsMax: number
  swapCreatorBpsMin: number
}

export interface ScheduleVerdict {
  agrees: boolean
  differences: string[]
  live: LiveSchedule
  recorded: RecordedSchedule
}

export function compareSchedule(live: LiveSchedule, recorded: RecordedSchedule): ScheduleVerdict {
  const differences: string[] = []
  const check = (name: string, a: number, b: number) => {
    if (a !== b) differences.push(`${name}: chain says ${a}, we recorded ${b}`)
  }
  const curve = live.curve[0]
  if (curve === undefined) differences.push('the curve fee config carries no tier at all')
  else {
    check('curve creator bps', curve.creatorBps, recorded.curveCreatorBps)
    check('curve protocol bps', curve.protocolBps, recorded.curveProtocolBps)
  }
  check('PumpSwap tier count', live.swap.length, recorded.swapTierCount)
  const creators = live.swap.map((t) => t.creatorBps)
  check('PumpSwap creator bps at zero', creators[0] ?? -1, recorded.swapCreatorBpsAtZero)
  check('PumpSwap creator bps, highest', Math.max(...creators), recorded.swapCreatorBpsMax)
  check('PumpSwap creator bps, lowest', Math.min(...creators), recorded.swapCreatorBpsMin)
  return { agrees: differences.length === 0, differences, live, recorded }
}

/** A guard against a wrong program id silently returning nothing. */
export function assertAddresses(): void {
  for (const [label, value] of [
    ['PUMP_AMM_PROGRAM', PUMP_AMM_PROGRAM],
    ['PUMP_CURVE_PROGRAM', PUMP_CURVE_PROGRAM],
  ] as const) {
    if (decodeBase58(value).length !== 32) throw new RangeError(`${label} is not an address`)
  }
}
