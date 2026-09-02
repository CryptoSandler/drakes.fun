// /verify/<hour> — one issuance, and the arithmetic that produced it.
//
// Caller: Next's router, and every post the X bot publishes
// (`src/lib/bot/post.ts` builds the URL). It is the page a stranger lands on
// from a post that says a piece went to an address, and the only thing it owes
// them is the means to check that sentence.
//
// **Everything here was read from the chain in this request.** Two calls: the
// issuance account, found by its hour, and the transaction that settled it.
// Nothing is read from the event cache in Postgres — that table exists so a
// list can be paged, and D21 says a verifier must not read an account we wrote.
//
// **The recipient is shown in full.** The post truncates because a post is a
// pointer; a page that a reader opened to check something must not make them
// squint at an elision.

import { ThemeSwitch } from '../../../src/components/ThemeSwitch.tsx'
import { missingConfig, readConfig } from '../../../src/lib/site/config.ts'
import { clusterName } from '../../../src/lib/snapshot/rpc.ts'
import { notFound } from 'next/navigation'
import { fetchPermalink, NOTHING_ISSUED } from '../../../src/lib/chain/issuance.ts'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ hour: string }> }) {
  const { hour } = await params
  return {
    title: `Hour ${hour} — Drakes`,
    description: `The issuance at hour ${hour}, recomputed from the chain.`,
  }
}

export default async function Issuance({ params }: { params: Promise<{ hour: string }> }) {
  const raw = (await params).hour
  // An hour is a u64 in a PDA seed. Anything else is not a bad request to
  // repair, it is a different question, and the page says so rather than
  // rendering a zero.
  // A 404 and not a rendered apology: a malformed hour is a URL that names
  // nothing, and answering 200 to it would put a soft error behind every
  // mistyped link a post ever produces.
  if (!/^\d{1,20}$/.test(raw)) notFound()
  const hour = BigInt(raw)

  if (missingConfig().length > 0) {
    return (
      <main className="sheet">
        <div className="colophon">
          <p className="lede">This deployment is not pointed at a chain.</p>
          <p className="note">
            <a href="/verify">← the checks</a>
          </p>
        </div>
      </main>
    )
  }

  const config = readConfig()
  const [cluster, permalink] = await Promise.all([
    clusterName(config.rpcUrl),
    fetchPermalink({ rpcUrl: config.rpcUrl, programId: config.programId, hour }),
  ])

  const issued = permalink !== null && permalink.account.settled && permalink.account.pieceId !== NOTHING_ISSUED

  return (
    <>
      <header className="sheet masthead">
        <div className="masthead__top">
          <b>
            <a href="/">Drakes</a>
          </b>
          <span className={`chip${cluster === 'mainnet' ? '' : ' chip--rehearsal'}`}>
            {cluster === 'mainnet' ? `hour ${hour}` : cluster}
          </span>
          <span className="masthead__end">
            <a href="/verify">Checks</a>
            <ThemeSwitch />
          </span>
        </div>
        <div className="dateline">
          <div className="dateline__clockwrap">
            <p className="dateline__label">Hour {hour.toString()}</p>
            <p className="dateline__clock" style={{ fontSize: 'var(--text-2xl)' }}>
              {permalink === null
                ? 'Not on chain'
                : issued
                  ? `Drake #${permalink.account.pieceId}`
                  : 'Nothing issued'}
            </p>
          </div>
          {cluster !== 'mainnet' && (
            <p className="note foot rehearsal" style={{ marginBottom: 0 }}>
              <strong style={{ color: 'var(--color-ink)' }}>
                This is a rehearsal on {cluster}.
              </strong>{' '}
              Mainnet has not started. Anything below happened on {cluster} and nowhere else.
            </p>
          )}
        </div>
      </header>

      <main className="sheet">
        {permalink === null ? (
          <section className="colophon">
            <p className="lede">This hour was never requested.</p>
            <p>
              An hour with no account on chain is an hour the cranker did not open — before the
              genesis instant, after the collection emptied, or one nobody paid for. There is
              nothing to check, which is different from a check that failed.
            </p>
            <p className="note">
              <a href="/verify">← the checks</a>
            </p>
          </section>
        ) : (
          <>
            <section className="entry">
              <div className="entry__grid">
                <p className="dateline__label" style={{ margin: 0 }}>
                  {issued ? 'Issued to' : 'Outcome'}
                </p>
                <div>
                  {issued ? (
                    <>
                      <p className="verdict" data-ok={permalink.agrees === true ? '1' : '0'} style={{ overflowWrap: 'anywhere' }}>
                        {permalink.account.recipient}
                      </p>
                      <p style={{ marginTop: 0, color: 'var(--color-ink-2)', maxWidth: '62ch' }}>
                        Chosen from everyone holding <code>$DRAKES</code> at slot{' '}
                        {permalink.account.snapshotSlot.toString()}, in proportion to what they
                        held. <strong>Nobody entered and nobody was picked by us.</strong>
                      </p>
                    </>
                  ) : (
                    <>
                      {/* No `data-ok`: the fault colour belongs to a check
                          that disagreed. An hour that issued nothing is the
                          protocol working as written -- the oracle missed its
                          window, or there was nobody to issue to -- and
                          painting it red would teach a reader that a normal
                          outcome is a defect. */}
                      <p className="verdict">This hour issued nothing</p>
                      <p style={{ marginTop: 0, color: 'var(--color-ink-2)', maxWidth: '62ch' }}>
                        The hour was requested and{' '}
                        {permalink.account.settled
                          ? 'settled without issuing a piece — the eligible supply was zero, so there was nobody to issue to.'
                          : 'never settled. The oracle did not reveal in time, and an hour can only be requested before the next one opens: there is no second attempt, by design.'}{' '}
                        The schedule does not shift and the piece is not lost — it stays in the
                        collection for a later hour.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </section>

            {permalink.event !== null && (
              <section className="entry">
                <div className="entry__grid">
                  <p className="dateline__label" style={{ margin: 0 }}>
                    The arithmetic
                  </p>
                  <div>
                    <p style={{ marginTop: 0, color: 'var(--color-ink-2)', maxWidth: '62ch' }}>
                      The program recorded a point inside the eligible supply and walked the
                      snapshot to whoever held it. That point is a pure function of the value the
                      oracle revealed — so it is recomputed here, in your request, and compared.
                    </p>
                    <p className="verdict" data-ok={permalink.agrees === true ? '1' : '0'}>
                      {permalink.agrees === true
                        ? 'recomputed and it agrees'
                        : 'RECOMPUTED AND IT DOES NOT AGREE'}
                    </p>
                    <dl className="facts">
                      <dt>point recorded</dt>
                      <dd className="num">{permalink.account.point.toString()}</dd>
                      <dt>point derived here</dt>
                      <dd className="num">{permalink.derived?.toString() ?? '—'}</dd>
                      <dt>eligible supply</dt>
                      <dd className="num">{permalink.event.eligibleSupply.toString()}</dd>
                      <dt>snapshot slot</dt>
                      <dd className="num">{permalink.account.snapshotSlot.toString()}</dd>
                      <dt>snapshot root</dt>
                      <dd className="num" style={{ overflowWrap: 'anywhere' }}>{permalink.account.root}</dd>
                      <dt>randomness account</dt>
                      <dd className="num" style={{ overflowWrap: 'anywhere' }}>{permalink.account.randomness}</dd>
                      <dt>settled in</dt>
                      <dd className="num" style={{ overflowWrap: 'anywhere' }}>{permalink.event.signature}</dd>
                    </dl>
                    <p className="note" style={{ maxWidth: '62ch' }}>
                      The root above commits the snapshot this hour was drawn from, and the
                      randomness account is Switchboard&rsquo;s — the value it revealed is in the
                      settle transaction&rsquo;s logs, which is where the number on the left came
                      from.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {issued && (
              <section className="entry">
                <div className="entry__grid">
                  <p className="dateline__label" style={{ margin: 0 }}>
                    The piece
                  </p>
                  <div>
                    <dl className="facts">
                      <dt>id</dt>
                      <dd className="num">#{permalink.account.pieceId}</dd>
                      <dt>tier</dt>
                      <dd className="note">
                        not published yet — the tier table is fixed by the manifest, and the
                        manifest is not committed until the art ships
                      </dd>
                    </dl>
                    <p className="note" style={{ maxWidth: '62ch' }}>
                      <strong style={{ color: 'var(--color-ink-2)' }}>
                        Rarity here is cosmetic.
                      </strong>{' '}
                      Every piece carries the same claim on the collection and the same redemption
                      in Phase 2; the tiers differ in what they look like and in nothing else.
                    </p>
                  </div>
                </div>
              </section>
            )}

            <section className="colophon">
              <p className="lede">Check this hour yourself</p>
              <pre className="cmd">
                <code>{`export RPC="https://<your-provider>/?api-key=<your key>"

node scripts/snapshot.ts pieces \\
  --rpc "$RPC" \\
  --program ${config.programId}${config.config ? ` \\\n  --config  ${config.config}` : ''}`}</code>
              </pre>
              <p className="note">
                The full replay, which is the only check that covers <em>which</em> piece this hour
                issued: that depends on every hour before it.{' '}
                {permalink.event !== null &&
                  'The arithmetic above is complete for the recipient and needs no history at all.'}
              </p>
            </section>
          </>
        )}
      </main>

      <footer className="sheet">
        <p className="note foot">
          <a href="/verify">← the checks</a> · <a href="/">the plate</a> · recomputable, not
          trustless
        </p>
      </footer>
    </>
  )
}
