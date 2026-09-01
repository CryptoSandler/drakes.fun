// One Postgres connection, over Neon's driver.
//
// Caller: `scripts/migrate.ts`, `scripts/migrate-test.ts`,
// `scripts/index-events.ts`, and the site's server components.
//
// The WebSocket `Client` rather than the HTTP `neon()` helper, because
// `pg_advisory_lock` is a SESSION lock: over HTTP each statement is its own
// connection, the lock is released the instant it is taken, and two concurrent
// migration runs would both proceed while appearing to serialise.

import { Client, neonConfig } from '@neondatabase/serverless'

export interface Db {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
  end: () => Promise<void>
}

export async function connect(url: string): Promise<Db> {
  if (!/^postgres(ql)?:\/\//.test(url)) throw new Error('not a Postgres URL')
  // Node 22 has a global WebSocket; the driver does not assume one.
  neonConfig.webSocketConstructor ??= globalThis.WebSocket as never
  const client = new Client(url)
  await client.connect()
  return {
    query: (text, values) => client.query(text, values) as never,
    end: () => client.end(),
  }
}
