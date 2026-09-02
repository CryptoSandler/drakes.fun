// The upgrade itself, executed by the 2-of-3 that holds the authority.
//
//   RPC_URL=... node scripts/rehearse-program-upgrade.ts --buffer <address>
//
// Caller: the operator, once per program change while the authority lives in a
// multisig. `docs/upgrade-authority-devnet.md` rehearsed the ceremony with a
// `SetAuthority`; this runs the real thing.
//
// **What this closes.** That document says plainly: *"A full `Upgrade` was not
// run"* — it needs a buffer holding the new program, and the devnet wallet did
// not have the 2.16 SOL of rent. What an `Upgrade` adds over a `SetAuthority`
// is buffer handling, and buffer handling is exactly where a real upgrade goes
// wrong.
//
// The buffer is written and handed to the vault BEFORE this runs:
//
//   solana program write-buffer target/deploy/issuance.so --keypair <payer>
//   solana program set-buffer-authority <buffer> --new-buffer-authority <vault>
//
// It refuses any cluster but devnet.

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { clusterName } from '../src/lib/snapshot/rpc.ts'

const require = createRequire(import.meta.url)
const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SYSVAR_RENT_PUBKEY, SYSVAR_CLOCK_PUBKEY, sendAndConfirmTransaction } =
  require('@solana/web3.js')
const multisig = require('@sqds/multisig')

const LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111')
const PROGRAM = new PublicKey('7qHEeK3Q5UW5jKykXqWeShqpWCypm4hey2EzYGotkTUs')

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const rpcUrl = process.env.RPC_URL
if (rpcUrl === undefined || rpcUrl === '') throw new Error('RPC_URL is not set')
const cluster = await clusterName(rpcUrl)
// Absolute, and the only cluster this script may ever touch.
if (cluster !== 'devnet') throw new Error(`this is a devnet rehearsal and the cluster is ${cluster}`)

const bufferAddress = flag('buffer')
if (bufferAddress === undefined) throw new Error('--buffer <address> is required')
const buffer = new PublicKey(bufferAddress)

const conn = new Connection(rpcUrl, 'confirmed')
const load = (dir: string, n: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.local/share/${dir}/${n}.json`, 'utf8')) as number[]))

const spill = load('solana-devnet-rehearsal', 'crank')
const members = [load('solana-devnet-moneypath', 'ms-a'), load('solana-devnet-moneypath', 'ms-b')]
const rig = JSON.parse(
  readFileSync(`${homedir()}/proyectos/evidencia/drakes/2026-09-01-b8-vaultclaim/state.json`, 'utf8'),
) as { multisig: string; multisigVault: string }
const multisigPda = new PublicKey(rig.multisig)
const vault = new PublicKey(rig.multisigVault)

const programData = PublicKey.findProgramAddressSync([PROGRAM.toBuffer()], LOADER)[0]

/** The programdata's own bytes: 4-byte tag, 8-byte slot, 1-byte option, authority. */
const readProgramData = async () => {
  const info = await conn.getAccountInfo(programData, 'confirmed')
  if (info === null) throw new Error('no programdata account')
  return {
    slot: info.data.readBigUInt64LE(4),
    authority: info.data[12] === 1 ? new PublicKey(info.data.subarray(13, 45)) : null,
  }
}

const before = await readProgramData()
process.stdout.write(
  `program      ${PROGRAM.toBase58()}\n` +
  `programdata  ${programData.toBase58()}\n` +
  `authority    ${before.authority?.toBase58() ?? 'NONE'}\n` +
  `deployed at  slot ${before.slot}\n` +
  `buffer       ${buffer.toBase58()}\n\n`,
)
if (before.authority === null || !before.authority.equals(vault)) {
  throw new Error('the upgrade authority is not the vault; nothing to rehearse')
}

// A buffer whose authority is not the vault cannot be consumed by the vault's
// upgrade, and the loader's error for that reads like an authority problem with
// the PROGRAM. Checked here so the failure names the right account.
const bufferInfo = await conn.getAccountInfo(buffer, 'confirmed')
if (bufferInfo === null) throw new Error('no buffer account')
const bufferAuthority = new PublicKey(bufferInfo.data.subarray(5, 37))
process.stdout.write(`buffer holds ${bufferInfo.data.length - 37} bytes, authority ${bufferAuthority.toBase58()}\n`)
if (!bufferAuthority.equals(vault)) throw new Error('the buffer authority is not the vault')

/** BPF Upgradeable Loader `Upgrade`, instruction index 3. */
const upgrade = () =>
  new TransactionInstruction({
    programId: LOADER,
    keys: [
      { pubkey: programData, isSigner: false, isWritable: true },
      { pubkey: PROGRAM, isSigner: false, isWritable: true },
      { pubkey: buffer, isSigner: false, isWritable: true },
      { pubkey: spill.publicKey, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(Uint8Array.of(3, 0, 0, 0)),
  })

const info = await multisig.accounts.Multisig.fromAccountAddress(conn, multisigPda)
const index = BigInt(Number(info.transactionIndex) + 1)
const inner = new (require('@solana/web3.js').TransactionMessage)({
  payerKey: vault,
  recentBlockhash: (await conn.getLatestBlockhash()).blockhash,
  instructions: [upgrade()],
})

const send = async (ixs: unknown[], signers: unknown[]) =>
  sendAndConfirmTransaction(conn, new Transaction().add(...(ixs as never[])), signers as never[], { commitment: 'confirmed' })

await send([multisig.instructions.vaultTransactionCreate({
  multisigPda, transactionIndex: index, creator: members[0]!.publicKey,
  vaultIndex: 0, ephemeralSigners: 0, transactionMessage: inner,
})], [members[0]!])
await send([multisig.instructions.proposalCreate({
  multisigPda, transactionIndex: index, creator: members[0]!.publicKey,
})], [members[0]!])
for (const member of members) {
  await send([multisig.instructions.proposalApprove({
    multisigPda, transactionIndex: index, member: member.publicKey,
  })], [member])
}
const proposal = await multisig.accounts.Proposal.fromAccountAddress(
  conn, multisig.getProposalPda({ multisigPda, transactionIndex: index })[0],
)
process.stdout.write(`\nproposal ${index}  status ${Object.keys(proposal.status)[0]}  approvals ${proposal.approved.length}\n`)

const { instruction } = await multisig.instructions.vaultTransactionExecute({
  connection: conn, multisigPda, transactionIndex: index, member: members[0]!.publicKey,
})
const executed = await send([instruction], [members[0]!])
process.stdout.write(`executed ${executed}\n`)

const after = await readProgramData()
process.stdout.write(
  `\nafter the 2-of-3\n` +
  `  authority   ${after.authority?.toBase58() ?? 'NONE'} (${after.authority?.equals(vault) ? 'still the vault' : 'MOVED'})\n` +
  `  deployed at slot ${after.slot} (was ${before.slot})\n`,
)
// The upgrade's own evidence: the loader stamps the slot it redeployed at.
if (after.slot <= before.slot) throw new Error('the last-deployed slot did not advance; the upgrade did not take')
if (after.authority === null || !after.authority.equals(vault)) throw new Error('the authority moved')
process.stdout.write('\nthe program was replaced by a 2-of-3 proposal, and the authority is unchanged.\n')
