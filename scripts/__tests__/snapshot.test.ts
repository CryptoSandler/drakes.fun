// Drives the CLI, not the library: this is the wiring test. Falsify it by
// deleting the `verify` branch at the bottom of scripts/snapshot.ts and
// watching every case here go red (CLAUDE.md, "every new module names its
// caller" — the caller of the snapshot library is this script).

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { encodeBase58 } from '../../src/lib/solana/base58.ts'
import { buildSnapshot } from '../../src/lib/snapshot/build.ts'
import { toHex } from '../../src/lib/snapshot/merkle.ts'

const SCRIPT = join(import.meta.dirname, '..', 'snapshot.ts')
const dir = mkdtempSync(join(tmpdir(), 'snapshot-'))

const owner = (n: number) => Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? n : 1))

const artifactFile = (mutate: (a: Record<string, unknown>) => void = () => {}): string => {
  const s = buildSnapshot({
    holdings: [
      { owner: owner(1), balance: 10n },
      { owner: owner(2), balance: 20n },
      { owner: owner(3), balance: 70n },
    ],
    excluded: [],
    slot: 12_345n,
    index: 3n,
  })
  const artifact: Record<string, unknown> = {
    cluster: 'devnet',
    mint: encodeBase58(owner(9)),
    slot: s.slot.toString(),
    index: s.index.toString(),
    eligibleSupply: s.eligibleSupply.toString(),
    root: toHex(s.root),
    commitment: toHex(s.commitment),
    leaves: s.leaves.map((l) => ({
      owner: encodeBase58(l.owner),
      balance: l.balance.toString(),
      rangeStart: l.rangeStart.toString(),
      rangeEnd: l.rangeEnd.toString(),
    })),
  }
  mutate(artifact)
  const path = join(dir, `${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(path, JSON.stringify(artifact))
  return path
}

const run = (args: string[]) =>
  execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: 'pipe' })

describe('scripts/snapshot.ts verify', () => {
  it('recomputes the root and the commitment from the leaves alone', () => {
    const out = run(['verify', artifactFile()])
    expect(out).toMatch(/OK {3}root/)
    expect(out).toMatch(/OK {3}commitment/)
    expect(out).toMatch(/OK {3}eligible supply/)
    expect(out).toMatch(/holders {8}3/)
  })

  it('resolves the recipient and verifies the proof', () => {
    // 35 mod 100 = 35, which falls in the third holder's range [30, 100).
    const value = (35n).toString(16).padStart(64, '0')
    const out = run(['verify', artifactFile(), '--randomness', value])
    expect(out).toContain(`recipient      ${encodeBase58(owner(3))}`)
    expect(out).toContain('range          [30, 100)')
    expect(out).toContain('point          35')
  })

  it('fails, loudly and with a non-zero exit, on a root that was tampered with', () => {
    const path = artifactFile((a) => {
      a.root = 'de'.repeat(32)
    })
    expect(() => run(['verify', path])).toThrow()
    try {
      run(['verify', path])
    } catch (error) {
      const e = error as { status: number; stdout: string }
      expect(e.status).toBe(1)
      expect(e.stdout).toMatch(/FAIL root/)
    }
  })

  it('refuses a published range that the rebuild does not agree with', () => {
    const path = artifactFile((a) => {
      const leaves = a.leaves as { rangeEnd: string }[]
      leaves[0]!.rangeEnd = '11'
    })
    expect(() => run(['verify', path])).toThrow(/published range differs|range width/)
  })
})
