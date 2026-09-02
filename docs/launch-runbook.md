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
| C2 | ⛔ **`initialize`** with **`base_uri` and `name_prefix`** (D32 — written once, here, and the program builds every asset's name and URI from them; `base_uri` ends with a slash and is the metadata folder from `docs/upload.md`), the manifest hash — **the one over `manifest.final.json`, which carries every piece's URI, not the allocation's** (`docs/upload.md`) — the collection size, the genesis instant and the period. | Read the config account back and assert every field, especially `period_seconds` and the manifest hash. `src/lib/site/collection.ts` already parses it. | **None.** D15: the values are written once by `initialize` and the config PDA has a fixed seed, so a second one means a different program. |
| C3 | ⛔ **`create_v2`** with the ground mint `1212YJcDwzgLXxmwbtmkYaEB53p6y958cn2tENt3C3dM`, `creator` = **the Squads vault**, `is_mayhem_mode: false`, `is_cashback_enabled: false`. | Read `BondingCurve.creator` at offset 49 and assert it equals the vault. Rehearsed end to end on devnet: `docs/pumpfun-create-devnet.md`. | **None.** `set_creator` is gated on an authority that belongs to pump.fun. Wrong here is wrong forever. |
| C4 | **Point the crank at mainnet**: config address, program id, RPC, and the absolute cluster assertion. | `scripts/crank-loop.ts` classifies the cluster from the genesis hash and refuses a mismatch. Watch one full period fire and settle. | Stop the process; the schedule waits. |
| C5 | **Change the env on Vercel** — `RPC_URL`, `ISSUANCE_PROGRAM`, `ISSUANCE_CONFIG`, `ISSUANCE_SURVIVORS` — then **redeploy a deployment whose own commit builds** (`vercel ls`, the most recent `● Ready`; **not the last one if it was documentation**, which the Ignored Build Step cancels). | **`node scripts/check-deployed-config.ts --site https://drakes.fun --rig <rig>`.** It reads the program and config addresses **off the served page**, reads that config from the chain, asserts the config is owned by the program the page names, and prints the genesis and period the site is therefore counting down to. **Never take C5 as done from the state of the variables** — see below. Then: the **mainnet** chip and the disappearance of the rehearsal sentence, both on their own from the server-side classification. The noindex triple stays until launch is announced. | Revert the env and redeploy the same way; no code deploy either way. |
| C6 | **The schedule guard in the daily cron.** | `node scripts/check-pump-schedule.ts --alert` exits 0 and writes a `schedule_checks` row; `/verify` stops saying "not confirmed". | Disable the job; `/verify` then says "not confirmed" after a week, which is the correct degraded state. |
| C7 | **The first conversion, seeded** (D28): the creator funds the vault, the 2-of-3 converts to `$PUMP`, and the row is marked `seeded by the creator, not from fees`. | `scripts/record-hoard-purchase.ts --signature <sig> --seeded` re-derives both amounts from the transaction. `/verify` renders the row. | The row can be deleted; the transaction cannot. |

---

## What is rehearsed on chain, and what is not

**The column that matters is the last one.** A step whose verification is a unit
test is a step whose first real execution is on mainnet, and this table exists so
that is never discovered on the day.

| Step | Rehearsed on devnet | Evidence |
|---|---|---|
| C1 deploy | ✅ and **a full `Upgrade` through the 2-of-3** | `docs/upgrade-authority-devnet.md` |
| C1b authority → vault | ✅ including a loader instruction executed by the vault | same |
| **C2 `initialize`, and the asset naming its piece** | ✅ **end to end, 2026-09-02** | `evidencia/drakes/2026-09-02-b25-happy-path/` |
| C3 `create_v2` | ✅ | `docs/pumpfun-create-devnet.md` |
| C4 crank | ✅ 303 issuances over the standing rig | `docs/runbook-devnet-rehearsal.md` |
| C5 Vercel env | ✅ **the whole program swap, end to end** | `evidencia/drakes/2026-09-02-b26-rig-swap/` |
| C6 schedule guard | ✅ runs daily | `docs/crank-hosting.md` |
| C7 first conversion | ✅ the ceremony, on an equivalent pool | `docs/vaultclaim-devnet.md` |

**C2's rehearsal needed a second program id and this is why.** The config PDA
seed is fixed, so a program has exactly one config for its whole life and
`initialize` cannot run twice — the standing rig's config was written before
`base_uri` existed and reads it as empty forever. So a throwaway program was
deployed, initialized with a real `base_uri`, cranked, and closed.

    program      FX2EB2zB4Ja6XukBK9QRtkVWXuvmaTenmmeye82xBi9b  (closed)
    hour 0  ->  piece 2676  ->  Drake #2676  ->  .../2676.json
    hour 1  ->  piece 3394  ->  Drake #3394  ->  .../3394.json
    2 of 2 assets name the piece the event emitted

Both URIs resolve to the metadata B2 uploaded, and their images resolve too —
so the chain closed from the manifest through `initialize` to what a wallet
shows. `scripts/rehearse-rig.ts` is the bootstrap and it is in the repository
now rather than in a scratchpad.

## The budget, measured then ×1.2

**Read from the chain 2026-09-02.** The programdata figure is the real size of
the deployed devnet program (352,989 bytes) priced at mainnet rent.

| What Claude Code spends | SOL |
|---|---|
| program + programdata rent | **1.802309** |
| `initialize`: config 489 B + survivors 8,016 B | 0.060976 |
| `create_v2` | ~0.0025 |
| first seeded conversion: proposal + vault tx + ATA + the swap | 0.063016 |
| ~30 signatures and priority fees | 0.005150 |
| a program upgrade through the 2-of-3, NET | 0.001700 |
| **subtotal** | **2.592177** |
| **×1.2** | **3.11** |

| What the owner funds | SOL |
|---|---|
| Squads 2-of-3 rent (creation fee is **0**, read from `ProgramConfig`) | 0.002561 |
| crank: 4,000 issuances × 0.0048 *(measured over the 250-hour devnet run)* | 19.200000 |
| 10% headroom on the crank | 1.920000 |
| **subtotal** | **21.122561** |
| **×1.2** | **25.35** |

**Total ×1.2: 28.46 SOL.**

**The program got smaller and the rent went with it.** `opt-level = "z"` and
`strip = true` on the release profile took the artifact from **340,288 to
283,864 bytes** — 17% — and the programdata's rent from 2.156140 to
**1.798806 SOL**. That is **0.357 SOL off this budget, permanently**, and it
costs nothing: `overflow-checks` stays on, the error strings survive the strip
(checked with `strings`, against a control), and the rig has been settling
hours on the smaller build since.

**An upgrade's cost is a peak, not a spend.** Measured on devnet 2026-09-02: the
full `Upgrade` by 2-of-3 cost **0.0017 SOL net**, because the buffer's rent —
**2.156089 SOL for a 340,288-byte program** — is returned when the upgrade
executes. The wallet still has to HOLD that peak first, and it is the number
that blocked this rehearsal twice. Budget the peak; spend the fee.

**The same shape applies to a fresh deploy.** `solana program deploy`
over-funds the buffer to cover the programdata's rent, so the peak is one
rent and not two: 2.158883 spent, 2.156140 reclaimed on `solana program close`,
**0.002744 net** — of which 0.001039 is the 36-byte program stub, whose rent
`close` does not return.

**The crank is the whole budget** and it is the one number that is a projection
rather than a measurement of mainnet: 0.0048 SOL per issuance is what devnet
cost, and mainnet priority fees are not devnet's. **Fund it in tranches rather
than all at once** — the schedule is on chain and a top-up is not a deploy.

`vaultTransactionAccountsClose` returns **0.010942 SOL** per conversion. The
production runbook closes those accounts after each monthly conversion rather
than leaving rent behind forever.

---

## C5 rehearsed: what a program swap by env actually costs

**Run on 2026-09-02.** A second devnet rig was stood up from nothing and
`drakes.fun` was moved onto it **by changing three environment variables and
redeploying — no code change**, which is exactly the shape of C5.

    ISSUANCE_PROGRAM     EMRgMM6FGfeU3SsWnZYKeD73YSFTxiEYz9abGACRhfGu
    ISSUANCE_CONFIG      aDX4VeW4otweuNJhWcqwN8KcVRaDnTeLavAanKuRjPA
    ISSUANCE_SURVIVORS   3AwuHRXM9pAEXQSanSrN4zKda1Fma91rcuxwNm4Z9gCo

Afterwards the front page read **8 of 4,000 issued** against the new program's
own counters, the register listed the new hours with their signatures, and
`/verify/2` showed `Drake #2210` — the piece `verify-assets` independently
says hour 2 emitted. **9 of 9 assets name the piece the event emitted**, with
the name unpadded and the URI four-wide (`Drake #703` → `0703.json`).

### A variable is an intention. The page is the fact.

**C5 is not done when the variables read as changed.** It is done when the
served page names the program you meant. Those are different states and there is
no error between them: on 2026-09-02 three variables were changed, two
deployments came back `Canceled`, and `drakes.fun` went on serving the previous
program with nothing in any log to say so.

`scripts/check-deployed-config.ts` is the check, and it is deliberately
end-to-end: it takes the addresses out of the HTML the site actually served,
not from the environment, not from the dashboard, and not from this repository.
Falsified against the superseded rig — it names both mismatches and exits 1.

### The hazard, and it cancelled two attempts

**An env change does nothing until a deployment BUILDS, and the Ignored Build
Step can cancel exactly the deployment you are waiting for.** The last push was
documentation only, so the ignore command skipped it — and `vercel redeploy` on
that same commit re-evaluates the command and skips again. Two `Canceled`
deployments, no error anywhere, and the site kept serving the old program.

**What works: redeploy a deployment whose own commit builds.** `vercel ls`
shows the status per deployment; pick the most recent `● Ready` one and
redeploy that. It rebuilds with the current environment and aliases to the
domain.

**At C5 this matters more, not less**, because the mainnet swap is the moment
the site stops showing a rehearsal. A "done" that silently did nothing is the
failure to plan for: after changing the env, read the domain and confirm the
figures moved.

### The cost, measured

| | SOL |
|---|---|
| deploy the program (283,864 bytes) | 1.801270 |
| collection + `initialize` | 0.065824 |
| ten issuances | 0.057536 |
| **total** | **1.924630** |

**Only the programdata comes back.** `solana program close` returns
**1.798806**; the 36-byte program stub (0.001039), the config (0.004971) and
the survivor array (0.051576) do not, because this program has no instruction
that closes them. **A rig that stands costs 0.125824 SOL and a rig that is torn
down costs the same** — the difference is only whether the 1.8 is parked or
freed.

**So every rig ever stood up leaves about 0.126 SOL parked forever**, and that
is a property of the program rather than of the rehearsal: `initialize` creates
the config and the survivor array and **nothing closes them**. On mainnet it
happens exactly once and 0.126 SOL is not a budget line. On devnet it is
per-rig, and the reason a retired rig is worth closing is the 1.8, not the 0.126
— which stays behind whatever anyone does.

**Retiring one is a 2-of-3, not a CLI call.** Once C1b has run, the upgrade
authority is the vault, so `solana program close` cannot sign: the loader's
`Close` goes through a proposal like any other authority instruction
(`scripts/close-program-by-vault.ts`). Measured 2026-09-02 retiring the first
devnet rig: **2.236289961 SOL returned**, proposal 5, two approvals.

**A closed program's accounts survive and stay readable.** Checked immediately
after: the issuance account for hour 378 still decodes, its recipient and piece
are intact, and the point still recomputes from the revealed value. Nothing can
modify them ever again, which is the point. The archive
(`scripts/export-issuances.ts`) is insurance against the RPC, not against the
chain — 302 of 302 derivations agreed at export time and every row carries the
revealed value, so the arithmetic is repeatable from the file with no network.

**Per issuance: 0.005754**, against the 0.0048 the 250-hour run measured. The
crank budget in this document uses the lower figure; the higher one is a
one-cluster, ten-hour sample and is recorded rather than substituted.

## The rule the snapshot leaves for mainnet

**The holder scan is DAS `getTokenAccounts`, by mint, paginated. Never
`getProgramAccounts`, and never `getProgramAccountsV2`.**

- `getProgramAccounts` unpaginated is what **D17 already forbade** on
  2026-09-01, and Helius began refusing it outright on 2026-09-02 — mid-run,
  on two consecutive hours of the standing rig. It is the mainnet issuance path
  and it was broken by somebody else's deploy.
- `getProgramAccountsV2`, which is what their error suggests, is the wrong
  axis: it paginates over the PROGRAM's accounts and applies the filter per
  page, so a scan for one mint walks every token account on the cluster. It did
  not finish in ten minutes on devnet, and **its first page returns `count: 0`
  with a non-null `paginationKey`** — an implementation that stops there builds
  a root over nothing.
- **DAS is an index, not a chain read**, and the code treats it as one: its
  `last_indexed_slot` can run ahead of the RPC node, the supply control waits
  for the node rather than being dropped, and a balance that arrives as a JSON
  number past 2^53 is refused rather than weighted.

The control that decides whether a scan may be committed is unchanged and is the
only thing that matters at the top of the hour: **the balances must sum to the
supply**, and an incomplete page set is a skipped hour, never a partial tree.

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
