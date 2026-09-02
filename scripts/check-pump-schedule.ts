// Is pump.fun's fee schedule still what we recorded?
//
//   node scripts/check-pump-schedule.ts [--alert]
//
// Caller: a scheduled job, and the operator before any copy change that quotes
// a rate. Nothing in the site calls it.
//
// **The schedule is a config in somebody else's program.** Meteora's static
// config is immutable; this is not. A number this project published on
// 2026-09-02 can be false on 2026-09-03 with nothing in our repository
// changing, and the only thing that would notice is this.
//
// It reads the chain, never the documentation — on 2026-09-02 the two
// disagreed: the docs described tiers from 0.950% to 0.050% and `GlobalConfig`
// carried a flat 5 bps.

import { readLiveSchedule, compareSchedule, assertAddresses } from '../src/lib/hoard/pump-schedule.ts'
import { RECORDED_SCHEDULE } from '../src/lib/hoard/pump-fees.ts'
import { clusterName } from '../src/lib/snapshot/rpc.ts'
import { connect } from '../src/lib/db/client.ts'
import { consoleSink, fallbackSink, ntfySink } from '../src/lib/crank/alert.ts'

const rpcUrl = process.env.MAINNET_RPC_URL ?? process.env.RPC_URL
if (rpcUrl === undefined || rpcUrl === '') throw new Error('no RPC URL')

assertAddresses()

// The schedule that matters is mainnet's. Reading devnet's and reporting it as
// the rate people pay would be the same class of error as reading the docs.
const cluster = await clusterName(rpcUrl)
if (cluster !== 'mainnet') {
  throw new Error(`this reads the schedule people actually pay; the RPC is ${cluster}`)
}

const live = await readLiveSchedule(rpcUrl)
const verdict = compareSchedule(live, { ...RECORDED_SCHEDULE })
const curve = live.curve[0]
const creators = live.swap.map((t) => t.creatorBps)

process.stdout.write(
  `FeeConfig ${live.account} (owned by the fee program) at slot ${live.slot}\n` +
    `  bonding curve: creator ${curve?.creatorBps} bps · protocol ${curve?.protocolBps} bps\n` +
    `  PumpSwap: ${live.swap.length} tiers, creator ${Math.min(...creators)}–${Math.max(...creators)} bps\n` +
    `  recorded ${RECORDED_SCHEDULE.readAt}: curve ${RECORDED_SCHEDULE.curveCreatorBps} bps, ` +
    `${RECORDED_SCHEDULE.swapTierCount} tiers\n\n`,
)

// Recorded whether it agrees or not: `/verify` needs the DATE of the last
// confirmation as much as the verdict, or a stale figure reads as a fresh one.
const dbUrl = process.env.DATABASE_URL
if (dbUrl !== undefined && dbUrl !== '') {
  const db = await connect(dbUrl)
  try {
    await db.query(
      `insert into schedule_checks (cluster, source_account, slot, lp_fee_bps, protocol_fee_bps,
         creator_fee_bps, tiered, recorded_creator_fee_bps, agrees, differences)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [cluster, live.account, live.slot.toString(), curve?.lpBps ?? 0, curve?.protocolBps ?? 0,
       curve?.creatorBps ?? 0, live.swap.length > 1, RECORDED_SCHEDULE.curveCreatorBps,
       verdict.agrees, verdict.differences.join('; ')],
    )
  } finally {
    await db.end()
  }
} else {
  process.stderr.write('DATABASE_URL is not set, so /verify will not learn this ran\n')
}

if (verdict.agrees) {
  process.stdout.write('the chain still says what we recorded\n')
  process.exit(0)
}

for (const line of verdict.differences) process.stdout.write(`  CHANGED: ${line}\n`)

if (process.argv.includes('--alert')) {
  // The existing sink, unchanged: ntfy when a topic is configured, and the
  // console ALWAYS last, so a missing or rejected topic degrades to a printed
  // alert rather than to silence.
  const topic = process.env.NTFY_TOPIC
  const sinks = []
  if (topic !== undefined && topic !== '') {
    try {
      sinks.push(ntfySink({ topic }))
    } catch (error) {
      // A bad topic is reported, never echoed: it is a secret either way.
      process.stderr.write(`NTFY_TOPIC rejected: ${(error as Error).message}\n`)
    }
  }
  sinks.push(consoleSink())
  const sink = fallbackSink(sinks)
  await sink({
    title: 'pump.fun changed its fee schedule',
    lines: [
      ...verdict.differences,
      `the site quotes ${RECORDED_SCHEDULE.curveCreatorBps} bps on the curve, recorded ${RECORDED_SCHEDULE.readAt}`,
      'update RECORDED_SCHEDULE in src/lib/hoard/pump-fees.ts and the copy',
    ],
  })
}

// Non-zero so a scheduler treats a changed schedule as a failure to look at,
// not as a run that happened to print something.
process.exit(4)
