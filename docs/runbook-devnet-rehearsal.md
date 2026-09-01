# Devnet rehearsal runbook — the issuance engine

The acceptance criterion for B4 is **behavioural, not a snapshot**: *"the
issuance fires every hour and does not drift"* is the claim, and one successful
settlement is not evidence of it (CLAUDE.md, "verify behaviour, not state").

This runbook is the rehearsal that produces that evidence. It runs entirely on
devnet, against a throwaway mint, and it touches no mainnet key, no pool and no
real value.

---

## 0. Before anything

**Funding is a manual step and it is deliberately not automated.** The devnet
faucet was rate-limited on 2026-09-01 and no funded key exists yet.

- **Generate a fresh keypair for the rehearsal.** Never the machine's default
  `~/.config/solana/id.json` — that key may be linked to something else, and a
  chain link is permanent (CLAUDE.md, the no-doxx guard). Devnet SOL is
  worthless, but the habit is the point, and the same key must never later
  appear on mainnet.
- Fund it from `faucet.solana.com` or a provider faucet.
- **An RPC that supports large `getProgramAccounts` scans.** The public
  endpoints refuse a scan over a mint with many holders — error `-32012`,
  verified 2026-09-01 (`references.md`). The rehearsal mint is small enough for
  a public endpoint; **mainnet will not be**, so at least one rehearsal pass
  runs against the provider that will serve mainnet.

Record for each run: the cluster (classified from the genesis hash, never from
the URL), the program id, the mint, the rehearsal period, and the genesis
instant.

## 0b. Toolchain

`solana-cli 1.18.26` is the machine's active release and **another project uses
it**; `cargo-build-sbf` from it cannot build Anchor 1.x. An isolated Agave
lives at `~/.local/share/agave-isolated/solana-release/bin` and the active
release was **not** touched. Put it first on `PATH` for anything in this repo:

    export PATH=~/.local/share/agave-isolated/solana-release/bin:$PATH

Verified 2026-09-01: `solana-cli 4.2.2`, `cargo-build-sbf 4.1.0`,
platform-tools v1.54, `anchor build` exit 0.

Two things the build says that are not failures, so nobody chases them:

- `getrandom 0.2` has no SBF backend and the program depends on it only through
  `solana-program`'s `k256`/`curve25519`. The `custom` feature is enabled and
  nothing asks for OS randomness — the randomness is Switchboard's, on chain.
- The linker reports a stack-frame warning in **mpl-core's own**
  `hooked::collection::deserialize`. This program never deserializes a
  Collection — it passes it through to the CPI — so that code is not on any path
  we execute. If a future instruction ever does deserialize one, it becomes a
  real problem and this note is the reason somebody will know why.

## 1. The period, and the one decision this rehearsal forces

An hourly schedule cannot be rehearsed at one issuance per hour: 48 of them is
two days per attempt. The rehearsal needs a short period — 60 seconds gives 48
issuances in 48 minutes.

**Two ways to get one, and they are not equivalent:**

| | How | What the rehearsal then proves |
|---|---|---|
| **A — `period_seconds` written once by `initialize`** | devnet writes 60, mainnet writes 3,600 | The rehearsal runs **the same bytecode** that goes to mainnet. |
| B — a compile-time constant behind a feature flag | two builds | The rehearsal proves nothing about the mainnet artifact's schedule. |

**Recommendation: A.** B tests a program that will never be deployed. The cost
of A is one more value that can be wrong at `initialize`, and it is paid at the
deploy checklist with an absolute assertion — `period_seconds == 3600`, written
as a positive assertion against a literal, never as an equality against another
variable (CLAUDE.md, "a schema guard is never `==`").

**Decided: A** (`docs/decisions.md` D15).

### The mainnet deploy checklist assertion

Before the mainnet `initialize` is signed, assert against the **literal**, never
against another variable that could itself be empty (CLAUDE.md):

    period_seconds == 3600
    collection_size == 4000
    switchboard_program == SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv
    cluster classified as "mainnet" from the genesis hash, not from the URL

## 2. What the rehearsal drives

Every instruction is sent **from an adversarial key** — a keypair that is not
the deployer, holds no pieces, and is funded with the minimum. The crank key
must be safe to make public (`DESIGN.md` T4), and the way to show that is to
never use a privileged key in the rehearsal at all.

The pair that has to be sent together, every time:

```
[ switchboard randomness_reveal , settle_issuance ]      one transaction
```

`RandomnessAccountData::get_value(clock_slot)` returns the value **only when
`clock_slot == reveal_slot`** (`references.md`, read from the crate 2026-09-01).
A `settle_issuance` sent on its own can never succeed, in any slot, ever. If the
rehearsal shows a settle failing alone, that is the design working.

## 3. The run

**48 consecutive issuances, no drift.** Not 48 attempts — 48 settlements whose
`issue_at` instants are exactly `genesis + n * period` with no accumulated
error, measured against the recorded on-chain instant of each settlement, not
against the cranker's own log.

Assert, per issuance, from the chain rather than from our own record:

1. `issue_at(n)` matches `genesis + n * period` **exactly**, computed from the
   index and never from the previous settlement.
2. The committed snapshot root equals the root rebuilt from the leaf set with
   `node scripts/snapshot.ts verify` — no network, no install.
3. The recipient the program minted to is the recipient
   `scripts/snapshot.ts verify --randomness <revealed value>` resolves to.
4. `issued_count` advanced by exactly one.

### The three forced failures, each observed at least once

| # | Forced how | Must produce |
|---|---|---|
| 1 | **Randomness never revealed** — request, then send no reveal for the whole period | the hour is skipped, `issued_count` does not advance, **no re-request is accepted for that index** |
| 2 | **Zero eligible supply** — move the whole balance to an excluded address | no request is sent at all; the index does not advance |
| 3 | **Scan aborted** — point the cranker at an endpoint that refuses the scan | the hour is skipped, and **no root is committed**; a partial tree is never built |

Failure 3 is the one that would otherwise ship: a truncated scan produces a root
that verifies perfectly while leaving holders out of the eligible set.

### And the one that proves the clock survives a skip

After failure 1, the **next** issuance must fire at `genesis + (n+1) * period`
and must issue index `n` — the schedule does not slide, and the index does not
skip. Completion moves out by one period, which is why the published number is
"no sooner than" and not a date (`DESIGN.md` §2, T12).

## 3b. The two implementations must agree, and this is how that is checked

The Merkle hashing and the modulo exist twice: in the program, and in
`src/lib/snapshot`, which is what the cranker and the published verify command
run. **A silent disagreement between them is the worst bug available here** — a
proof the program refuses forever, or one it accepts that the public verifier
does not.

The Rust tests in `programs/issuance/src/lib.rs` carry vectors generated by the
TypeScript side. Regenerate them by building a snapshot with
`src/lib/snapshot/build.ts`, printing the root, the resolved point and the
proof, and pasting them into the test module. A change to either implementation
that is not made on both sides turns those tests red, which is the point.

    cargo test -p issuance      # 9 tests, includes the cross-implementation vectors
    npm test                    # 51 tests, includes the CLI wiring test

## 4. Rules for the run itself

- **A run overtaken by an edit is killed and restarted, not believed.** Finish a
  unit, verify it, then start the next (CLAUDE.md). A 48-minute run is long
  enough for this to happen by accident.
- **Kill by PID.** Never `pkill -f` anything.
- Everything the rehearsal asserts is read back from the chain. The cranker's
  own log is evidence of what the cranker thought, and nothing more.

## 4b. State of the rehearsal — 2026-09-01

**Cleared and verified on chain:**

| | |
|---|---|
| Program | `Bpmysmj4VMMo38Pa9NdbgRhmoBjQNWLbseARiPfoUaWm` |
| Config PDA | `445WA1VxGD9sJcoAMfRHJ92eZBo4aPsMi4Wk1MsTuKUL` |
| Collection (mpl-core) | `3shhtPkp4FST9DxFNuWEtroecReauz3gJcpcmVzKmZrZ`, update authority = config PDA |
| Randomness | `GyVunMibLgBmJ65WU18JV3ezF6AiZ8rWAYxyqwtLc39P`, **authority = config PDA** |
| Queue | `EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7` |
| Period | 60s (rehearsal), `collection_size` 4,000, `issued` 0, `live` 0 |

**T13 is closed.** `initialize` now creates the randomness account by CPI to
`randomness_init` with the config PDA signing as authority — the only way to get
a PDA authority, since that instruction requires the authority's signature and a
PDA cannot sign at the top level. The account was then **read back from the
chain** rather than assumed: its owner is the Switchboard devnet program and its
`authority` is the config PDA.

**Deploying: use the provider endpoint, not the public one.** The public devnet
RPC failed four of six attempts on a ~313 KB upload ("13 to 15 write
transactions failed"), each stranding ~1.99 SOL in a buffer. The same deploy
through Helius succeeded **first try**, and `solana program dump` matched the
local `.so` by sha256 exactly:

    cbc6719c019845b9bef2ff41bec9241f939213b59383c9b441903646aca96cbd

**And Helius carries the snapshot scan.** The query the public endpoint refuses
with `-32012` returned **1,471,466 accounts** through Helius (devnet USDC, 2026-09-01),
which is what D17 requires and what the cranker depends on.

**Still to do before the 48-issuance run:** a rehearsal `$DRAKES` mint with a
handful of holders, and the cranker loop itself.

## 5. What the rehearsal does not cover

- **Mainnet scan size.** The rehearsal mint has a handful of holders. §0.
- **Oracle liveness under an adversary.** T12 — whoever lands `request_issuance`
  first names the oracle. The rehearsal can force a stalled oracle once; it
  cannot rehearse an adversary doing it every hour for months.
- **Anything in Phase 2.** No reserve, no `claim_fees`, no `redeem`. The Phase 1
  program holds nothing, which is what makes it deployable before an audit (D8).
- **The 48 issuances.** None have run yet. The blocker that stopped them is
  gone (4b); what remains is the rehearsal mint, its holders, and the cranker.
- **The Switchboard randomness account.** It is created off-chain by the
  deployer with its authority set to the config PDA, and passed to
  `initialize`, which asserts both the authority and the queue. One account is
  reused every hour; the commit overwrites the seed each time.
