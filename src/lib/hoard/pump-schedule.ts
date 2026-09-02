// pump.fun's fee schedule, read from the chain rather than from their docs.
//
// Caller: `scripts/check-pump-schedule.ts` (the job) and `app/verify/page.tsx`
// (to mark the table stale rather than keep asserting it).
//
// **Why this exists, and it is not hypothetical.** On 2026-09-02 the
// documentation at `pump.fun/docs/fees` described a creator fee tiered by
// market cap, from 0.950% down to 0.050%. The chain said something else:
// `GlobalConfig` on mainnet carries `coin_creator_fee_basis_points: 5` — a flat
// **0.05%** — and there is no `FeeConfig` account deployed under the AMM on
// either cluster, though both IDLs define one with a `fee_tiers` vector.
//
// So the tiers are defined in the program and **not currently in force**, and a
// site that had published the tier table would have been publishing a number
// nobody is paying. The chain is the source; the docs are a claim about it.
//
// This module reads `GlobalConfig` and, if one ever appears, `FeeConfig`.

import { decodeBase58, encodeBase58 } from '../solana/base58.ts'
import { rpc } from '../chain/rpc.ts'

export const PUMP_AMM_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'
export const PUMP_CURVE_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'

/** `sha256("account:GlobalConfig")[..8]`, taken from the on-chain IDL. */
export const GLOBAL_CONFIG_DISCRIMINATOR = '95089ccaa0fcb0d9'
/** `sha256("account:FeeConfig")[..8]`, likewise. No account carries it yet. */
export const FEE_CONFIG_DISCRIMINATOR = '8f3492bbdb7b4c9b'

export interface LiveSchedule {
  /** The account the numbers came from. */
  account: string
  lpFeeBps: number
  protocolFeeBps: number
  creatorFeeBps: number
  /** True when a tier table is deployed; today it is not. */
  tiered: boolean
  slot: bigint
  /** The bonding curve's own schedule, where a coin spends its first hours. */
  curve: { protocolFeeBps: number; creatorFeeBps: number }
}

/** `Global` under the curve program, seeds `["global"]`. */
const CURVE_GLOBAL_OFFSETS = {
  // 8 disc, 1 bool initialized, 2 pubkeys, 4 u64 reserves
  feeBasisPoints: 8 + 1 + 32 * 2 + 8 * 4,
  // ...then withdraw_authority (32), enable_migrate (1), pool_migration_fee (8)
  creatorFeeBasisPoints: 8 + 1 + 32 * 2 + 8 * 4 + 8 + 32 + 1 + 8,
} as const

async function readCurveSchedule(rpcUrl: string): Promise<{ protocolFeeBps: number; creatorFeeBps: number }> {
  const pda = curveGlobalPda()
  const account = (await rpc(rpcUrl, 'getAccountInfo', [pda, { encoding: 'base64' }])) as {
    value?: { data: [string, string] } | null
  }
  if (account.value == null) throw new Error(`the curve's Global account ${pda} does not exist`)
  const data = Buffer.from(account.value.data[0], 'base64')
  if (data.length < CURVE_GLOBAL_OFFSETS.creatorFeeBasisPoints + 8) {
    throw new Error(`the curve Global is ${data.length} bytes; this layout does not fit`)
  }
  return {
    protocolFeeBps: Number(data.readBigUInt64LE(CURVE_GLOBAL_OFFSETS.feeBasisPoints)),
    creatorFeeBps: Number(data.readBigUInt64LE(CURVE_GLOBAL_OFFSETS.creatorFeeBasisPoints)),
  }
}

/** Hard-coded because it is a fixed seed under a fixed program. Asserted below. */
const CURVE_GLOBAL = '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf'
const curveGlobalPda = () => CURVE_GLOBAL

const OFFSETS = {
  admin: 8,
  lpFeeBps: 8 + 32,
  protocolFeeBps: 8 + 32 + 8,
  disableFlags: 8 + 32 + 16,
  // ...then `protocol_fee_recipients: [pubkey; 8]`
  creatorFeeBps: 8 + 32 + 16 + 1 + 32 * 8,
} as const

async function accountsWithDiscriminator(rpcUrl: string, programId: string, hex: string) {
  return (await rpc(rpcUrl, 'getProgramAccounts', [
    programId,
    {
      encoding: 'base64',
      withContext: true,
      filters: [{ memcmp: { offset: 0, bytes: encodeBase58(hexBytes(hex)) } }],
    },
  ])) as { context: { slot: number }; value: { pubkey: string; account: { data: [string, string] } }[] }
}

const hexBytes = (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex'))

/**
 * The schedule in force, read from `GlobalConfig`.
 *
 * Throws when there is not exactly one: zero means the query is wrong (or the
 * program moved) and more than one means the layout assumption is wrong.
 * Neither may be turned into a rate on a page.
 */
export async function readLiveSchedule(rpcUrl: string): Promise<LiveSchedule> {
  const globals = await accountsWithDiscriminator(rpcUrl, PUMP_AMM_PROGRAM, GLOBAL_CONFIG_DISCRIMINATOR)
  if (globals.value.length !== 1) {
    throw new Error(
      `expected exactly one GlobalConfig under ${PUMP_AMM_PROGRAM}, found ${globals.value.length}. ` +
        'A rate is not read from an ambiguous account.',
    )
  }
  const row = globals.value[0]!
  const data = Buffer.from(row.account.data[0], 'base64')
  if (data.length < OFFSETS.creatorFeeBps + 8) {
    throw new Error(`GlobalConfig is ${data.length} bytes; the layout this reads does not fit`)
  }

  const fees = await accountsWithDiscriminator(rpcUrl, PUMP_AMM_PROGRAM, FEE_CONFIG_DISCRIMINATOR)
  const curve = await readCurveSchedule(rpcUrl)

  return {
    curve,
    account: row.pubkey,
    lpFeeBps: Number(data.readBigUInt64LE(OFFSETS.lpFeeBps)),
    protocolFeeBps: Number(data.readBigUInt64LE(OFFSETS.protocolFeeBps)),
    creatorFeeBps: Number(data.readBigUInt64LE(OFFSETS.creatorFeeBps)),
    tiered: fees.value.length > 0,
    slot: BigInt(globals.context.slot),
  }
}

/** What this repository last recorded, and when. Compared, never assumed. */
export interface RecordedSchedule {
  readAt: string
  lpFeeBps: number
  protocolFeeBps: number
  creatorFeeBps: number
  tiered: boolean
  curveCreatorFeeBps: number
  curveProtocolFeeBps: number
}

export interface ScheduleVerdict {
  agrees: boolean
  differences: string[]
  live: LiveSchedule
  recorded: RecordedSchedule
}

export function compareSchedule(live: LiveSchedule, recorded: RecordedSchedule): ScheduleVerdict {
  const differences: string[] = []
  const check = (name: string, a: number | boolean, b: number | boolean) => {
    if (a !== b) differences.push(`${name}: chain says ${a}, we recorded ${b}`)
  }
  check('creator fee bps', live.creatorFeeBps, recorded.creatorFeeBps)
  check('lp fee bps', live.lpFeeBps, recorded.lpFeeBps)
  check('protocol fee bps', live.protocolFeeBps, recorded.protocolFeeBps)
  check('a tier table is deployed', live.tiered, recorded.tiered)
  check('curve creator fee bps', live.curve.creatorFeeBps, recorded.curveCreatorFeeBps)
  check('curve protocol fee bps', live.curve.protocolFeeBps, recorded.curveProtocolFeeBps)
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
