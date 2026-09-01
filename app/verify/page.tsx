'use client'

// /verify — the public replay behind one button.
//
// Caller: Next's router. The button calls `/api/verify`, which runs the same
// `fetchIssuanceSettled` + `replayFromChain` the published command runs.
//
// The page prints the command next to the button on purpose: the button is a
// convenience for a reader who has not cloned the repository, and a reader who
// only ever presses our button has verified nothing about us.

import { useState } from 'react'

interface Result {
  ok: boolean
  why?: string
  cluster?: string
  settled?: number
  minted?: number
  distinct?: number
  agreed?: number
  remaining?: number
  size?: number
  tookMs?: number
  disagreements?: { hour: number; program: number; replay: number }[]
}

export default function Verify() {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle')
  const [result, setResult] = useState<Result | null>(null)

  const run = async () => {
    setState('running')
    setResult(null)
    try {
      const res = await fetch('/api/verify', { cache: 'no-store' })
      setResult((await res.json()) as Result)
    } catch (error) {
      setResult({ ok: false, why: error instanceof Error ? error.message : String(error) })
    }
    setState('done')
  }

  return (
    <>
      <header className="sheet masthead">
        <nav className="masthead__top">
          <b>
            <a href="/">Drakes</a>
          </b>
          <span>verify</span>
          <span />
        </nav>
      </header>

      <main className="sheet">
        <section className="entry">
          <h1 className="dateline__label">Replay the permutation from the chain</h1>
          <p style={{ maxWidth: '58ch', margin: '0 0 var(--space-24)' }}>
            This walks every signature the program has, decodes the{' '}
            <code>IssuanceSettled</code> events, and rebuilds which piece went out each hour from the
            revealed values alone. It reads no account of ours and no file of ours.
          </p>

          <p style={{ display: 'flex', gap: 'var(--space-16)', flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn" onClick={run} disabled={state === 'running'}>
              {state === 'running' ? 'Replaying…' : 'Run the replay'}
            </button>
            {state === 'running' && <span className="note">reading the chain — this takes a while</span>}
          </p>
        </section>

        {result && (
          <section className="colophon" aria-live="polite">
            {result.ok ? (
              <>
                <p className="dateline__label" style={{ color: 'var(--color-accent)' }}>
                  ◆ {result.agreed} of {result.minted} agree
                </p>
                <dl className="facts">
                  <dt>settlements</dt>
                  <dd>{result.settled}</dd>
                  <dt>distinct pieces</dt>
                  <dd>
                    {result.distinct} <span className="note">— none issued twice</span>
                  </dd>
                  <dt>still unissued</dt>
                  <dd>
                    {result.remaining} of {result.size}
                  </dd>
                  <dt>network</dt>
                  <dd>{result.cluster}</dd>
                  <dt>took</dt>
                  <dd className="note">{result.tookMs} ms</dd>
                </dl>
              </>
            ) : (
              <>
                <p className="dateline__label" style={{ color: 'var(--color-ink)' }}>
                  the replay did not agree
                </p>
                <p>{result.why ?? 'see the rows below'}</p>
                {result.disagreements?.map((d) => (
                  <p key={d.hour} className="note">
                    issuance {d.hour}: the program emitted {d.program}, the replay says {d.replay}
                  </p>
                ))}
              </>
            )}
          </section>
        )}

        <section className="colophon">
          <p className="dateline__label">Do it without us</p>
          <p className="note" style={{ maxWidth: '58ch' }}>
            The button runs on our server. Running it on yours is the point — Node 22.18 or newer,
            no install step, any RPC endpoint with history:
          </p>
          <pre
            style={{
              overflowX: 'auto',
              background: 'var(--color-paper-2)',
              border: 'var(--rule) solid var(--color-rule)',
              padding: 'var(--space-16)',
              fontSize: 'var(--text-sm)',
              marginTop: 'var(--space-16)',
            }}
          >
            <code>{`node scripts/snapshot.ts pieces \\
  --rpc "$RPC" \\
  --program <PROGRAM_ID> \\
  --config  <CONFIG_ADDRESS>`}</code>
          </pre>
        </section>
      </main>
      <footer className="sheet">
        <div className="rail" style={{ paddingBottom: 'var(--space-48)' }}>
          <a href="/">← the plate</a>
          <span className="note">recomputable, not trustless</span>
        </div>
      </footer>
    </>
  )
}
