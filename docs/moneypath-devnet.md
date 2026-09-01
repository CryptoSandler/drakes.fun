# The money path, rehearsed on devnet — 2026-09-01

What a trade actually does to a fee, from the swap to the multisig, run rather
than reasoned about. Everything below was executed on devnet against the real
Meteora DAMM v2 program; the addresses are in
`~/proyectos/evidencia/drakes/2026-09-01-b7-moneypath/state.json` and the
verifier is `scripts/verify-fee-path.ts`.

**Total cost of the whole rehearsal: 0.0406 SOL** — two mints, two pools, the
supply, a Squads 2-of-3, nineteen swaps and two claims.

---

## The blocking finding: the pool in `docs/batches.md` B3 cannot be created

**`$DRAKES`/`$PUMP` on DAMM v2 is not creatable today, by us or by anyone.**

Three facts, each checked separately:

1. **cp-amm demands a Meteora *token badge* for a Token-2022 mint that carries a
   `transferHook` extension — even when the hook's `programId` is null.**
   Isolated on devnet: a mock `$PUMP` reproducing the real mint (Token-2022, 6
   decimals, `transferHook` with `programId: null`, live authority) failed pool
   creation with `AccountOwnedByWrongProgram` on the badge PDA. The identical
   pool with a **plain** Token-2022 mint — same payer, same config, same
   SPL-Token partner, no extensions — **succeeded**. The extension is the
   variable.
2. **`create_token_badge` is gated on a Meteora `operator` account.** It is not
   permissionless and we cannot issue one.
3. **`$PUMP` has no badge, and there are zero DAMM v2 pools holding it.** Read
   from mainnet 2026-09-01:

   | Mint | pools as token A | as token B | total |
   |---|---|---|---|
   | `$PUMP` | 0 | 0 | **0** |
   | wSOL *(control)* | 395,862 | 990,110 | 1,385,972 |
   | USDC *(control)* | 443 | 21,198 | 21,641 |

   The controls are the point: the census instrument finds over a million pools
   when they exist, so the zero is a fact about `$PUMP` and not about the query.

**What this costs.** `DESIGN.md` §8 and `batches.md` B3 both name DAMM v2 for the
`$DRAKES`/`$PUMP` pool, and T10 turns on `$PUMP` sorting as token B under
`collect_fee_mode = 1`. None of that is reachable while the badge is missing.
This is not a "verify before launch" item; it is a hole in the plan, found for
0.04 SOL, that would otherwise have been found on launch day with a ground mint
keypair already spent.

**Not established:** whether Meteora would issue a badge for `$PUMP` on request,
whether DAMM v1 or DBC accept hooked mints, and whether some other venue does.
Those are three questions for a person, not three more RPC calls.

## The minimal equivalent rehearsal, and what it proved

Since the hooked pair cannot be created, the rest of the path was rehearsed with
**token B as a plain Token-2022 mint** — everything else identical: the same
public static config `HQ6vW45Kug23h2A4LkyUqB4UFfGx4LqY1uZLLfQemEjU` (index 15,
`collect_fee_mode = 1`, `pool_creator_authority` = default so anyone may use it),
the same SPL-Token side, the same Squads 2-of-3 destination.

### The fee is 2% and the take is 1.6%, measured

A B→A swap of 10,000 token B (10,000,000,000 base units) produced:

| | base units | of input |
|---|---|---|
| trading fee | 200,000,000 | **2.00%** |
| Meteora protocol share (20%) | 40,000,000 | 0.40% |
| **accrued to the position** | **160,000,000** | **1.60%** |

`DESIGN.md` §1 said *"every trade pays 2% into a reserve"*. True of what the
trader pays, false of what arrives. Corrected there, with this as the citation.

### Fees accrue in token B only

Eight swaps, alternating direction. Every one accrued to `feeTokenB` and none to
`feeTokenA`, including the A→B direction where the fee is taken out of the
output. That is `collect_fee_mode = 1` behaving as `references.md` says, now
observed rather than quoted.

### The accrual is not exactly additive, and the check had to change

Expected LP fee over 8 swaps: **1,272,880,763**. Observed: **1,272,880,762**.

The pool accumulates fee-per-unit-of-liquidity in Q64 and the claimable amount
is that accumulator multiplied back, so the total sits a base unit or two below
the sum of the per-swap fees. Ten swaps produced −1; eight produced −1.

The verifier therefore asserts `observed ≤ expected` **and**
`expected − observed ≤ swaps`, which still catches a real leak — any positive
difference, or a shortfall larger than one unit per swap, fails — while
tolerating truncation that is arithmetic rather than loss. **A check demanding
exact equality here would fail forever and be switched off**, which is worse
than a check with a stated tolerance.

### The claim lands in the multisig, exactly

`8 swaps → claimable 1,272,880,762 → landed 1,272,880,762` in the Squads vault's
token-B ATA. Verified by reading the ATA back off the chain and by confirming its
owner is the vault PDA.

## The risk that only appeared by running it

**A claim built with the SDK helper sent the entire fee to the operator key, and
the transaction succeeded.**

The first run passed `tokenAAccount` and `tokenBAccount` to
`CpAmm.claimPositionFee`. Those are **not in that method's parameter schema** —
it takes `receiver` — so they were dropped in silence and the destination
defaulted to `owner`. 1,591,767,082 base units of token B moved from the pool
vault to the payer. No error, no warning, no failed assertion; the multisig's
ATA simply stayed at zero, and the only reason it was caught is that the script
compared the vault's balance before and after instead of trusting the receipt.

Two things follow and both are now in the code:

1. **`DESIGN.md` §3's rule extends to libraries.** *"No destination is ever taken
   from a caller"* has to mean no destination is taken from a helper either.
2. **The destination is asserted on the built instruction, before signing** —
   the account sitting in `claim_position_fee`'s `token_b_account` slot must be
   the ATA we intend, whatever the helper decided. Falsified by pointing
   `receiver` at the operator: the script refuses to sign and names both
   addresses.

That guard does not depend on knowing an SDK's parameter names, which is exactly
why it is the one worth having. This is a Phase 2 lesson arriving before Phase 2
is written.

## What was deliberately not done

- **No redemption and no reserve in the program.** Phase 2 stays closed; nothing
  in `programs/issuance` changed in this batch.
- **The position is not owned by the multisig yet.** The claim was signed by the
  key holding the position NFT, with the multisig as *destination*. `DESIGN.md`
  §3 says the position is owned by the multisig and it claims directly — proving
  that needs the NFT moved into the vault and a real 2-of-3 proposal, and it is
  the next rehearsal rather than this one.
- **No permanent lock.** T10 wants the position permanently locked at creation;
  the rehearsal kept it unlocked so the rig can be re-used.
- **Mainnet was read, never written.**

## Re-running it

```sh
export RPC_URL="https://devnet.helius-rpc.com/?api-key=<key>"
export MONEYPATH_KEYPAIR="$HOME/.local/share/solana-devnet-moneypath/payer.json"
node scripts/verify-fee-path.ts --rig rigs/devnet-moneypath.json --swaps 8 --claim
```

It classifies the cluster from the genesis hash and refuses if the rig disagrees,
because this script moves value and a wrong cluster is a wrong ledger.
