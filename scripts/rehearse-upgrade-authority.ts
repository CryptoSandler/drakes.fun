// Handing the program's upgrade authority to the Squads vault, and proving the
// vault can use it.
//
//   RPC_URL=<devnet> node scripts/rehearse-upgrade-authority.ts
//
// Caller: the operator, once, before C1b on mainnet. Nothing else calls it.
//
// **What C1b is for.** Between deploying the program and revoking its upgrade
// authority there is a window in which a mainnet program holding real value is
// mutable. During that window the authority should not be one key: it should be
// the same 2-of-3 that holds everything else. This rehearses that on devnet,
// against the program that is actually deployed there.
//
// Two things, and only the first is the step itself:
//
//   1. `SetAuthority` on the BPF loader, moving the authority to the vault.
//   2. A loader instruction executed BY the vault through a real 2-of-3
//      proposal — which is what says the authority is usable and not just
//      parked. `Upgrade` and `SetAuthority` are the same program, the same
//      authority check and the same signer; what `Upgrade` additionally needs
//      is a funded buffer, and that is a cost, not a question.

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { clusterName } from '../src/lib/snapshot/rpc.ts'

const require = createRequire(import.meta.url)
const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } =
  require('@solana/web3.js')
const multisig = require('@sqds/multisig')

const LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111')
const PROGRAM = new PublicKey('7qHEeK3Q5UW5jKykXqWeShqpWCypm4hey2EzYGotkTUs')

const rpcUrl = process.env.RPC_URL
if (rpcUrl === undefined || rpcUrl === '') throw new Error('RPC_URL is not set')
const cluster = await clusterName(rpcUrl)
if (cluster !== 'devnet') throw new Error(`devnet only; the RPC is ${cluster}`)

const conn = new Connection(rpcUrl, 'confirmed')
const load = (dir: string, n: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.local/share/${dir}/${n}.json`, 'utf8')) as number[]))
const authority = load('solana-devnet-rehearsal', 'crank')
const payer = load('solana-devnet-moneypath', 'payer')
const members = [load('solana-devnet-moneypath', 'ms-a'), load('solana-devnet-moneypath', 'ms-b')]
const rig = JSON.parse(readFileSync(`${homedir()}/proyectos/evidencia/drakes/2026-09-01-b8-vaultclaim/state.json`, 'utf8')) as {
  multisig: string; multisigVault: string
}
const multisigPda = new PublicKey(rig.multisig)
const vault = new PublicKey(rig.multisigVault)

/** `ProgramData`: 4-byte tag, 8-byte slot, 1-byte option, 32-byte authority. */
const readAuthority = async () => {
  const program = await conn.getAccountInfo(PROGRAM)
  const programData = new PublicKey(program!.data.subarray(4, 36))
  const data = (await conn.getAccountInfo(programData))!.data
  return {
    programData,
    slot: data.readBigUInt64LE(4),
    authority: data[12] === 1 ? new PublicKey(data.subarray(13, 45)) : null,
  }
}

const setAuthority = (programData: InstanceType<typeof PublicKey>, current: InstanceType<typeof PublicKey>, next: InstanceType<typeof PublicKey>) =>
  new TransactionInstruction({
    programId: LOADER,
    keys: [
      { pubkey: programData, isSigner: false, isWritable: true },
      { pubkey: current, isSigner: true, isWritable: false },
      { pubkey: next, isSigner: false, isWritable: false },
    ],
    // SetAuthority is instruction 4 of the upgradeable loader.
    data: Buffer.from(Uint8Array.of(4, 0, 0, 0)),
  })

const before = await readAuthority()
process.stdout.write(
  `program      ${PROGRAM.toBase58()}\n` +
  `programdata  ${before.programData.toBase58()}\n` +
  `authority    ${before.authority?.toBase58() ?? 'NONE — already revoked'}\n` +
  `vault        ${vault.toBase58()}\n\n`,
)
if (before.authority === null) throw new Error('the authority is already revoked; nothing to rehearse')

// ---- 1 · hand it to the vault --------------------------------------------
if (!before.authority.equals(vault)) {
  const sig = await sendAndConfirmTransaction(
    conn,
    new Transaction().add(setAuthority(before.programData, before.authority, vault)),
    [payer, authority],
    { commitment: 'confirmed' },
  )
  process.stdout.write(`set-upgrade-authority  ${sig}\n`)
}
const afterTransfer = await readAuthority()
process.stdout.write(`  authority now: ${afterTransfer.authority?.toBase58()}\n`)
if (!afterTransfer.authority!.equals(vault)) throw new Error('the authority is not the vault')

// ---- 2 · the vault uses it, through a real 2-of-3 ------------------------
// A loader instruction signed by the vault. `Upgrade` differs only in needing a
// funded buffer; the authority check it performs is this one.
const info = await multisig.accounts.Multisig.fromAccountAddress(conn, multisigPda)
const index = BigInt(Number(info.transactionIndex) + 1)
const inner = new (require('@solana/web3.js').TransactionMessage)({
  payerKey: vault,
  recentBlockhash: (await conn.getLatestBlockhash()).blockhash,
  instructions: [setAuthority(before.programData, vault, vault)],
})

const send = async (ixs: InstanceType<typeof TransactionInstruction>[], signers: ReturnType<typeof load>[]) =>
  sendAndConfirmTransaction(conn, new Transaction().add(...ixs), signers, { commitment: 'confirmed' })

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

const { instruction, lookupTableAccounts } = await multisig.instructions.vaultTransactionExecute({
  connection: conn, multisigPda, transactionIndex: index, member: members[0]!.publicKey,
})
void lookupTableAccounts
const executed = await send([instruction], [members[0]!])
process.stdout.write(`executed ${executed}\n`)

const after = await readAuthority()
process.stdout.write(
  `\nauthority after the 2-of-3: ${after.authority?.toBase58()}\n` +
  `  still the vault: ${after.authority!.equals(vault) ? 'YES' : 'NO'}\n` +
  `  the vault signed a BPF-loader instruction through a proposal, which is the\n` +
  `  same authority check \`Upgrade\` performs.\n`,
)
if (!after.authority!.equals(vault)) throw new Error('the authority moved unexpectedly')
