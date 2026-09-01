import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BANNED_TERMS } from '../banned-terms.js'
import { findBanned, countWord, scanCorpus, corpusFiles } from '../lexicon.js'

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8')

// The instrument is checked before the instrument is believed (CLAUDE.md, "a
// verification that returns nothing needs a control"). Everything in this
// block runs against files we wrote, whose contents we know exactly.
describe('the scanner itself', () => {
  it('reports every banned term, once each at least', () => {
    const found = new Set(findBanned(fixture('banned.md')).map((m) => m.term))
    expect([...BANNED_TERMS].filter((t) => !found.has(t))).toEqual([])
  })

  it('reports the term inside identifiers, snake_case and camelCase alike', () => {
    const lines = findBanned('const settle_draw = 1\nfunction requestDraw() {}\n')
    expect(lines.map((m) => [m.term, m.line])).toEqual([
      ['draw', 1],
      ['draw', 2],
    ])
  })

  it('reports nothing in a clean file', () => {
    expect(findBanned(fixture('clean.md'))).toEqual([])
  })

  it('reports nothing for words that merely contain a banned term', () => {
    expect(findBanned(fixture('near-misses.md'))).toEqual([])
  })

  // DESIGN.md §6: the positive half of the control. Today it runs against the
  // fixture, because the user-facing corpus does not exist yet. When the site
  // ships (B6) this assertion moves to `scanCorpus`, where DESIGN.md puts it.
  it('counts the control word', () => {
    expect(countWord(fixture('clean.md'), 'issued')).toBeGreaterThanOrEqual(20)
  })
})

describe('the repository', () => {
  // Absolute assertion, not `length > 0`: an empty glob and a clean repository
  // are the same result otherwise (CLAUDE.md, "a schema guard is never ==").
  it('scans a corpus that provably contains a file we know exists', () => {
    expect(corpusFiles()).toContain('src/lib/copy/lexicon.ts')
  })

  it('contains no banned term in any source file', () => {
    expect(scanCorpus()).toEqual([])
  })
})
