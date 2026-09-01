// One hour's on-chain work, as a unit the scheduler can call and retry.
//
// Caller: `scripts/crank-loop.ts` passes `settleHour` to `runLoop`. Nothing
// else calls it. The rehearsal driver that this replaces was a scratchpad
// script living outside the repository, which the 2026-09-01 runbook lists
// under "what the rehearsal does not cover".
//
// **The key.** This holds one, and the program is written so that being public
// costs nothing: `request_issuance` and `settle_issuance` are permissionless,
// the commit is signed by the config PDA rather than the caller, and the worst
// a stolen crank key can do is pay for our transactions (DESIGN.md T4). It
// cannot move value, because in Phase 1 there is no value to move.
//
// The retry story lives in `loop.ts` and not here on purpose: this function
// either settles the hour or throws, and it is safe to call again. Every step
// that could half-succeed is idempotent on chain — a second `request_issuance`
// for an hour fails because the account already exists, and a second
// `settle_issuance` fails with `AlreadySettled`.

import { createHash } from 'node:crypto'
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_SLOT_HASHES_PUBKEY,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import { buildSnapshot, resolveRecipient, type Resolution, type Snapshot } from '../snapshot/build.ts'
import { toHex, verifyProof } from '../snapshot/merkle.ts'
import { fetchHoldings } from '../snapshot/rpc.ts'
import { encodeBase58 } from '../solana/base58.ts'
import { SurvivorSet } from '../protocol/survivors.ts'
import { eligible, httpProbe, selectOracle, type OracleView, type QueueView } from './oracles.ts'

export const MPL_CORE = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d')
export const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
export const ASSOCIATED_TOKEN = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
export const WSOL = new PublicKey('So11111111111111111111111111111111111111112')
export const SWITCHBOARD = new PublicKey('Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2')

// Anchor derives these, so they are derived here too rather than pasted as
// magic bytes. Asserted below against the values read off a real devnet
// settlement on 2026-09-01, which is the positive check CLAUDE.md asks for: a
// wrong discriminator produces `InstructionFallbackNotFound` at the worst
// possible moment, an hour that can never be re-requested.
const discriminator = (name: string): Buffer =>
  createHash('sha256').update(`global:${name}`).digest().subarray(0, 8)

const REQUEST_IX = discriminator('request_issuance')
const SETTLE_IX = discriminator('settle_issuance')
if (REQUEST_IX.toString('hex') !== 'b3e585d1560c02c0') throw new Error('request discriminator drifted')
if (SETTLE_IX.toString('hex') !== 'b0e62f9500e3a88b') throw new Error('settle discriminator drifted')

// Offsets into the Switchboard accounts, read from switchboard-on-demand 0.13.0
// and confirmed against devnet on 2026-09-01 (`docs/references.md`).
const QUEUE_ORACLE_KEYS = 1064
const QUEUE_NODE_TIMEOUT = 5176
const QUEUE_ORACLE_KEYS_LEN = 5204
const ORACLE_QUEUE = 3472
const ORACLE_HEARTBEAT = 3512
const ORACLE_GATEWAY = 3584
const ORACLE_ON_QUEUE = 3656

// The `Survivors` account: 8 discriminator, `remaining: u16`, `bump: u8`, five
// pad bytes, then the array.
const SURVIVORS_REMAINING = 8
const SURVIVORS_SLOTS = 16

export interface Rig {
  program: PublicKey
  config: PublicKey
  survivors: PublicKey
  collection: PublicKey
  randomness: PublicKey
  queue: PublicKey
  /** The eligibility mint. */
  mint: string
  collectionSize: number
}

export interface IssuanceOutcome {
  hour: number
  pieceId: number
  recipient: string
  point: string
  balance: string
  snapshotSlot: string
  eligibleSupply: string
  root: string
  randomness: string
  signature: string
  holders: number
  oracle: string
}

const u64 = (n: bigint | number): Buffer => {
  const b = Buffer.alloc(8)
  b.writeBigUInt64LE(BigInt(n))
  return b
}

const borshString = (s: string): Buffer => {
  const body = Buffer.from(s, 'utf8')
  const len = Buffer.alloc(4)
  len.writeUInt32LE(body.length)
  return Buffer.concat([len, body])
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

export interface EngineOptions {
  rpcUrl: string
  rig: Rig
  payer: Keypair
  /** Names the piece in the mpl-core asset. Defaults to the devnet form. */
  assetName?: (hour: number, pieceId: number) => { name: string; uri: string }
  onNote?: (note: string) => void
}

/**
 * Holds the connection and the two Switchboard handles the reveal needs.
 *
 * It holds no survivor state: the array is read from the chain each hour. The
 * cranker only has to agree with the chain going forward, and the verify
 * command does the opposite — it replays from the events, because a reader must
 * derive the state without trusting the account we wrote (`survivors.ts`). The
 * two paths meeting on the same array is the check.
 */
export class IssuanceEngine {
  private readonly conn: Connection
  private readonly rig: Rig
  private readonly payer: Keypair
  private readonly note: (s: string) => void
  private readonly assetName: (hour: number, pieceId: number) => { name: string; uri: string }
  private readonly recentlyFailed = new Set<string>()
  private sbProgram: unknown
  private programState?: PublicKey
  private rewardEscrow?: PublicKey
  private started = false

  constructor(options: EngineOptions) {
    this.conn = new Connection(options.rpcUrl, 'confirmed')
    this.rig = options.rig
    this.payer = options.payer
    this.note = options.onNote ?? (() => {})
    this.assetName =
      options.assetName ??
      ((hour) => ({ name: `Drake #${hour + 1}`, uri: `https://drakes.fun/a/${hour + 1}` }))
  }

  get crankAddress(): string {
    return this.payer.publicKey.toBase58()
  }

  /** Loads the Switchboard handles and reports the collection state. Call once. */
  async start(): Promise<void> {
    const sb = await import('@switchboard-xyz/on-demand')
    this.sbProgram = await sb.AnchorUtils.loadProgramFromConnection(this.conn)
    // The program state and the reward escrow are the two accounts the reveal
    // needs and the IDL does not name. `Randomness.create` builds a throwaway
    // instruction purely to read the program state key out of it.
    const [, tx] = await sb.Randomness.create(
      this.sbProgram as never,
      Keypair.generate(),
      this.rig.queue,
      this.payer.publicKey,
    )
    this.programState = tx.keys[9]!.pubkey
    this.rewardEscrow = PublicKey.findProgramAddressSync(
      [this.rig.randomness.toBuffer(), TOKEN_PROGRAM.toBuffer(), WSOL.toBuffer()],
      ASSOCIATED_TOKEN,
    )[0]

    const survivors = await this.readSurvivors()
    this.started = true
    this.note(`survivors read from chain: ${this.rig.collectionSize - survivors.remaining} already issued`)
  }

  /**
   * The survivor array as the chain holds it, read fresh.
   *
   * Deliberately re-read every hour rather than carried in memory and advanced
   * locally. A local copy has to be rolled back on every failed attempt, and
   * `loop.ts` retries — one wrong rollback and the crank's idea of the
   * permutation diverges from the chain's silently, which is the one bug here
   * that would not show up until it had corrupted a published artifact. One
   * account read an hour is not a cost worth being clever about.
   */
  private async readSurvivors(): Promise<SurvivorSet> {
    const account = await this.conn.getAccountInfo(this.rig.survivors)
    if (account === null) throw new Error('the survivors account does not exist on this cluster')
    const slots = new Uint16Array(this.rig.collectionSize)
    for (let i = 0; i < this.rig.collectionSize; i += 1) {
      slots[i] = account.data.readUInt16LE(SURVIVORS_SLOTS + i * 2)
    }
    return SurvivorSet.fromSlots(slots, account.data.readUInt16LE(SURVIVORS_REMAINING))
  }

  /**
   * Requests, reveals and settles one hour, or throws.
   *
   * Throwing is the contract with `runLoop`: it means "not settled", and the
   * loop decides whether the window still allows another go.
   */
  async settleHour(hour: number): Promise<IssuanceOutcome> {
    if (!this.started) throw new Error('start() was not called')
    const oracle = await this.pickOracle(hour)
    const snapshot = await this.request(hour, oracle)
    const { value, sigBuf, recovery } = await this.reveal()

    // The TypeScript's answer, computed from the chain's own array before the
    // program gives its own. The two agreeing on all 51 rehearsal issuances is
    // what the cross-implementation check rests on.
    const pieceId = (await this.readSurvivors()).issue(value)
    const resolved = resolveRecipient(snapshot, value)
    if (!verifyProof(resolved.leaf, resolved.proof, snapshot.root)) {
      throw new Error('the local proof did not verify; refusing to settle')
    }

    const signature = await this.settle(hour, oracle, resolved, sigBuf, recovery, value, pieceId)
    this.recentlyFailed.delete(oracle.toBase58())
    return {
      hour,
      pieceId,
      recipient: encodeBase58(resolved.leaf.owner),
      point: resolved.point.toString(),
      balance: resolved.leaf.balance.toString(),
      snapshotSlot: snapshot.slot.toString(),
      eligibleSupply: snapshot.eligibleSupply.toString(),
      root: toHex(snapshot.root),
      randomness: toHex(value),
      signature,
      holders: snapshot.leaves.length,
      oracle: oracle.toBase58(),
    }
  }

  private async pickOracle(hour: number): Promise<PublicKey> {
    const info = await this.conn.getAccountInfo(this.rig.queue)
    if (info === null) throw new Error('queue account not found; wrong cluster or wrong address')
    const queue = parseQueue(info.data)
    const keys = queue.oracleKeys.map((k) => new PublicKey(k))
    const infos = await this.conn.getMultipleAccountsInfo(keys)
    const oracles = keys.flatMap((key, i) => {
      const account = infos[i]
      return account ? [parseOracle(key.toBase58(), account.data)] : []
    })

    const { candidates, rejected } = eligible(oracles, queue, Math.floor(Date.now() / 1000))
    // The gateway probe, which is worth eight hours out of forty-eight: in the
    // first rehearsal one oracle passed every on-chain check and answered 503
    // to every reveal. On-chain liveness is not gateway liveness.
    const selection = await selectOracle({
      candidates,
      startIndex: hour,
      probe: httpProbe(2_500),
      avoid: this.recentlyFailed,
    })
    if (selection.chosen === null) {
      const why = [...rejected, ...selection.rejected].map((r) => `${r.address.slice(0, 8)}:${r.why}`)
      // Requesting with a silent gateway strands the hour and there is no
      // re-request, so sending nothing is strictly better than sending this.
      throw new Error(`no oracle available (${why.join(', ') || 'queue empty'})`)
    }
    this.note(`hour ${hour}: oracle ${selection.chosen.address.slice(0, 8)}, ${candidates.length} live`)
    return new PublicKey(selection.chosen.address)
  }

  private async request(hour: number, oracle: PublicKey): Promise<Snapshot> {
    const { slot, holdings } = await fetchHoldings({ rpcUrl: this.conn.rpcEndpoint, mint: this.rig.mint })
    const snapshot = buildSnapshot({ holdings, excluded: [], slot, index: BigInt(hour) })
    const data = Buffer.concat([
      REQUEST_IX,
      u64(hour),
      u64(snapshot.slot),
      Buffer.from(snapshot.root),
      Buffer.from(snapshot.commitment),
      u64(snapshot.eligibleSupply),
    ])
    const keys = [
      { pubkey: this.payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: this.rig.config, isSigner: false, isWritable: true },
      { pubkey: this.issuancePda(hour), isSigner: false, isWritable: true },
      { pubkey: this.rig.randomness, isSigner: false, isWritable: true },
      { pubkey: this.rig.queue, isSigner: false, isWritable: false },
      { pubkey: oracle, isSigner: false, isWritable: true },
      { pubkey: SWITCHBOARD, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ]
    await this.send([new TransactionInstruction({ programId: this.rig.program, keys, data })], 400_000, [])
    return snapshot
  }

  private async reveal(): Promise<{ value: Uint8Array; sigBuf: Buffer; recovery: number }> {
    const sb = await import('@switchboard-xyz/on-demand')
    const randomness = new sb.Randomness(this.sbProgram as never, this.rig.randomness)
    const ix = await randomness.revealIx(this.payer.publicKey)
    const data = ix.data as Buffer
    return {
      sigBuf: data.subarray(8, 72),
      recovery: data[72]!,
      value: new Uint8Array(data.subarray(73, 105)),
    }
  }

  private async settle(
    hour: number,
    oracle: PublicKey,
    resolved: Resolution,
    sigBuf: Buffer,
    recovery: number,
    value: Uint8Array,
    pieceId: number,
  ): Promise<string> {
    const asset = Keypair.generate()
    const proof = Buffer.concat(resolved.proof.map((p) => Buffer.from(p)))
    const proofLen = Buffer.alloc(4)
    proofLen.writeUInt32LE(resolved.proof.length)
    const named = this.assetName(hour, pieceId)
    const data = Buffer.concat([
      SETTLE_IX,
      sigBuf,
      Buffer.from([recovery]),
      Buffer.from(value),
      Buffer.from(resolved.leaf.owner),
      u64(resolved.leaf.balance),
      u64(resolved.leaf.rangeStart),
      u64(resolved.leaf.rangeEnd),
      proofLen,
      proof,
      borshString(named.name),
      borshString(named.uri),
    ])
    const keys = [
      { pubkey: this.payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: this.rig.config, isSigner: false, isWritable: true },
      { pubkey: this.issuancePda(hour), isSigner: false, isWritable: true },
      { pubkey: this.rig.survivors, isSigner: false, isWritable: true },
      { pubkey: this.rig.randomness, isSigner: false, isWritable: true },
      { pubkey: this.rig.queue, isSigner: false, isWritable: false },
      { pubkey: oracle, isSigner: false, isWritable: false },
      { pubkey: this.statsPda(oracle), isSigner: false, isWritable: true },
      { pubkey: this.rewardEscrow!, isSigner: false, isWritable: true },
      { pubkey: this.programState!, isSigner: false, isWritable: false },
      { pubkey: SWITCHBOARD, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: WSOL, isSigner: false, isWritable: false },
      { pubkey: asset.publicKey, isSigner: true, isWritable: true },
      { pubkey: this.rig.collection, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(resolved.leaf.owner), isSigner: false, isWritable: false },
      { pubkey: MPL_CORE, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ]
    return this.send([new TransactionInstruction({ programId: this.rig.program, keys, data })], 600_000, [asset])
  }

  private async send(
    instructions: TransactionInstruction[],
    units: number,
    extraSigners: Keypair[],
  ): Promise<string> {
    const tx = new Transaction()
      .add(ComputeBudgetProgram.setComputeUnitLimit({ units }))
      .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }))
    for (const ix of instructions) tx.add(ix)
    return sendAndConfirmTransaction(this.conn, tx, [this.payer, ...extraSigners], {
      commitment: 'confirmed',
    })
  }

  private issuancePda(hour: number): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('issuance'), u64(hour)],
      this.rig.program,
    )[0]
  }

  private statsPda(oracle: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('OracleRandomnessStats'), oracle.toBuffer()],
      SWITCHBOARD,
    )[0]
  }

  /** Marks an oracle so the next hour prefers somebody else. */
  blame(oracle: string): void {
    this.recentlyFailed.add(oracle)
  }
}
