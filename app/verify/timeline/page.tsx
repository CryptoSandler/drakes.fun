// /verify/timeline — the register: everything that happened, in order, each row
// carrying the signature that proves it.
//
// Caller: Next's router, linked from `/verify`.
//
// **Why it exists.** `/verify` answers two questions — is the recipient derived,
// and does the permutation replay — and answers them as checks. A reader who
// wants to know *what has happened* has to assemble that from a live window, a
// job's row and a table of conversions. This is the same facts as a chronology,
// which is a shape that `docs/references.md` records seeing work elsewhere: a
// dated list where every entry carries its own primary source.
//
// **It is not a feed and it makes no claim the other pages do not.** Every
// issuance row links to `/verify/<hour>`, where the arithmetic is recomputed in
// the reader's own request; every conversion row carries the signature its
// figures were read out of (D27).
//
// **The window is the last 40 issuances and it says so.** Rendering 4,000 from
// the chain per request is not a page, and reading them out of the event cache
// would be showing a reader our record instead of everybody's (D21). The full
// history is the replay command, which is on `/verify` and in the README.

import { ThemeSwitch } from '../../../src/components/ThemeSwitch.tsx'
import { missingConfig, readConfig } from '../../../src/lib/site/config.ts'
import { clusterName } from '../../../src/lib/snapshot/rpc.ts'
import { readCollectionState } from '../../../src/lib/site/collection.ts'
import { fetchRecentSettled } from '../../../src/lib/chain/latest.ts'
import { connect } from '../../../src/lib/db/client.ts'
import { buildTimeline, shortSignature, stamp, type RawConversion } from '../../../src/lib/site/timeline.ts'
import { formatAmount } from '../../../src/lib/chain/latest.ts'
import { encodeBase58 } from '../../../src/lib/solana/base58.ts'

export const dynamic = 'force-dynamic'

const WINDOW = 40

export const metadata = {
  title: 'The register — Drakes',
  description: 'Every issuance and every conversion, in order, each with its signature.',
}

async function conversions(): Promise<RawConversion[]> {
  const url = process.env.DATABASE_URL
  if (url === undefined || url === '') return []
  try {
    const db = await connect(url)
    try {
      const { rows } = await db.query('select * from hoard_purchases order by slot desc limit 100', [])
      return rows as unknown as RawConversion[]
    } finally {
      await db.end()
    }
  } catch {
    // The register still renders the chain half. A cache being down must not
    // take the chain read down with it (`app/verify/page.tsx` says the same).
    return []
  }
}

export default async function Timeline() {
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
  const cluster = await clusterName(config.rpcUrl)
  if (cluster === 'unknown' || config.survivors === undefined) {
    return (
      <main className="sheet">
        <div className="colophon">
          <p className="lede">This register cannot name its network.</p>
          <p>
            Every row below would be a claim about a chain this deployment cannot identify, so
            none of them is shown.
          </p>
          <p className="note">
            <a href="/verify">← the checks</a>
          </p>
        </div>
      </main>
    )
  }

  const [state, settled, bought] = await Promise.all([
    readCollectionState({ rpcUrl: config.rpcUrl, config: config.config!, survivors: config.survivors }),
    fetchRecentSettled({
      rpcUrl: config.rpcUrl, programId: config.programId, config: config.config, limit: WINDOW,
    }),
    conversions(),
  ])

  const rows = buildTimeline({
    schedule: { genesisUnix: state.genesisUnix, periodSeconds: state.periodSeconds },
    issuances: settled.map((event) => ({
      hour: Number(event.hour),
      minted: event.minted,
      pieceId: event.pieceId,
      recipient: encodeBase58(event.recipient),
      signature: event.signature,
    })),
    conversions: bought,
  })

  return (
    <>
      <header className="sheet masthead">
        <div className="masthead__top">
          <b>
            <a href="/">Drakes</a>
          </b>
          <span className={`chip${cluster === 'mainnet' ? '' : ' chip--rehearsal'}`}>
            {cluster === 'mainnet' ? 'register' : cluster}
          </span>
          <span className="masthead__end">
            <a href="/verify">Checks</a>
            <ThemeSwitch />
          </span>
        </div>
        <div className="dateline">
          <div className="dateline__clockwrap">
            <p className="dateline__label">Every row has a signature</p>
            <p className="dateline__clock" style={{ fontSize: 'var(--text-2xl)' }}>
              The register
            </p>
          </div>
          {cluster !== 'mainnet' && (
            <p className="note foot rehearsal" style={{ marginBottom: 0 }}>
              <strong style={{ color: 'var(--color-ink)' }}>
                Everything below is a rehearsal on {cluster}.
              </strong>{' '}
              Mainnet has not started.
            </p>
          )}
        </div>
      </header>

      <main className="sheet">
        <section className="entry">
          <div className="entry__grid">
            <p className="dateline__label" style={{ margin: 0 }}>
              What this is
            </p>
            <div>
              <p style={{ marginTop: 0, color: 'var(--color-ink-2)', maxWidth: '62ch' }}>
                The last {WINDOW} issuances, read from the chain in this request, and every
                conversion recorded so far — one chronology rather than two lists.{' '}
                <strong>Each row names the transaction it comes from.</strong> Fetch any of
                them and you get the same figures, or you get different ones and we are caught.
              </p>
              <p className="note" style={{ maxWidth: '62ch' }}>
                <strong style={{ color: 'var(--color-ink-2)' }}>The two dates are not the
                same kind of date.</strong>{' '}
                An issuance is stamped with the instant the schedule names for that hour —
                <code> genesis + hour × period</code>, both read from the config account, exact
                and derivable by anyone. The transaction lands seconds to minutes later. A
                conversion is stamped with its own transaction&rsquo;s block time.
              </p>
            </div>
          </div>
        </section>

        <section className="entry">
          <div className="entry__grid">
            <p className="dateline__label" style={{ margin: 0 }}>
              The register
            </p>
            <div>
              {rows.length === 0 ? (
                <p className="note">Nothing has settled on this chain yet.</p>
              ) : (
                <ol className="register">
                  {rows.map((row) => (
                    <li key={`${row.kind}-${row.signature}`} className="register__row">
                      <p className="register__when">
                        <time dateTime={new Date(row.at * 1000).toISOString()}>{stamp(row.at)}</time>
                      </p>
                      <div>
                        {row.kind === 'issuance' ? (
                          <>
                            <p className="register__what">
                              {row.pieceId === null ? (
                                <>
                                  Hour {row.hour} issued nothing
                                </>
                              ) : (
                                <>
                                  <strong>Drake #{row.pieceId}</strong> issued to{' '}
                                  <span className="num">{row.recipient.slice(0, 4)}…{row.recipient.slice(-4)}</span>
                                </>
                              )}
                            </p>
                            <p className="register__source note">
                              <a href={row.href}>hour {row.hour} — recompute it</a> ·{' '}
                              <span className="num">{shortSignature(row.signature)}</span>
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="register__what">
                              <strong>{formatAmount(BigInt(row.solSpent), 9)} SOL</strong> converted to{' '}
                              <strong>{formatAmount(BigInt(row.pumpReceived), 6)} $PUMP</strong>
                            </p>
                            <p className="register__source note">
                              <span
                                data-source={row.source.kind}
                                style={row.source.kind === 'unknown' ? { color: 'var(--color-accent)' } : undefined}
                              >
                                {row.source.text}
                              </span>{' '}
                              · <span className="num">{shortSignature(row.signature)}</span>
                            </p>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </section>

        <section className="colophon">
          <p className="lede">Past the window</p>
          <p>
            This page shows the most recent {WINDOW}. The whole history is the replay, which
            walks every settlement the program ever emitted and rebuilds the permutation from
            the revealed values alone.
          </p>
          <p className="note">
            <a href="/verify">← the two checks, and the command that runs the replay</a>
          </p>
        </section>
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
