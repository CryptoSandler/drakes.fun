# `create_v2` with a Squads vault as the creator — devnet, 2026-09-02

The one irreversible step of the launch, rehearsed where being wrong costs
nothing. `set_creator` is gated on an authority that belongs to pump.fun, so a
creator set wrong on mainnet is wrong forever.

## What was proven

    create_v2   euYcgnsc6gsK2GjNmemakU6m5nMbhrpc8UeLRZL2kNCm...
    extend      23tRGsCRU3zQCQfgug46551hDCrMGmGbS1wVdRnPAeKs...

    mint            8ozSeS24kMtjQUBo3kLrvmCY3fUsUS15gw9YBQxfeEcE
    token program   TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb  (Token-2022)
    bonding curve   EteSBZL1GRjUhN9nkSjNeiqdEPUyoxFg8YJswzihPCfF  151 B after extend
    creator         8MxzqgfotX2vms5SnopoNpx7VKNtY5E7DgLYoFGrcL6Q  = the Squads vault
    creator_vault   SDWbsHef6gRPY5o8DiNwm3kX279pfWSJcr15pbuQAoR   0 SOL, no trades yet

**The vault is the creator and it never signed anything.** `creator` is an
argument to `create_v2`, so no PDA signing and no vault transaction is needed to
launch. The readback is at offset 49 of the bonding curve, the same offset the
v1 record used.

## Why `create_v2` and not `create`

`create` still builds a coin. Its coins cannot be bought: the live buy path
fails with `InvalidBondingCurveV2`, wanting a record a v1 `create` never wrote.
`create_v2_enabled` is `true` on both clusters. **v1 is legacy in everything but
its presence in the IDL.**

`create_v2` was called with `is_mayhem_mode: false` and
`is_cashback_enabled: false`. Both are pump.fun mechanics whose rules live in
their programs — `MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e` for the first.
**Neither was investigated and neither was opted into.** On the one coin whose
creator can never be changed, taking a default we have not read is not a thing
to do casually. If either becomes interesting it is a decision with its own
round.

## What the run cost to learn, in order

Each failure named the next thing, and none of it is in the documentation:

| Error | What it meant |
|---|---|
| `AccountOwnedByWrongProgram ... Right: pfeeUxB6...` | `FeeConfig` is owned by a **third program**, not by the two whose IDLs declare it |
| `BuybackFeeRecipientMissing` | `buy` needs the **eight** `Global.buyback_fee_recipients` as remaining accounts |
| `ConstraintSeeds ... Right: 13ec7Xdr...` | the mayhem PDAs derive under the **mayhem** program, not under pump |
| `InvalidBondingCurveV2` | the buy path wants a curve record `create_v2` does not write on its own |

`extend_account` grows the 115-byte curve `create_v2` writes to the full 151.
That was necessary and **not sufficient**: the buy still refuses.

## What is NOT established

- **The two buys did not go through**, and the reason is now specific rather
  than a mystery. Read off a **real mainnet buy** (18 accounts: the 16 in the
  IDL, then two more):

      remaining +0   bonding_curve_v2   = ["bonding-curve-v2", mint] under pump
      remaining +1   ONE buyback recipient from Global, not all eight

  The seeds were **verified against the live address**, not guessed: the
  account passed in that buy is exactly what those seeds derive. Two things I
  had wrong: the order — remaining accounts are positional, and passing the
  recipients first made the program read one as the curve and answer
  `InvalidBondingCurveV2`, an error about the wrong account in the right slot —
  and the count, eight where one was wanted.

  **Fixing both did not fix the buy on a `create_v2` coin.** On that mainnet buy
  the derived `bonding-curve-v2` address **holds no account at all**: the coin
  was v1 (SPL Token, 151-byte curve), the program finds nothing and proceeds. A
  `create_v2` coin appears to need the record to exist, and nothing this script
  calls creates it. **No mainnet coin created with `create_v2` and then traded
  could be found to read** — the Token-2022 pump coins sampled are v1 coins with
  Token-2022 mints, which is a different thing.
- **`collect_creator_fee` was therefore not exercised**, and there is no
  before/after balance on the vault. Its account list is read and its creator is
  a **non-signer**, so the claim is permissionless — but that is read, not run.
- Whether the mainnet buy path differs from devnet's.

**None of that blocks the launch decision.** What the launch cannot undo is the
creator, and the creator is proven.

## Re-running it

```sh
RPC_URL="https://devnet.helius-rpc.com/?api-key=<key>" \
  node scripts/rehearse-pump-create.ts
```

It refuses any cluster but devnet.
