// Applies pending migrations to DATABASE_URL.
//
//   node scripts/migrate.ts
//
// Caller: the operator, and the Vercel build. It is safe to run repeatedly:
// applied versions are recorded and skipped.

import { fileURLToPath } from 'node:url'
import { connect } from '../src/lib/db/client.ts'
import { applyMigrations, readMigrations } from '../src/lib/db/migrate.ts'

const url = process.env.DATABASE_URL
if (url === undefined || url === '') throw new Error('DATABASE_URL is not set')

const dir = fileURLToPath(new URL('../migrations', import.meta.url))
const migrations = readMigrations(dir)
// A migration set that came back empty reads exactly like "nothing to do", and
// is far more often a wrong path (CLAUDE.md, a verification that returns
// nothing needs a control).
if (migrations.length === 0) throw new Error(`no migrations found in ${dir}`)

const client = await connect(url)
try {
  const { applied, skipped } = await applyMigrations(client, migrations, (l) => process.stdout.write(`${l}\n`))
  process.stdout.write(`applied ${applied.length}, already present ${skipped.length}\n`)
} finally {
  await client.end()
}
