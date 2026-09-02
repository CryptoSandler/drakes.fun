// /verify — two checks, and the page is explicit about which is which.
//
// Caller: Next's router.
//
// **The live one is complete for what it claims.** `point` is a pure function of
// the revealed value and the eligible supply, both carried by the event, so the
// last 24 hours are checkable in a second with no history — and the check can
// genuinely fail.
//
// **The permutation cannot be checked from a window**, because which piece an
// hour issued depends on every take before it. That is the full replay: a job
// that runs against the chain and publishes a dated result, and the same command
// in a clone. The row below is a RECORD OF A JOB WE RAN and is labelled as one;
// the chain stays the evidence.

import { ThemeSwitch } from '../../src/components/ThemeSwitch.tsx'
import { missingConfig, readConfig } from '../../src/lib/site/config.ts'
import { clusterName } from '../../src/lib/snapshot/rpc.ts'
import { provenanceLabel } from '../../src/lib/site/provenance.ts'
import { RECORDED_SCHEDULE } from '../../src/lib/hoard/pump-fees.ts'
import { connect } from '../../src/lib/db/client.ts'
import { LiveWindow } from '../../src/components/LiveWindow.tsx'

export const dynamic = 'force-dynamic'

interface Purchase {
  signature: string
  vault: string
  sol_spent: string
  pump_received: string
  slot: string
  block_time: string | null
  /** Typed `unknown` on purpose: the database is what it is, not what the
   *  migration intended. `provenanceLabel` is the only thing that reads it. */
  funded_by: unknown
}

interface Run {
  ok: boolean
  settled: number
  minted: number
  distinct_pieces: number
  agreed: number
  remaining: number
  collection_size: number
  cluster: string
  took_ms: number
  ran_at: string
  last_signature: string | null
}

async function purchases(): Promise<Purchase[]> {
  const url = process.env.DATABASE_URL
  if (url === undefined || url === '') return []
  try {
    const db = await connect(url)
    try {
      const { rows } = await db.query('select * from hoard_purchases order by slot desc limit 20', [])
      return rows as unknown as Purchase[]
    } finally {
      await db.end()
    }
  } catch {
    return []
  }
}

interface ScheduleCheck {
  creator_fee_bps: number
  lp_fee_bps: number
  protocol_fee_bps: number
  tiered: boolean
  agrees: boolean
  differences: string
  slot: string
  ran_at: string
}

/** The last time the fee schedule was compared against the chain. */
async function lastScheduleCheck(): Promise<ScheduleCheck | null> {
  const url = process.env.DATABASE_URL
  if (url === undefined || url === '') return null
  try {
    const db = await connect(url)
    try {
      const { rows } = await db.query(
        "select * from schedule_checks where cluster = 'mainnet' order by ran_at desc limit 1", [],
      )
      return (rows[0] as unknown as ScheduleCheck) ?? null
    } finally {
      await db.end()
    }
  } catch {
    return null
  }
}

async function lastRun(): Promise<Run | null> {
  const url = process.env.DATABASE_URL
  if (url === undefined || url === '') return null
  try {
    const db = await connect(url)
    try {
      const { rows } = await db.query(
        'select * from verification_runs order by ran_at desc limit 1',
        [],
      )
      return (rows[0] as unknown as Run) ?? null
    } finally {
      await db.end()
    }
  } catch {
    // A page that cannot reach the cache still renders the live check, which is
    // the half that matters. The cache being down must not take the chain read
    // down with it.
    return null
  }
}

export default async function Verify() {
  if (missingConfig().length > 0) {
    return (
      <main className="sheet">
        <div className="colophon">
          <p className="lede">This deployment is not pointed at a chain.</p>
          <p>There is nothing to replay against, so this page is showing nothing.</p>
        </div>
      </main>
    )
  }
  const config = readConfig()
  // Classified server-side from the genesis hash, never from the URL. This
  // page tells a reader that figures are checkable; which chain they are
  // checkable on is part of that sentence, not a footnote to it.
  const [cluster, run, bought, schedule] = await Promise.all([
    clusterName(config.rpcUrl), lastRun(), purchases(), lastScheduleCheck(),
  ])
  // A confirmation has an age. Older than a week and the figure is printed as
  // unconfirmed rather than as fact — the schedule is a config in pump.fun's
  // program and nothing in this repository changes when they move it.
  const checkedAt = schedule === null ? null : new Date(schedule.ran_at)
  const staleAfterDays = 7
  const scheduleStale =
    schedule === null ||
    !schedule.agrees ||
    Date.now() - new Date(schedule.ran_at).getTime() > staleAfterDays * 86_400_000

  return (
    <>
      <header className="sheet masthead">
        <div className="masthead__top">
          <b>
            <a href="/">Drakes</a>
          </b>
          <span className={`chip${cluster === 'mainnet' ? '' : ' chip--rehearsal'}`}>
            {cluster === 'mainnet' ? 'verify' : cluster}
          </span>
          <span className="masthead__end">
            <a href="/">Plate</a>
            <ThemeSwitch />
          </span>
        </div>
        <div className="dateline">
          <div className="dateline__clockwrap">
            <p className="dateline__label">Recomputable, not trustless</p>
            <p className="dateline__clock" style={{ fontSize: 'var(--text-2xl)' }}>
              Check it yourself
            </p>
          </div>
          {cluster !== 'mainnet' && (
            <p className="note foot rehearsal" style={{ marginBottom: 0 }}>
              <strong style={{ color: 'var(--color-ink)' }}>
                Everything below is a rehearsal on {cluster}.
              </strong>{' '}
              Mainnet has not started. The replay is real and so is the chain it reads — it is not
              the chain that carries value.
            </p>
          )}
        </div>
      </header>

      <main className="sheet">
        <section className="entry">
          <div className="entry__grid">
            <p className="dateline__label" style={{ margin: 0 }}>
              Live · last 24
            </p>
            <div>
              <p style={{ marginTop: 0, color: 'var(--color-ink-2)', maxWidth: '62ch' }}>
                For each of the last twenty-four hours, the point the program recorded is recomputed
                from the value the oracle revealed and the eligible supply at that hour. Both come
                from the event. <strong>No history is needed and none is used</strong>, so this runs
                in your request, against the chain, right now.
              </p>
              <LiveWindow />
            </div>
          </div>
        </section>

        <section className="entry">
          <div className="entry__grid">
            <p className="dateline__label" style={{ margin: 0 }}>
              Full replay
            </p>
            <div>
              <p style={{ marginTop: 0, color: 'var(--color-ink-2)', maxWidth: '62ch' }}>
                Which piece each hour issued depends on every take before it, so it cannot be checked
                from a window. A job walks the program&rsquo;s whole history, rebuilds the
                permutation from the revealed values alone and compares it against the piece ids the
                program emitted.
              </p>
              {run === null ? (
                <p className="note">No full replay has been recorded yet.</p>
              ) : (
                <>
                  <p className="verdict" data-ok={run.ok ? '1' : '0'}>
                    {run.agreed} of {run.minted} agree · {run.distinct_pieces} distinct
                  </p>
                  <dl className="facts">
                    <dt>ran at</dt>
                    <dd>
                      <time dateTime={new Date(run.ran_at).toISOString()}>
                        {new Date(run.ran_at).toISOString().replace('T', ' ').slice(0, 19)} UTC
                      </time>
                    </dd>
                    <dt>settlements</dt>
                    <dd>{run.settled}</dd>
                    <dt>still unissued</dt>
                    <dd>
                      {run.remaining} of {run.collection_size}
                    </dd>
                    <dt>took</dt>
                    <dd className="note">{(run.took_ms / 1000).toFixed(0)} s</dd>
                  </dl>
                </>
              )}
              <p className="note" style={{ maxWidth: '62ch' }}>
                <strong style={{ color: 'var(--color-ink-2)' }}>
                  That row is a record of a job we ran, not evidence about the chain.
                </strong>{' '}
                The chain is the evidence. The command below runs the identical replay from a clone,
                on your machine, against any endpoint you choose — which is the only version of this
                that does not require believing us.
              </p>
            </div>
          </div>
        </section>

        <section className="colophon">
          <p className="lede">Run it yourself</p>
          <p>
            Node 22.18 or newer. <strong>No install step</strong> — the verification path has no
            dependencies on purpose, so running it does not mean installing several hundred packages
            from us.
          </p>
          <pre className="cmd">
            <code>{`git clone <this repository> && cd drakes

export RPC="https://<your-provider>/?api-key=<your key>"

node scripts/snapshot.ts pieces \\
  --rpc "$RPC" \\
  --program ${config.programId}${config.config ? ` \\\n  --config  ${config.config}` : ''}`}</code>
          </pre>
          <p className="note">
            The same walk the job above runs. It reads no account of ours and no file of ours.
          </p>
        </section>
        <section className="entry">
          <div className="entry__grid">
            <p className="dateline__label" style={{ margin: 0 }}>
              Also · the hoard
            </p>
            <div>
              <p style={{ marginTop: 0, color: 'var(--color-ink-2)', maxWidth: '62ch' }}>
                {/* D31 moved this below the two checks and below the command.
                    It is a property of the collection, not the reason for it:
                    the rate peaks at 0.95% while the coin is small and decays
                    to 0.05% as it grows, so the hoard earns least exactly when
                    the collection is worth most. That does not belong above the
                    thing the page exists to prove. Nothing was removed. */}
                A secondary property, and a small one. Creator fees from $DRAKES trades arrive in
                SOL; the multisig converts them to <code>$PUMP</code> on a published rule — <strong>at 5 SOL, at most weekly, and at least monthly above
                1 SOL</strong> (<code>DESIGN.md</code> §3.6) — and every conversion is a
                transaction anyone can fetch.
              </p>
              {/* The rate in force. It is pump.fun's schedule, set by market cap
                  and by them, so the page shows the band the coin is in and the
                  date the table was read — never a rate stated as fixed. Until
                  the coin exists there is no market cap to read, and saying so
                  is the honest render. */}
              <dl className="facts">
                <dt>creator fee in force</dt>
                <dd>
                  {scheduleStale ? (
                    <>
                      <strong style={{ color: 'var(--color-accent)' }}>not confirmed</strong>{' '}
                      <span className="note">
                        {schedule === null
                          ? 'no check has run against the chain yet'
                          : schedule.agrees
                            ? `last confirmed ${checkedAt!.toISOString().slice(0, 10)}, which is too long ago`
                            : `the chain has moved: ${schedule.differences}`}
                        {' '}— we last recorded {RECORDED_SCHEDULE.curveCreatorBps / 100}% on the curve, and this
                        page will not state it as current until a check agrees.
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>{schedule!.creator_fee_bps / 100}%</strong>{' '}
                      <span className="note">
                        read from pump.fun&rsquo;s <code>GlobalConfig</code> at slot{' '}
                        {schedule!.slot}, {checkedAt!.toISOString().slice(0, 10)}
                        {schedule!.tiered ? '' : ' — a flat rate; no tier table is deployed'}
                      </span>
                    </>
                  )}
                </dd>
                <dt>schedule</dt>
                <dd className="note">
                  pump.fun&rsquo;s, and <strong>they can change it</strong> — it is a config in
                  their program, not an immutable one like a Meteora pool&rsquo;s. A job re-reads
                  it and this line says when it last agreed.
                </dd>
              </dl>
              {bought.length === 0 ? (
                <p className="note">No conversion has been recorded yet.</p>
              ) : (
                <div className="tablewrap">
                  <table className="rows">
                    <thead>
                      <tr>
                        <th scope="col">When</th>
                        <th scope="col">SOL spent</th>
                        <th scope="col">$PUMP received</th>
                        <th scope="col">Source</th>
                        <th scope="col">Signature</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bought.map((b) => (
                        <tr key={b.signature}>
                          <td>{b.block_time === null ? `slot ${b.slot}` : new Date(b.block_time).toISOString().slice(0, 16).replace('T', ' ')}</td>
                          <td className="num">{b.sol_spent}</td>
                          <td className="num">{b.pump_received}</td>
                          <td>
                            {(() => {
                              const source = provenanceLabel(b.funded_by)
                              return source.kind === 'fees' ? (
                                source.text
                              ) : (
                                <span
                                  className="note"
                                  data-source={source.kind}
                                  style={
                                    source.kind === 'unknown'
                                      ? { color: 'var(--color-accent)' }
                                      : undefined
                                  }
                                >
                                  {source.text}
                                </span>
                              )
                            })()}
                          </td>
                          <td className="num">{b.signature.slice(0, 8)}…{b.signature.slice(-8)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="note" style={{ maxWidth: '62ch' }}>
                <strong style={{ color: 'var(--color-ink-2)' }}>
                  Every figure in that table was read out of the transaction it names.
                </strong>{' '}
                The one exception is the source column: SOL in the vault is fungible, so no read
                can separate fee SOL from SOL the creator put there. That column is ours to
                assert, and it is marked so you can weigh it differently from the numbers beside
                it.{' '}
                The operator supplies a signature and nothing else; the amounts come from the
                transaction&rsquo;s own pre and post balances. Fetch the signature and you get the
                same numbers, or you get different ones and we are caught.
              </p>
            </div>
          </div>
        </section>

      </main>

      <footer className="sheet">
        <p className="note foot">
          <a href="/">← the plate</a> · recomputable, not trustless
        </p>
      </footer>
    </>
  )
}
