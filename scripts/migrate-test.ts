// Prepares the disposable test database, and is the ONLY thing that stamps one.
//
//   node scripts/migrate-test.ts
//
// Caller: `npm run migrate:test`, and the developer before running the DB
// tests. The stamp is deliberately not written by a migration: a migration runs
// everywhere, production included, which is exactly backwards. It marks an
// ENVIRONMENT, not a schema (CLAUDE.md).

import { fileURLToPath } from 'node:url'
import { connect } from '../src/lib/db/client.ts'
import { applyMigrations, assertDistinct, readMigrations, stamp } from '../src/lib/db/migrate.ts'

// The relative guard: two URLs, both present, and different. Written as a
// function so "DATABASE_URL is unset" is a refusal rather than a pass.
const url = assertDistinct(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL)

const dir = fileURLToPath(new URL('../migrations', import.meta.url))
const migrations = readMigrations(dir)
if (migrations.length === 0) throw new Error(`no migrations found in ${dir}`)

const client = await connect(url)
try {
  // The absolute guard lives inside `stamp`: a populated database with no stamp
  // is what production looks like, and it is refused.
  await stamp(client, 'stamped by scripts/migrate-test.ts')
  const { applied, skipped } = await applyMigrations(client, migrations, (l) => process.stdout.write(`${l}\n`))
  process.stdout.write(`stamped, applied ${applied.length}, already present ${skipped.length}\n`)
} finally {
  await client.end()
}
