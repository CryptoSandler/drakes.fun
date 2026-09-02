// Creating a coin on pump.fun with a Squads vault as the creator, on devnet.
//
//   RPC_URL=<devnet> node scripts/rehearse-pump-create.ts
//
// Caller: the operator, once, before the mainnet launch. Nothing else calls it.
//
// **Why this is the one rehearsal that matters.** `create` takes
// `creator: pubkey` as an ARGUMENT, so the vault can be the creator with no PDA
// signing — but `set_creator` is gated on an authority that belongs to
// pump.fun, not to us. **A creator set wrong at launch is wrong forever.** This
// proves the whole path on a cluster where being wrong costs nothing:
//
//   1. create the coin with the Squads vault as `creator`
//   2. buy twice from a different wallet, so fees accrue
//   3. `collect_creator_fee` — permissionless, no signer — and watch the SOL
//      land at the vault and nowhere else
//   4. read `BondingCurve.creator` back off the chain
//
// It refuses to run anywhere but devnet.

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { clusterName } from '../src/lib/snapshot/rpc.ts'

const require = createRequire(import.meta.url)
const {
  Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY,
  Transaction, TransactionInstruction, sendAndConfirmTransaction, ComputeBudgetProgram,
} = require('@solana/web3.js')

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P')
// `create_v2` mints under Token-2022, which is what every real pump.fun coin
// turned out to be (`docs/references.md`, 2026-09-02).
const TOKEN = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
const MAYHEM = new PublicKey('MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e')
const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
/**
 * The fee program, and finding it is the point of this comment.
 *
 * `FeeConfig` is declared in pump's IDL and in PumpSwap's, so a scan for its
 * discriminator under those two programs finds nothing — which is what I
 * concluded from, wrongly. The account is OWNED by a third program, and the
 * only reason that surfaced is that a `buy` failed with
 * `AccountOwnedByWrongProgram ... Right: pfeeUxB6...`. **An IDL says what an
 * account looks like, never who owns it.**
 */
const FEE_PROGRAM = new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ')
const DISC = {
  createV2: Buffer.from('d6904cec5f8b31b4', 'hex'),
  buy: Buffer.from('66063d1201daebea', 'hex'),
  collect: Buffer.from('1416567bc61cdb84', 'hex'),
  extend: Buffer.from('ea66c2cb96483ee5', 'hex'),
}

const rpcUrl = process.env.RPC_URL
if (rpcUrl === undefined || rpcUrl === '') throw new Error('RPC_URL is not set')
const cluster = await clusterName(rpcUrl)
if (cluster !== 'devnet') throw new Error(`this rehearsal is devnet-only; the RPC is ${cluster}`)

const store = `${homedir()}/.local/share/solana-devnet-moneypath`
const load = (n: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`${store}/${n}.json`, 'utf8')) as number[]))

const conn = new Connection(rpcUrl, 'confirmed')
const payer = load('payer')
const buyer = load('ms-a') // any wallet that is not the creator
const state = JSON.parse(readFileSync(`${homedir()}/proyectos/evidencia/drakes/2026-09-01-b8-vaultclaim/state.json`, 'utf8')) as {
  multisigVault: string
}
const vault = new PublicKey(state.multisigVault)

const pda = (seeds: (Buffer | Uint8Array)[], program = PUMP) => PublicKey.findProgramAddressSync(seeds, program)[0]
const ata = (owner: InstanceType<typeof PublicKey>, mint: InstanceType<typeof PublicKey>) =>
  PublicKey.findProgramAddressSync([owner.toBytes(), TOKEN.toBytes(), mint.toBytes()], ATA_PROGRAM)[0]

const str = (s: string) => {
  const b = Buffer.from(s, 'utf8')
  const len = Buffer.alloc(4)
  len.writeUInt32LE(b.length)
  return Buffer.concat([len, b])
}
const u64 = (n: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b }

const mint = Keypair.generate()
const bondingCurve = pda([Buffer.from('bonding-curve'), mint.publicKey.toBytes()])
const global = pda([Buffer.from('global')])
const eventAuthority = pda([Buffer.from('__event_authority')])
const mintAuthority = pda([Buffer.from('mint-authority')])
const creatorVault = pda([Buffer.from('creator-vault'), vault.toBytes()])

process.stdout.write(
  `payer   ${payer.publicKey.toBase58()}\n` +
  `buyer   ${buyer.publicKey.toBase58()}\n` +
  `creator ${vault.toBase58()}  (the Squads vault — an argument, not a signer)\n` +
  `mint    ${mint.publicKey.toBase58()}\n` +
  `vault   ${creatorVault.toBase58()}  (creator-vault PDA)\n\n`,
)

const before = {
  payer: await conn.getBalance(payer.publicKey),
  creatorVault: await conn.getBalance(creatorVault),
  vault: await conn.getBalance(vault),
}

// 1 · create_v2 ------------------------------------------------------------
// **`create_v2`, not `create`, and the program chose for us.** A v1 coin builds
// fine and then its buys fail with `InvalidBondingCurveV2`: the live buy path
// wants a v2 curve that a v1 create never made. `create_v2_enabled` is true on
// both clusters. So v1 is legacy in everything but name.
//
// `is_mayhem_mode: false` and `is_cashback_enabled: false` — two pump.fun
// mechanics we do not need and did not investigate. Opting in to a mechanic
// whose rules live in somebody else's program, on the coin whose creator can
// never be changed, is not a thing to do casually.
// Under the MAYHEM program, not under pump — the IDL lists the seeds and never
// says which program derives them, and the wrong guess fails with
// `ConstraintSeeds` naming the address it wanted.
const globalParams = pda([Buffer.from('global-params')], MAYHEM)
const solVault = pda([Buffer.from('sol-vault')], MAYHEM)
const mayhemState = pda([Buffer.from('mayhem-state'), mint.publicKey.toBytes()], MAYHEM)
const mayhemTokenVault = ata(mayhemState, mint.publicKey)

const createIx = new TransactionInstruction({
  programId: PUMP,
  keys: [
    { pubkey: mint.publicKey, isSigner: true, isWritable: true },
    { pubkey: mintAuthority, isSigner: false, isWritable: false },
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: ata(bondingCurve, mint.publicKey), isSigner: false, isWritable: true },
    { pubkey: global, isSigner: false, isWritable: false },
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN, isSigner: false, isWritable: false },
    { pubkey: ATA_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: MAYHEM, isSigner: false, isWritable: true },
    { pubkey: globalParams, isSigner: false, isWritable: false },
    { pubkey: solVault, isSigner: false, isWritable: true },
    { pubkey: mayhemState, isSigner: false, isWritable: true },
    { pubkey: mayhemTokenVault, isSigner: false, isWritable: true },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: PUMP, isSigner: false, isWritable: false },
  ],
  data: Buffer.concat([
    DISC.createV2,
    str('Drakes Rehearsal'), str('DRAKESR'),
    str('https://drakes.fun/rehearsal.json'),
    vault.toBuffer(),
    Buffer.from([0]), // is_mayhem_mode
    Buffer.from([0]), // is_cashback_enabled
  ]),
})
const sig1 = await sendAndConfirmTransaction(
  conn,
  new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }), createIx),
  [payer, mint],
  { commitment: 'confirmed' },
)
process.stdout.write(`create_v2 ${sig1}\n`)

// 2 · two buys from a different wallet -------------------------------------
const buyIx = (amount: bigint, maxCost: bigint) => new TransactionInstruction({
  programId: PUMP,
  keys: [
    { pubkey: global, isSigner: false, isWritable: false },
    { pubkey: new PublicKey('68yFSZxzLWJXkxxRGydZ63C6mHx1NLEDWmwN9Lb5yySg'), isSigner: false, isWritable: true },
    { pubkey: mint.publicKey, isSigner: false, isWritable: false },
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: ata(bondingCurve, mint.publicKey), isSigner: false, isWritable: true },
    { pubkey: ata(buyer.publicKey, mint.publicKey), isSigner: false, isWritable: true },
    { pubkey: buyer.publicKey, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN, isSigner: false, isWritable: false },
    { pubkey: creatorVault, isSigner: false, isWritable: true },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: PUMP, isSigner: false, isWritable: false },
    { pubkey: pda([Buffer.from('global_volume_accumulator')]), isSigner: false, isWritable: false },
    { pubkey: pda([Buffer.from('user_volume_accumulator'), buyer.publicKey.toBytes()]), isSigner: false, isWritable: true },
    { pubkey: pda([Buffer.from('fee_config'), PUMP.toBytes()], FEE_PROGRAM), isSigner: false, isWritable: false },
    { pubkey: FEE_PROGRAM, isSigner: false, isWritable: false },
    // Remaining accounts: `Global.buyback_fee_recipients`, all eight, writable.
    // Not in the IDL's account list — the program reads them off the end, and
    // omitting them fails with `BuybackFeeRecipientMissing`. Read from the
    // account rather than pasted, so a change on their side is picked up.
    ...buybackRecipients.map((pubkey) => ({ pubkey, isSigner: false, isWritable: true })),
    { pubkey: bondingCurveV2, isSigner: false, isWritable: true },
  ],
  data: Buffer.concat([DISC.buy, u64(amount), u64(maxCost), Buffer.from([0])]),
})

// The eight buyback recipients live at a fixed offset in `Global`, after the
// reserved recipients and the cashback flag.
const globalData = (await conn.getAccountInfo(global))!.data
const BUYBACK_OFFSET = 741
const buybackRecipients = Array.from({ length: 8 }, (_, i) =>
  new PublicKey(globalData.subarray(BUYBACK_OFFSET + i * 32, BUYBACK_OFFSET + i * 32 + 32)))

// `create_v2` writes a 115-byte BondingCurve; the full record is 151, and the
// buy path wants the extended one. `extend_account` grows it in place, so the
// `bonding_curve_v2` remaining account is the SAME address — a name in the IDL
// that is about the record's shape, not about a second account.
const extendIx = new TransactionInstruction({
  programId: PUMP,
  keys: [
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: PUMP, isSigner: false, isWritable: false },
  ],
  data: DISC.extend,
})
const sigExtend = await sendAndConfirmTransaction(conn, new Transaction().add(extendIx), [payer], { commitment: 'confirmed' })
process.stdout.write(`extend    ${sigExtend}  (${(await conn.getAccountInfo(bondingCurve))!.data.length} bytes)\n`)
const bondingCurveV2 = bondingCurve
const buys: string[] = []
for (const [amount, cost] of [[500_000_000_000n, 30_000_000n], [300_000_000_000n, 30_000_000n]] as const) {
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    await ataIfMissing(buyer, mint.publicKey),
    buyIx(amount, cost),
  )
  buys.push(await sendAndConfirmTransaction(conn, tx, [buyer], { commitment: 'confirmed' }))
  process.stdout.write(`buy      ${buys.at(-1)}\n`)
}

async function ataIfMissing(owner: ReturnType<typeof load>, m: InstanceType<typeof PublicKey>) {
  const address = ata(owner.publicKey, m)
  const info = await conn.getAccountInfo(address)
  if (info !== null) return new TransactionInstruction({ programId: SystemProgram.programId, keys: [], data: Buffer.alloc(0) })
  return new TransactionInstruction({
    programId: ATA_PROGRAM,
    keys: [
      { pubkey: owner.publicKey, isSigner: true, isWritable: true },
      { pubkey: address, isSigner: false, isWritable: true },
      { pubkey: owner.publicKey, isSigner: false, isWritable: false },
      { pubkey: m, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  })
}

const accrued = await conn.getBalance(creatorVault)
process.stdout.write(`\ncreator-vault after the buys: ${(accrued / 1e9).toFixed(9)} SOL\n`)

// 3 · collect, permissionless ----------------------------------------------
const collectIx = new TransactionInstruction({
  programId: PUMP,
  keys: [
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: creatorVault, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: PUMP, isSigner: false, isWritable: false },
  ],
  data: DISC.collect,
})
// Signed by the PAYER, who is not the creator and not a member of the multisig.
// If this succeeds, the claim is permissionless and its destination is fixed.
const sig3 = await sendAndConfirmTransaction(conn, new Transaction().add(collectIx), [payer], { commitment: 'confirmed' })
process.stdout.write(`collect  ${sig3}  (signed by the payer, who is not the creator)\n`)

// 4 · read it back ----------------------------------------------------------
const curve = await conn.getAccountInfo(bondingCurve)
const creatorOnChain = new PublicKey(curve!.data.subarray(49, 81))
const after = {
  creatorVault: await conn.getBalance(creatorVault),
  vault: await conn.getBalance(vault),
}

process.stdout.write(
  `\nBondingCurve.creator = ${creatorOnChain.toBase58()}\n` +
  `  is the Squads vault: ${creatorOnChain.equals(vault) ? 'YES' : 'NO'}\n` +
  `  vault SOL  ${(before.vault / 1e9).toFixed(9)} -> ${(after.vault / 1e9).toFixed(9)} ` +
  `(+${((after.vault - before.vault) / 1e9).toFixed(9)})\n` +
  `  creator-vault ${(accrued / 1e9).toFixed(9)} -> ${(after.creatorVault / 1e9).toFixed(9)}\n` +
  `  rehearsal cost ${((before.payer - (await conn.getBalance(payer.publicKey))) / 1e9).toFixed(6)} SOL\n`,
)
if (!creatorOnChain.equals(vault)) throw new Error('the creator is not the vault')
if (after.vault <= before.vault) throw new Error('no SOL reached the vault')
