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

import { readConfig } from '../../src/lib/site/config.ts'
import { connect } from '../../src/lib/db/client.ts'
import { LiveWindow } from '../../src/components/LiveWindow.tsx'

export const dynamic = 'force-dynamic'

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
  const config = readConfig()
  const run = await lastRun()

  return (
    <>
      <header className="sheet masthead">
        <div className="masthead__top">
          <b>
            <a href="/">Drakes</a>
          </b>
          <span className="chip">verify</span>
          <a href="/">Plate</a>
        </div>
        <div className="dateline">
          <div className="dateline__clockwrap">
            <p className="dateline__label">Recomputable, not trustless</p>
            <p className="dateline__clock" style={{ fontSize: 'var(--text-2xl)' }}>
              Check it yourself
            </p>
          </div>
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
      </main>

      <footer className="sheet">
        <p className="note foot">
          <a href="/">← the plate</a> · the hoard is empty and there is no pool sending anything to
          it yet
        </p>
      </footer>
    </>
  )
}
