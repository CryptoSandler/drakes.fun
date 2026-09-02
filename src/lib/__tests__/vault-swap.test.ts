// The size guard, tested against a real recorded route.
//
// The fixture is the largest of six SOL→$PUMP quotes taken from Jupiter on
// 2026-09-01 — three hops, Meteora DLMM > Raydium CLMM > TesseraV. It is here
// so that the arithmetic is pinned to something that actually happened rather
// than to a number typed into an assertion.

import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { assertFits, assertUserIsVault, innerInstructions, measure, PACKET_LIMIT, HEADROOM } from '../hoard/vault-swap.ts'

const require = createRequire(import.meta.url)
const { PublicKey, Keypair, TransactionInstruction, TransactionMessage, VersionedTransaction, AddressLookupTableAccount } =
  require('@solana/web3.js')
const multisig = require('@sqds/multisig')

const fixture = JSON.parse(
  readFileSync(new URL('../hoard/__fixtures__/jupiter-swap-3hop.json', import.meta.url), 'utf8'),
) as {
  route: string[]
  swapInstructions: Parameters<typeof innerInstructions>[0]
  lookupTables: Record<string, string[]>
}

const createKey = Keypair.fromSeed(new Uint8Array(32).fill(7)).publicKey
const [multisigPda] = multisig.getMultisigPda({ createKey })
const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })
const member = Keypair.fromSeed(new Uint8Array(32).fill(8)).publicKey
const BLOCKHASH = PublicKey.default.toBase58()

const toIx = (i: { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string }) =>
  new TransactionInstruction({
    programId: new PublicKey(i.programId),
    keys: i.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
    data: Buffer.from(i.data, 'base64'),
  })

const tables = Object.entries(fixture.lookupTables).map(
  ([key, addresses]) =>
    new AddressLookupTableAccount({
      key: new PublicKey(key),
      state: {
        deactivationSlot: 2n ** 64n - 1n,
        lastExtendedSlot: 0,
        lastExtendedSlotStartIndex: 0,
        addresses: addresses.map((a) => new PublicKey(a)),
      },
    }),
)

function build(instructions: ReturnType<typeof toIx>[]) {
  const message = new TransactionMessage({ payerKey: vaultPda, recentBlockhash: BLOCKHASH, instructions })
  const createIx = multisig.instructions.vaultTransactionCreate({
    multisigPda, transactionIndex: 1n, creator: member, vaultIndex: 0, ephemeralSigners: 0,
    transactionMessage: message, addressLookupTableAccounts: tables,
  })
  const tx = new VersionedTransaction(
    new TransactionMessage({ payerKey: member, recentBlockhash: BLOCKHASH, instructions: [createIx] }).compileToV0Message(),
  )
  tx.signatures = [new Uint8Array(64)]
  return tx.serialize().length
}

describe('the vault swap size guard', () => {
  const inner = innerInstructions(fixture.swapInstructions, toIx)

  it('wraps a real three-hop route inside a packet, with the margin stated', () => {
    const createSize = build(inner)
    expect(createSize).toBeLessThanOrEqual(PACKET_LIMIT)
    // Pinned to the recorded route. If the wrapping changes, this moves, and a
    // number that moves silently is the thing this test exists to catch.
    expect(createSize).toBe(1098)
    // The margin is the finding, not the pass: one more hop does not fit.
    expect(PACKET_LIMIT - createSize).toBeLessThan(212) // ~212 B per hop, measured
  })

  it('refuses the route that was actually observed to be unsendable', () => {
    // Whirlpool > Whirlpool > Whirlpool, mainnet 2026-09-01: 1246 bytes to
    // create against a 1232-byte packet. 4 of 60 quotes were over the raw
    // limit. This is pinned because the temptation, on seeing a guard fire
    // 10% of the time, is to widen it.
    const observed = measure(1246, 1211)
    expect(observed.fits).toBe(false)
    expect(1246).toBeGreaterThan(PACKET_LIMIT)
    expect(() => assertFits(observed, ['Whirlpool', 'Whirlpool', 'Whirlpool'])).toThrow(/Whirlpool > Whirlpool/)
  })

  it('lets the same route through once the create side is buffered and the table exists', () => {
    // The mitigation in DESIGN.md §3.7: a buffer removes the create side, and
    // the project lookup table takes 90 B off the execute side.
    expect(measure(0, 1211 - 90).fits).toBe(true)
  })

  it('refuses a route that does not fit, and says by how much', () => {
    const sizes = measure(1200, 900)
    expect(sizes.fits).toBe(false)
    expect(() => assertFits(sizes, ['A', 'B'])).toThrow(/over by 32B/)
  })

  it('keeps the headroom out of the usable budget', () => {
    // Exactly at the limit is a fail, because a blockhash is not the only thing
    // that changes between quoting and sending.
    expect(measure(PACKET_LIMIT, 100).fits).toBe(false)
    expect(measure(PACKET_LIMIT - HEADROOM, 100).fits).toBe(true)
  })

  it('accepts the fixture because every signer in it is the vault', () => {
    expect(() => assertUserIsVault(inner, vaultPda)).not.toThrow()
  })

  it('refuses instructions that ask anyone but the vault to sign', () => {
    // Falsification: the defect this catches is the one recorded in
    // docs/moneypath-devnet.md, where a helper quietly retargeted a transfer.
    const impostor = Keypair.generate().publicKey
    const tampered = inner.map((ix: ReturnType<typeof toIx>, n: number) =>
      n !== 0 ? ix : new TransactionInstruction({
        programId: ix.programId,
        keys: [{ pubkey: impostor, isSigner: true, isWritable: false }, ...ix.keys],
        data: ix.data,
      }),
    )
    expect(() => assertUserIsVault(tampered, vaultPda)).toThrow(/not the vault/)
  })

  it('drops the compute budget instructions, which do nothing inside a CPI', () => {
    const programs = new Set(inner.map((i: ReturnType<typeof toIx>) => i.programId.toBase58()))
    expect(programs.has('ComputeBudget111111111111111111111111111111')).toBe(false)
  })
})
