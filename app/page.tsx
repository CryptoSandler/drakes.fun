// The front page. Minimal on purpose: B6 is the batch that designs a site, and
// this one exists to prove the reads are real.
//
// Caller: Next's router, at `/`.
//
// **Every figure here is read from the chain at request time and labelled with
// the slot it was read at** (DESIGN.md §7). The Postgres cache the event runner
// fills is not consulted. A page that renders what a job recorded is telling
// the reader what we believe; the reader is the person who did not send the
// transaction.

import { clusterName } from '../src/lib/snapshot/rpc.ts'
import { fetchLatestSettled, formatAmount, readBalance } from '../src/lib/chain/latest.ts'
import { encodeBase58 } from '../src/lib/solana/base58.ts'
import { toHex } from '../src/lib/snapshot/merkle.ts'
import { readConfig } from '../src/lib/site/config.ts'

// Read at request time. A cached render of a chain read is a chain read with an
// unlabelled slot, which is the one thing §7 forbids.
export const dynamic = 'force-dynamic'

const short = (s: string): string => `${s.slice(0, 6)}…${s.slice(-6)}`

export default async function Page() {
  const config = readConfig()
  const cluster = await clusterName(config.rpcUrl)

  // Classified to a name, server-side, from the genesis hash. "unknown" is a
  // real answer and it stops the page rather than mislabelling every number on
  // it (CLAUDE.md). This page asks for no signature, so refusing costs a
  // render; on the page that does ask, it costs nothing and saves everything.
  if (cluster === 'unknown') {
    return (
      <main>
        <h1>Drakes</h1>
        <p className="refuse">
          The cluster this deployment is pointed at could not be classified from its genesis hash.
          Rather than label these figures with a network that might be the wrong one, the page is
          showing none.
        </p>
      </main>
    )
  }

  const [latest, reserve] = await Promise.all([
    fetchLatestSettled({ rpcUrl: config.rpcUrl, programId: config.programId, config: config.config }),
    config.reserveOwner === undefined
      ? Promise.resolve(null)
      : readBalance({ rpcUrl: config.rpcUrl, owner: config.reserveOwner, mint: config.pumpMint }),
  ])

  return (
    <main>
      <h1>Drakes</h1>
      <p className="cluster">
        <span className="label">network</span> {cluster}
      </p>

      <section>
        <h2>Last issuance</h2>
        {latest === null ? (
          <p className="dim">
            No issuance has settled on this program yet. That is the chain&rsquo;s answer, not a
            placeholder.
          </p>
        ) : (
          <dl>
            <Row label="issuance" value={String(latest.hour)} />
            <Row
              label="piece"
              value={latest.minted ? `#${latest.pieceId} of ${config.collectionSize}` : 'none minted'}
            />
            <Row label="recipient" value={short(encodeBase58(latest.recipient))} mono />
            <Row label="held" value={latest.balance.toString()} mono />
            <Row label="eligible supply" value={latest.eligibleSupply.toString()} mono />
            <Row label="point" value={latest.point.toString()} mono />
            <Row label="snapshot slot" value={latest.snapshotSlot.toString()} mono />
            <Row label="reveal slot" value={latest.revealSlot.toString()} mono />
            <Row label="root" value={short(toHex(latest.root))} mono />
            <Row label="signature" value={short(latest.signature)} mono />
          </dl>
        )}
      </section>

      <section>
        <h2>Reserve</h2>
        {reserve === null ? (
          // The neutral wording. It neither promises a reserve nor forbids one,
          // and it is true in both futures (CLAUDE.md, decisions with a door).
          <p className="dim">
            <strong>There is no reserve yet.</strong> The program running today issues pieces and
            holds nothing — that is what makes it deployable before an audit. The vault, the fee
            claim and redemption are a second program, and until it is deployed and audited any
            accumulated <code>$PUMP</code> is under temporary custody by a multisig. Anyone who
            calls that custodial is right.
          </p>
        ) : (
          <dl>
            <Row label="reserve" value={`${formatAmount(reserve.amount, reserve.decimals)} $PUMP`} mono />
            <Row label="read at slot" value={reserve.slot.toString()} mono />
            <Row label="holder" value={short(config.reserveOwner!)} mono />
          </dl>
        )}
      </section>

      <p className="foot">
        Every figure above was read from the chain when this page was rendered, and carries the slot
        it was read at. None of it comes from our database. The commands that recompute it from the
        chain, with no dependency on anything we host, are in the repository&rsquo;s README.
      </p>
    </main>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={mono ? 'mono' : undefined}>{value}</dd>
    </>
  )
}
