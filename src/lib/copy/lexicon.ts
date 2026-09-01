import { globSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { BANNED_TERMS } from './banned-terms.ts'

const ROOT = join(import.meta.dirname, '..', '..', '..')

/** Source that a person can read, plus every identifier in it (DESIGN.md §6). */
export const CORPUS_PATTERNS = [
  'src/**/*.ts',
  'src/**/*.tsx',
  'app/**/*.ts',
  'app/**/*.tsx',
  'scripts/**/*.ts',
  // The ban covers identifiers, and an on-chain instruction name is the most
  // permanent identifier this project has: it is in the IDL forever.
  'programs/**/*.rs',
  // The placeholder is the most public copy this project has. It is scanned.
  'public/**/*.html',
  'public/**/*.txt',
  'content/**/*.md',
  'content/**/*.json',
]

/** Tests carry the forbidden vocabulary on purpose; the list file is the list. */
const EXCLUDED = ['src/lib/copy/banned-terms.ts']
const isExcluded = (path: string) =>
  path.includes('__tests__') || EXCLUDED.includes(path)

export interface Match {
  term: string
  line: number
  file?: string
}

// An alphanumeric edge, so `_` separates for free and `settle_issuance` reads
// as two words. camelCase does not separate on its own, so it is split before
// matching — otherwise the identifier half of the rule catches nothing, which
// is precisely the leak DESIGN.md §6 names.
const EDGE = '[^A-Za-z0-9]'
const separate = (line: string) => line.replace(/([a-z0-9])([A-Z])/g, '$1 $2')

// ponytail: whole words only, so a suffixed form ("ticketing") slips. Add the
// stem to BANNED_TERMS if a real leak ever appears; matching on stems would
// also flag ordinary English and canvas API names that merely end or begin
// with a listed word, which is why it is not the default.
const matcher = (term: string) =>
  new RegExp(`(?<=^|${EDGE})${term.replace(/ /g, `\\s+`)}(?=$|${EDGE})`, 'gi')

export function findBanned(text: string): Match[] {
  const found: Match[] = []
  text.split('\n').forEach((raw, index) => {
    const line = separate(raw)
    for (const term of BANNED_TERMS) {
      if (matcher(term).test(line)) found.push({ term, line: index + 1 })
    }
  })
  return found
}

/** Occurrences of one word, same edges. The positive half of the control. */
export function countWord(text: string, word: string): number {
  return separate(text).match(matcher(word))?.length ?? 0
}

export function corpusFiles(): string[] {
  const files = CORPUS_PATTERNS.flatMap((pattern) =>
    globSync(pattern, { cwd: ROOT }).map((f) =>
      relative('', f).split(sep).join('/'),
    ),
  )
  return [...new Set(files)].filter((f) => !isExcluded(f)).sort()
}

export function scanCorpus(): Match[] {
  return corpusFiles().flatMap((file) =>
    findBanned(readFileSync(join(ROOT, file), 'utf8')).map((m) => ({
      ...m,
      file,
    })),
  )
}
