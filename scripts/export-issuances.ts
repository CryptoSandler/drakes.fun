// Everything `/verify` reads about one program's issuances, as a file.
//
//   RPC_URL=... node scripts/export-issuances.ts --program <id> --out <dir>
//
// Caller: the operator, once, before a rig is retired. Nothing in the
// application calls it.
//
// **Why it exists.** `/verify/<hour>` reads two things live — the issuance
// account and the event in the transaction that settled it — and renders the
// derivation from them. When a rig's program is closed, those reads are the
// only record of what it did, and a page that cannot be served is a page whose
// contents nobody wrote down.
//
// It exports the SAME facts the page renders, including the point recomputed
// here, so a reader with the file can check the arithmetic without an RPC.

import { mkdirSync, writeFileSync } from 'node:fs'
import { HOLDER_DOMAIN, uniformIndex } from '../src/lib/protocol/survivors.ts'
import { decodeIssuance, fetchSettledFor, ISSUANCE_SIZE, NOTHING_ISSUED } from '../src/lib/chain/issuance.ts'
import { encodeBase58 } from '../src/lib/solana/base58.ts'
import { rpc } from '../src/lib/chain/rpc.ts'
import { clusterName } from '../src/lib/snapshot/rpc.ts'

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const out = (line: string): void => {
  process.stdout.write(`${line}\n`)
}
function die(message: string): never {
  process.stderr.write(`${message}\n`)
  return process.exit(1)
}

const rpcUrl = process.env.RPC_URL ?? die('RPC_URL is not set')
const programId = flag('program') ?? die('--program <id> is required')
const dir = flag('out') ?? die('--out <dir> is required')
const cluster = await clusterName(rpcUrl)
if (cluster === 'unknown') die('cannot classify the cluster; refusing to label an export with an unknown chain')

mkdirSync(dir, { recursive: true })
out(`${cluster} · program ${programId}`)

// Every issuance account in one call. The size filter is what separates them
// from the config and the survivor array.
const accounts = (await rpc(rpcUrl, 'getProgramAccounts', [
  programId,
  { encoding: 'base64', filters: [{ dataSize: ISSUANCE_SIZE }] },
])) as { pubkey: string; account: { data: [string, string] } }[]
out(`${accounts.length} issuance accounts`)
// The control: an export of nothing is a file that looks like a retired rig
// that never issued.
if (accounts.length === 0) die('no issuance accounts found; refusing to write an empty archive')

const decoded = accounts
  .map((a) => decodeIssuance(a.pubkey, new Uint8Array(Buffer.from(a.account.data[0], 'base64'))))
  .sort((a, b) => (a.hour < b.hour ? -1 : a.hour > b.hour ? 1 : 0))

interface Row {
  hour: string
  account: string
  settled: boolean
  issued: boolean
  pieceId: number | null
  pieceIndex: number
  recipient: string
  point: string
  /** Recomputed here from the revealed value, exactly as the page does. */
  derived: string | null
  agrees: boolean | null
  eligibleSupply: string
  snapshotSlot: string
  root: string
  commitment: string
  randomness: string
  /** The 32 bytes the oracle revealed. Without these the derivation is unrepeatable. */
  randomnessValue: string | null
  requestedAt: string
  signature: string | null
  txSlot: string | null
}

const rows: Row[] = []
let disagreements = 0
for (const [i, account] of decoded.entries()) {
  const event = account.settled
    ? await fetchSettledFor({ rpcUrl, programId, account: account.address })
    : null
  const derived =
    event !== null && event.eligibleSupply > 0n
      ? uniformIndex(event.randomnessValue, event.eligibleSupply, HOLDER_DOMAIN)
      : null
  const agrees = derived === null ? null : derived === account.point
  if (agrees === false) disagreements += 1
  rows.push({
    hour: account.hour.toString(),
    account: account.address,
    settled: account.settled,
    issued: account.settled && account.pieceId !== NOTHING_ISSUED,
    pieceId: account.pieceId === NOTHING_ISSUED ? null : account.pieceId,
    pieceIndex: account.pieceIndex,
    recipient: account.recipient,
    point: account.point.toString(),
    derived: derived === null ? null : derived.toString(),
    agrees,
    eligibleSupply: account.eligibleSupply.toString(),
    snapshotSlot: account.snapshotSlot.toString(),
    root: account.root,
    commitment: account.commitment,
    randomness: account.randomness,
    randomnessValue: event === null ? null : Buffer.from(event.randomnessValue).toString('hex'),
    requestedAt: account.requestedAt.toString(),
    signature: event?.signature ?? null,
    txSlot: event === null ? null : event.txSlot.toString(),
  })
  if (i % 25 === 0) process.stdout.write(`\r  ${i}/${decoded.length}`)
}
process.stdout.write(`\r  ${decoded.length}/${decoded.length}\n`)

writeFileSync(`${dir}/issuances.jsonl`, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`)

// The two accounts the front page reads, kept raw: their layout is documented
// in the program and a decoder can be written against these bytes later.
const state: Record<string, string> = {}
for (const name of ['config', 'survivors'] as const) {
  const [address] = (await import('@solana/web3.js')).PublicKey.findProgramAddressSync(
    [Buffer.from(name)],
    new (await import('@solana/web3.js')).PublicKey(programId),
  )
  const info = (await rpc(rpcUrl, 'getAccountInfo', [address.toBase58(), { encoding: 'base64' }])) as
    { value?: { data: [string, string] } | null }
  if (info.value != null) {
    state[name] = address.toBase58()
    writeFileSync(`${dir}/${name}.base64`, `${info.value.data[0]}\n`)
  }
}

const settled = rows.filter((r) => r.settled).length
const issued = rows.filter((r) => r.issued).length
const checked = rows.filter((r) => r.agrees !== null).length
writeFileSync(
  `${dir}/manifest.json`,
  `${JSON.stringify({
    cluster, program: programId, exportedAt: new Date().toISOString(),
    accounts: rows.length, settled, issued, derivationChecked: checked, disagreements,
    hours: { first: rows[0]!.hour, last: rows[rows.length - 1]!.hour },
    ...state,
  }, null, 2)}\n`,
)

out('')
out(`accounts   ${rows.length}`)
out(`settled    ${settled}`)
out(`issued     ${issued}`)
out(`derivation ${checked - disagreements} of ${checked} agree`)
out(`hours      ${rows[0]!.hour} to ${rows[rows.length - 1]!.hour}`)
out(`written    ${dir}/issuances.jsonl`)
// The point of the export is that the derivation is repeatable from the file.
// If it did not agree while the program was live, the file must say so loudly.
if (disagreements > 0) die(`${disagreements} disagreements: DO NOT retire this program until that is understood`)
void encodeBase58
