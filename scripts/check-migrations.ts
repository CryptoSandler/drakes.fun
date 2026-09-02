// Do the three databases agree on what schema they are?
//
//   node scripts/check-migrations.ts
//
// Caller: `/cierre`, before the push. Nothing in the site or the cranker calls
// it.
//
// **The incident this exists for.** On 2026-09-01 migration `0004` was written,
// applied to the test database by the test run, and never applied to
// production. Nothing failed: `hoard_purchases.funded_by` simply did not exist
// there, so the row came back without the field, and `/verify` rendered
// `b.funded_by === 'creator' ? … : 'fees'` — **showing `fees` for a row whose
// provenance the database did not record.** A default dressed as data, on a
// public page, in the one column that is an assertion rather than a
// derivation.
//
// A migration is not "done" when it runs somewhere. It is done when every
// database this project talks to is at the same version, and that is a thing a
// machine can check in two seconds.
//
// It compares the whole version LIST, not the maximum: two databases can share
// a highest version and disagree about a gap underneath it, and a `max()`
// check would call that agreement.

import { connect } from '../src/lib/db/client.ts'

const TARGETS = [
  { label: 'production', env: 'DATABASE_URL' },
  { label: 'preview', env: 'PREVIEW_DATABASE_URL' },
  { label: 'tests', env: 'TEST_DATABASE_URL' },
] as const

interface State {
  label: string
  /** The host, never the URL: the credentials are in it and this gets pasted. */
  host: string
  versions: number[]
  stamped: boolean
}

/** `~/.claude/GATES.md`: the identity of what was measured is what makes the
 *  number trustworthy, not the number. */
const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return '(unparseable URL)'
  }
}

const read = async (label: string, url: string): Promise<State> => {
  const host = hostOf(url)
  const db = await connect(url)
  try {
    const { rows: exists } = await db.query(
      "select to_regclass('public.schema_migrations') is not null as present",
      [],
    )
    if (!(exists[0] as { present: boolean }).present) return { label, host, versions: [], stamped: false }
    const { rows } = await db.query('select version from schema_migrations order by version', [])
    const { rows: stamp } = await db.query(
      "select to_regclass('public.disposable_database') is not null as present",
      [],
    )
    return {
      label,
      host,
      versions: rows.map((r) => Number((r as { version: number }).version)),
      stamped: (stamp[0] as { present: boolean }).present,
    }
  } finally {
    await db.end()
  }
}

const states: State[] = []
const unset: string[] = []
for (const target of TARGETS) {
  const url = process.env[target.env]
  if (url === undefined || url === '') {
    unset.push(target.env)
    continue
  }
  states.push(await read(target.label, url))
}

for (const s of states) {
  process.stdout.write(
    `  ${s.label.padEnd(11)} ${s.host.padEnd(44)} [${s.versions.join(', ') || 'none'}]` +
      `${s.stamped ? '  (disposable)' : ''}\n`,
  )
}

// An unset URL is a failure, not a pass. A check that silently examines two
// databases and calls it three is the shape this script exists to prevent
// (CLAUDE.md: a verification that returns nothing needs a control).
if (unset.length > 0) {
  process.stderr.write(
    `\nrefusing: ${unset.join(', ')} not set, so this checked ${states.length} of ` +
      `${TARGETS.length} databases. An unchecked database is exactly where 0004 hid.\n`,
  )
  process.exit(2)
}

// Exactly one of the three carries the disposable stamp, and it is the test
// one. An absolute assertion, not a comparison between variables.
const stamped = states.filter((s) => s.stamped).map((s) => s.label)
if (stamped.join(',') !== 'tests') {
  process.stderr.write(
    `\nrefusing: the \`disposable_database\` stamp is on [${stamped.join(', ') || 'nothing'}] ` +
      'and it must be on exactly `tests`. Either a URL points somewhere unexpected or a ' +
      'production database has been stamped.\n',
  )
  process.exit(3)
}

const key = (s: State) => s.versions.join(',')
const agreed = new Set(states.map(key))
if (agreed.size !== 1) {
  const highest = states.reduce((a, b) => (b.versions.length > a.versions.length ? b : a))
  process.stderr.write('\nthe three databases do not hold the same schema:\n')
  for (const s of states) {
    const missing = highest.versions.filter((v) => !s.versions.includes(v))
    if (missing.length > 0) {
      process.stderr.write(`  ${s.label} is missing ${missing.join(', ')}\n`)
    }
  }
  process.stderr.write(
    '\nApply every migration to all three in the same close. `npm run migrate` reads ' +
      'DATABASE_URL, so run it once per URL.\n',
  )
  process.exit(1)
}

process.stdout.write(`\nall three agree on [${states[0]!.versions.join(', ')}]\n`)
