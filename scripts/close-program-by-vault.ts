// Close a program whose upgrade authority is the Squads vault.
//
//   RPC_URL=... node scripts/close-program-by-vault.ts --program <id>
//                  [--recipient <address>]
//
// Caller: the operator, when a rehearsal rig is retired. Nothing in the
// application calls it, and **it exists only because C1b worked**: once the
// authority is in the multisig, `solana program close` cannot sign, and the
// loader's `Close` has to go through a proposal like any other authority
// instruction.
//
// **Closing a program is irreversible and the program id can never be used
// again.** Its accounts survive — config, survivors and every issuance stay on
// chain, owned by an id that can no longer execute — but nothing will ever
// modify them. Export first: `scripts/export-issuances.ts`.
//
// It refuses any cluster but devnet.

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { clusterName } from '../src/lib/snapshot/rpc.ts'

const require = createRequire(import.meta.url)
const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } =
  require('@solana/web3.js')
const multisig = require('@sqds/multisig')

const LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111')
/** BPF Upgradeable Loader `Close`. */
const CLOSE = 5

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
if (cluster !== 'devnet') die(`this retires a REHEARSAL rig and the cluster is ${cluster}`)

const program = new PublicKey(flag('program') ?? die('--program <id> is required'))
const conn = new Connection(rpcUrl, 'confirmed')
const load = (dir: string, n: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.local/share/${dir}/${n}.json`, 'utf8')) as number[]))

const members = [load('solana-devnet-moneypath', 'ms-a'), load('solana-devnet-moneypath', 'ms-b')]
const rig = JSON.parse(
  readFileSync(`${homedir()}/proyectos/evidencia/drakes/2026-09-01-b8-vaultclaim/state.json`, 'utf8'),
) as { multisig: string; multisigVault: string }
const multisigPda = new PublicKey(rig.multisig)
const vault = new PublicKey(rig.multisigVault)
const recipient = new PublicKey(
  flag('recipient') ?? load('solana-devnet-rehearsal', 'crank').publicKey.toBase58(),
)

const programData = PublicKey.findProgramAddressSync([program.toBuffer()], LOADER)[0]
const [programInfo, dataInfo] = await conn.getMultipleAccountsInfo([program, programData], 'confirmed')
if (programInfo === null) die('no program account')
if (dataInfo === null) die('no programdata account: this program is already closed')

const authority = dataInfo.data[12] === 1 ? new PublicKey(dataInfo.data.subarray(13, 45)) : null
out(`program      ${program.toBase58()}`)
out(`programdata  ${programData.toBase58()}  ${(dataInfo.lamports / 1e9).toFixed(9)} SOL`)
out(`authority    ${authority?.toBase58() ?? 'NONE'}`)
out(`recipient    ${recipient.toBase58()}  ${((await conn.getBalance(recipient)) / 1e9).toFixed(9)} SOL`)
if (authority === null || !authority.equals(vault)) {
  die('the upgrade authority is not the vault; use `solana program close` with whatever key holds it')
}

const close = new TransactionInstruction({
  programId: LOADER,
  keys: [
    { pubkey: programData, isSigner: false, isWritable: true },
    { pubkey: recipient, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: true, isWritable: false },
    { pubkey: program, isSigner: false, isWritable: true },
  ],
  data: Buffer.from(Uint8Array.of(CLOSE, 0, 0, 0)),
})

const info = await multisig.accounts.Multisig.fromAccountAddress(conn, multisigPda)
const index = BigInt(Number(info.transactionIndex) + 1)
const inner = new (require('@solana/web3.js').TransactionMessage)({
  payerKey: vault,
  recentBlockhash: (await conn.getLatestBlockhash()).blockhash,
  instructions: [close],
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
out(`\nproposal ${index}  approvals ${proposal.approved.length}`)

const { instruction } = await multisig.instructions.vaultTransactionExecute({
  connection: conn, multisigPda, transactionIndex: index, member: members[0]!.publicKey,
})
const executed = await send([instruction], [members[0]!])
out(`executed ${executed}`)

const after = await conn.getAccountInfo(programData, 'confirmed')
const recipientAfter = (await conn.getBalance(recipient)) / 1e9
out('')
out(`programdata  ${after === null ? 'CLOSED' : `STILL THERE (${after.lamports / 1e9} SOL)`}`)
out(`recipient    ${recipientAfter.toFixed(9)} SOL`)
// The loader's own evidence: the account is gone and the lamports moved.
if (after !== null) die('the programdata account is still there; the close did not take')
