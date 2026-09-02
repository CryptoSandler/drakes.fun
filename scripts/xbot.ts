// The X bot, as the thing a host actually runs.
//
//   node scripts/xbot.ts --rig rigs/devnet-rehearsal.json [--limit 24]
//                        [--from <hour>] [--out posts.jsonl] [--dry-run]
//                        [--cursor <path.json>] [--manifest <path>]
//
// Caller: the crank host, hourly. `docs/crank-hosting.md` carries it in the
// table of scheduled jobs beside the two that were already there. It is
// deliberately NOT part of `scripts/crank-loop.ts`: a poster that shares a
// process with the cranker is a poster whose backoff can eat an issuance
// window, and the window is the one thing the protocol cannot get back.
//
// Everything it prints is one JSON object per line on stdout, like the cranker.
//
// **It publishes to X only when four credentials are set and `--dry-run` is
// not.** Otherwise it writes the identical text to a file or to stdout. That is
// not a stub: it is the same text, in the same order, through the same cursor.

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fetchIssuanceByHour, NOTHING_ISSUED } from '../src/lib/chain/issuance.ts'
import { buildPost } from '../src/lib/bot/post.ts'
import { consoleSink, fileSink, xSink, type Sink } from '../src/lib/bot/sink.ts'
import { runPass, type Cursor, type Scan, type Settled } from '../src/lib/bot/run.ts'
import { connect } from '../src/lib/db/client.ts'
import { clusterName } from '../src/lib/snapshot/rpc.ts'
import { rpc } from '../src/lib/chain/rpc.ts'

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const has = (name: string): boolean => process.argv.includes(`--${name}`)

const emit = (row: Record<string, unknown>): void => {
  process.stdout.write(`${JSON.stringify({ t: new Date().toISOString(), ...row })}\n`)
}

const die = (message: string): never => {
  emit({ level: 'error', msg: message })
  process.exit(1)
}

// --- what we are pointed at -------------------------------------------------

interface Rig { program: string; config: string; expectCluster?: string }

const rigPath = flag('rig')
const rig: Partial<Rig> = rigPath === undefined ? {} : (JSON.parse(readFileSync(rigPath, 'utf8')) as Rig)
const rpcUrl = process.env.RPC_URL ?? ''
const programId = rig.program ?? process.env.ISSUANCE_PROGRAM ?? ''
const configAddress = rig.config ?? process.env.ISSUANCE_CONFIG ?? ''
const siteUrl = (process.env.SITE_URL ?? 'https://drakes.fun').replace(/\/$/, '')

if (rpcUrl === '') die('RPC_URL is not set')
if (programId === '') die('no program: pass --rig or set ISSUANCE_PROGRAM')
if (configAddress === '') die('no config: pass --rig or set ISSUANCE_CONFIG')

// --- the config account, which is where the schedule lives (D15) ------------

// `Config`: 8 discriminator, bump, five Pubkeys, genesis, period, size, issued,
// live, then `excluded: Vec<Pubkey>` and the manifest hash behind it. The
// vector is why the hash's offset is computed and not a constant. Checked
// against the devnet config on 2026-09-02: genesis 1788281174, period 60.
const CONFIG_GENESIS = 8 + 1 + 32 * 5
const CONFIG_PERIOD = CONFIG_GENESIS + 8
const CONFIG_SIZE = CONFIG_PERIOD + 8
const CONFIG_EXCLUDED_LEN = CONFIG_SIZE + 4 + 4 + 4

interface ChainConfig { genesisUnix: number; periodSeconds: number; manifestHash: string }

async function readChainConfig(): Promise<ChainConfig> {
  const account = (await rpc(rpcUrl, 'getAccountInfo', [configAddress, { encoding: 'base64' }])) as
    { value?: { data: [string, string] } | null }
  if (account.value == null) die(`no config account at ${configAddress} on this cluster`)
  const data = Buffer.from(account.value!.data[0], 'base64')
  const excluded = data.readUInt32LE(CONFIG_EXCLUDED_LEN)
  const at = CONFIG_EXCLUDED_LEN + 4 + excluded * 32
  const config = {
    genesisUnix: Number(data.readBigInt64LE(CONFIG_GENESIS)),
    periodSeconds: Number(data.readBigInt64LE(CONFIG_PERIOD)),
    manifestHash: data.subarray(at, at + 32).toString('hex'),
  }
  // Positive assertions: a zero period divides by zero below, and a zero
  // genesis puts every hour in the past.
  if (config.periodSeconds <= 0) die('the config carries no period')
  if (config.genesisUnix <= 0) die('the config carries no genesis instant')
  return config
}

// --- the tier gate ----------------------------------------------------------

/**
 * Tiers, but only if the manifest we hold is the manifest the chain committed.
 *
 * `placeholderTier` is a stand-in for designing the gallery; publishing it as a
 * piece's rarity would assert something a reader can check and find false
 * (D13). So the gate is the hash `initialize` wrote, against the sha256 of the
 * file we are about to read tiers from, and a mismatch means silence.
 */
function tierTable(manifestHash: string): ((pieceId: number) => string | null) | null {
  const path = flag('manifest')
  if (path === undefined) return null
  const raw = readFileSync(path, 'utf8')
  const ours = createHash('sha256').update(raw).digest('hex')
  if (ours !== manifestHash) {
    emit({
      level: 'warn',
      msg: 'the manifest does not match the hash the chain committed; posts will carry no tier',
      chain: manifestHash, file: ours,
    })
    return null
  }
  const manifest = JSON.parse(raw) as { pieces: { id: number; tier: string }[] }
  const byId = new Map(manifest.pieces.map((p) => [p.id, p.tier]))
  emit({ level: 'info', msg: 'manifest verified against the chain; posts carry tiers', hash: ours })
  return (pieceId) => byId.get(pieceId) ?? null
}

// --- the cursor -------------------------------------------------------------

/**
 * Postgres when there is a database, a file when there is not.
 *
 * The table is `indexer_cursor`, which already exists and is keyed by an
 * arbitrary stream name — the event indexer is one consumer of this program's
 * history and the bot is another. `last_signature` is not meaningful for a
 * consumer that works in hours, and the column is `not null`, so it carries the
 * permalink the post pointed at: honest about what it is, and useful when
 * somebody is looking at the row wondering what published.
 */
function postgresCursor(url: string, stream: string): Cursor {
  return {
    read: async () => {
      const db = await connect(url)
      try {
        const { rows } = await db.query('select last_hour from indexer_cursor where stream = $1', [stream])
        const row = rows[0] as { last_hour: string } | undefined
        return row === undefined ? null : BigInt(row.last_hour)
      } finally {
        await db.end()
      }
    },
    write: async (hour) => {
      const db = await connect(url)
      try {
        await db.query(
          `insert into indexer_cursor (stream, last_signature, last_hour, updated_at)
           values ($1, $2, $3, now())
           on conflict (stream) do update set last_signature = excluded.last_signature,
             last_hour = excluded.last_hour, updated_at = now()`,
          [stream, `${siteUrl}/verify/${hour}`, hour.toString()],
        )
      } finally {
        await db.end()
      }
    },
  }
}

function fileCursor(path: string): Cursor {
  return {
    read: async () => {
      try {
        const { hour } = JSON.parse(readFileSync(path, 'utf8')) as { hour: string }
        return BigInt(hour)
      } catch {
        return null
      }
    },
    write: async (hour) => writeFileSync(path, `${JSON.stringify({ hour: hour.toString() })}\n`),
  }
}

// --- the sink ---------------------------------------------------------------

function chooseSink(): Sink {
  const out = flag('out')
  const credentials = {
    consumerKey: process.env.X_API_KEY ?? '',
    consumerSecret: process.env.X_API_SECRET ?? '',
    token: process.env.X_ACCESS_TOKEN ?? '',
    tokenSecret: process.env.X_ACCESS_SECRET ?? '',
  }
  const complete = Object.values(credentials).every((v) => v !== '')
  if (has('dry-run') || !complete) {
    if (complete) emit({ level: 'info', msg: '--dry-run: X credentials are set and will not be used' })
    else emit({ level: 'info', msg: 'no X credentials; publishing to the local sink' })
    return out === undefined ? consoleSink() : fileSink(out)
  }
  return xSink(credentials)
}

// --- the run ----------------------------------------------------------------

const chain = await readChainConfig()
const cluster = await clusterName(rpcUrl)
// CLAUDE.md: classify to a cluster name, and refuse when it cannot be
// classified. A post that cannot say which chain it is about is worse than no
// post, because the marker is what stops a rehearsal reading as a launch.
if (cluster === 'unknown') die('cannot classify the cluster from its genesis hash; refusing to post')
if (rig.expectCluster !== undefined && rig.expectCluster !== cluster) {
  die(`the rig expects ${rig.expectCluster} and this RPC is ${cluster}`)
}

const limit = Number(flag('limit') ?? 24)
const tier = tierTable(chain.manifestHash)
const nowUnix = Math.floor(Date.now() / 1000)
// Only closed hours. The hour in progress has not settled yet, and posting
// "issued nothing" about an hour that is still open would be a lie with a
// deadline on it.
const currentHour = BigInt(Math.floor((nowUnix - chain.genesisUnix) / chain.periodSeconds))

/**
 * Every closed hour after the cursor, in order, up to `limit` posts.
 *
 * Hour by hour rather than by walking the program's signatures, because the
 * hour IS the address: it seeds the account. So a gap costs one cheap lookup
 * that returns nothing, and the walk cannot silently start in the middle the
 * way a "most recent N" read does.
 */
async function fetchAfter(after: bigint | null, want: number): Promise<Scan> {
  if (after === null) {
    // Priming: the newest closed hour that exists, looking back far enough to
    // cross an outage but not the whole history.
    for (let hour = currentHour - 1n; hour >= 0n && hour > currentHour - 500n; hour -= 1n) {
      const account = await fetchIssuanceByHour({ rpcUrl, programId, hour })
      if (account !== null) return { pending: [], scannedThrough: hour }
    }
    return { pending: [], scannedThrough: null }
  }

  const pending: Settled[] = []
  let scannedThrough: bigint | null = null
  // The scan is bounded twice: by the posts we want, and by how many hours we
  // are willing to look at in one pass. Without the second bound a bot primed
  // at hour 0 against a full collection would make 4,000 RPC calls.
  const ceiling = after + BigInt(Math.max(want * 4, 200))
  for (let hour = after + 1n; hour < currentHour && hour <= ceiling; hour += 1n) {
    if (pending.length >= want) break
    const account = await fetchIssuanceByHour({ rpcUrl, programId, hour })
    scannedThrough = hour
    if (account === null) continue
    const issued = account.settled && account.pieceId !== NOTHING_ISSUED
    pending.push({
      hour,
      post: buildPost(
        {
          hour,
          issued,
          pieceId: account.pieceId,
          recipient: account.recipient,
          snapshotSlot: account.snapshotSlot,
          settled: account.settled,
        },
        { cluster, siteUrl, tier: issued && tier !== null ? tier(account.pieceId) : null },
      ),
    })
  }
  return { pending, scannedThrough }
}

const cursorPath = flag('cursor')
const databaseUrl = process.env.DATABASE_URL
const cursor =
  cursorPath !== undefined
    ? fileCursor(cursorPath)
    : databaseUrl !== undefined && databaseUrl !== ''
      ? postgresCursor(databaseUrl, `xbot:${programId}:${configAddress}`)
      : die('no cursor: set DATABASE_URL or pass --cursor <path.json>')

const from = flag('from')
if (from !== undefined) {
  // A deliberate backfill. It is a flag and not a default because the default
  // would be "post the entire history" on a fresh database.
  await cursor.write(BigInt(from) - 1n)
  emit({ level: 'info', msg: `backfilling from hour ${from}` })
}

const sink = chooseSink()
emit({
  level: 'info', msg: 'starting', cluster, program: programId, sink: sink.name,
  currentHour: currentHour.toString(), limit,
})

const report = await runPass({
  fetchAfter,
  sink,
  cursor,
  limit,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onPost: ({ post, published, repeat }) =>
    emit({ level: 'info', msg: repeat ? 'already posted' : 'posted', hour: post.hour.toString(), kind: post.kind, id: published.id, url: post.url }),
  onNote: (note) => emit({ level: 'info', msg: note }),
})

emit({ level: report.stop === 'failed' ? 'error' : 'info', msg: 'done', ...report, cursor: report.cursor?.toString() ?? null })
// A failure has to reach the host's own restart and alerting, so it exits
// non-zero. A rate limit does not: the pass ends where it ends and the next one
// resumes, which is the designed behaviour and not an incident.
if (report.stop === 'failed') process.exit(3)
