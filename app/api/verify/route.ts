// The public replay, as an endpoint, so /verify can put it behind one button.
//
// Caller: `app/verify/page.tsx` in every B6 direction.
//
// **It runs the same code the published command runs.** `fetchIssuanceSettled`
// pages the program's signatures and `replayFromChain` rebuilds the survivor
// permutation from the revealed values — no account of ours, no artifact of
// ours, no database (D21). The button is a convenience for a reader who has not
// cloned the repository; it is not a different claim, and the page says so and
// prints the command.

import { fetchIssuanceSettled } from '../../../src/lib/chain/events.ts'
import { replayFromChain } from '../../../src/lib/snapshot/reconcile.ts'
import { readConfig } from '../../../src/lib/site/config.ts'
import { clusterName } from '../../../src/lib/snapshot/rpc.ts'

export const dynamic = 'force-dynamic'
// The replay walks every signature the program has. At 4,000 issuances that is
// minutes, not seconds, and a default 15 s function timeout would turn a
// working verification into a failed one.
export const maxDuration = 300

export async function GET(): Promise<Response> {
  const started = Date.now()
  try {
    const config = readConfig()
    const cluster = await clusterName(config.rpcUrl)
    if (cluster === 'unknown') {
      return Response.json({ ok: false, why: 'the cluster could not be classified' }, { status: 503 })
    }

    const events = await fetchIssuanceSettled({
      rpcUrl: config.rpcUrl,
      programId: config.programId,
      config: config.config,
    })
    // A verification that returns nothing needs a control (CLAUDE.md): zero
    // events reads exactly like "nothing is wrong".
    if (events.length === 0) {
      return Response.json(
        { ok: false, why: 'the chain returned no settlements; that is a broken query, not a clean result' },
        { status: 503 },
      )
    }

    const replay = replayFromChain(events, config.collectionSize)
    const minted = replay.rows.filter((r) => r.minted)
    return Response.json({
      ok: replay.disagreements.length === 0,
      cluster,
      program: config.programId,
      settled: events.length,
      minted: minted.length,
      distinct: new Set(minted.map((r) => r.replayed)).size,
      agreed: minted.length - replay.disagreements.length,
      disagreements: replay.disagreements.map((r) => ({
        hour: Number(r.hour),
        program: r.emitted,
        replay: r.replayed,
      })),
      remaining: replay.remaining,
      size: replay.size,
      tookMs: Date.now() - started,
    })
  } catch (error) {
    return Response.json(
      { ok: false, why: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
