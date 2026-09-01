// The finding of 2026-09-01, turned into a test that fails if it comes back.
//
// The rehearsal's `pieces` replayed the survivor permutation from the artifacts
// we publish. Two of those artifacts had been deleted while the issuances they
// described were on chain, so the replay was two takes behind from its first
// line and reported 0 of 49 — indistinguishable from the arithmetic being
// wrong. The fix is not a better error message: it is that the permutation is
// a function of the chain, and the published set is a cache we reconcile.
//
// Everything here runs against payloads recorded verbatim from devnet on
// 2026-09-01, so the decoder is exercised rather than a decoded form we wrote
// down, and CI needs no network.

import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ISSUANCE_SETTLED_DISCRIMINATOR,
  decodeSettled,
  ownEventPayloads,
  type SettledEvent,
} from '../../src/lib/chain/events.ts'
import { NOT_MINTED, nameHours, reconcile, replayFromChain } from '../../src/lib/snapshot/reconcile.ts'
import { encodeBase58 } from '../../src/lib/solana/base58.ts'
import { toHex } from '../../src/lib/snapshot/merkle.ts'
import type { PublishedArtifact } from '../../src/lib/snapshot/reconcile.ts'

const here = fileURLToPath(new URL('.', import.meta.url))
const fixture = <T,>(name: string): T =>
  JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8')) as T

const settled = fixture<{
  program: string
  config: string
  events: { signature: string; slot: number; data: string }[]
}>('rehearsal-settled.json')

const publishedFixture = fixture<{ files: Record<string, PublishedArtifact> }>(
  'rehearsal-published.json',
)

/** The recorded events, decoded the way the live reader decodes them. */
const events: SettledEvent[] = settled.events.map((row) => {
  const decoded = decodeSettled(new Uint8Array(Buffer.from(row.data, 'base64')))
  if (decoded === null) throw new Error(`fixture row ${row.signature} did not decode`)
  return { ...decoded, signature: row.signature, txSlot: BigInt(row.slot) }
})

/** Materialises the published set into a scratch directory the test may edit. */
function materialise(omit: string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), 'drakes-published-'))
  for (const [name, artifact] of Object.entries(publishedFixture.files)) {
    if (omit.includes(name)) continue
    writeFileSync(join(dir, name), JSON.stringify(artifact, null, 1))
  }
  return dir
}

function readDir(dir: string): Map<string, PublishedArtifact> {
  const out = new Map<string, PublishedArtifact>()
  for (const [name, artifact] of Object.entries(publishedFixture.files)) {
    try {
      out.set(artifact.index, JSON.parse(readFileSync(join(dir, name), 'utf8')) as PublishedArtifact)
    } catch {
      // Absent from the directory: that is exactly what this test removes.
    }
  }
  return out
}

describe('the recorded devnet fixture', () => {
  it('is the whole rehearsal and nothing else', () => {
    // The control. An empty or truncated fixture would let every assertion
    // below pass vacuously, which is the shape a broken check takes most often.
    expect(events).toHaveLength(51)
    expect(new Set(events.map((e) => e.hour.toString())).size).toBe(51)
    expect(events.every((e) => encodeBase58(e.config) === settled.config)).toBe(true)
  })

  it('decodes to the values the rehearsal recorded', () => {
    const first = events[0]!
    expect(first.hour).toBe(3n)
    expect(first.pieceId).toBe(2158)
    expect(first.minted).toBe(true)
    expect(toHex(first.randomnessValue)).toBe(
      '1d5be83f95d69122db27fc2e3af4b7bb8724378477dee3286d7beafe6aa6c0df',
    )
  })

  it('refuses a payload that is not ours', () => {
    expect(decodeSettled(new Uint8Array(8))).toBeNull()
    const wrongDiscriminator = new Uint8Array(Buffer.from(settled.events[0]!.data, 'base64'))
    wrongDiscriminator[0] = wrongDiscriminator[0]! ^ 0xff
    expect(decodeSettled(wrongDiscriminator)).toBeNull()
    expect(ISSUANCE_SETTLED_DISCRIMINATOR).toBe('f5ec4261d6573e31')
  })

  it('attributes Program data to the program that emitted it', () => {
    // A settlement's logs also carry Switchboard's and mpl-core's invocations.
    const logs = [
      'Program OURS invoke [1]',
      'Program INNER invoke [2]',
      'Program data: aW5uZXI=',
      'Program INNER success',
      'Program data: b3Vycw==',
      'Program OURS success',
    ]
    expect(ownEventPayloads(logs, 'OURS').map((p) => Buffer.from(p).toString())).toEqual(['ours'])
    expect(ownEventPayloads(logs, 'INNER').map((p) => Buffer.from(p).toString())).toEqual(['inner'])
  })
})

describe('the permutation is a function of the chain', () => {
  it('replays all 51 issuances and agrees with every piece id the program emitted', () => {
    const replay = replayFromChain(events, 4_000)
    expect(replay.disagreements).toEqual([])
    expect(replay.rows).toHaveLength(51)
    expect(replay.remaining).toBe(4_000 - 51)
    expect(new Set(replay.rows.map((r) => r.replayed)).size).toBe(51)
  })

  it('still replays 51 of 51 when two artifacts are deleted', () => {
    // The finding, exactly. Hours 3 and 4 are the two the rehearsal lost.
    const dir = materialise(['snap-3.json', 'snap-4.json'])
    try {
      const replay = replayFromChain(events, 4_000)
      expect(replay.disagreements).toEqual([])
      expect(replay.rows.filter((r) => r.minted)).toHaveLength(51)
      expect(replay.remaining).toBe(3_949)
      // And the deletion genuinely happened, or this asserts nothing.
      expect(readDir(dir).size).toBe(49)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not consume a survivor for an hour that minted nothing', () => {
    // Past 4,000 the draw keeps firing and stops minting. A replay that takes
    // on every event runs one ahead of the chain from that hour onward.
    const nothingMinted: SettledEvent = { ...events[0]!, hour: 999n, minted: false, pieceId: NOT_MINTED }
    const withGap = replayFromChain([...events, nothingMinted], 4_000)
    expect(withGap.disagreements).toEqual([])
    expect(withGap.remaining).toBe(3_949)
    expect(withGap.rows.at(-1)!.replayed).toBe(NOT_MINTED)
  })

  it('gives a different piece to a repeated value, because the set has shrunk', () => {
    // Worth pinning down, because the obvious test to write here is "the same
    // randomness twice issues the same piece twice", and it is false. `take`
    // samples over `remaining`, so replaying hour 3's value at the end of the
    // run lands somewhere else entirely. Two `take`s on one set cannot collide
    // by construction — which is why `replayFromChain`'s duplicate guard is an
    // assertion about `SurvivorSet`, not a check on chain data.
    const repeated = [...events, { ...events[0]!, hour: 999n }]
    const replay = replayFromChain(repeated, 4_000)
    expect(replay.rows).toHaveLength(52)
    expect(replay.rows.at(-1)!.replayed).not.toBe(replay.rows[0]!.replayed)
    expect(new Set(replay.rows.map((r) => r.replayed)).size).toBe(52)
  })
})

describe('the published set is reconciled, not trusted', () => {
  it('names exactly the two missing issuances instead of failing the replay', () => {
    const dir = materialise(['snap-3.json', 'snap-4.json'])
    try {
      const rows = reconcile(events, readDir(dir))
      const missing = rows.filter((r) => r.verdict === 'missing').map((r) => r.hour)
      expect(missing).toEqual([3n, 4n])
      expect(nameHours(missing)).toBe('3 and 4')
      // Nothing else was disturbed by the deletion: no hour reports a
      // disagreement, which is what the old tool said about all 49 of them.
      expect(rows.filter((r) => r.verdict === 'disagrees')).toEqual([])
      expect(rows.filter((r) => r.verdict === 'ok')).toHaveLength(49)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('verifies the whole set when nothing is missing', () => {
    const rows = reconcile(events, readDir(materialise()))
    expect(rows.filter((r) => r.verdict === 'missing')).toEqual([])
    expect(rows.filter((r) => r.verdict === 'disagrees')).toEqual([])
    // Hours 3 and 4 are the recovery stubs the rehearsal wrote back from the
    // events: they carry no leaf set, so they verify partially and say so.
    const partial = rows.filter((r) => r.verdict === 'partial').map((r) => r.hour)
    expect(partial).toEqual([3n, 4n])
    expect(rows.filter((r) => r.verdict === 'ok')).toHaveLength(49)
  })

  it('reports a doctored artifact as a disagreement, not as a gap', () => {
    // Falsifies the test above: if reconcile only ever compared the hour, this
    // would come back 'ok'.
    const doctored = readDir(materialise())
    const hour = '6'
    doctored.set(hour, { ...doctored.get(hour)!, piece: 1 })
    const row = reconcile(events, doctored).find((r) => r.hour === 6n)!
    expect(row.verdict).toBe('disagrees')
    expect(row.note).toMatch(/piece: chain says/)
  })

  it('catches a leaf set that is not the one the settlement ran against', () => {
    const doctored = readDir(materialise())
    const hour = '6'
    const artifact = doctored.get(hour)!
    // One extra unit to one holder: the root moves, and so does the recipient
    // the revealed value resolves to.
    const leaves = artifact.leaves!.map((l, i) =>
      i === 0 ? { ...l, balance: (BigInt(l.balance) + 1n).toString() } : l,
    )
    doctored.set(hour, { ...artifact, leaves })
    const row = reconcile(events, doctored).find((r) => r.hour === 6n)!
    expect(row.verdict).toBe('disagrees')
  })
})
