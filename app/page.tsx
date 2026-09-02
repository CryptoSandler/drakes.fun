// The front page. Bestiary — the collection is the page.
//
// Chosen 2026-09-01 out of three directions; the other two are recorded as
// discarded in `docs/`. The design system is `DESIGN.md` §10.
//
// The argument: 4,000 dragons exist already, their tiers fixed before the first
// one went out, and the fact worth looking at is *which ones are still in
// there*. So the plate — every piece, at once — is the hero.
//
// **The clock sits in the masthead**, above the plate and above the rule, so
// that the first thing on the screen is the thing that recurs. That is taken
// from the direction that made the page nothing but the clock; what is not
// taken from the third direction is the poster, and the absent hoard gets one
// line at the foot rather than a frame of its own.
//
// Caller: Next's router, at `/`.

import { ThemeSwitch } from '../src/components/ThemeSwitch.tsx'
import { clusterName } from '../src/lib/snapshot/rpc.ts'
import { fetchLatestSettled } from '../src/lib/chain/latest.ts'
import { nextIssuanceAt, placeholderTier, readCollectionState, TIERS } from '../src/lib/site/collection.ts'
import { missingConfig, readConfig } from '../src/lib/site/config.ts'
import { encodeBase58 } from '../src/lib/solana/base58.ts'
import { Countdown } from '../src/components/Countdown.tsx'
import { ArtSlot } from '../src/components/ArtSlot.tsx'

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

/**
 * A chain read that fails must not take the page down.
 *
 * The gallery answered HTTP 500 on roughly one request in three while the
 * cranker, the capture harness and the replay job shared one provider key. The
 * retry in `src/lib/chain/rpc.ts` is the fix; this is the second line of it,
 * because "the page is broken" and "the endpoint is busy" are different facts
 * and the reader is entitled to be told which.
 */
async function orNull<T>(work: Promise<T>): Promise<T | null> {
  try {
    return await work
  } catch {
    return null
  }
}

export default async function Page() {
  const missing = missingConfig()
  if (missing.length > 0) {
    return (
      <main className="sheet">
        <div className="colophon">
          <p className="lede">This deployment is not pointed at a chain.</p>
          <p>
            {missing.join(' and ')} {missing.length === 1 ? 'is' : 'are'} not set here, so the page
            is showing nothing rather than something it cannot source. No figure on this site is
            ever rendered without the chain it came from.
          </p>
        </div>
      </main>
    )
  }
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
      : orNull(readCollectionState({ rpcUrl: config.rpcUrl, config: config.config!, survivors: config.survivors })),
    orNull(fetchLatestSettled({ rpcUrl: config.rpcUrl, programId: config.programId, config: config.config })),
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
        {/* Three fixed slots. The middle one is a chip, not a sentence, so it
            cannot wrap and shove `Verify` onto a second line at 390 px. */}
        <div className="masthead__top">
          <b>Drakes</b>
          <span className={`chip${cluster === 'mainnet' ? '' : ' chip--rehearsal'}`}>{cluster}</span>
          <span className="masthead__end">
            <a href="/verify">Verify</a>
            <ThemeSwitch />
          </span>
        </div>

        {/* The clock. First thing on the screen at every width. */}
        <div className="dateline">
          <div className="dateline__clockwrap">
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
          </div>
          {state && (
            <div className="dateline__meta">
              <span>
                <b>{state.issuedCount.toLocaleString('en')}</b> of{' '}
                {state.collectionSize.toLocaleString('en')} issued
              </span>
              <span>
                <b>{state.remaining.toLocaleString('en')}</b> still in the plate
              </span>
              <span className="note">read at slot {state.slot.toLocaleString('en')}</span>
            </div>
          )}
        </div>
      </header>

      <main className="sheet">
        {state === null && (
          <section className="entry">
            <p className="note" style={{ maxWidth: '62ch' }}>
              The chain did not answer in time for this render, so the plate is not shown. Nothing
              is cached in its place — reload, or read it yourself from{' '}
              <a href="/verify">/verify</a>.
            </p>
          </section>
        )}
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

        {/* The catalogue entry for the most recent specimen, with the slot the
            artwork will occupy drawn empty at its real size. */}
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
              <div className="entry__body">
                <ArtSlot pieceId={latest.minted ? latest.pieceId : null} />
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
                    ,{' '}
                    {state
                      ? ago(state.genesisUnix + Number(latest.hour) * state.periodSeconds, now)
                      : 'recently'}
                    .
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
            {/* The mechanism, never a promise. `DESIGN.md` §7 lists `backed`
                among the words this project may never use, and the sentence that
                would be easiest to write is exactly that one.

                This used to read "sends 2% in $PUMP to the hoard", which D26
                made false twice over: the pool is quoted in SOL, and 2% is what
                the trader pays rather than what arrives. Caught by reading a
                capture — the footer three lines below already said the fee
                arrives in SOL, so the page contradicted itself. */}
            <strong>1.6% of every trade reaches the hoard.</strong> The pool charges 2% and
            Meteora keeps 0.4% of the trade as its protocol share, so 1.6% is what arrives. It
            arrives in SOL, and the multisig converts it to $PUMP on a rule published in advance.
            That is the mechanism, stated as a mechanism.
          </p>
          <p style={{ marginTop: 'var(--space-24)' }}>
            <a className="btn" href="/verify">
              Replay it yourself →
            </a>
          </p>
        </section>
      </main>

      <footer className="sheet">
        {/* The hoard, in one line, at the foot. It was a full gold frame in one
            of the discarded directions and that put the emptiest fact on the
            site in its largest object.
            The line used to read "the hoard is empty and there is no pool
            sending anything to it yet". D26 gave the hoard a way in, and a
            capture of /verify showed that sentence sitting directly under a
            table of conversions. This wording is true before the first
            conversion and after it, and promises nothing either way. */}
        {/* The page is live on the real domain and the chain under it is
            devnet (D29). This says so in words, next to the chip that says it
            in a colour, because the chip is a label and this is a sentence. It
            is written from the config rather than hard-coded, so pointing
            ISSUANCE_PROGRAM at mainnet removes it with no deploy. */}
        {cluster !== 'mainnet' && (
          <p className="note foot rehearsal">
            <strong style={{ color: 'var(--color-ink)' }}>
              These issuances are a rehearsal on {cluster}.
            </strong>{' '}
            Mainnet has not started. Nothing on this page has been issued on the network that
            carries value, and no piece here is the piece you would hold.
          </p>
        )}
        <p className="note foot">
          {config.programId} · recomputable, not trustless ·{' '}
          <strong style={{ color: 'var(--color-ink-2)' }}>
            the fee arrives in SOL and the hoard is bought on a published rule
          </strong>{' '}
          — <a href="/verify">every conversion is listed</a>
        </p>
      </footer>
    </>
  )
}
