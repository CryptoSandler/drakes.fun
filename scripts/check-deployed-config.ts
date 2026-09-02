// What the SERVED site is actually pointed at — read off the page, not out of
// the dashboard.
//
//   node scripts/check-deployed-config.ts --site https://drakes.fun
//                                         [--rig rigs/devnet-rehearsal.json]
//
// Caller: the operator, at launch step C5, after changing the environment.
//
// **Why this and not the variable list.** An environment change does nothing
// until a deployment builds, and a build can be cancelled without an error —
// the Ignored Build Step skipped two of them on 2026-09-02 while every variable
// read as changed and the site kept serving the previous program. **A variable
// is an intention. The page is the fact.**
//
// So it takes the program and config addresses out of the rendered HTML — the
// same ones `/verify` prints in its "run it yourself" command, which is the
// only place the site states them — then reads that config account from the
// chain and prints the schedule the site is therefore counting down to.

import { readFileSync } from 'node:fs'
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

const site = (flag('site') ?? die('--site <url> is required')).replace(/\/$/, '')
const rpcUrl = process.env.RPC_URL ?? die('RPC_URL is not set')
const rigPath = flag('rig')

const response = await fetch(`${site}/verify`, { cache: 'no-store' })
if (!response.ok) die(`${site}/verify answered HTTP ${response.status}`)
const html = await response.text()

// `--program <id>` and `--config <id>` out of the command block. Base58, 32-44
// characters, which is every Solana address and nothing else on that page.
const grab = (name: string): string => {
  const match = new RegExp(`--${name}\\s+([1-9A-HJ-NP-Za-km-z]{32,44})`).exec(html)
  if (match === null) {
    die(`the page does not state --${name}. Either it is not the page this expects, or the deployment is not serving a chain.`)
  }
  return match[1]!
}
const programId = grab('program')
const configAddress = grab('config')

out(`site      ${site}`)
out(`program   ${programId}`)
out(`config    ${configAddress}`)

// The schedule the site is counting down to, read from the account the site
// itself names. Offsets as in `src/lib/site/collection.ts`.
const CONFIG_GENESIS = 8 + 1 + 32 * 5
const account = (await rpc(rpcUrl, 'getAccountInfo', [configAddress, { encoding: 'base64' }])) as
  { value?: { data: [string, string]; owner: string } | null }
if (account.value == null) die(`the config the site names does not exist on this cluster`)
const data = Buffer.from(account.value.data[0], 'base64')
const genesisUnix = Number(data.readBigInt64LE(CONFIG_GENESIS))
const periodSeconds = Number(data.readBigInt64LE(CONFIG_GENESIS + 8))

out(`owner     ${account.value.owner}`)
out(`genesis   ${genesisUnix}  (${new Date(genesisUnix * 1000).toISOString()})`)
out(`period    ${periodSeconds}s`)
out(`cluster   ${await clusterName(rpcUrl)}`)

// The config must belong to the program the page names. A page that states a
// program and a config from different rigs would count down correctly and
// verify nothing.
if (account.value.owner !== programId) {
  die(`the config the site names is owned by ${account.value.owner}, not by the program it names`)
}

if (rigPath !== undefined) {
  const rig = JSON.parse(readFileSync(rigPath, 'utf8')) as {
    program: string; config: string; expectPeriodSeconds?: number; genesisUnix?: number
  }
  const wrong: string[] = []
  if (rig.program !== programId) wrong.push(`program: rig ${rig.program}, site ${programId}`)
  if (rig.config !== configAddress) wrong.push(`config: rig ${rig.config}, site ${configAddress}`)
  if (rig.expectPeriodSeconds !== undefined && rig.expectPeriodSeconds !== periodSeconds) {
    wrong.push(`period: rig ${rig.expectPeriodSeconds}, chain ${periodSeconds}`)
  }
  if (rig.genesisUnix !== undefined && rig.genesisUnix !== genesisUnix) {
    wrong.push(`genesis: rig ${rig.genesisUnix}, chain ${genesisUnix}`)
  }
  out('')
  if (wrong.length > 0) {
    die(`the served site is NOT on ${rigPath}:\n  ${wrong.join('\n  ')}`)
  }
  out(`the served site is on ${rigPath}, and its config agrees with the chain.`)
}
