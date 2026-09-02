// A fresh issuance rig on devnet: a collection, a randomness account, and
// `initialize` with a real `base_uri`.
//
//   RPC_URL=... node scripts/rehearse-rig.ts --out <rig.json>
//                  --base-uri https://gateway.irys.xyz/<tx>/
//                  --name-prefix "Drake #" [--period 60] [--in 45]
//
// Caller: the operator, when a rehearsal needs a rig the existing one cannot
// provide. **The config PDA seed is fixed**, so a program has exactly one config
// for its whole life and `initialize` cannot run twice — which is why proving
// anything about `initialize` needs a new program id, and why this script
// exists instead of a note saying "it was done by hand once".
//
// It reads the program id from the keypair it is given, so it follows whatever
// `declare_id!` was built.
//
// The account order and the two Switchboard derivations are the ones the
// 2026-09-01 B4 bootstrap used and that produced a working rig; they are in the
// repository now rather than in a scratchpad.

import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { clusterName } from '../src/lib/snapshot/rpc.ts'

const require = createRequire(import.meta.url)
const {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction,
  ComputeBudgetProgram, sendAndConfirmTransaction,
} = require('@solana/web3.js')
const sb = require('@switchboard-xyz/on-demand')

const MPL_CORE = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d')
/** `sha256("global:initialize")[..8]`. */
const INITIALIZE_IX = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237])
/** mpl-core `CreateCollectionV2`. */
const CREATE_COLLECTION_V2 = 21

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
const cluster = await clusterName(rpcUrl)
if (cluster !== 'devnet') die(`this builds a REHEARSAL rig and the cluster is ${cluster}`)

const baseUri = flag('base-uri') ?? die('--base-uri is required, and it ends with a slash')
if (!baseUri.endsWith('/')) die('--base-uri must end with a slash: the program appends 0000.json')
const namePrefix = flag('name-prefix') ?? die('--name-prefix is required')
const outPath = flag('out') ?? die('--out <rig.json> is required')
const period = Number(flag('period') ?? 60)
const startsIn = Number(flag('in') ?? 45)

const home = process.env.HOME ?? die('no HOME')
const keystore = `${home}/.local/share/solana-devnet-rehearsal`
const load = (n: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`${keystore}/${n}.json`, 'utf8')) as number[]))

const payer = load('crank')
const programKeypair = load(flag('program') ?? 'program-b25')
const program = programKeypair.publicKey
const queue = new PublicKey(flag('queue') ?? 'EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7')
const mint = new PublicKey(flag('mint') ?? '3mdNd6KVgrVq3QbnubsA8fcejqMHHjT3EEDwYCAW6imJ')

const conn = new Connection(rpcUrl, 'confirmed')
const balance = async () => (await conn.getBalance(payer.publicKey)) / 1e9

const u64 = (n: bigint | number): Buffer => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b }
const i64 = (n: bigint | number): Buffer => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(n)); return b }
const u32 = (n: number): Buffer => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b }
const str = (s: string): Buffer => {
  const body = Buffer.from(s, 'utf8')
  return Buffer.concat([u32(body.length), body])
}

const [config] = PublicKey.findProgramAddressSync([Buffer.from('config')], program)
const [survivors] = PublicKey.findProgramAddressSync([Buffer.from('survivors')], program)

out(`program    ${program.toBase58()}`)
out(`config     ${config.toBase58()}`)
out(`survivors  ${survivors.toBase58()}`)
out(`payer      ${payer.publicKey.toBase58()}  ${await balance()} SOL`)
out('')

// --- the collection, whose update authority is THIS program's config --------
// mpl-core checks that authority at mint, so a collection pointed at another
// program's config cannot be minted into by this one.
const collection = Keypair.generate()
const collectionData = Buffer.concat([
  Buffer.from([CREATE_COLLECTION_V2]),
  str('Drakes rehearsal'),
  str(`${baseUri}collection.json`),
  Buffer.from([0]),
  Buffer.from([0]),
])
const collectionSig = await sendAndConfirmTransaction(
  conn,
  new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }))
    .add(new TransactionInstruction({
      programId: MPL_CORE,
      data: collectionData,
      keys: [
        { pubkey: collection.publicKey, isSigner: true, isWritable: true },
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
    })),
  [payer, collection],
  { commitment: 'confirmed' },
)
out(`collection ${collection.publicKey.toBase58()}  ${collectionSig.slice(0, 16)}…`)

// --- the randomness account -------------------------------------------------
// `initialize` creates it by CPI, so what is needed here is the account layout
// Switchboard would have used: its own template instruction gives both the
// recent slot the lookup table derives from and every account, in order.
const sbProgram = await sb.AnchorUtils.loadProgramFromConnection(conn)
const randomness = Keypair.generate()
const [, template] = await sb.Randomness.create(sbProgram, randomness, queue, payer.publicKey)
const keys = template.keys.map((k: { pubkey: InstanceType<typeof PublicKey> }) => k.pubkey)
const recentSlot = template.data.readBigUInt64LE(8)

const genesis = Math.floor(Date.now() / 1000) + startsIn
const manifestHash = createHash('sha256').update(`drakes devnet rehearsal ${baseUri}`).digest()

const params = Buffer.concat([
  u64(recentSlot),
  manifestHash,
  mint.toBuffer(),
  i64(genesis),
  i64(period),
  u32(4000),
  u32(0), // excluded: none
  str(baseUri),
  str(namePrefix),
])

const initializeSig = await sendAndConfirmTransaction(
  conn,
  new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }))
    .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }))
    .add(new TransactionInstruction({
      programId: program,
      data: Buffer.concat([INITIALIZE_IX, params]),
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: survivors, isSigner: false, isWritable: true },
        { pubkey: collection.publicKey, isSigner: false, isWritable: false },
        { pubkey: queue, isSigner: false, isWritable: true },
        { pubkey: randomness.publicKey, isSigner: true, isWritable: true },
        { pubkey: keys[1], isSigner: false, isWritable: true },
        { pubkey: keys[9], isSigner: false, isWritable: false },
        { pubkey: keys[10], isSigner: false, isWritable: false },
        { pubkey: keys[11], isSigner: false, isWritable: true },
        { pubkey: keys[12], isSigner: false, isWritable: false },
        { pubkey: keys[6], isSigner: false, isWritable: false },
        { pubkey: keys[7], isSigner: false, isWritable: false },
        { pubkey: keys[8], isSigner: false, isWritable: false },
        { pubkey: sbProgram.programId, isSigner: false, isWritable: false },
        { pubkey: keys[5], isSigner: false, isWritable: false },
      ],
    })),
  [payer, randomness],
  { commitment: 'confirmed' },
)
out(`initialize ${initializeSig.slice(0, 16)}…`)

const rig = {
  _: 'A devnet rehearsal rig. Devnet only, holds no value, every address here is public chain state.',
  rpcEnv: 'RPC_URL',
  keypairEnv: 'CRANK_KEYPAIR',
  expectCluster: 'devnet',
  expectPeriodSeconds: period,
  program: program.toBase58(),
  config: config.toBase58(),
  survivors: survivors.toBase58(),
  collection: collection.publicKey.toBase58(),
  randomness: randomness.publicKey.toBase58(),
  queue: queue.toBase58(),
  mint: mint.toBase58(),
  collectionSize: 4000,
  baseUri,
  namePrefix,
  genesisUnix: genesis,
}
writeFileSync(outPath, `${JSON.stringify(rig, null, 2)}\n`)
out('')
out(`rig written to ${outPath}`)
out(`genesis in ${startsIn}s, period ${period}s`)
out(`payer now ${await balance()} SOL`)
