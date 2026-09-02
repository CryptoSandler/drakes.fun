# Jupiter under a Squads vault transaction — measured on mainnet, 2026-09-01

Whether the conversion in `DESIGN.md` §3.6 can actually be built as a 2-of-3
proposal. **Measured, not executed**: the size question is settled and the
execution question is not, for the reason in "What is not proven" below.

Instrument: `scripts/verify-jupiter-vault.ts --dry`. Guard:
`src/lib/hoard/vault-swap.ts`. Raw run:
`~/proyectos/evidencia/drakes/2026-09-01-b9-jupiter/dry-run-20.txt`.

**Cost so far: 0 SOL.** Nothing was signed and nothing was sent.

---

## The answer: no, not as one plain proposal

Sixty quotes for 0.002 SOL → `$PUMP`, each wrapped into the two transactions a
Squads conversion needs, all against mainnet with real address lookup tables.

| | |
|---|---|
| Distinct routes | **22** in 60 quotes taken ~1.2 s apart |
| Hops | 1 – 3 |
| `vaultTransactionCreate` | 672 – **1246 B** of 1232 |
| `vaultTransactionExecute` | 576 – **1211 B** of 1232 |
| Refused by the guard (64 B headroom) | **6 of 60 — 10%** |
| **Over the raw packet limit** | **4 of 60 — 7%** |
| Bytes per additional hop | ≈ 212 |

The two that failed:

| create | execute | why | route |
|---|---|---|---|
| **1246** | 1211 | **over 1232 — unsendable** | `Whirlpool > Whirlpool > Whirlpool` |
| 1194 | 1157 | inside the packet, outside the headroom | `Whirlpool > Byreal > Whirlpool` |

**This is not a tail event.** Three Whirlpool hops is an ordinary route for this
pair, it appeared on ordinary quotes, and Jupiter chooses it without asking.

The first twenty quotes had suggested this fit with six bytes to spare. It did
not: twenty samples were too few to see a 7% failure, and the difference between
"fits with no margin" and "does not fit" is the whole verdict. **A sample that
never showed a failure was a sample that was too small**, which is the same
lesson as the crank run — one green hour is not evidence about an hourly job.

## `maxAccounts` is not the bound it looks like

The obvious lever is Jupiter's `maxAccounts`. Swept from unconstrained down to
16, against the wrapped transaction rather than Jupiter's own:

| `maxAccounts` | hops | create | execute | output vs unconstrained |
|---|---|---|---|---|
| none | 3 | 996 | 959 | — |
| 64 | 2 | 962 | 890 | +0.017% |
| 48 | 2 | 962 | 890 | −0.078% |
| 40 | 1 | 755 | 667 | −0.108% |
| 32 | 1 | 755 | 667 | −0.108% |
| **24** | 2 | **1006** | 948 | −0.108% |
| 20 | 2 | 1001 | 942 | −0.188% |
| 16 | 1 | 672 | 576 | −0.231% |

**At `maxAccounts = 24` the wrapped transaction is larger than at 48.** The
parameter bounds the accounts in *Jupiter's* transaction; the Squads wrapper
stores full account metas in an inner message and adds its own accounts to the
outer one, and the two counts are not the same count. Constraining it is nearly
free in price and buys no guarantee, which makes it a comfort and not a control.

## The two ways out, both measured

### 1 · The create side can stop being a ceiling

Squads v4 supports `transactionBufferCreate`, `transactionBufferExtend` and
`vaultTransactionCreateFromBuffer`. The inner message is uploaded in chunks
across several transactions, so its size stops being a limit. Confirmed present
in the deployed program's IDL and in the `@sqds/multisig` 2.1.4 bundle — though
**not re-exported under `instructions`**, so reaching them means building from
the generated layer.

This removes the tighter of the two ceilings (create was 1162 against execute's
1126, and create grows faster because it carries the whole message).

### 2 · The execute side compresses by 90 bytes and no more

A project-owned address lookup table can hold only what is known *before* a
route is quoted: the multisig, the vault, both mints, the three token programs,
the system program, Jupiter and Squads. Ten addresses. Measured across four
routes, it saved a consistent **90 B — about 0.4 of a hop**.

It cannot hold the proposal and transaction PDAs, which move with every
conversion index, and it cannot hold the pool accounts, which are the route.

A table containing *everything* static in one particular execute transaction
saved 431 B, and that number is a mirage: it is only knowable after the route
is chosen, and an ALT cannot be extended and used in the same slot.

### 3 · Both together, measured over forty more quotes

`--buffered --with-table` re-ran forty quotes with the create side modelled as
buffered and the project table included: **no refusal**, execute 486 – 1003 B,
**45 bytes** of usable margin on the worst. That agrees with subtracting the
measured 90 B from the 1211 B worst case seen unmitigated.

**45 bytes is still less than one hop**, so this widens the window rather than
closing the question.

### 4 · So the bound is still measurement

`src/lib/hoard/vault-swap.ts` builds both transactions, measures them, reserves
64 bytes of headroom, and **refuses** to create a proposal that does not fit,
naming the route and the overflow. The answer to a refusal is to quote again:
the route changed on its own five times in twenty quotes seconds apart.

The headroom is not decoration. A transaction that fits at quote time and not at
send time is the failure it exists for — the blockhash changes, and an address
that was in one of Jupiter's lookup tables can be absent from the next one it
names.

## What is not proven, and why

**Nothing was executed.** The size question is arithmetic and is now settled;
the questions below need a signature:

- **CPI depth.** Squads' `vault_transaction_execute` invokes Jupiter, which
  invokes each AMM. That is three levels below the transaction against a limit
  of four, and a route whose AMM itself CPIs into a token program sits at the
  edge. Only a run answers it.
- **Compute units.** A three-hop swap under a Squads CPI, with the account
  resolution Squads does first, is not obviously inside 1.4M.
- **Whether the route survives the round trip.** Quote, create, two approvals
  and execute are five transactions over at least a few seconds, and the pools
  move underneath. The slippage tolerance is doing more work here than in a
  single-transaction swap.

**Why it was not executed.** The rehearsal needs about **0.035 SOL** on mainnet
at a fresh address. The only funded key on this machine is
`~/.config/solana/deploy-mainnet.json`, which is a shared key in a global
location; spending from it would put this project's first mainnet footprint on a
chain path shared with whatever else that key has touched. `CLAUDE.md`: *"Funding
paths are the owner's decision and are never assumed."* So the rehearsal stops
here rather than choosing one.

The disposable rig is built and waiting. Keys are at
`~/.local/share/drakes-mainnet-jupiter/`, `0600`, and are **not** the ground
mint and **not** the real multisig — three fresh keys created for this and
nothing else.

| | |
|---|---|
| operator (fund this one) | `2vnB66vd4jYhSGfnMtbzxbTdq2LPrJtFzH1hMYFAqNmr` |
| multisig | `8p8huR51FQb56fyn7xHPXBUtVf9vVEerQHcAx1GkWoxQ` |
| vault | `HKbFNft3NzH5cXRuCpk7eA82CZDVTzwFMAqAkAXMEiZ8` |

## The cost sheet, read from the chain

Squads' `multisigCreationFee` is **0** (`ProgramConfig`
`BSTq9w3kZwNwpBXJEvTZz2G9ZTNyKBvoSeXMvwb4cNZr`, read 2026-09-01).

| | bytes | SOL |
|---|---|---|
| Multisig, 3 members | 240 | 0.002561 |
| Proposal | 358 | 0.003383 |
| `VaultTransaction`, 807-byte message | 958 | 0.007559 |
| Vault's Token-2022 ATA for `$PUMP` | 170 | 0.002074 |
| Signatures, ~9 transactions | | 0.000045 |
| Priority fees | | ~0.000500 |
| The swap itself | | 0.002000 |
| **Total** | | **≈ 0.018** |

`vaultTransactionAccountsClose` returns **0.010941** of that per conversion,
which is why three attempts still fit inside 0.05 — and why the production
runbook should close accounts after every monthly conversion rather than leaving
rent behind forever.

## Re-running the measurement

```sh
export MAINNET_RPC_URL="https://mainnet.helius-rpc.com/?api-key=<key>"
node scripts/verify-jupiter-vault.ts --dry --samples 20
```

It classifies the cluster from the genesis hash and refuses anything but
mainnet, because a devnet route is not the route under test. Exit 4 means a
sampled route did not fit.
