// The live half of /verify: the last 24 hours, read from the chain on request.
//
// Caller: `app/verify/page.tsx`.
//
// It reads the chain, not the Postgres cache. The cache exists so a list page
// does not make thousands of RPC calls; it is never what a verification reads,
// because the point of the page is that the reader does not have to believe our
// records.

import { fetchRecentSettled } from '../../../../src/lib/chain/latest.ts'
import { verifyRecent } from '../../../../src/lib/chain/recent.ts'
import { readConfig } from '../../../../src/lib/site/config.ts'
import { clusterName } from '../../../../src/lib/snapshot/rpc.ts'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const WINDOW = 24

export async function GET(): Promise<Response> {
  const started = Date.now()
  try {
    const config = readConfig()
    const cluster = await clusterName(config.rpcUrl)
    if (cluster === 'unknown') {
      return Response.json({ ok: false, why: 'the cluster could not be classified' }, { status: 503 })
    }
    const recent = await fetchRecentSettled({
      rpcUrl: config.rpcUrl,
      programId: config.programId,
      config: config.config,
      limit: WINDOW,
    })
    if (recent.length === 0) {
      // A verification that returns nothing needs a control (CLAUDE.md).
      return Response.json(
        { ok: false, why: 'the chain returned no settlements; that is a broken query, not a clean result' },
        { status: 503 },
      )
    }
    const report = verifyRecent(recent)
    return Response.json({
      ok: report.agreed === report.checked && report.repeated.length === 0,
      cluster,
      window: WINDOW,
      ...report,
      tookMs: Date.now() - started,
    })
  } catch (error) {
    return Response.json(
      { ok: false, why: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
