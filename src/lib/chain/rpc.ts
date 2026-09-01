// One JSON-RPC caller, with the retry that matters.
//
// Caller: `events.ts`, `latest.ts`, `collection.ts`. It exists because the
// second and third had their own copies without the retry, and the front page
// answered **HTTP 500 on roughly one request in three** while the cranker, the
// capture harness and the full-replay job were sharing one provider key.
//
// **Helius reports a rate limit as JSON-RPC `-32429` inside an HTTP 200.** A
// retry loop that only watches the status code gives up on exactly the error it
// exists to survive; this was already fixed once in `events.ts` on 2026-09-01
// and the fix had not reached the other two.

export class FatalRpcError extends Error {}

export async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  let last: Error | undefined
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        cache: 'no-store',
      })
      if (res.status === 429 || res.status >= 500) throw new Error(`${method}: HTTP ${res.status}`)
      if (!res.ok) throw new FatalRpcError(`${method}: HTTP ${res.status}`)
      const body = (await res.json()) as { result?: unknown; error?: { code?: number; message: string } }
      if (body.error) {
        if (body.error.code === -32429) throw new Error(`${method}: ${body.error.message}`)
        throw new FatalRpcError(`${method}: ${body.error.message}`)
      }
      // `getTransaction` answers `null` for a pruned signature, and that is a
      // real answer rather than an error.
      if (!('result' in body)) throw new FatalRpcError(`${method}: no result field`)
      return body.result
    } catch (error) {
      if (error instanceof FatalRpcError) throw error
      last = error as Error
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt))
    }
  }
  throw new Error(`${method}: gave up after 5 attempts (${last?.message})`)
}
