// The issuance cranker's oracle step, as a command.
//
//   node scripts/crank.ts select --rpc <url> --queue <addr> [--start N] [--avoid a,b]
//   node scripts/crank.ts plan   <fixture.json>
//
// `select` reads the queue and every oracle it lists, applies the checks the
// program will apply on chain (T12), then **probes each gateway before
// committing to one**. `plan` does the same selection against a file, with no
// network, which is what the tests drive.
//
// Why the probe exists: in the 2026-09-01 devnet rehearsal one oracle passed
// every on-chain check and answered 503 to every reveal, costing 15% of the
// hours. On-chain liveness is not gateway liveness.

import { readFileSync } from 'node:fs'
import { decodeBase58, encodeBase58 } from '../src/lib/solana/base58.ts'
import {
  eligible,
  httpProbe,
  selectOracle,
  type OracleView,
  type QueueView,
} from '../src/lib/crank/oracles.ts'

// Offsets into the Switchboard accounts, read from switchboard-on-demand
// 0.13.0 and confirmed against devnet on 2026-09-01 (`docs/references.md`).
const QUEUE_ORACLE_KEYS = 1064
const QUEUE_NODE_TIMEOUT = 5176
const QUEUE_ORACLE_KEYS_LEN = 5204
const ORACLE_QUEUE = 3472
const ORACLE_HEARTBEAT = 3512
const ORACLE_GATEWAY = 3584
const ORACLE_ON_QUEUE = 3656

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const required = (name: string): string => {
  const v = flag(name)
  if (v === undefined) throw new Error(`--${name} is required`)
  return v
}

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`)
  const body = (await res.json()) as { result?: unknown; error?: { message: string } }
  if (body.error) throw new Error(`${method}: ${body.error.message}`)
  if (body.result === undefined) throw new Error(`${method}: no result`)
  return body.result
}

export function parseQueue(data: Buffer): QueueView {
  const len = data.readUInt32LE(QUEUE_ORACLE_KEYS_LEN)
  if (len === 0 || len > 78) throw new Error(`queue reports ${len} oracles; the layout is wrong`)
  const oracleKeys: string[] = []
  for (let i = 0; i < len; i += 1) {
    const at = QUEUE_ORACLE_KEYS + i * 32
    oracleKeys.push(encodeBase58(new Uint8Array(data.subarray(at, at + 32))))
  }
  return { oracleKeys, nodeTimeoutSeconds: Number(data.readBigInt64LE(QUEUE_NODE_TIMEOUT)) }
}

export function parseOracle(address: string, data: Buffer): OracleView {
  return {
    address,
    queue: encodeBase58(new Uint8Array(data.subarray(ORACLE_QUEUE, ORACLE_QUEUE + 32))),
    isOnQueue: data.readUInt8(ORACLE_ON_QUEUE) === 1,
    lastHeartbeat: Number(data.readBigInt64LE(ORACLE_HEARTBEAT)),
    gatewayUri: data
      .subarray(ORACLE_GATEWAY, ORACLE_GATEWAY + 64)
      .toString('utf8')
      .replace(/\0+$/, ''),
  }
}

async function select(): Promise<void> {
  const url = required('rpc')
  const queueAddress = required('queue')
  if (decodeBase58(queueAddress).length !== 32) throw new Error('queue is not an address')

  const q = (await rpc(url, 'getAccountInfo', [queueAddress, { encoding: 'base64' }])) as {
    value?: { data: [string, string] }
  }
  if (!q?.value) throw new Error('queue account not found; wrong cluster or wrong address')
  const queue = parseQueue(Buffer.from(q.value.data[0], 'base64'))

  const infos = (await rpc(url, 'getMultipleAccounts', [
    queue.oracleKeys,
    { encoding: 'base64' },
  ])) as { value: ({ data: [string, string] } | null)[] }
  const oracles = queue.oracleKeys.flatMap((address, i) => {
    const info = infos.value[i]
    return info ? [parseOracle(address, Buffer.from(info.data[0], 'base64'))] : []
  })

  await report(queue, oracles, Math.floor(Date.now() / 1000), httpProbe())
}

async function plan(path: string): Promise<void> {
  const f = JSON.parse(readFileSync(path, 'utf8')) as {
    queue: QueueView
    oracles: OracleView[]
    now: number
    startIndex?: number
    silent?: string[]
  }
  const silent = f.silent ?? []
  await report(
    f.queue,
    f.oracles,
    f.now,
    async (uri) => !silent.some((fragment) => uri.includes(fragment)),
    f.startIndex,
  )
}

async function report(
  queue: QueueView,
  oracles: OracleView[],
  now: number,
  probe: (uri: string) => Promise<boolean>,
  startIndexOverride?: number,
): Promise<void> {
  const { candidates, rejected } = eligible(oracles, queue, now)
  const startIndex = Number(flag('start') ?? startIndexOverride ?? 0)
  const avoid = new Set((flag('avoid') ?? '').split(',').filter(Boolean))
  const s = await selectOracle({ candidates, startIndex, probe, avoid })

  process.stdout.write(`listed         ${queue.oracleKeys.length}\n`)
  process.stdout.write(`node_timeout   ${queue.nodeTimeoutSeconds}s\n`)
  process.stdout.write(`on-chain live  ${candidates.length}\n`)
  for (const r of [...rejected, ...s.rejected]) {
    process.stdout.write(`  refused      ${r.address}  ${r.why}\n`)
  }
  if (s.chosen === null) {
    process.stdout.write('\nchosen         none: no oracle available\n')
    process.stdout.write('the hour is not requested. Requesting with an oracle whose gateway is\n')
    process.stdout.write('silent strands the hour, and there is no re-request.\n')
    process.exitCode = 3
    return
  }
  process.stdout.write(`\nchosen         ${s.chosen.address}\n`)
  process.stdout.write(`gateway        ${s.chosen.gatewayUri}\n`)
  process.stdout.write(`heartbeat age  ${s.chosen.heartbeatAge}s\n`)
}

const [subcommand] = process.argv.slice(2)
if (subcommand === 'select') await select()
else if (subcommand === 'plan') {
  const path = process.argv[3]
  if (path === undefined || path.startsWith('--')) throw new Error('plan needs a file path')
  await plan(path)
} else {
  process.stderr.write('usage: crank.ts select --rpc <url> --queue <addr> | plan <fixture.json>\n')
  process.exitCode = 2
}
