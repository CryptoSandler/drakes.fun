// The issuance cranker, as the thing a host actually runs.
//
//   node scripts/crank-loop.ts --rig <rig.json> [--hours N] [--out <dir>]
//   node scripts/crank-loop.ts --alert-test
//
// Caller: the host. `docs/crank-hosting.md` carries the systemd unit and the
// evaluation behind it. Nothing in this repository invokes this file — it is
// the process, not a library.
//
// It reads its schedule from the config account on chain rather than from the
// rig file, so the one value the whole schedule derives from cannot be wrong in
// our copy of it (D15, and CLAUDE.md on absolute assertions).
//
// Everything it prints is one JSON object per line on stdout. `journalctl` and
// a `docker logs` both keep that legible, and `jq` turns the run into the
// jitter table without a parser.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { runLoop, type HourReport } from '../src/lib/crank/loop.ts'
import { IssuanceEngine, type Rig } from '../src/lib/crank/issue.ts'
import { consoleSink, fallbackSink, telegramSink, type Sink } from '../src/lib/crank/alert.ts'
import { clusterName } from '../src/lib/snapshot/rpc.ts'
import type { Schedule } from '../src/lib/protocol/schedule.ts'

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const has = (name: string): boolean => process.argv.includes(`--${name}`)

const emit = (row: Record<string, unknown>): void => {
  process.stdout.write(`${JSON.stringify({ t: new Date().toISOString(), ...row })}\n`)
}

// `Config`, read from `programs/issuance/src/lib.rs` rather than remembered:
// 8 discriminator, `bump: u8`, then five Pubkeys (weight_mint, collection,
// switchboard_program, queue, randomness), then the two i64 the schedule needs.
// Checked against the devnet config on 2026-09-01, which reads genesis
// 1788281174 and period 60.
const CONFIG_GENESIS = 8 + 1 + 32 * 5
const CONFIG_PERIOD = CONFIG_GENESIS + 8

function alertSink(): Sink {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (token === undefined || chatId === undefined || token === '' || chatId === '') {
    emit({ level: 'warn', msg: 'no TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID; alerts go to stderr only' })
    return consoleSink()
  }
  // The console sink is last and never removed. An alerting path whose only
  // channel can fail silently is worse than none, because it is trusted.
  return fallbackSink([telegramSink({ token, chatId }), consoleSink()])
}

async function alertTest(): Promise<void> {
  await alertSink()({
    title: 'DRAKES: alert channel test',
    lines: [
      'If you are reading this, the cranker can reach you.',
      `sent ${new Date().toISOString()}`,
    ],
  })
  emit({ level: 'info', msg: 'alert sent' })
}

async function main(): Promise<void> {
  const rigPath = flag('rig')
  if (rigPath === undefined) throw new Error('--rig <rig.json> is required')
  const raw = JSON.parse(readFileSync(rigPath, 'utf8')) as {
    rpcEnv?: string
    rpc?: string
    program: string
    config: string
    survivors: string
    collection: string
    randomness: string
    queue: string
    mint: string
    collectionSize: number
    keypair?: string
    keypairEnv?: string
    expectCluster: 'devnet' | 'mainnet'
    expectPeriodSeconds: number
  }

  const rpcUrl = raw.rpc ?? process.env[raw.rpcEnv ?? 'RPC_URL']
  if (rpcUrl === undefined || rpcUrl === '') throw new Error('no RPC URL: set rpc or rpcEnv in the rig')

  // Two absolute assertions before anything is signed, neither of them an
  // equality against another variable that could itself be empty (CLAUDE.md).
  const cluster = await clusterName(rpcUrl)
  if (cluster === 'unknown') throw new Error('the cluster could not be classified; refusing to sign')
  if (cluster !== raw.expectCluster) {
    throw new Error(`the rig says ${raw.expectCluster} and the genesis hash says ${cluster}`)
  }

  const conn = new Connection(rpcUrl, 'confirmed')
  const configAccount = await conn.getAccountInfo(new PublicKey(raw.config))
  if (configAccount === null) throw new Error('the config account does not exist on this cluster')
  const schedule: Schedule = {
    genesisUnix: Number(configAccount.data.readBigInt64LE(CONFIG_GENESIS)),
    periodSeconds: Number(configAccount.data.readBigInt64LE(CONFIG_PERIOD)),
  }
  // The schedule is read from the chain and then checked against the literal
  // the operator wrote down. Mainnet's literal is 3600 and it belongs in the
  // deploy checklist, not in a variable comparison.
  if (schedule.periodSeconds !== raw.expectPeriodSeconds) {
    throw new Error(
      `the chain says period_seconds = ${schedule.periodSeconds}, the rig expects ${raw.expectPeriodSeconds}`,
    )
  }
  if (schedule.genesisUnix <= 0) throw new Error('the config carries no genesis instant')

  const rig: Rig = {
    program: new PublicKey(raw.program),
    config: new PublicKey(raw.config),
    survivors: new PublicKey(raw.survivors),
    collection: new PublicKey(raw.collection),
    randomness: new PublicKey(raw.randomness),
    queue: new PublicKey(raw.queue),
    mint: raw.mint,
    collectionSize: raw.collectionSize,
  }
  // The path is taken from the environment by default, so a rig file committed
  // to a public repository names no path on anybody's machine.
  const keypairPath = raw.keypair ?? process.env[raw.keypairEnv ?? 'CRANK_KEYPAIR']
  if (keypairPath === undefined || keypairPath === '') {
    throw new Error('no crank keypair: set keypair in the rig or CRANK_KEYPAIR in the environment')
  }
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf8')) as number[]),
  )
  const engine = new IssuanceEngine({
    rpcUrl,
    rig,
    payer,
    onNote: (msg) => emit({ level: 'debug', msg }),
  })
  await engine.start()

  const out = flag('out')
  if (out !== undefined) mkdirSync(out, { recursive: true })
  const sink = alertSink()
  const balance = await conn.getBalance(payer.publicKey)

  emit({
    level: 'info',
    msg: 'cranker up',
    cluster,
    program: raw.program,
    config: raw.config,
    crank: engine.crankAddress,
    crankSol: balance / 1e9,
    genesisUnix: schedule.genesisUnix,
    periodSeconds: schedule.periodSeconds,
  })

  const stopping = { aborted: false }
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      emit({ level: 'info', msg: `${signal}; finishing the current hour then stopping` })
      stopping.aborted = true
    })
  }

  await runLoop({
    schedule,
    hours: flag('hours') === undefined ? undefined : Number(flag('hours')),
    // Half a period, so a stalled attempt cannot eat the window a retry needs.
    attemptTimeoutMs: (schedule.periodSeconds * 1000) / 2,
    signal: stopping,
    deps: {
      now: () => Date.now(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      settle: async (hour) => {
        const outcome = await engine.settleHour(hour)
        emit({ level: 'info', msg: 'settled', ...outcome })
        if (out !== undefined) {
          // Every settled issuance is published, without exception. A gap in
          // the published set is recoverable only from the chain, and that
          // recovery is why the event carries the revealed value
          // (`docs/runbook-devnet-rehearsal.md`, and D21).
          writeFileSync(
            join(out, `snap-${hour}.json`),
            JSON.stringify(
              {
                cluster,
                mint: rig.mint,
                index: String(hour),
                piece: outcome.pieceId,
                slot: outcome.snapshotSlot,
                eligibleSupply: outcome.eligibleSupply,
                root: outcome.root,
                randomness: outcome.randomness,
                recipient: outcome.recipient,
                signature: outcome.signature,
              },
              null,
              1,
            ),
          )
        }
      },
      onHour: (report) => {
        emit({
          level: report.settled ? 'info' : 'error',
          msg: 'hour',
          hour: report.hour,
          jitterMs: report.jitterMs,
          settled: report.settled,
          attempts: report.attempts.length,
          why: report.why,
          failures: report.attempts.filter((a) => !a.ok).map((a) => a.why),
        })
      },
      onMissed: async (report: HourReport) => {
        try {
          await sink({
            title: `DRAKES: issuance ${report.hour} was not settled`,
            lines: [
              `cluster ${cluster}`,
              `${report.attempts.length} attempts, window closed`,
              report.why ?? '',
              report.attempts.at(-1)?.why ?? '',
            ].filter(Boolean),
          })
        } catch (error) {
          // The alert failing is itself worth a line, and it must not take the
          // cranker down: the next hour is more important than this message.
          emit({ level: 'error', msg: 'alert failed', why: String(error) })
        }
      },
    },
  })
  emit({ level: 'info', msg: 'cranker down' })
}

if (has('alert-test')) await alertTest()
else await main()
