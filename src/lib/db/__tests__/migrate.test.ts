// The guards are the point of this file, and a guard that has never been made
// to fail is not a guard.
//
// Everything here runs against a fake client, so the failure cases can be built
// on purpose — including "the database is production", which is not a state a
// test may create for real.

import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DISPOSABLE_TABLE,
  MIGRATION_LOCK_KEY,
  applyMigrations,
  assertDisposable,
  assertDistinct,
  assertStampable,
  readMigrations,
  stamp,
  type Queryable,
} from '../migrate.ts'

/** Records every statement, and answers the two catalogue queries by hand. */
function fakeDb(options: { tables?: string[]; applied?: number[] } = {}) {
  const tables = new Set(options.tables ?? [])
  const applied = new Set(options.applied ?? [])
  const log: string[] = []
  const db: Queryable = {
    query: async (text, values) => {
      log.push(text.trim().split('\n')[0]!.trim())
      if (text.includes('information_schema.tables') && text.includes('table_name = $2')) {
        return { rows: tables.has(String(values![1])) ? [{ '?column?': 1 }] : [] }
      }
      if (text.includes('information_schema.tables')) {
        return { rows: [...tables].map((t) => ({ table_name: t })) }
      }
      if (text.startsWith('select version from schema_migrations')) {
        return { rows: [...applied].map((v) => ({ version: v })) }
      }
      if (text.trim().startsWith('create table')) {
        const name = /create table (?:if not exists )?(\w+)/.exec(text)?.[1]
        if (name !== undefined) tables.add(name)
      }
      return { rows: [] }
    },
  }
  return { db, log, tables }
}

const migrations = [
  { version: 1, name: 'one', sql: 'create table a ()' },
  { version: 2, name: 'two', sql: 'create table b ()' },
]

describe('reading the migration directory', () => {
  it('reads the real migrations, contiguous from 0001', () => {
    const dir = fileURLToPath(new URL('../../../../migrations', import.meta.url))
    const found = readMigrations(dir)
    // The control: this repository has a first migration, and a run that found
    // none would otherwise look like a clean directory.
    expect(found.length).toBeGreaterThanOrEqual(1)
    expect(found[0]!.version).toBe(1)
    expect(found[0]!.name).toBe('issuance_events')
    expect(found[0]!.sql).toMatch(/create table issuance_events/)
  })
})

describe('applying', () => {
  it('applies everything once and skips it forever after', async () => {
    const first = fakeDb()
    const a = await applyMigrations(first.db, migrations)
    expect(a.applied.map((m) => m.version)).toEqual([1, 2])

    const second = fakeDb({ applied: [1, 2] })
    const b = await applyMigrations(second.db, migrations)
    expect(b.applied).toEqual([])
    expect(b.skipped).toEqual([1, 2])
  })

  it('applies only what is missing', async () => {
    const { db } = fakeDb({ applied: [1] })
    const result = await applyMigrations(db, migrations)
    expect(result.applied.map((m) => m.version)).toEqual([2])
  })

  it('takes the advisory lock before reading the applied set, and releases it', async () => {
    // Reading first and locking second lets two runners both decide 0002 is
    // missing. The order is the guarantee, so it is asserted.
    const { db, log } = fakeDb()
    await applyMigrations(db, migrations)
    const lock = log.findIndex((l) => l.includes('pg_advisory_lock'))
    const read = log.findIndex((l) => l.startsWith('select version from schema_migrations'))
    expect(lock).toBeGreaterThan(-1)
    expect(lock).toBeLessThan(read)
    expect(log.some((l) => l.includes('pg_advisory_unlock'))).toBe(true)
  })

  it('releases the lock even when a migration fails', async () => {
    const log: string[] = []
    const db: Queryable = {
      query: async (text) => {
        log.push(text.trim().split('\n')[0]!.trim())
        if (text === 'boom') throw new Error('syntax error')
        if (text.startsWith('select version from schema_migrations')) return { rows: [] }
        return { rows: [] }
      },
    }
    await expect(applyMigrations(db, [{ version: 1, name: 'bad', sql: 'boom' }])).rejects.toThrow(
      /migration 1 failed/,
    )
    expect(log).toContain('rollback')
    expect(log.some((l) => l.includes('pg_advisory_unlock'))).toBe(true)
  })

  it('uses one fixed lock key, because two keys do not serialise', () => {
    expect(MIGRATION_LOCK_KEY).toBe(4_182_909_117)
  })

  it('refuses a gap in the numbering, on a real directory', () => {
    // 0003 never committed: running 0004 against a database that never saw it
    // produces a schema no file describes. Driven through `readMigrations`
    // itself rather than a copy of its rule, or the test passes while the
    // function is broken.
    const dir = mkdtempSync(join(tmpdir(), 'drakes-migrations-'))
    try {
      writeFileSync(join(dir, '0001_first.sql'), 'select 1')
      writeFileSync(join(dir, '0003_third.sql'), 'select 1')
      expect(() => readMigrations(dir)).toThrow(/contiguous/)

      writeFileSync(join(dir, '0002_second.sql'), 'select 1')
      expect(readMigrations(dir).map((m) => m.version)).toEqual([1, 2, 3])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('the absolute guard: this database carries the stamp', () => {
  it('passes on a stamped database', async () => {
    const { db } = fakeDb({ tables: [DISPOSABLE_TABLE] })
    await expect(assertDisposable(db)).resolves.toBeUndefined()
  })

  it('refuses a database with no stamp', async () => {
    const { db } = fakeDb({ tables: ['issuance_events'] })
    await expect(assertDisposable(db)).rejects.toThrow(/carries no `disposable_database` stamp/)
  })

  it('refuses an EMPTY database too', async () => {
    // The one that matters: an empty result reads exactly like a clean bill of
    // health, and the check has to be a positive assertion that the stamp is
    // present -- not the absence of anything alarming.
    const { db } = fakeDb({ tables: [] })
    await expect(assertDisposable(db)).rejects.toThrow(/stamp/)
  })
})

describe('the guard on stamping', () => {
  it('stamps a fresh database', async () => {
    const { db, tables } = fakeDb({ tables: [] })
    await stamp(db, 'test')
    expect(tables.has(DISPOSABLE_TABLE)).toBe(true)
  })

  it('re-stamps an already-stamped one', async () => {
    const { db } = fakeDb({ tables: [DISPOSABLE_TABLE, 'issuance_events'] })
    await expect(stamp(db, 'again')).resolves.toBeUndefined()
  })

  it('refuses a populated database with no stamp, which is what production looks like', async () => {
    const { db } = fakeDb({ tables: ['issuance_events', 'schema_migrations'] })
    await expect(assertStampable(db)).rejects.toThrow(/what production looks like/)
    await expect(stamp(db, 'no')).rejects.toThrow(/refusing to stamp/)
  })
})

describe('the relative guard: a different database', () => {
  it('passes on two different URLs', () => {
    expect(assertDistinct('postgres://a', 'postgres://b')).toBe('postgres://a')
  })

  it('refuses the same URL twice', () => {
    expect(() => assertDistinct('postgres://a', 'postgres://a')).toThrow(/the same database/)
  })

  it('refuses when the production URL is UNSET, instead of passing', () => {
    // `if (TEST_DATABASE_URL !== DATABASE_URL)` passes when DATABASE_URL is
    // unset, and then truncates production. This is that exact case.
    expect(() => assertDistinct('postgres://a', undefined)).toThrow(/DATABASE_URL is not set/)
    expect(() => assertDistinct('postgres://a', '')).toThrow(/DATABASE_URL is not set/)
  })

  it('refuses when the test URL is unset', () => {
    expect(() => assertDistinct(undefined, 'postgres://b')).toThrow(/TEST_DATABASE_URL is not set/)
  })
})
