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

## 4b. The rehearsal, run 2026-09-01 — 48 hours, 39 settled

Program `A6vnmLcrppzSqCubRdJoXzs1oDJc23swLSGDCTKu7jGt`, period 60 s, a rehearsal
mint with 8 token accounts (2 holding zero), all through Helius.

| | |
|---|---|
| Hours run | 48 |
| **Settled** | **39** |
| Skipped | 9 |
| Schedule drift | **zero** — every `issue_at` was exactly `genesis + h·60`, 2,820 s across 47 hours |
| Public verify (`node scripts/snapshot.ts verify`) | **39 / 39 pass**, no network, no install |
| Program vs TypeScript | **39 / 39 agree** on recipient, point, root and eligible supply |

### Why the nine hours skipped

| Count | Cause |
|---|---|
| **7** | the oracle's gateway answered **503** |
| 1 | forced: the reveal was deliberately withheld |
| 1 | RPC returned "blockhash not found" |

**The seven are one oracle, not seven.** They fell on hours 8, 14, 20, 26, 32,
38, 44 — every `h ≡ 2 (mod 6)`, which is the crank's round-robin landing on the
same member of a six-oracle live set. **That oracle passed every on-chain check
— it was in `oracle_keys`, `is_on_queue == 1`, and heartbeating inside
`node_timeout` — and its gateway was dead.**

This is T12's residual risk, measured: **on-chain liveness is not gateway
liveness**, and one bad member of six cost 15% of the hours. The fix is in the
crank, not the program: **health-check the gateway before committing to an
oracle**. The program cannot help, because the oracle is chosen at request time
and there is no re-request.

That check now lives in `src/lib/crank/oracles.ts` and
`scripts/crank.ts select`. It applies the same conditions the program will
assert on chain, then sends a real `POST /gateway/api/v1/ping` to each
candidate in round-robin order and takes the first that answers. An oracle that
just failed goes to the back of the order rather than being dropped — a gateway
down a minute ago may be the only one up now. **When nobody answers, no request
is sent** and the hour is recorded as "no oracle available": requesting with a
silent gateway strands the hour, and there is no re-request.

**The probe route is read from the SDK, not invented, and that matters.** The
first version guessed a `gateway_health` path; every gateway answered 404, the
crank concluded all six oracles were dead, and it refused to issue anything. A
health check that fails closed on its own bug halts the collection more
thoroughly than the fault it was written to catch. The route is
`POST /gateway/api/v1/ping` with `{"api_version":"1.0.0"}`, taken from
`@switchboard-xyz/common`. And the URI is **concatenated, not resolved**: the
gateway address carries a path segment, and `new URL(path, base)` discards it.

### The three forced failures

| Hour | Probe | Result |
|---|---|---|
| 10 | request the same hour twice | **refused — the issuance account already exists.** Structural, not a check. |
| 15 | settle an hour that has passed | **rejected, `IssuanceExpired`** |
| 20 | request naming an oracle outside the live set | **rejected, `OracleStale`** |

### The freeze, demonstrated rather than asserted

A holder bought 3,000,000 tokens **two seconds after hour 7's boundary**, i.e.
between that hour's request and its settle. Hour 7 settled against 6 leaves and
11,500,001 eligible — **without them**. Hour 8 carried 7 leaves and 14,500,001.
This is the sentence §7 requires the site to print.

Both zero-balance accounts stayed out of every tree: 8 token accounts, 6 leaves.

### Winners against weights

39 settlements, chi-square **5.286** on 6 degrees of freedom against a critical
value of **12.592** at p = 0.05 — consistent with the balances. The largest
holder (42.2% of supply) took 18 of 39; the 1-unit holder took none.

### Cost

| | SOL |
|---|---|
| The 48-hour rehearsal | **0.2166** |
| — per settled issuance | ~0.0056 |
| Program rent (recoverable by closing) | 2.0902 |
| **Net burned across every deploy, the mint, the holders and the run** | **~0.278** |

### The bug the rehearsal found, which no unit test could

`request_issuance` failed every time with `AccountBorrowFailed`.
`QueueAccountData::new` and its oracle counterpart each return a `Ref` into
account data, and **a CPI refuses to run while any account it is passed is still
borrowed** — the T12 assertions held both borrows open across
`randomness_commit`. Scoping them in a block fixed it. It is unreachable off
chain, and it is exactly what a rehearsal is for.

## 5. What the rehearsal does not cover

- **Mainnet scan size.** The rehearsal mint has a handful of holders. §0.
- **Oracle liveness under an adversary.** T12 — whoever lands `request_issuance`
  first names the oracle. The rehearsal can force a stalled oracle once; it
  cannot rehearse an adversary doing it every hour for months.
- **Anything in Phase 2.** No reserve, no `claim_fees`, no `redeem`. The Phase 1
  program holds nothing, which is what makes it deployable before an audit (D8).
- **Survivor selection (D19).** The program still mints sequentially by
  `issued_count`. The rehearsal exercised the schedule, the snapshot, the
  randomness and the mint — not the random piece pick, which is unwritten.
- **A production cranker.** The rehearsal driver is a scratchpad script. The
  cranker that ships needs the gateway health check above, and it needs a home
  in this repository with a test that drives it.
- **The Switchboard randomness account.** It is created off-chain by the
  deployer with its authority set to the config PDA, and passed to
  `initialize`, which asserts both the authority and the queue. One account is
  reused every hour; the commit overwrites the seed each time.
