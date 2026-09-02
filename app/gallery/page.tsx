// /gallery — the plate at size. 48 px circles, 500 to a page.
//
// Caller: linked from the plate on `/`. The home plate answers "how much of the
// collection is out"; this answers "which ones, and what are they".

import { ThemeSwitch } from '../../src/components/ThemeSwitch.tsx'
import { placeholderTier, readCollectionState, TIERS } from '../../src/lib/site/collection.ts'
import { readConfig } from '../../src/lib/site/config.ts'
import { clusterName } from '../../src/lib/snapshot/rpc.ts'

export const dynamic = 'force-dynamic'
const PER_PAGE = 500

export default async function Gallery({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const config = readConfig()
  const cluster = await clusterName(config.rpcUrl)
  if (cluster === 'unknown' || config.survivors === undefined) {
    return (
      <main className="sheet">
        <div className="colophon">
          <p className="lede">This plate cannot name its network.</p>
        </div>
      </main>
    )
  }
  let state
  try {
    state = await readCollectionState({
      rpcUrl: config.rpcUrl,
      config: config.config!,
      survivors: config.survivors,
    })
  } catch {
    // Stated, not 500'd. See the note in `app/page.tsx`.
    return (
      <main className="sheet">
        <div className="colophon">
          <p className="lede">The chain did not answer in time.</p>
          <p className="note">
            Nothing is served from a cache in its place. Reload, or read it yourself from{' '}
            <a href="/verify">/verify</a>.
          </p>
        </div>
      </main>
    )
  }
  const pages = Math.ceil(state.collectionSize / PER_PAGE)
  const asked = Number((await searchParams).page ?? '1')
  const page = Number.isFinite(asked) ? Math.min(Math.max(1, Math.trunc(asked)), pages) : 1
  const from = (page - 1) * PER_PAGE
  const to = Math.min(from + PER_PAGE, state.collectionSize)

  return (
    <>
      <header className="sheet masthead">
        <div className="masthead__top">
          <b>
            <a href="/">Drakes</a>
          </b>
          <span>
            {state.issuedCount.toLocaleString('en')} issued · {state.remaining.toLocaleString('en')} remain
          </span>
          <span className="masthead__end">
            <a href="/verify">Verify</a>
            <ThemeSwitch />
          </span>
        </div>
        <div className="dateline">
          <p className="dateline__label">Plate II</p>
          <p className="dateline__clock" style={{ fontSize: 'var(--text-2xl)' }}>
            {from}–{to - 1}
          </p>
        </div>
      </header>
      <main className="sheet">
        <section className="plate">
          <nav className="pager" aria-label="Plates">
            {Array.from({ length: pages }, (_, i) => (
              <a key={i} href={`/gallery?page=${i + 1}`} aria-current={i + 1 === page ? 'page' : undefined}>
                {i * PER_PAGE}–{Math.min((i + 1) * PER_PAGE, state.collectionSize) - 1}
              </a>
            ))}
          </nav>
          <p className="tiers" style={{ marginBottom: 'var(--space-16)' }}>
            {TIERS.map((t) => (
              <span key={t.name}>
                <i className={`t--${t.name.toLowerCase()}`} />
                {t.name}
              </span>
            ))}
          </p>
          <div className="specimens">
            {Array.from({ length: to - from }, (_, k) => {
              const id = from + k
              const issued = state.issued.has(id)
              return (
                <span
                  key={id}
                  className={`specimen t--${placeholderTier(id).toLowerCase()}`}
                  data-issued={issued ? '1' : '0'}
                  title={`#${id} · ${placeholderTier(id)} · ${issued ? 'issued' : 'in the plate'}`}
                />
              )
            })}
          </div>
          <p className="note" style={{ maxWidth: '62ch', marginTop: 'var(--space-24)' }}>
            <strong style={{ color: 'var(--color-ink-2)' }}>Tiers are a placeholder</strong> until the
            manifest is published. Issued and remaining come from the chain.
          </p>
        </section>
      </main>
      <footer className="sheet">
        <p className="note" style={{ padding: 'var(--space-24) 0 var(--space-48)' }}>
          <a href="/">← the plate</a> · slot {state.slot.toLocaleString('en')}
        </p>
      </footer>
    </>
  )
}
