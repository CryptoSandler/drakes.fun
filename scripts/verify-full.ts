// The full replay, as a job.
//
//   node scripts/verify-full.ts --program <id> [--config <addr>] [--no-write]
//
// Caller: a scheduled service on the same host as the cranker
// (`docs/crank-hosting.md`), and a human before a launch. `/verify` renders the
// most recent row and stamps it with the date it was written.
//
// It reads the chain and nothing else -- no Postgres, no artifact of ours. The
// row it writes afterwards is a record of this run, and the page says so. The
// same replay runs from a clone with `scripts/snapshot.ts pieces`, which is the
// command the page prints next to the result.

import { fetchIssuanceSettled } from '../src/lib/chain/events.ts'
import { replayFromChain } from '../src/lib/snapshot/reconcile.ts'
import { clusterName } from '../src/lib/snapshot/rpc.ts'
import { connect } from '../src/lib/db/client.ts'

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const rpcUrl = process.env.RPC_URL
if (rpcUrl === undefined || rpcUrl === '') throw new Error('RPC_URL is not set')
const programId = flag('program')
if (programId === undefined) throw new Error('--program <id> is required')
const config = flag('config')
const size = Number(flag('size') ?? 4000)

const cluster = await clusterName(rpcUrl)
if (cluster === 'unknown') throw new Error('the cluster could not be classified; refusing')

const started = Date.now()
const events = await fetchIssuanceSettled({
  rpcUrl,
  programId,
  config,
  onProgress: (note) => process.stderr.write(`${note}\n`),
})
// A verification that returns nothing needs a control (CLAUDE.md): zero events
// reads exactly like a clean result and is far more often a wrong program id.
if (events.length === 0) throw new Error('the chain returned no settlements; that is a broken query')

const replay = replayFromChain(events, size)
const minted = replay.rows.filter((r) => r.minted)
const result = {
  ok: replay.disagreements.length === 0,
  settled: events.length,
  minted: minted.length,
  distinct: new Set(minted.map((r) => r.replayed)).size,
  agreed: minted.length - replay.disagreements.length,
  remaining: replay.remaining,
  size,
  lastSignature: events.at(-1)?.signature ?? null,
  tookMs: Date.now() - started,
}
process.stdout.write(`${JSON.stringify(result, null, 1)}\n`)

if (process.argv.includes('--no-write')) process.exit(result.ok ? 0 : 1)

const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined || databaseUrl === '') throw new Error('DATABASE_URL is not set')
const db = await connect(databaseUrl)
try {
  await db.query(
    `insert into verification_runs
       (program, config, cluster, ok, settled, minted, distinct_pieces, agreed,
        remaining, collection_size, disagreements, last_signature, took_ms)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)`,
    [
      programId,
      config ?? null,
      cluster,
      result.ok,
      result.settled,
      result.minted,
      result.distinct,
      result.agreed,
      result.remaining,
      size,
      JSON.stringify(
        replay.disagreements.map((r) => ({ hour: Number(r.hour), program: r.emitted, replay: r.replayed })),
      ),
      result.lastSignature,
      result.tookMs,
    ],
  )
  process.stdout.write('recorded\n')
} finally {
  await db.end()
}
if (!result.ok) process.exit(1)
