// Drives the CLI, not the library. Falsify by deleting the probe call in
// `selectOracle` and watching the silent gateway get chosen.

import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCRIPT = join(import.meta.dirname, '..', 'crank.ts')
const fixture = (name: string) => join(import.meta.dirname, 'fixtures', name)
const run = (args: string[]) =>
  execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: 'pipe' })

describe('scripts/crank.ts plan', () => {
  it('refuses the stale and off-queue members before any probe', () => {
    const out = run(['plan', fixture('queue.json')])
    expect(out).toMatch(/refused +charlie +stale-heartbeat/)
    expect(out).toMatch(/refused +delta +not-on-queue/)
    expect(out).toMatch(/on-chain live +2/)
  })

  // The measured failure: an oracle that passes every on-chain check and whose
  // gateway is dead. It must not be the one the hour is requested with.
  it('skips the live oracle whose gateway is silent and takes the next', () => {
    const out = run(['plan', fixture('queue.json')])
    expect(out).toMatch(/refused +alpha +gateway-silent/)
    expect(out).toContain('chosen         bravo')
  })

  it('round-robins from the start index', () => {
    const out = run(['plan', fixture('queue.json'), '--start', '1'])
    expect(out).toContain('chosen         bravo')
  })

  it('tries an avoided member last rather than never', () => {
    // bravo is avoided and alpha is silent, so bravo still serves.
    const out = run(['plan', fixture('queue.json'), '--avoid', 'bravo'])
    expect(out).toContain('chosen         bravo')
    expect(out).toMatch(/refused +alpha +gateway-silent/)
  })

  it('records "no oracle available" and exits non-zero when none answer', () => {
    try {
      run(['plan', fixture('all-silent.json')])
      throw new Error('should have exited non-zero')
    } catch (error) {
      const e = error as { status: number; stdout: string }
      expect(e.status).toBe(3)
      expect(e.stdout).toContain('none: no oracle available')
      expect(e.stdout).toContain('there is no re-request')
    }
  })
})
