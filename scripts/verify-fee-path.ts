// The money path, counted rather than assumed.
//
//   node scripts/verify-fee-path.ts --rig <rig.json> [--swaps 10] [--claim]
//
// Caller: the operator, before B3 on mainnet and after any Meteora upgrade.
// It is not called by the site or by the cranker.
//
// **What it proves.** That N swaps through a DAMM v2 pool on a
// `collect_fee_mode = 1` config accrue a fee to the LP position *in token B*,
// that the amount is exactly what the fee schedule says and not approximately,
// and that claiming it lands the token B in the multisig's vault and nowhere
// else. Every number is read back off the chain; the quote is used only to say
// what to expect, never to report what happened.
//
// **The exactness is the point.** A rehearsal that reports "fees arrived,
// roughly right" would pass while a rounding rule quietly took a slice, and the
// slice is the product.

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram, sendAndConfirmTransaction } =
  require('@solana/web3.js')
const T = require('@solana/spl-token')
const sdk = require('@meteora-ag/cp-amm-sdk')
const BN = require('bn.js')

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const rigPath = flag('rig')
if (rigPath === undefined) throw new Error('--rig <rig.json> is required')
const rig = JSON.parse(readFileSync(rigPath, 'utf8')) as {
  rpcEnv?: string
  expectCluster: 'devnet' | 'mainnet'
  pool: string
  positionNftMint: string
  payerKeypairEnv?: string
  feeDestinationOwner: string
  tokenBIsFeeToken: true
}
const swaps = Number(flag('swaps') ?? 10)
const rpcUrl = process.env[rig.rpcEnv ?? 'RPC_URL']
if (rpcUrl === undefined || rpcUrl === '') throw new Error('no RPC URL')
const keypairPath = process.env[rig.payerKeypairEnv ?? 'MONEYPATH_KEYPAIR']
if (keypairPath === undefined) throw new Error('no payer keypair')

const conn = new Connection(rpcUrl, 'confirmed')
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf8')) as number[]))

// The cluster is classified from the genesis hash and never from the URL
// (CLAUDE.md). This script moves value; a wrong cluster is a wrong ledger.
const { clusterName } = await import('../src/lib/snapshot/rpc.ts')
const cluster = await clusterName(rpcUrl)
if (cluster === 'unknown') throw new Error('cluster could not be classified; refusing')
if (cluster !== rig.expectCluster) throw new Error(`rig says ${rig.expectCluster}, chain says ${cluster}`)

const cp = new sdk.CpAmm(conn)
const poolAddress = new PublicKey(rig.pool)
const positionNft = new PublicKey(rig.positionNftMint)
const position = sdk.derivePositionAddress(positionNft)
const positionNftAccount = sdk.derivePositionNftAccount(positionNft)

const pool = await cp.fetchPoolState(poolAddress)

const out = (row: Record<string, unknown>): void => {
  process.stdout.write(`${JSON.stringify(row)}\n`)
}

out({
  msg: 'rig',
  cluster,
  pool: poolAddress.toBase58(),
  tokenA: pool.tokenAMint.toBase58(),
  tokenB: pool.tokenBMint.toBase58(),
  collectFeeMode: pool.collectFeeMode,
  protocolFeePercent: pool.poolFees.protocolFeePercent,
  swaps,
})
if (pool.collectFeeMode !== 1) {
  throw new Error(`collect_fee_mode is ${pool.collectFeeMode}; this rehearsal is about mode 1 (OnlyB)`)
}

const tokenAProgram = (await conn.getAccountInfo(pool.tokenAMint))!.owner
const tokenBProgram = (await conn.getAccountInfo(pool.tokenBMint))!.owner

const unclaimed = async (): Promise<bigint> => {
  const p = await cp.fetchPoolState(poolAddress)
  const pos = await cp.fetchPositionState(position)
  return BigInt(sdk.getUnClaimLpFee(p, pos).feeTokenB.toString())
}

const before = await unclaimed()
out({ msg: 'unclaimed lp fee in token B, before', amount: before.toString() })

// --- N swaps, alternating direction ---------------------------------------
const AMOUNT_A = new BN((1_000_000n * 10n ** 6n).toString())
const AMOUNT_B = new BN((10_000n * 10n ** 6n).toString())
let expectedTotalFee = 0n
let expectedLpFee = 0n

for (let i = 0; i < swaps; i += 1) {
  const aToB = i % 2 === 0
  const inputAmount = aToB ? AMOUNT_A : AMOUNT_B
  const live = await cp.fetchPoolState(poolAddress)
  const quote = cp.getQuote({
    inAmount: inputAmount,
    inputTokenMint: aToB ? live.tokenAMint : live.tokenBMint,
    slippage: 0.5,
    poolState: live,
    currentTime: Math.floor(Date.now() / 1000),
    currentSlot: await conn.getSlot(),
  })
  const totalFee = BigInt(quote.totalFee.toString())
  // The published split: the protocol takes `protocolFeePercent` of the trading
  // fee and the LP position keeps the rest. 2% × (100 − 20)% = 1.6% net, which
  // is the number DESIGN.md's headline "2%" does not say out loud.
  const lpFee = totalFee - (totalFee * BigInt(live.poolFees.protocolFeePercent)) / 100n
  expectedTotalFee += totalFee
  expectedLpFee += lpFee

  const built = await cp.swap({
    payer: payer.publicKey,
    pool: poolAddress,
    inputTokenMint: aToB ? live.tokenAMint : live.tokenBMint,
    outputTokenMint: aToB ? live.tokenBMint : live.tokenAMint,
    amountIn: inputAmount,
    minimumAmountOut: new BN(0),
    tokenAMint: live.tokenAMint,
    tokenBMint: live.tokenBMint,
    tokenAVault: live.tokenAVault,
    tokenBVault: live.tokenBVault,
    tokenAProgram,
    tokenBProgram,
    referralTokenAccount: null,
  })
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }))
  built.instructions.forEach((ix: unknown) => tx.add(ix as never))
  const sig = await sendAndConfirmTransaction(conn, tx, [payer], { commitment: 'confirmed' })
  out({ msg: 'swap', i, direction: aToB ? 'A->B' : 'B->A', totalFee: totalFee.toString(), lpFee: lpFee.toString(), sig: sig.slice(0, 16) })
}

const after = await unclaimed()
const observed = after - before
out({
  msg: 'accrual',
  expectedTotalFee: expectedTotalFee.toString(),
  expectedLpFee: expectedLpFee.toString(),
  observedLpFee: observed.toString(),
  exact: observed === expectedLpFee,
  differenceBaseUnits: (observed - expectedLpFee).toString(),
  // The pool accumulates fee-per-unit-of-liquidity in Q64 and the claimable
  // amount is that accumulator multiplied back, so the total is NOT the exact
  // sum of the per-swap fees -- it can sit a base unit or two below. Ten swaps
  // produced a difference of one. The check therefore demands the difference be
  // non-positive and smaller than the number of swaps, which catches a real
  // leak while tolerating truncation that is arithmetic rather than loss.
  withinTruncation: observed <= expectedLpFee && expectedLpFee - observed <= BigInt(swaps),
})

// --- claim into the multisig vault ----------------------------------------
if (process.argv.includes('--claim')) {
  const owner = new PublicKey(rig.feeDestinationOwner)
  const vaultAtaB = await T.getAssociatedTokenAddress(pool.tokenBMint, owner, true, tokenBProgram, T.ASSOCIATED_TOKEN_PROGRAM_ID)
  const vaultAtaA = await T.getAssociatedTokenAddress(pool.tokenAMint, owner, true, tokenAProgram, T.ASSOCIATED_TOKEN_PROGRAM_ID)
  const pre = []
  for (const [ata, mint, program] of [[vaultAtaB, pool.tokenBMint, tokenBProgram], [vaultAtaA, pool.tokenAMint, tokenAProgram]] as const) {
    if (!(await conn.getAccountInfo(ata))) {
      pre.push(T.createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, mint, program, T.ASSOCIATED_TOKEN_PROGRAM_ID))
    }
  }
  if (pre.length) await sendAndConfirmTransaction(conn, new Transaction().add(...pre), [payer], { commitment: 'confirmed' })

  const balBefore = BigInt((await conn.getTokenAccountBalance(vaultAtaB)).value.amount)
  const claimable = await unclaimed()

  const built = await cp.claimPositionFee({
    // `receiver` is the parameter that decides where the money goes. An earlier
    // version of this script passed `tokenAAccount` / `tokenBAccount`, which are
    // NOT in the SDK's schema for this call: they were dropped in silence, the
    // destination defaulted to `owner`, and 1,591,767,082 base units of token B
    // landed on the operator key with a successful transaction and no error.
    receiver: owner,
    owner: payer.publicKey,
    pool: poolAddress,
    position,
    positionNftAccount,
    tokenAVault: pool.tokenAVault,
    tokenBVault: pool.tokenBVault,
    tokenAMint: pool.tokenAMint,
    tokenBMint: pool.tokenBMint,
    tokenAProgram,
    tokenBProgram,
  })

  // **The destination is asserted on the built instruction, not trusted from
  // the helper.** This is the guard that does not depend on knowing the SDK's
  // parameter names: whatever the helper decided, the account in slot
  // `token_b_account` of `claim_position_fee` must be the ATA we intend, or
  // nothing is signed. `DESIGN.md` §3: no destination is ever taken from a
  // caller -- and none is taken from a library either.
  const claimIx = built.instructions.find(
    (ix: { programId: { equals: (p: unknown) => boolean } }) => ix.programId.equals(sdk.CP_AMM_PROGRAM_ID),
  )
  if (claimIx === undefined) throw new Error('no cp-amm instruction in the built claim')
  const TOKEN_B_ACCOUNT_SLOT = 4 // per the IDL account order for claim_position_fee
  const actualDestination = claimIx.keys[TOKEN_B_ACCOUNT_SLOT].pubkey
  out({ msg: 'destination check', expected: vaultAtaB.toBase58(), inInstruction: actualDestination.toBase58() })
  if (!actualDestination.equals(vaultAtaB)) {
    throw new Error(
      `refusing to sign: the claim would send token B to ${actualDestination.toBase58()}, ` +
        `not to ${vaultAtaB.toBase58()}`,
    )
  }

  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }))
  built.instructions.forEach((ix: unknown) => tx.add(ix as never))
  const sig = await sendAndConfirmTransaction(conn, tx, [payer], { commitment: 'confirmed' })

  const balAfter = BigInt((await conn.getTokenAccountBalance(vaultAtaB)).value.amount)
  const landed = balAfter - balBefore
  out({
    msg: 'claim',
    destination: vaultAtaB.toBase58(),
    owner: owner.toBase58(),
    claimable: claimable.toString(),
    landed: landed.toString(),
    exact: landed === claimable,
    sig,
  })
  if (landed !== claimable) process.exitCode = 1
}

if (!(observed <= expectedLpFee && expectedLpFee - observed <= BigInt(swaps))) process.exitCode = 1
