// Every pair, recomputed in both themes, from the tokens the site actually ships.
//
// It reads `tokens.css` rather than a copy of the values, because a table of
// ratios goes stale the first time a token moves and a stale table is worse
// than none: it is a check that reports the old palette as passing.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { contrastRatio, FLOOR, ratio, type Floor } from '../contrast.ts'

const css = readFileSync(new URL('../../../../tokens.css', import.meta.url), 'utf8')

/** The declarations inside one selector block, as a token -> colour map. */
function band(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  expect(start, `${selector} not found in tokens.css`).toBeGreaterThan(-1)
  const open = css.indexOf('{', start)
  const close = css.indexOf('\n}', open)
  const out: Record<string, string> = {}
  for (const line of css.slice(open, close).split('\n')) {
    const m = /^\s*(--[a-z0-9-]+):\s*(oklch\([^)]*\))\s*;/.exec(line)
    if (m !== null) out[m[1]!] = m[2]!
  }
  return out
}

const light = band(':root {')
const dark = { ...light, ...band('[data-theme="dark"] {') }

/** Every pair the design puts on screen, with the floor its role carries. */
const PAIRS: { name: string; fg: string; bg: string; floor: Floor }[] = [
  { name: 'body prose', fg: '--color-ink-2', bg: '--color-paper', floor: 'text' },
  { name: 'values', fg: '--color-ink', bg: '--color-paper', floor: 'text' },
  { name: 'notes', fg: '--color-ink-3', bg: '--color-paper', floor: 'text' },
  { name: 'notes on the raised surface', fg: '--color-ink-3', bg: '--color-paper-2', floor: 'text' },
  { name: 'values on the raised surface', fg: '--color-ink', bg: '--color-paper-2', floor: 'text' },
  { name: 'table stripe prose', fg: '--color-ink-2', bg: '--color-paper-2', floor: 'text' },
  { name: 'a failed verdict', fg: '--color-accent', bg: '--color-paper', floor: 'text' },
  { name: 'a failed verdict, raised', fg: '--color-accent', bg: '--color-paper-2', floor: 'text' },
  // The clock is large display type; it is held to the text floor anyway
  // because it is the first thing on the screen.
  { name: 'the clock', fg: '--color-ink', bg: '--color-paper', floor: 'text' },
  // The chip: its meaning is its word, so its word is what carries the floor.
  { name: 'DEVNET chip text', fg: '--color-warn-ink', bg: '--color-warn', floor: 'text' },
  // The pill's boundary, not its fill: the amber ground is a hue difference
  // that a luminance ratio cannot see, so the rim is what carries the edge.
  { name: 'the chip edge against the page', fg: '--color-warn-edge', bg: '--color-paper', floor: 'nonText' },
  // The plate: `issued` is a filled disc and `waiting` is a ring. The fill is
  // the only thing that says which, so the weakest tier carries the floor.
  { name: 'tier Whelp, issued', fg: '--tier-whelp', bg: '--color-paper', floor: 'nonText' },
  { name: 'tier Wyrm, issued', fg: '--tier-wyrm', bg: '--color-paper', floor: 'nonText' },
  { name: 'tier Elder, issued', fg: '--tier-elder', bg: '--color-paper', floor: 'nonText' },
  { name: 'tier Ancient, issued', fg: '--color-accent-2', bg: '--color-paper', floor: 'nonText' },
  { name: 'tier Sovereign, issued', fg: '--color-accent', bg: '--color-paper', floor: 'nonText' },
  // Controls and the switch.
  { name: 'the button', fg: '--color-paper', bg: '--color-ink', floor: 'text' },
  { name: 'the current pager page', fg: '--color-paper', bg: '--color-ink', floor: 'text' },
  { name: 'the switch disc', fg: '--color-ink-2', bg: '--color-paper-2', floor: 'nonText' },
  { name: 'the focus ring', fg: '--color-focus', bg: '--color-paper', floor: 'nonText' },
  { name: 'the masthead rule', fg: '--color-rule-firm', bg: '--color-paper', floor: 'nonText' },
  { name: 'a hairline', fg: '--color-rule', bg: '--color-paper', floor: 'hairline' },
  { name: 'a waiting slot', fg: '--color-rule', bg: '--color-paper', floor: 'hairline' },
]

describe.each([
  ['light', light],
  ['dark', dark],
])('the %s band clears every floor', (name, tokens) => {
  it.each(PAIRS)('$name', ({ fg, bg, floor }) => {
    const a = tokens[fg]
    const b = tokens[bg]
    expect(a, `${fg} is not defined in the ${name} band`).toBeDefined()
    expect(b, `${bg} is not defined in the ${name} band`).toBeDefined()
    expect(ratio(a!, b!)).toBeGreaterThanOrEqual(FLOOR[floor])
  })
})

describe('the instrument', () => {
  it('gives 21 for black on white and 1 for a colour on itself', () => {
    // A ratio check that cannot reach its extremes is measuring something else.
    expect(ratio('oklch(100% 0 0)', 'oklch(0% 0 0)')).toBe(21)
    expect(ratio('oklch(46% 0.18 27)', 'oklch(46% 0.18 27)')).toBe(1)
  })

  it('round-trips the canonical OKLCH for pure sRGB red', () => {
    expect(ratio('oklch(62.8% 0.2577 29.23)', 'oklch(100% 0 0)')).toBeCloseTo(4.0, 1)
  })

  it('would fail a pair that is genuinely too low', () => {
    // Falsification: the floors are only worth something if a bad pair trips.
    expect(contrastRatio('oklch(78% 0.15 75)', 'oklch(93% 0.012 85)')).toBeLessThan(FLOOR.text)
  })

  it('reads two different bands out of tokens.css', () => {
    // If the parser silently returned the same map twice, every dark assertion
    // above would be a light assertion wearing a label.
    expect(dark['--color-paper']).not.toBe(light['--color-paper'])
    expect(dark['--color-ink']).not.toBe(light['--color-ink'])
    expect(Object.keys(light).length).toBeGreaterThan(12)
  })
})

describe('there is no third theme', () => {
  it('never selects a palette from prefers-color-scheme', () => {
    for (const file of ['tokens.css', 'app/globals.css']) {
      const text = readFileSync(new URL(`../../../../${file}`, import.meta.url), 'utf8')
      // The comment in tokens.css explains the absence; a real at-rule is what
      // would reintroduce `system` without anything being labelled one.
      expect(text).not.toMatch(/@media[^{]*prefers-color-scheme/)
    }
  })

  it('offers exactly two themes and defaults to light', async () => {
    const { THEMES, DEFAULT_THEME, normalise } = await import('../theme.ts')
    expect([...THEMES]).toEqual(['light', 'dark'])
    expect(DEFAULT_THEME).toBe('light')
    for (const junk of ['system', 'auto', '', null, undefined, 'DARK']) {
      expect(normalise(junk)).toBe('light')
    }
  })
})
