# The position in the multisig's hands — devnet, 2026-09-01

The second money-path rehearsal. The first (`docs/moneypath-devnet.md`) proved
fees accrue and can be claimed *to* a multisig. This one proves the shape
`DESIGN.md` §3 actually describes: the position is **owned by** the multisig, and
the multisig claims and spends through a real 2-of-3.

Every figure below is a balance read before and after. No receipt was trusted.

---

## 1. The pair the owner chose creates without a badge

`$DRAKES`/wSOL on the same public static config, first attempt, no token badge
asked for. `tokenA = $DRAKES`, `tokenB = wSOL`, `collectFeeMode = 1` — so the fee
arrives in SOL.

That is D24's finding used rather than merely recorded: the badge requirement is
specific to a Token-2022 mint carrying a `transferHook`, and an all-SPL pair
never touches it.

The devnet mint was ground below wSOL in **11 tries**. **The mainnet keypair was
not loaded by this rehearsal** and the script carries the reason: a key with a
devnet history has a public record on the wrong ledger.

## 2. The position moves into the vault

The position NFT lives in a token account at an address cp-amm derives from the
NFT mint. Handing the position over is therefore not a transfer of the token but
a **change of that account's owner**, which keeps the derived address cp-amm
expects:

```
positionNftAccount HFCSRkhr1WqoKg6f5Yz9PNLvUujvwGVPSTjNkgvm2AgL
owner              8MxzqgfotX2vms5SnopoNpx7VKNtY5E7DgLYoFGrcL6Q  (the vault)
```

## 3. The claim, through a real 2-of-3

Four swaps accrued **464,526 lamports** of wSOL to the position. Then:

| step | result |
|---|---|
| proposal created | index 1 |
| approvals | 2 of 2 required, by two distinct members |
| status before execution | `Approved` |
| vault wSOL before | **0** |
| vault wSOL after | **464,526** |
| exact | **yes** |

**Both the destination and the signer were asserted on the built instruction
before anything was signed** — the account in `claim_position_fee`'s
`token_b_account` slot, and the account in its `signer` slot, checked against the
vault's addresses (D25).

## 4. The first hoard purchase, also through a 2-of-3

The vault spent its whole SOL fee on the hoard token:

| | |
|---|---|
| wSOL spent | **464,526** (all of it) |
| `$PUMP` received | **45,104,503,705** |
| quoted | 45,104,503,705 — **identical** |
| approvals | 2 |

The input and output accounts were asserted on the built instruction too: a swap
that spent from somewhere other than the vault, or paid into somewhere other than
the vault, is refused before signing rather than discovered after.

**What this rehearsed and what it did not.** The *shape* — SOL leaves the vault,
`$PUMP` arrives in the vault, both under the threshold — is real. The *venue* is
not: there is no Jupiter route for a mock mint on devnet, so the route was a DAMM
v2 pool created for the purpose. Jupiter's routing, its slippage behaviour and
its instruction size under a Squads vault transaction are mainnet questions and
remain untested.

## 5. Then it was indexed from its own signature

`scripts/record-hoard-purchase.ts` was given the purchase signature and nothing
else. It read `464,526` spent and `45,104,503,705` received out of the
transaction's own pre and post balances — the same numbers the rehearsal
measured, arrived at independently — and refuses a transaction where the vault
did not spend the quote and receive the hoard token. `/verify` lists it with the
signature beside the figures (D27).

## Three things the SDK does that cost a run each

Recorded because each was found by a failure, not by reading:

1. **`CpAmm.claimPositionFee` cannot be used when the quote is wSOL.** It
   special-cases the native mint and wants a `tempWSolAccount` so it can unwrap
   to SOL; without one it throws inside `getOrCreateATAInstruction` on an
   undefined program id. The vault wants the wSOL, not an unwrap. The claim is
   now built from the IDL with all fifteen accounts named — which D25 wanted
   anyway.
2. **Pool creation with wSOL closes the wSOL account afterwards.** Meteora
   appends an unwrap, so a second pool cannot assume the first left an account
   behind. Transferring lamports to the now-absent ATA makes a system account and
   `syncNative` fails with `IncorrectProgramId`, which is a confusing way to
   learn it.
3. **A Squads proposal is paid for by the creating member, not by the fee
   payer.** `vaultTransactionCreate` failed with `insufficient lamports 0, need
   4496430` against a member key holding nothing. The members need SOL, and on
   mainnet that means three funded keys before the first claim — a small
   operational fact that would have surfaced at the worst moment.

## Cost

**0.19 SOL** for this rehearsal: the `$DRAKES`/wSOL pool and its liquidity, the
route pool and its liquidity, the custody change, eight swaps, two proposals with
four approvals and two executions, and funding three member keys.

## What is still not rehearsed

- **Jupiter.** See §4.
- **A permanently locked position.** T10 wants the position locked at creation;
  both rehearsals kept it unlocked so the rig can be reused. Locking changes what
  `claim_position_fee` is allowed to do and has to be rehearsed before B3.
- **Three keys in three places.** The 2-of-3 here is three keypairs in one
  directory, which reproduces the mechanism and not the custody. D7 says the
  three keys are held by one person in Phase 1 and the copy calls that temporary
  custody, so the rehearsal is honest about matching the plan rather than the
  ideal.
- **A hook installed on a live pool's mint.** Still the open T1 question, and the
  one the badge request asks Meteora directly.
