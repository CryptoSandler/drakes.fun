// The event runner: the chain into Postgres, so a list page does not make
// 8,000 RPC calls to render.
//
//   node scripts/index-events.ts --program <id> [--config <addr>] [--full]
//
// Caller: the host that runs the cranker, as a second service
// (`docs/crank-hosting.md`). It is NOT called by the site, and the site reads
// nothing it writes — the front page's figures come straight from the chain
// (DESIGN.md §7). Until that host exists, this is run by hand.
//
// **The cache is a cache.** Everything it holds is already on chain, every row
// is derived, and losing the whole table costs one re-run. Nothing may be
// written here that cannot be rebuilt from `IssuanceSettled`.

import { connect } from '../src/lib/db/client.ts'
import { fetchIssuanceSettled } from '../src/lib/chain/events.ts'
import { encodeBase58 } from '../src/lib/solana/base58.ts'

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const rpcUrl = process.env.RPC_URL
const databaseUrl = process.env.DATABASE_URL
if (rpcUrl === undefined || rpcUrl === '') throw new Error('RPC_URL is not set')
if (databaseUrl === undefined || databaseUrl === '') throw new Error('DATABASE_URL is not set')

const programId = flag('program')
if (programId === undefined) throw new Error('--program <id> is required')
const config = flag('config')
const stream = `${programId}:${config ?? '*'}`

const db = await connect(databaseUrl)
try {
  const cursor = await db.query('select last_signature from indexer_cursor where stream = $1', [stream])
  const until = process.argv.includes('--full')
    ? undefined
    : (cursor.rows[0]?.last_signature as string | undefined)

  const events = await fetchIssuanceSettled({
    rpcUrl,
    programId,
    config,
    until,
    onProgress: (note) => process.stderr.write(`${note}\n`),
  })
  if (events.length === 0) {
    // Nothing new is a real answer here, unlike in the verifier: the cursor
    // means we have already read everything up to it.
    process.stdout.write(`no new settlements since ${until ?? 'the beginning'}\n`)
  }

  for (const event of events) {
    // `hour` is the key because the program seeds the issuance account with it.
    // On conflict the row is refreshed rather than skipped: a re-run after a
    // partial write should converge, and every column is derived from the same
    // event, so nothing can be lost by rewriting it.
    await db.query(
      `insert into issuance_events (
         hour, config, piece_index, minted, piece_id, snapshot_slot, root,
         randomness, randomness_value, reveal_slot, eligible_supply, point,
         balance, recipient, signature, tx_slot
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       on conflict (hour) do update set
         config = excluded.config, piece_index = excluded.piece_index,
         minted = excluded.minted, piece_id = excluded.piece_id,
         snapshot_slot = excluded.snapshot_slot, root = excluded.root,
         randomness = excluded.randomness, randomness_value = excluded.randomness_value,
         reveal_slot = excluded.reveal_slot, eligible_supply = excluded.eligible_supply,
         point = excluded.point, balance = excluded.balance,
         recipient = excluded.recipient, signature = excluded.signature,
         tx_slot = excluded.tx_slot, indexed_at = now()`,
      [
        event.hour.toString(),
        encodeBase58(event.config),
        event.pieceIndex,
        event.minted,
        event.pieceId,
        event.snapshotSlot.toString(),
        Buffer.from(event.root),
        encodeBase58(event.randomness),
        Buffer.from(event.randomnessValue),
        event.revealSlot.toString(),
        event.eligibleSupply.toString(),
        event.point.toString(),
        event.balance.toString(),
        encodeBase58(event.recipient),
        event.signature,
        event.txSlot.toString(),
      ],
    )
  }

  const last = events.at(-1)
  if (last !== undefined) {
    await db.query(
      `insert into indexer_cursor (stream, last_signature, last_hour)
       values ($1, $2, $3)
       on conflict (stream) do update set
         last_signature = excluded.last_signature,
         last_hour = excluded.last_hour,
         updated_at = now()`,
      [stream, last.signature, last.hour.toString()],
    )
  }

  const total = await db.query('select count(*)::int as n, max(hour)::text as top from issuance_events')
  process.stdout.write(
    `indexed ${events.length} new; table holds ${total.rows[0]!.n} rows, latest issuance ${total.rows[0]!.top}\n`,
  )
} finally {
  await db.end()
}
