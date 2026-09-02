// Does the asset in a holder's wallet name the piece the chain says they got?
//
//   node scripts/verify-assets.ts --rig rigs/devnet-rehearsal.json [--hours 20]
//                                 [--from <hour>]
//
// Caller: the operator, and the acceptance step of the asset-URI rehearsal
// (`docs/round-2026-09-02-asset-uri.md`). Nothing in the application calls it.
//
// **It reads three things and trusts none of them against each other**: the
// issuance account for the hour, the settle transaction's event, and the
// mpl-core asset that transaction created. The event says which piece was
// issued; the asset says which piece it claims to be; this compares them.
//
// It is expected to FAIL against any hour settled before the program built its
// own name and URI, and that failure is the defect it exists to measure.

import { readFileSync } from 'node:fs'
import { fetchIssuanceByHour, fetchSettledFor, NOTHING_ISSUED } from '../src/lib/chain/issuance.ts'
import { checkAsset, decodeAsset, type AssetVerdict, type CoreAsset } from '../src/lib/chain/asset.ts'
import { rpc } from '../src/lib/chain/rpc.ts'
import { clusterName } from '../src/lib/snapshot/rpc.ts'

const MPL_CORE = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d'

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

const rigPath = flag('rig')
const rig = rigPath === undefined ? {} : (JSON.parse(readFileSync(rigPath, 'utf8')) as {
  program?: string; config?: string; collection?: string; expectCluster?: string
})
const rpcUrl = process.env.RPC_URL ?? die('RPC_URL is not set')
const programId = rig.program ?? process.env.ISSUANCE_PROGRAM ?? die('no program: pass --rig')
const configAddress = rig.config ?? process.env.ISSUANCE_CONFIG ?? die('no config: pass --rig')
const hours = Number(flag('hours') ?? 20)

const cluster = await clusterName(rpcUrl)
if (cluster === 'unknown') die('cannot classify the cluster; refusing to report about an unknown chain')
if (rig.expectCluster !== undefined && rig.expectCluster !== cluster) {
  die(`the rig expects ${rig.expectCluster} and this RPC is ${cluster}`)
}

// The schedule, from the config account, so the window is the protocol's hours
// and not a guess. Offsets as in `scripts/crank-loop.ts`.
const CONFIG_GENESIS = 8 + 1 + 32 * 5
const account = (await rpc(rpcUrl, 'getAccountInfo', [configAddress, { encoding: 'base64' }])) as
  { value?: { data: [string, string] } | null }
if (account.value == null) die(`no config account at ${configAddress} on ${cluster}`)
const config = Buffer.from(account.value.data[0], 'base64')
const genesisUnix = Number(config.readBigInt64LE(CONFIG_GENESIS))
const periodSeconds = Number(config.readBigInt64LE(CONFIG_GENESIS + 8))
if (periodSeconds <= 0) die('the config carries no period')

const currentHour = Math.floor((Math.floor(Date.now() / 1000) - genesisUnix) / periodSeconds)
const from = flag('from') === undefined ? undefined : Number(flag('from'))

out(`${cluster} · program ${programId} · hour ${currentHour} now`)
out(`checking up to ${hours} settled hours${from === undefined ? ', newest first' : ` from ${from}`}`)
out('')

/** The asset an mpl-core CPI created in this transaction, if any. */
async function assetIn(signature: string): Promise<CoreAsset | null> {
  const tx = (await rpc(rpcUrl, 'getTransaction', [
    signature, { maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' },
  ])) as { transaction?: { message: { accountKeys: { pubkey: string }[] } } } | null
  const keys = tx?.transaction?.message.accountKeys.map((k) => k.pubkey) ?? []
  if (keys.length === 0) return null
  const infos = (await rpc(rpcUrl, 'getMultipleAccounts', [keys, { encoding: 'base64' }])) as
    { value?: ({ owner: string; data: [string, string] } | null)[] }
  for (const [i, info] of (infos.value ?? []).entries()) {
    if (info == null || info.owner !== MPL_CORE) continue
    // The collection account is in this transaction too and is not an asset;
    // `decodeAsset` returns null for anything whose key byte is not AssetV1.
    const asset = decodeAsset(keys[i]!, new Uint8Array(Buffer.from(info.data[0], 'base64')))
    if (asset !== null) return asset
  }
  return null
}

const verdicts: AssetVerdict[] = []
let hour = from === undefined ? currentHour - 1 : from
let scanned = 0
while (verdicts.length < hours && hour >= 0 && scanned < hours * 20) {
  scanned += 1
  const issuance = await fetchIssuanceByHour({ rpcUrl, programId, hour: BigInt(hour) })
  hour = from === undefined ? hour - 1 : hour + 1
  if (issuance === null || !issuance.settled || issuance.pieceId === NOTHING_ISSUED) continue

  const event = await fetchSettledFor({ rpcUrl, programId, account: issuance.address })
  if (event === null) continue
  const verdict = checkAsset(issuance.hour, event.pieceId, await assetIn(event.signature))
  verdicts.push(verdict)
  out(
    `${verdict.agrees ? 'OK  ' : 'FAIL'} hour ${verdict.hour.toString().padStart(4)} · piece ${String(verdict.pieceId).padStart(4)} · ` +
      `${verdict.asset === null ? '(no asset)' : `${verdict.asset.name} · ${verdict.asset.uri}`}`,
  )
  if (!verdict.agrees) out(`     ${verdict.why}`)
}

const bad = verdicts.filter((v) => !v.agrees)
out('')
// The control: zero of zero agreeing reads exactly like a clean run.
if (verdicts.length === 0) die('no settled hour was checked, so this proves nothing')
out(`${verdicts.length - bad.length} of ${verdicts.length} assets name the piece the event emitted`)
if (bad.length > 0) {
  die(
    `\n${bad.length} do not. An asset that names a different piece is permanent: it is in ` +
      'somebody\'s wallet and there is no instruction to rename it.',
  )
}
