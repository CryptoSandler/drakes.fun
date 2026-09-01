// Direction B — "Bestiary". The collection is the page.
//
// The argument: 4,000 dragons exist already, their tiers fixed before the first
// one went out, and the interesting fact is *which ones are still in there*. So
// the plate — every piece, at once — is the hero, and the hour is the date-line
// above it. This is the one direction that takes Quantums' grid-as-hero, and it
// pushes it somewhere they do not: theirs is a status display, this is a
// catalogue with an entry.
//
// Caller: Next's router, at `/`. `docs/DESIGN-candidate-bestiary.md` is the
// argument.

import { clusterName } from '../src/lib/snapshot/rpc.ts'
import { fetchLatestSettled } from '../src/lib/chain/latest.ts'
import { nextIssuanceAt, placeholderTier, readCollectionState, TIERS } from '../src/lib/site/collection.ts'
import { readConfig } from '../src/lib/site/config.ts'
import { encodeBase58 } from '../src/lib/solana/base58.ts'
import { Countdown } from '../src/components/Countdown.tsx'

export const dynamic = 'force-dynamic'

const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-6)}`

function share(balance: bigint, eligible: bigint): string {
  if (eligible === 0n) return '—'
  const bp = Number((balance * 10000n) / eligible)
  return bp >= 100 ? `${(bp / 100).toFixed(1)}%` : bp >= 1 ? `${(bp / 100).toFixed(2)}%` : '<0.01%'
}

function ago(fromUnix: number, nowUnix: number): string {
  const s = Math.max(0, nowUnix - fromUnix)
  if (s < 90) return `${s} seconds ago`
  const m = Math.round(s / 60)
  return m < 90 ? `${m} minutes ago` : `${Math.round(m / 60)} hours ago`
}

export default async function Page() {
  const config = readConfig()
  const cluster = await clusterName(config.rpcUrl)

  if (cluster === 'unknown') {
    return (
      <main className="sheet">
        <div className="colophon">
          <p className="lede">This plate cannot name its network.</p>
          <p>
            The cluster this deployment points at could not be classified from its genesis hash, so
            the page is showing no figures rather than figures labelled with the wrong chain.
          </p>
        </div>
      </main>
    )
  }

  const [state, latest] = await Promise.all([
    config.survivors === undefined
      ? Promise.resolve(null)
      : readCollectionState({ rpcUrl: config.rpcUrl, config: config.config!, survivors: config.survivors }),
    fetchLatestSettled({ rpcUrl: config.rpcUrl, programId: config.programId, config: config.config }),
  ])

  const now = Math.floor(Date.now() / 1000)
  const nextAt = state ? nextIssuanceAt(state, now) : null
  const remainingByTier = state
    ? TIERS.map((t) => {
        let left = 0
        for (let id = 0; id < state.collectionSize; id += 1) {
          if (!state.issued.has(id) && placeholderTier(id) === t.name) left += 1
        }
        return { ...t, left }
      })
    : []

  return (
    <>
      <header className="sheet masthead">
        <div className="masthead__top">
          <b>Drakes</b>
          <span>A bestiary of 4,000 · {cluster}</span>
          <a href="/verify">Verify</a>
        </div>
        <div className="dateline">
          <p className="dateline__label">The next one is issued in</p>
          {state && nextAt ? (
            <Countdown
              className="dateline__clock"
              nextAtUnix={nextAt}
              periodSeconds={state.periodSeconds}
              initial={nextAt - now}
            />
          ) : (
            <span className="dateline__clock">--:--</span>
          )}
          <div className="dateline__meta">
            {state && (
              <span>
                <b>{state.issuedCount.toLocaleString('en')}</b> of{' '}
                {state.collectionSize.toLocaleString('en')} issued
              </span>
            )}
            {state && (
              <span>
                <b>{state.remaining.toLocaleString('en')}</b> still in the plate
              </span>
            )}
            {state && <span className="note">read at slot {state.slot.toLocaleString('en')}</span>}
          </div>
        </div>
      </header>

      <main className="sheet">
        {/* The plate. Every piece, at once, and the point of the direction. */}
        {state && (
          <section className="plate" aria-labelledby="plate">
            <div className="plate__head">
              <h1 className="plate__title" id="plate">
                Plate I — the whole collection
              </h1>
              <p className="plate__note">
                filled: issued · outlined: still in the plate ·{' '}
                <a href="/gallery">see them at size →</a>
              </p>
            </div>
            <div
              className="specimens specimens--dense"
              role="img"
              aria-label={`${state.issuedCount} of ${state.collectionSize} issued`}
            >
              {Array.from({ length: state.collectionSize }, (_, id) => (
                <span
                  key={id}
                  className={`specimen t--${placeholderTier(id).toLowerCase()}`}
                  data-issued={state.issued.has(id) ? '1' : '0'}
                />
              ))}
            </div>
            <p className="tiers" style={{ marginTop: 'var(--space-16)' }}>
              {remainingByTier.map((t) => (
                <span key={t.name}>
                  <i className={`t--${t.name.toLowerCase()}`} />
                  {t.left.toLocaleString('en')} of {t.count.toLocaleString('en')} {t.name} remain
                </span>
              ))}
            </p>
            <p className="note" style={{ maxWidth: '62ch', marginTop: 'var(--space-8)' }}>
              <strong style={{ color: 'var(--color-ink-2)' }}>Tiers are a placeholder.</strong> The
              real allocation is fixed by a manifest whose hash the program commits, and it is not
              published yet. Issued and remaining come from the chain and are real.
            </p>
          </section>
        )}

        {/* The catalogue entry for the most recent specimen. */}
        <section className="entry" aria-labelledby="last">
          <div className="entry__grid">
            <p className="dateline__label" id="last" style={{ margin: 0 }}>
              Most recent
            </p>
            {latest === null ? (
              <p className="note">
                Nothing has been issued on this program yet. That is the chain&rsquo;s answer, not a
                placeholder.
              </p>
            ) : (
              <div>
                <h2>
                  <small>Issuance {String(latest.hour)}</small>
                  {latest.minted ? `Drake #${latest.pieceId}` : 'No piece minted'}
                </h2>
                <p style={{ margin: 0, color: 'var(--color-ink-2)' }}>
                  Issued to{' '}
                  <strong style={{ color: 'var(--color-ink)' }}>
                    {short(encodeBase58(latest.recipient))}
                  </strong>
                  , {state ? ago(state.genesisUnix + Number(latest.hour) * state.periodSeconds, now) : 'recently'}.
                </p>
                <dl className="facts">
                  <dt>tier</dt>
                  <dd>
                    {latest.minted ? placeholderTier(latest.pieceId) : '—'}{' '}
                    <span className="note">(placeholder)</span>
                  </dd>
                  <dt>their share</dt>
                  <dd>{share(latest.balance, latest.eligibleSupply)} of eligible supply</dd>
                  <dt>snapshot slot</dt>
                  <dd>{latest.snapshotSlot.toString()}</dd>
                  <dt>signature</dt>
                  <dd className="note">{short(latest.signature)}</dd>
                </dl>
              </div>
            )}
          </div>
        </section>

        <section className="colophon" aria-label="What this is">
          <p className="lede">
            Hold $DRAKES, and every hour the protocol issues one of these to one holder — weighted
            by the balance they hold when the hour is requested.
          </p>
          <p>
            <strong>Four thousand dragons.</strong> All of them exist already and every tier was
            fixed before the first one went out. The recipient is derived from a snapshot published
            in advance and a value from an oracle, so it is <strong>never chosen</strong>, and anyone
            can recompute it.
          </p>
          <p>
            Every trade of $DRAKES sends <strong>2% in $PUMP</strong> to the hoard. What that
            becomes, and when it opens, is in the protocol paper.
          </p>
          <p style={{ marginTop: 'var(--space-24)' }}>
            <a className="btn" href="/verify">
              Replay it yourself →
            </a>
          </p>
        </section>
      </main>

      <footer className="sheet">
        <p className="note" style={{ padding: 'var(--space-24) 0 var(--space-48)' }}>
          {config.programId} · recomputable, not trustless · no hoard exists yet
        </p>
      </footer>
    </>
  )
}
