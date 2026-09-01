// The migration runner, and the two guards that decide which database it is
// allowed to touch.
//
// Caller: `scripts/migrate.ts` (the real database, and the Vercel build) and
// `scripts/migrate-test.ts` (the disposable one). Nothing imports this at
// request time.
//
// It was split out of B0 deliberately: a migration runner that has never run
// against a Postgres instance is unverified code, and there was no project
// database until this batch (`docs/batches.md`, D14).

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A constant, and it must stay one. `pg_advisory_lock` keys are just integers;
 * two deployments racing on the same key serialise, and two racing on
 * different keys both migrate.
 */
export const MIGRATION_LOCK_KEY = 4_182_909_117

/** The table the stamp lives in. Its EXISTENCE is the stamp. */
export const DISPOSABLE_TABLE = 'disposable_database'

export interface Migration {
  version: number
  name: string
  sql: string
}

/** The narrow slice of a Postgres client this file needs. */
export interface Queryable {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

/**
 * Reads `NNNN_name.sql` from a directory, in order.
 *
 * Refuses a gap or a duplicate. A missing 0003 between 0002 and 0004 means a
 * file was deleted or never committed, and running 0004 against a database
 * that never saw 0003 produces a schema no file describes.
 */
export function readMigrations(dir: string): Migration[] {
  const migrations = readdirSync(dir)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .map((file) => ({
      version: Number(file.slice(0, 4)),
      name: file.slice(5, -4),
      sql: readFileSync(join(dir, file), 'utf8'),
    }))
    .sort((a, b) => a.version - b.version)

  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(`migrations must be contiguous from 0001; found ${m.version} at position ${i + 1}`)
    }
  })
  return migrations
}

export interface ApplyResult {
  applied: Migration[]
  skipped: number[]
}

/**
 * Applies every migration the database has not recorded, under an advisory
 * lock, each in its own transaction.
 *
 * **Applied versions are recorded and skipped, and this is why the SQL of an
 * applied migration is never edited** (CLAUDE.md): editing the file fixes the
 * file and nothing else, every database that ran the old version keeps the old
 * schema, and the file now lies about what those databases contain.
 */
export async function applyMigrations(
  client: Queryable,
  migrations: Migration[],
  log: (line: string) => void = () => {},
): Promise<ApplyResult> {
  await client.query(`
    create table if not exists schema_migrations (
      version    integer     primary key,
      name       text        not null,
      applied_at timestamptz not null default now()
    )
  `)

  // Taken before the applied set is read, or two runners could both read
  // "0002 is missing" and both try to apply it.
  await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY])
  try {
    const { rows } = await client.query('select version from schema_migrations')
    const already = new Set(rows.map((r) => Number(r.version)))
    const applied: Migration[] = []

    for (const migration of migrations) {
      if (already.has(migration.version)) continue
      log(`applying ${String(migration.version).padStart(4, '0')}_${migration.name}`)
      await client.query('begin')
      try {
        await client.query(migration.sql)
        await client.query('insert into schema_migrations (version, name) values ($1, $2)', [
          migration.version,
          migration.name,
        ])
        await client.query('commit')
      } catch (error) {
        await client.query('rollback')
        throw new Error(`migration ${migration.version} failed: ${(error as Error).message}`)
      }
      applied.push(migration)
    }
    return { applied, skipped: [...already].sort((a, b) => a - b) }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY])
  }
}

async function hasTable(client: Queryable, table: string): Promise<boolean> {
  const { rows } = await client.query(
    'select 1 from information_schema.tables where table_schema = $1 and table_name = $2',
    ['public', table],
  )
  return rows.length > 0
}

async function userTables(client: Queryable): Promise<string[]> {
  const { rows } = await client.query(
    'select table_name from information_schema.tables where table_schema = $1',
    ['public'],
  )
  return rows.map((r) => String(r.table_name)).sort()
}

/**
 * The ABSOLUTE guard: this database carries the stamp.
 *
 * Written as a positive assertion against a known value, never as an equality
 * against another variable that could itself be empty. `TEST_DATABASE_URL !==
 * DATABASE_URL` passes when `DATABASE_URL` is unset, and then truncates
 * production (CLAUDE.md).
 *
 * Every destructive test helper calls this, and the test runner refuses to
 * start without it.
 */
export async function assertDisposable(client: Queryable): Promise<void> {
  if (!(await hasTable(client, DISPOSABLE_TABLE))) {
    throw new Error(
      `this database carries no \`${DISPOSABLE_TABLE}\` stamp, so it is not a test database.\n` +
        'Run `npm run migrate:test` against TEST_DATABASE_URL to create one. The stamp is ' +
        'deliberately NOT written by a migration: a migration runs everywhere, production ' +
        'included, which is exactly backwards. It marks an ENVIRONMENT, not a schema.',
    )
  }
}

/**
 * The guard on the stamping itself, which is the one operation that can bless
 * a database as disposable.
 *
 * A database that already carries the stamp is fine. A database with **no user
 * tables at all** is fine, because it cannot be production. Anything else is
 * refused: production has tables and no stamp, and that is precisely the shape
 * this rejects.
 */
export async function assertStampable(client: Queryable): Promise<void> {
  if (await hasTable(client, DISPOSABLE_TABLE)) return
  const tables = await userTables(client)
  if (tables.length === 0) return
  throw new Error(
    `refusing to stamp: this database already holds ${tables.length} table(s) ` +
      `(${tables.slice(0, 5).join(', ')}) and carries no \`${DISPOSABLE_TABLE}\` stamp.\n` +
      'A populated, unstamped database is what production looks like.',
  )
}

/** Writes the stamp. Called only by `scripts/migrate-test.ts`. */
export async function stamp(client: Queryable, note: string): Promise<void> {
  await assertStampable(client)
  await client.query(`
    create table if not exists ${DISPOSABLE_TABLE} (
      stamped_at timestamptz not null default now(),
      note       text        not null
    )
  `)
  await client.query(`insert into ${DISPOSABLE_TABLE} (note) values ($1)`, [note])
}

/**
 * The RELATIVE guard: two URLs that answer different questions.
 *
 * It catches "same target twice"; `assertDisposable` catches "wrong target".
 * Both are needed, always, and neither substitutes for the other.
 */
export function assertDistinct(testUrl: string | undefined, prodUrl: string | undefined): string {
  if (testUrl === undefined || testUrl === '') throw new Error('TEST_DATABASE_URL is not set')
  // The production URL being unset is not permission to proceed. It is the
  // exact condition that makes a bare `!==` pass and then truncate production.
  if (prodUrl === undefined || prodUrl === '') {
    throw new Error('DATABASE_URL is not set, so "the test database is a different one" cannot be checked')
  }
  if (testUrl === prodUrl) throw new Error('TEST_DATABASE_URL and DATABASE_URL are the same database')
  return testUrl
}
