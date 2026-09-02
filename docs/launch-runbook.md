# Launch runbook

Two columns, in order. **Nothing in the right-hand column can start before the
left-hand one for that row is done**, and the owner's rows are all before the
first irreversible step on purpose.

**Every figure below was read from devnet or from mainnet on 2026-09-02, then
multiplied by 1.2.** Where a number is a measurement it says so; where it is an
estimate it says that instead.

**⛔ marks a step that cannot be undone.** There are three.

---

## Before anything: what the owner does

| # | Step | Verification | Undo |
|---|---|---|---|
| O1 | **A real Squads 2-of-3**, with **one key on a different device** — not three keys in one keystore, which is a multisig of one with extra ceremony. | `multisig.accounts.Multisig.fromAccountAddress` shows three distinct members and `threshold: 2`. Sign one throwaway proposal from the second device before trusting it. | Recreate; costs the rent again. |
| O2 | **Fund the launch wallet.** See the budget below: **3.11 SOL** for the steps Claude Code runs, and **25.35 SOL** for the crank if the whole collection is funded up front. | `getBalance` on the address, read back. | — |
| O3 | **The crank host**, paid and reachable, with `RAILWAY_TOKEN` (or the chosen host's) in `.env.local`. | `docs/crank-hosting.md`; `/healthz` answers 200 from outside. | Move hosts; the schedule is on chain and survives. |
| O4 | **The illustrator delivers**, and the manifest is generated and signed off. | `node scripts/generate-collection.ts --strict` exits 0; the contact sheet per tier reads as a ladder (§9.2, judged by the owner). | Redraw; this is why milestone 1 is three pieces. |
| O5 | **The X account exists** under the project identity, never a personal one. | Post nothing yet. | — |

**O1 and O4 gate everything.** The creator address is fixed forever at C3, and
the manifest hash is committed forever at C2.

---

## Then: what Claude Code runs

| # | Step | Verification | Undo |
|---|---|---|---|
| C1 | **Deploy the program to mainnet** and record the **sha256 of the dump**. | `solana program dump <id> out.so && sha256sum out.so`, compared against the sha256 of the locally built artifact. Both go in `docs/references.md` with the date. | Redeploy while the upgrade authority exists — first as C1's own key, then through the 2-of-3 once C1b has run. |
| C1b | **Hand the upgrade authority to the Squads vault** (`set-upgrade-authority`). Between the deploy and the revocation the program is mutable with real value inside it, and during that window the authority must not be one key. | Read the **programdata** account back: 4-byte tag, 8-byte slot, 1-byte option, then the authority at offset 13. Assert it equals the vault. Rehearsed on devnet against the deployed program, including a loader instruction executed **by the vault through a real 2-of-3** — `docs/upgrade-authority-devnet.md`. | Set it back, while the vault still holds it. After revocation there is nothing to set. |
| C2 | ⛔ **`initialize`** with the manifest hash — **the one over `manifest.final.json`, which carries every piece's URI, not the allocation's** (`docs/upload.md`) — the collection size, the genesis instant and the period. | Read the config account back and assert every field, especially `period_seconds` and the manifest hash. `src/lib/site/collection.ts` already parses it. | **None.** D15: the values are written once by `initialize` and the config PDA has a fixed seed, so a second one means a different program. |
| C3 | ⛔ **`create_v2`** with the ground mint `1212YJcDwzgLXxmwbtmkYaEB53p6y958cn2tENt3C3dM`, `creator` = **the Squads vault**, `is_mayhem_mode: false`, `is_cashback_enabled: false`. | Read `BondingCurve.creator` at offset 49 and assert it equals the vault. Rehearsed end to end on devnet: `docs/pumpfun-create-devnet.md`. | **None.** `set_creator` is gated on an authority that belongs to pump.fun. Wrong here is wrong forever. |
| C4 | **Point the crank at mainnet**: config address, program id, RPC, and the absolute cluster assertion. | `scripts/crank-loop.ts` classifies the cluster from the genesis hash and refuses a mismatch. Watch one full period fire and settle. | Stop the process; the schedule waits. |
| C5 | **Change the env on Vercel** — `RPC_URL`, `ISSUANCE_PROGRAM`, `ISSUANCE_CONFIG`, `ISSUANCE_SURVIVORS` — and redeploy. | `drakes.fun` shows the **mainnet** chip and the rehearsal sentence disappears **on its own**, because both are conditioned on the server-side classification. The noindex triple stays until launch is announced. | Revert the env; no code deploy either way. |
| C6 | **The schedule guard in the daily cron.** | `node scripts/check-pump-schedule.ts --alert` exits 0 and writes a `schedule_checks` row; `/verify` stops saying "not confirmed". | Disable the job; `/verify` then says "not confirmed" after a week, which is the correct degraded state. |
| C7 | **The first conversion, seeded** (D28): the creator funds the vault, the 2-of-3 converts to `$PUMP`, and the row is marked `seeded by the creator, not from fees`. | `scripts/record-hoard-purchase.ts --signature <sig> --seeded` re-derives both amounts from the transaction. `/verify` renders the row. | The row can be deleted; the transaction cannot. |

---

## The budget, measured then ×1.2

**Read from the chain 2026-09-02.** The programdata figure is the real size of
the deployed devnet program (352,989 bytes) priced at mainnet rent.

| What Claude Code spends | SOL |
|---|---|
| program + programdata rent | 2.458835 |
| `initialize`: config 489 B + survivors 8,016 B | 0.060976 |
| `create_v2` | ~0.0025 |
| first seeded conversion: proposal + vault tx + ATA + the swap | 0.063016 |
| ~30 signatures and priority fees | 0.005150 |
| **subtotal** | **2.590477** |
| **×1.2** | **3.11** |

| What the owner funds | SOL |
|---|---|
| Squads 2-of-3 rent (creation fee is **0**, read from `ProgramConfig`) | 0.002561 |
| crank: 4,000 issuances × 0.0048 *(measured over the 250-hour devnet run)* | 19.200000 |
| 10% headroom on the crank | 1.920000 |
| **subtotal** | **21.122561** |
| **×1.2** | **25.35** |

**Total ×1.2: 28.46 SOL.**

**The crank is the whole budget** and it is the one number that is a projection
rather than a measurement of mainnet: 0.0048 SOL per issuance is what devnet
cost, and mainnet priority fees are not devnet's. **Fund it in tranches rather
than all at once** — the schedule is on chain and a top-up is not a deploy.

`vaultTransactionAccountsClose` returns **0.010942 SOL** per conversion. The
production runbook closes those accounts after each monthly conversion rather
than leaving rent behind forever.

---

## The three irreversible steps, together

1. **C2 `initialize`** — the manifest hash, the period and the genesis instant.
   Everything the collection promises about rarity is fixed here.
2. **C3 `create_v2`** — the creator. The hoard's entire income belongs to
   whatever address this names, forever.
3. **Revoking the program's upgrade authority.** Not in this runbook and not
   dated here. **D8 ties it to a condition rather than to a date: Phase 2
   audited and deployed.** Until then the authority lives in the 2-of-3 (C1b),
   which is the difference between "mutable by whoever holds a key" and
   "mutable by two people who both have to agree".

**Each of the first two has a devnet rehearsal that was actually run**, and the
rehearsal is the verification step, not a paragraph promising care.

---

## What this runbook does not cover

- **The audit.** D8 says the Phase 1 program holds nothing, which is what makes
  it deployable before one. Phase 2 — `redeem`, the reserve PDA, `claim_fees` —
  does not launch with this.
- **Announcing.** The noindex triple stays up until the owner takes it down, and
  taking it down is a decision, not a step.
- **What happens if pump.fun changes the fee schedule mid-launch.** C6 is what
  notices; what to do about it is a judgement call with real numbers in front of
  it.
