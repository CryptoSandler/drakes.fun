// The published snapshot tool. Four forms, and the ones that read the chain are
// the point:
//
//   node scripts/snapshot.ts live    --rpc <url> --mint <addr> [--index N]
//                                    [--exclude a,b,c]
//   node scripts/snapshot.ts verify  <artifact.json> [--randomness <64 hex>]
//   node scripts/snapshot.ts verify  --published <dir> --rpc <url>
//                                    --program <id> [--config <addr>]
//   node scripts/snapshot.ts pieces  --rpc <url> --program <id>
//                                    [--config <addr>] [--published <dir>]
//                                    [--size 4000]
//   node scripts/snapshot.ts pieces  <dir>            (offline, cache only)
//
// `live` reads the chain and emits the artifact the cranker commits.
//
// `verify <file>` takes that artifact and recomputes everything from it with
// **no network and no dependencies** — the root, the commitment, the contiguity
// of the ranges, and, given the revealed randomness, the recipient and their
// proof. A stranger runs it against a file we published without trusting
// anything we say about it.
//
// `pieces` rebuilds the survivor permutation **from the `IssuanceSettled`
// events on chain**, and checks each hour against the piece id the program
// itself emitted. It reads no account, and — since 2026-09-01 — no artifact of
// ours either. See `src/lib/snapshot/reconcile.ts` for why that second one
// mattered.
//
// `verify --published` is the reconciliation: it walks the chain's settlements
// against the artifacts we published and names any that are absent. A hole in
// our record is a hole in our record. It is not evidence that the arithmetic
// disagrees, and the first version of this tool reported it as though it were.
//
// What none of this can do is confirm the leaf set matched chain state at that
// slot; see the note at the top of `src/lib/snapshot/rpc.ts`, which is honest
// about which of the two claims is being made.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { decodeBase58, encodeBase58 } from '../src/lib/solana/base58.ts'
import {
  assertContiguous,
  buildSnapshot,
  resolveRecipient,
  type Snapshot,
} from '../src/lib/snapshot/build.ts'
import { merkleRoot, snapshotCommitment, toHex, verifyProof } from '../src/lib/snapshot/merkle.ts'
import { clusterName, fetchHoldings } from '../src/lib/snapshot/rpc.ts'
import { fetchIssuanceSettled, type SettledEvent } from '../src/lib/chain/events.ts'
import {
  nameHours,
  reconcile,
  replayFromChain,
  type PublishedArtifact,
} from '../src/lib/snapshot/reconcile.ts'
import { SurvivorSet } from '../src/lib/protocol/survivors.ts'

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
 * Reads a directory of `snap-N.json` into a map keyed by the hour the artifact
 * claims, not by its filename. The filename is a convenience; `index` is what
 * the artifact asserts about itself, and the two disagreeing is worth saying.
 */
export function readPublished(dir: string): Map<string, PublishedArtifact> {
  const out = new Map<string, PublishedArtifact>()
  for (const file of readdirSync(dir).filter((f) => /^snap-\d+\.json$/.test(f))) {
    const artifact = JSON.parse(readFileSync(join(dir, file), 'utf8')) as PublishedArtifact
    const named = file.match(/\d+/)![0]
    if (artifact.index !== named) {
      throw new Error(`${file} carries index ${artifact.index}; the filename says ${named}`)
    }
    if (out.has(artifact.index)) throw new Error(`two artifacts for issuance ${artifact.index}`)
    out.set(artifact.index, artifact)
  }
  return out
}

async function readChain(): Promise<SettledEvent[]> {
  const events = await fetchIssuanceSettled({
    rpcUrl: required('rpc'),
    programId: required('program'),
    config: flag('config'),
    onProgress: (note) => process.stderr.write(`${note}\n`),
  })
  // A verification that returns nothing needs a control (CLAUDE.md). Zero
  // events reads exactly like "nothing has gone wrong", and it is far more
  // often a wrong program id, a wrong cluster, or an RPC that pruned history.
  if (events.length === 0) {
    throw new Error(
      'the chain returned no IssuanceSettled events.\n' +
        'That is not a clean bill of health — check the program id, the cluster the\n' +
        '--rpc URL points at, and whether the endpoint keeps history that far back.',
    )
  }
  return events
}

/**
 * The survivor permutation, rebuilt from the chain.
 *
 * **Nothing here reads the survivor account, and nothing here reads an artifact
 * of ours.** A stranger derives which piece went out each hour from the values
 * the program itself published, and checks them against the piece ids the
 * program emitted. `--published` additionally reports which hours are absent
 * from our artifact set, because that is a fact about our record and not about
 * the permutation.
 */
async function piecesFromChain(): Promise<void> {
  const size = Number(flag('size') ?? 4_000)
  const events = await readChain()
  const replay = replayFromChain(events, size)
  const minted = replay.rows.filter((r) => r.minted)

  process.stdout.write(`source         chain, program ${required('program')}\n`)
  if (flag('config') !== undefined) process.stdout.write(`config         ${flag('config')}\n`)
  process.stdout.write(`OK   settled      ${events.length}\n`)
  process.stdout.write(`     minted       ${minted.length}\n`)
  process.stdout.write(
    `OK   distinct     ${new Set(minted.map((r) => r.replayed)).size}  (no piece issued twice)\n`,
  )
  const agree = minted.length - replay.disagreements.length
  process.stdout.write(
    `${replay.disagreements.length === 0 ? 'OK  ' : 'FAIL'} piece ids    ${agree}/${minted.length} match the replay\n`,
  )
  for (const row of replay.disagreements) {
    process.stdout.write(
      `     issuance ${row.hour}: program says ${row.emitted}, replay says ${row.replayed}\n`,
    )
  }
  process.stdout.write(`     remaining    ${replay.remaining} of ${size}\n`)
  if (replay.disagreements.length > 0) process.exitCode = 1

  const dir = flag('published')
  if (dir === undefined) return
  const published = readPublished(dir)
  const gaps = events.filter((e) => !published.has(e.hour.toString())).map((e) => e.hour)
  process.stdout.write(
    gaps.length === 0
      ? `OK   published    ${published.size} artifacts, one for every settlement\n`
      : `GAP  published    issuances ${nameHours(gaps)} are missing from the published set\n` +
          '     The replay above did not need them and is unaffected.\n',
  )
}

/** The offline replay, kept for a set that has already been reconciled. */
function piecesFromDir(dir: string): void {
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
  process.stdout.write('source         the published set, which is OUR record.\n')
  process.stdout.write('               A missing artifact breaks every issuance after it and\n')
  process.stdout.write('               looks identical to a mismatch. Prefer --rpc --program.\n')
  process.stdout.write(`OK   issuances    ${files.length}\n`)
  process.stdout.write(`OK   distinct     ${seen.size}  (no piece issued twice)\n`)
  process.stdout.write(
    `${mismatched === 0 ? 'OK  ' : 'FAIL'} piece ids    ${checked - mismatched}/${checked} match the replay\n`,
  )
  process.stdout.write(`     remaining    ${set.remaining} of ${size}\n`)
  if (mismatched > 0) process.exitCode = 1
}

/**
 * The published set against the chain: what is missing, what is only a
 * recovery stub, and what actually disagrees. These are three different
 * findings and the tool says which one it found.
 */
async function verifyPublished(dir: string): Promise<void> {
  const events = await readChain()
  const published = readPublished(dir)
  const rows = reconcile(events, published)

  const missing = rows.filter((r) => r.verdict === 'missing')
  const partial = rows.filter((r) => r.verdict === 'partial')
  const bad = rows.filter((r) => r.verdict === 'disagrees')
  const ok = rows.filter((r) => r.verdict === 'ok')

  process.stdout.write(`chain          ${events.length} settlements\n`)
  process.stdout.write(`published      ${published.size} artifacts\n`)

  if (missing.length > 0) {
    process.stdout.write(
      `GAP  missing      issuances ${nameHours(missing.map((r) => r.hour))} are missing from the published set\n`,
    )
    process.stdout.write('     Republish them. Every value except the leaf set is recoverable from\n')
    process.stdout.write('     the IssuanceSettled event, which is why the event carries it.\n')
  } else {
    process.stdout.write('OK   missing      none; every settlement has an artifact\n')
  }

  for (const row of partial) process.stdout.write(`WARN issuance ${row.hour}  ${row.note}\n`)
  for (const row of bad) process.stdout.write(`FAIL issuance ${row.hour}  ${row.note}\n`)
  process.stdout.write(
    `${bad.length === 0 ? 'OK  ' : 'FAIL'} agreement    ${ok.length} fully verified, ` +
      `${partial.length} partial, ${bad.length} disagree\n`,
  )
  // A gap is a hole in our record and the operator has to fix it. A
  // disagreement is a defect in one of the two implementations. Both exit
  // non-zero, with different codes, so a script can tell them apart.
  if (bad.length > 0) process.exitCode = 1
  else if (missing.length > 0) process.exitCode = 4
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
  if (dir !== undefined && !dir.startsWith('--')) piecesFromDir(dir)
  else await piecesFromChain()
} else if (subcommand === 'verify') {
  const path = process.argv[3]
  if (path !== undefined && !path.startsWith('--')) verify(path)
  else await verifyPublished(required('published'))
} else {
  process.stderr.write(
    [
      'usage:',
      '  snapshot.ts live    --rpc <url> --mint <addr> [--index N] [--exclude a,b]',
      '  snapshot.ts verify  <artifact.json> [--randomness <64 hex>]',
      '  snapshot.ts verify  --published <dir> --rpc <url> --program <id> [--config <addr>]',
      '  snapshot.ts pieces  --rpc <url> --program <id> [--config <addr>] [--published <dir>]',
      '  snapshot.ts pieces  <dir>          offline, replays OUR record only',
      '',
    ].join('\n'),
  )
  process.exitCode = 2
}
