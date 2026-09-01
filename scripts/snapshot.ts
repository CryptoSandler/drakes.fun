// The published snapshot tool. Two subcommands, and the second one is the point:
//
//   node scripts/snapshot.ts live   --rpc <url> --mint <addr> [--index N]
//                                   [--exclude a,b,c]
//   node scripts/snapshot.ts verify <artifact.json> [--randomness <64 hex>]
//   node scripts/snapshot.ts pieces <dir> [--size 4000]
//
// `live` reads the chain and emits the artifact the cranker commits.
// `verify` takes that artifact and recomputes everything from it with **no
// network and no dependencies** — the root, the commitment, the contiguity of
// the ranges, and, given the revealed randomness, the recipient and their
// proof. That is the command the verify page publishes, and a stranger can run
// it against a file we published without trusting anything we say about it.
//
// What it cannot do is confirm the leaf set matched chain state at that slot;
// see the note at the top of `src/lib/snapshot/rpc.ts`, which is honest about
// which of the two claims is being made.

import { readFileSync } from 'node:fs'
import { decodeBase58, encodeBase58 } from '../src/lib/solana/base58.ts'
import {
  assertContiguous,
  buildSnapshot,
  resolveRecipient,
  type Snapshot,
} from '../src/lib/snapshot/build.ts'
import { merkleRoot, snapshotCommitment, toHex, verifyProof } from '../src/lib/snapshot/merkle.ts'
import { clusterName, fetchHoldings } from '../src/lib/snapshot/rpc.ts'
import { SurvivorSet } from '../src/lib/protocol/survivors.ts'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

interface Artifact {
  cluster: string
  mint: string
  slot: string
  index: string
  eligibleSupply: string
  root: string
  commitment: string
  leaves: { owner: string; balance: string; rangeStart: string; rangeEnd: string }[]
}

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const required = (name: string): string => {
  const value = flag(name)
  if (value === undefined) throw new Error(`--${name} is required`)
  return value
}

const toArtifact = (s: Snapshot, cluster: string, mint: string): Artifact => ({
  cluster,
  mint,
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
})

async function live(): Promise<void> {
  const rpcUrl = required('rpc')
  const mint = required('mint')
  const cluster = await clusterName(rpcUrl)
  // A cluster we cannot name is a refusal, not a warning: an artifact labelled
  // with the wrong network is worse than no artifact (CLAUDE.md).
  if (cluster === 'unknown') throw new Error('cluster could not be classified; refusing')

  const { slot, holdings } = await fetchHoldings({ rpcUrl, mint })
  const snapshot = buildSnapshot({
    holdings,
    excluded: (flag('exclude') ?? '')
      .split(',')
      .filter(Boolean)
      .map(decodeBase58),
    slot,
    index: BigInt(flag('index') ?? '0'),
  })
  assertContiguous(snapshot)
  process.stdout.write(`${JSON.stringify(toArtifact(snapshot, cluster, mint), null, 2)}\n`)
}

function verify(path: string): void {
  const artifact = JSON.parse(readFileSync(path, 'utf8')) as Artifact
  const leaves = artifact.leaves.map((l) => ({
    owner: decodeBase58(l.owner),
    balance: BigInt(l.balance),
    rangeStart: BigInt(l.rangeStart),
    rangeEnd: BigInt(l.rangeEnd),
  }))
  // Rebuilt from the balances alone, never read back from the file: reading the
  // root out of the artifact and comparing it to itself is the check that
  // always passes.
  const rebuilt = buildSnapshot({
    holdings: leaves.map((l) => ({ owner: l.owner, balance: l.balance })),
    excluded: [],
    slot: BigInt(artifact.slot),
    index: BigInt(artifact.index),
  })
  assertContiguous(rebuilt)

  // And the ranges in the file must be the ranges the rebuild produced, or a
  // published artifact could carry ranges nobody checked.
  rebuilt.leaves.forEach((l, i) => {
    const published = leaves[i]!
    if (l.rangeStart !== published.rangeStart || l.rangeEnd !== published.rangeEnd) {
      throw new Error(`published range differs from the rebuilt one at leaf ${i}`)
    }
  })
  check('eligible supply', rebuilt.eligibleSupply.toString(), artifact.eligibleSupply)
  check('root', toHex(merkleRoot(rebuilt.leafHashes)), artifact.root)
  check(
    'commitment',
    toHex(
      snapshotCommitment({
        root: rebuilt.root,
        eligibleSupply: rebuilt.eligibleSupply,
        slot: rebuilt.slot,
        index: rebuilt.index,
      }),
    ),
    artifact.commitment,
  )
  process.stdout.write(`holders        ${rebuilt.leaves.length}\n`)

  const hex = flag('randomness')
  if (hex === undefined) {
    process.stdout.write('\nno randomness given, so no recipient was resolved.\n')
    return
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('--randomness must be 64 hex characters')
  const bytes = Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)))
  const r = resolveRecipient(rebuilt, bytes)
  if (!verifyProof(r.leaf, r.proof, rebuilt.root)) throw new Error('proof did not verify')
  process.stdout.write(
    [
      '',
      `point          ${r.point}  (0x${hex} mod ${rebuilt.eligibleSupply})`,
      `range          [${r.leaf.rangeStart}, ${r.leaf.rangeEnd})`,
      `recipient      ${encodeBase58(r.leaf.owner)}`,
      `balance        ${r.leaf.balance}`,
      `proof          ${r.proof.length} sibling hashes, verified against the root`,
      '',
    ].join('\n'),
  )
}

/**
 * Replays the survivor array from the published issuances, in order, and checks
 * every piece id against it.
 *
 * **Nothing here reads the survivor account.** The point is that a stranger can
 * derive which piece went out each hour from the revealed values alone, without
 * trusting the array we wrote — and that a piece is never issued twice.
 */
function pieces(dir: string): void {
  const files = readdirSync(dir)
    .filter((f) => /^snap-\d+\.json$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
  if (files.length === 0) throw new Error(`no published issuances in ${dir}`)

  const size = Number(flag('size') ?? 4_000)
  const set = new SurvivorSet(size)
  const seen = new Map<number, string>()
  let checked = 0
  let mismatched = 0
  for (const f of files) {
    const a = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { randomness: string; piece?: number }
    const value = Uint8Array.from(a.randomness.match(/../g)!.map((b) => parseInt(b, 16)))
    const replayed = set.issue(value)
    const twice = seen.get(replayed)
    if (twice !== undefined) throw new Error(`piece ${replayed} issued twice: ${twice} and ${f}`)
    seen.set(replayed, f)
    if (a.piece !== undefined) {
      checked += 1
      if (a.piece !== replayed) {
        mismatched += 1
        process.stdout.write(`FAIL ${f}: published piece ${a.piece}, replay says ${replayed}\n`)
      }
    }
  }
  process.stdout.write(`OK   issuances    ${files.length}\n`)
  process.stdout.write(`OK   distinct     ${seen.size}  (no piece issued twice)\n`)
  process.stdout.write(`${mismatched === 0 ? 'OK  ' : 'FAIL'} piece ids    ${checked - mismatched}/${checked} match the replay\n`)
  process.stdout.write(`     remaining    ${set.remaining} of ${size}\n`)
  if (mismatched > 0) process.exitCode = 1
}

function check(label: string, computed: string, published: string): void {
  const ok = computed === published
  process.stdout.write(`${ok ? 'OK  ' : 'FAIL'} ${label.padEnd(14)} ${computed}\n`)
  if (!ok) {
    process.stdout.write(`     published     ${published}\n`)
    process.exitCode = 1
  }
}

const [subcommand] = process.argv.slice(2)
if (subcommand === 'live') await live()
else if (subcommand === 'pieces') {
  const dir = process.argv[3]
  if (dir === undefined || dir.startsWith('--')) throw new Error('pieces needs a directory')
  pieces(dir)
} else if (subcommand === 'verify') {
  const path = process.argv[3]
  if (path === undefined || path.startsWith('--')) throw new Error('verify needs a file path')
  verify(path)
}
else {
  process.stderr.write(
    'usage: snapshot.ts live --rpc <url> --mint <addr> | verify <file.json> | pieces <dir>\n',
  )
  process.exitCode = 2
}
