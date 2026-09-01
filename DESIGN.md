# Drakes — design

Normative. A verdict cites this file with it open, or it is not yet a verdict.
Policy the owner decided lives in `docs/decisions.md`; external facts and the
date they were read live in `docs/references.md`.

---

## 1. The thesis

**4,000 pieces that cannot be bought at issuance. One per hour, issued by the
protocol to a `$DRAKES` holder chosen in proportion to their holding. Every
trade of `$DRAKES` pays a 2% fee, taken in `$PUMP`; Meteora keeps 20% of it and
**1.6% of the trade reaches the hoard**. Any piece can be burned to redeem its
share of that hoard, and the slot it leaves never refills.**

*The 2%/1.6% distinction was measured on devnet on 2026-09-01 rather than
inferred: a swap of 10,000 token B produced a 200,000,000-base-unit fee, of
which 160,000,000 accrued to the position. `docs/moneypath-devnet.md`. The
thesis said "pays 2% into a reserve", which is true of what the trader pays and
false of what arrives.*

Three properties follow, and a feature that serves none of them belongs to a
different product:

1. **Holding is the entire action.** Nothing is staked, locked, claimed or
   entered. There is no page where you buy in, and no allowlist to be on.
2. **The share is arithmetic.** Every piece redeems for the same amount
   regardless of what it looks like. Rarity is cosmetic and never touches the
   reserve.
3. **Everything is recomputable by a stranger.** Every issuance publishes the
   slot, the snapshot root, the randomness account and the arithmetic. A page
   that cannot be re-derived from the chain is a page nobody has to believe.

A Drake is a dragon asleep on its hoard. The reserve **is** the hoard, and every
Drake guards its share of it; burning one is that Drake taking its share and
leaving. The species names itself and never describes the mechanism — nothing
in the word says vault, redemption or backing, which is exactly what §6 needs.

The register is deliberate and it is not high fantasy: **black dragon, street,
a chain, and the posture of something that already made it.** It is a creature
that has the hoard, not one questing for it.

---

## 2. The state machine

Three states, derived and never set. **No instruction changes the state.** The
state is a function of two on-chain counters, read at the top of every
instruction that cares.

```
                issued_count == 4000
   ┌─────────┐ ──────────────────────► ┌────────┐
   │ Minting │                         │ Mature │
   └─────────┘                         └────────┘
        │                                   │
        │        live_supply == 0           │
        └──────────────┬────────────────────┘
                       ▼
                 ┌───────────┐
                 │ Exhausted │   (terminal)
                 └───────────┘
```

| State | Condition | Fee split | Issuance | Redemption |
|---|---|---|---|---|
| **Minting** | `issued_count < 4000` | 85% reserve / 15% creator | issues a piece | open (Phase 2 only) |
| **Mature** | `issued_count == 4000` and `live_supply > 0` | **100% reserve / 0% creator** | fires and emits, mints nothing | open |
| **Exhausted** | `live_supply == 0` after Mature | — | fires and emits | nothing left to redeem |

**Minting → Mature is automatic, hardcoded, and unreachable by any signer.** It
is `issued_count == 4000`, evaluated inside `claim_fees`. There is no phase
setter, no admin call, no migration. This is CLAUDE.md's "a status is never an
input" applied to the thing most worth applying it to: the moment the creator
stops being paid.

**Exhausted exists so the protocol does not spend the rest of time depositing
`$PUMP` into a vault with no possible claimant.** In this state `claim_fees`
refuses; the LP position keeps accruing fees that are never claimed, by
anyone, forever. Decided: `docs/decisions.md` D10. The refusal is a state the
program derives from `live_supply == 0`, not a flag, and no signer can set it.

**It is a one-way door and the copy has to say so**: once the last piece is
burned, the position's fees stop being collected and nothing re-opens the
path. That sentence belongs on the site before it is ever true (§7).

**The clock never stops.** Issuance fires every hour forever, in every state. It
simply stops minting once 4,000 have been issued. The verify page therefore
stays alive and checkable after the collection completes, which is the point.

### The schedule

`issue_at(n) = genesis_instant + n hours`, UTC, computed from the index —
**never from when the previous issuance settled**, so a late one cannot push the
schedule. The collection needs at least 4,000 hours after genesis: **166 days
and 16 hours**.

**That is a floor, not a completion date, and copy must never state it as one.**
A skipped hour does not advance `issued_count` (below), so any hour that fails
to settle pushes completion out by an hour. 166d16h is the earliest the
collection can finish and the number to publish is "no sooner than"; T12 is the
reason the difference is not academic.

**Skipped hours.** If eligible supply is zero, or randomness is not fulfilled
before the next hour's request, no piece is minted and `issued_count` does not
advance. The hour is lost; the collection is not shortened. This is deliberate
and it is what removes randomness-grinding (§5, T13).

---

## 3. The program, instruction by instruction

Two deployments. **The Phase 1 program holds nothing**, which is the entire
reason it is allowed to run before an audit.

### Phase 1 — issuance only

| # | Instruction | Signer | Holds value? |
|---|---|---|---|
| 1 | `initialize` | deployer, once | no |
| 2 | `request_issuance` | **permissionless** | no |
| 3 | `settle_issuance` | **permissionless** | no |

The Meteora LP position is owned by the Squads multisig, which claims fees
directly through Meteora's own program. Our code is not in the money path at
all. The worst an undiscovered bug can do in Phase 1 is issue a piece to the
wrong address — bad, public, and not a loss of the reserve.

### Phase 2 — the audited program, adds custody

| # | Instruction | Signer | What it can do at worst |
|---|---|---|---|
| 4 | `claim_fees` | **permissionless** | Move fees from the LP position to two hardcoded destinations in a hardcoded ratio. The caller gains nothing but the gas they spent. |
| 5 | `redeem` | asset owner | Burn one piece and move that piece's share out. |

**Five instructions total. No `withdraw`. No `sweep`. No `rescue`. No `pause`.
No `set_fee`. No `set_creator`. No destination is ever taken from a caller.**
Every parameter is a `const` or is written once by `initialize`.

---

### 1. `initialize`

Writes the config PDA and closes the door behind it. Fails if the config account
already exists, so it cannot run twice.

**Phase 1 writes only what Phase 1 needs**: the weight mint, the collection,
the Switchboard program, queue and randomness account, the genesis instant, the
period (D15), the collection size, the excluded set, and **the manifest hash**.

**The manifest hash is what makes rarity verifiable in advance.** It commits the
full piece-by-piece table — id, tier, traits, Arweave URI — for all 4,000, fixed
and public before issuance 1. One 32-byte field replaces any notion of an
on-chain tier table: the program never reads a tier, because rarity never
touches money (§1, property 2; §9.5). What the hash buys is that nobody can
claim we steered the Sovereigns, because the whole mapping was frozen before
anyone knew who would be issued anything. The reserve, the creator
ATA and the fee split are Phase 2's `initialize`, because the Phase 1 binary has
no instruction that could use them and a config field with no reader is a field
nobody checks.

**The excluded set is recorded but not enforced on chain.** This program never
sees a token account, so the exclusion is applied when the snapshot is built
off-chain. Recording it makes the verify page able to state the set; pretending
the program enforced it would be worse than saying this.

Immutable after this call in the Phase 2 program: the `$DRAKES` mint, the `$PUMP` mint (asserted
literally equal to `pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn`, per CLAUDE.md
"a schema guard is never `==` against another variable"), the Core collection,
the Meteora pool and position, the creator ATA, the genesis instant, the
excluded-address set, and the 85/15 split.

**Excluded addresses**, fixed here and never editable — pool vault, reserve PDA,
config PDA, creator ATA, the burn address, and the Meteora position. Excluded
from both the eligible set and the denominator, so pool liquidity is never
issued a piece and cannot dilute anyone's share.

### 2. `request_issuance`

Permissionless. Refuses unless `now >= issue_at(hour)`.

**The issuance account is keyed by the schedule hour, not by the piece index,
and that distinction is the whole skip mechanism.** A PDA seeded with the hour
can be created exactly once, so **one request per hour is enforced by the
account existing, not by a check** — there is no re-request and therefore no
way to re-roll an hour whose outcome a caller has already fetched from the
gateway and disliked (T11). A piece index, by contrast, must remain requestable
in a later hour, or a single unrevealed hour would strand the collection below
4,000 forever.

So: the **hour** advances with the clock; the **piece index** advances only on a
settled issuance. A skipped hour costs an hour of calendar, never a piece.

The hour is passed as an argument because it seeds the account, and the handler
asserts it equals the hour derived from the clock. The caller names which
account it is opening; the machine decides what hour it is.

Records the current slot, writes the snapshot Merkle root for that slot, and
requests Switchboard randomness. The outcome does not exist yet: the randomness
is not fulfilled and the root is already frozen, so nobody — including us — can
know who is about to be issued a piece.

**The root binds the whole distribution**, not just membership: each leaf is
`(holder, balance, range_start, range_end)`, and the root also commits
`eligible_supply`. A proof that does not partition `[0, eligible_supply)`
contiguously does not verify.

### 3. `settle_issuance`

Permissionless. Refuses on three independent conditions, each with its own
error, because an instruction that fails three ways and says one thing is not
debuggable in public:

- `AnchorTooEarly` — the settling slot is before `issue_at(hour)`.
- `SnapshotNotFrozen` — no root committed for this hour.
- `RandomnessNotReadable` — `get_value` refused at this slot.
- `IssuanceExpired` — **a fourth, added when the program was written.** The
  hour being settled must be the current hour. Switchboard's reveal window is
  only a few minutes wide in practice, so a stale hour would almost never
  settle late — but "almost never" is not a guard, and an hour that settled out
  of order would mint a piece against a snapshot from an arbitrary point in the
  past.

**The third one is not "the value has not arrived yet", and this was verified
against the crate rather than assumed** (`references.md`, Switchboard On-Demand
read 2026-09-01). `RandomnessAccountData::get_value(clock_slot)` returns the
value **only when `clock_slot == reveal_slot`** and errors in every other slot,
including every slot after it. There is no fulfilled-and-then-read state to
poll for.

So **`settle_issuance` only works in the same transaction as the Switchboard
reveal**, immediately after it. The crank builds `[reveal, settle]` and sends
it as one transaction. This does not make settle permissioned — anybody can
fetch the oracle's signed reveal and build the same pair — but it does mean a
settle sent on its own can never succeed, and the error has to say so plainly
or every integrator will lose a day to it.

**One value, two derivations, domain-separated.** The revealed randomness
answers two independent questions — *which piece* and *to whom* — and they are
derived separately or one number would be doing two jobs:

    piece_point  = sha256(0x03 || value) mod survivors_remaining
    holder_point = sha256(0x04 || value) mod eligible_supply

**Which piece: Fisher-Yates, swap-with-last.** The program holds an array of
4,000 `u16` (8 KB, rented once at about 0.06 SOL) plus a `remaining` counter.
Each issuance takes `arr[piece_point]`, writes `arr[remaining - 1]` over it, and
decrements. O(1), no scan, no bitmap, and the survivor set is exactly the
unissued pieces at every moment. The array's state after any hour is derivable
by replaying the emitted events, which is what lets the verify page show it.

**To whom:** a Merkle proof for the leaf whose range contains `holder_point`,
then a CPI to `mpl-core` to mint that piece to that address.

**The bounty is a Phase 2 feature and it is a flat number.** The Phase 1
program holds nothing (D8), so it cannot pay anybody; the crank is us and the
cost is ours, roughly 5,000 lamports an hour. In Phase 2 the settler is paid
**0.001 SOL, flat, in lamports** — never a fraction of the reserve. An earlier
draft of this section said "capped at 1/10,000 of the reserve", which compounded
over 4,000 issuances is `(1 - 1e-4)^4000 ≈ 0.67`: **about a third of the reserve
paid to crankers.** That was a drain with a bounty-shaped label on it.

Emits the slot, the root, the randomness account and value, both points, the
piece id, the eligible supply, the recipient and their balance — every input
needed to recompute the result.

**Modulo bias** is present at roughly 2^-224 on the holder point and 2^-244 on
the piece point (the modulus is at most 4,000), and is documented rather than
rejection-sampled away, for the same reason nftraffle documents it: the verify
page's instructions have to be followable by a person with a hash tool, and
"compute this, and if it exceeds a threshold, do it again" is a procedure
readers get wrong.

### 4. `claim_fees` *(Phase 2)*

Permissionless. CPIs Meteora's `claim_position_fee` on the permanently locked
position. Fees arrive as `$PUMP` because the pool is configured
`collect_fee_mode = 1` and `$PUMP` is token B.

**The destination is asserted on the built instruction, never taken from a
helper.** On devnet 2026-09-01 a claim built with an SDK helper sent the whole
fee to the operator key: the destination parameters passed were not in that
helper's schema, were dropped in silence, and the transaction succeeded. The
rule that "no destination is ever taken from a caller" has to extend to
libraries, and the check is on the account in the instruction rather than on the
argument that was meant to produce it (`scripts/verify-fee-path.ts`).

Reads `issued_count`, derives the state, and splits: **Minting** → 85% to the
reserve ATA, 15% to the creator ATA. **Mature** → 100% to the reserve ATA.
**Exhausted** → refuses.

Both destinations are addresses written by `initialize`. There is no argument
for a destination and no branch that computes one.

### 5. `redeem` *(Phase 2)*

Signed by the asset owner. Refuses unless `live_supply >= 100` — a cap by
**count**, not by fraction of the reserve. A fractional cap stops binding as a
function of live supply, and live supply falls when people burn; a count cannot
be gamed by burning.

```
share   = reserve_balance * 90 / live_supply     (read BEFORE the burn)
payout  = share                                   (floor division; the
                                                   remainder stays in reserve)
```

Order, and it is load-bearing: **read supply → compute share → CPI `mpl-core`
burn → `transfer_checked` the payout**. Computing after the burn credits the
redeemer with a share of a smaller supply, which is a drain.

Ten percent stays behind. Supply falls by one piece while the reserve falls by
less than one share, so **backing per remaining piece rises on every single
exit**. Whoever leaves pays a toll to whoever stays.

A flat **0.05 SOL** fee goes to the creator, charged on top in lamports, never
deducted from the payout.

**The transfer is hook-aware from day one.** `transfer_checked` resolves
Token-2022 extra account metas and passes `remaining_accounts` through, even
though `$PUMP` has no hook installed today. This costs a little compute now and
is the difference between a benign future hook being a non-event and being a
permanently stranded reserve (T1).

---

## 4. Where the weights come from

Solana has no equivalent of a token contract that updates a balance tree on
every transfer, so the snapshot is built off-chain and committed on-chain.

At the request slot we read every `$DRAKES` token account, drop the excluded
set, sort, assign contiguous ranges, and Merkle-ize. The root goes on chain
before the randomness exists.

**This is recomputable, not trustless, and the site says exactly that.** We
build the tree, so we could lie about it.

**Two claims, and only one of them is cheap — the page must not blur them.**

1. **The arithmetic.** We publish the full leaf set for every issuance, so
   anybody recomputes the root, the commitment, the ranges and the recipient
   from that file, offline, in seconds, with `node` and nothing installed. That
   is `scripts/snapshot.ts verify`, and it is the command the verify page
   prints.
2. **That the leaf set matched the chain at that slot.** This one is not what
   an earlier draft of this section claimed. **There is no standard RPC that
   returns program accounts as they stood at a past slot** — an archival RPC
   keeps blocks and transactions, not account state at an arbitrary slot. The
   honest routes are somebody's own indexer running from launch, or a replay of
   token transfers up to that slot. Saying "anyone with an archival RPC can
   rebuild it" would be false, and it is exactly the kind of sentence that gets
   quoted back.

A root that did not match would still be permanent public evidence; the point
is that the second check is expensive, and the page says so instead of implying
a one-liner.

**The snapshot is read at the current slot** and the slot it was actually read
at comes back in the RPC response context, which is what goes on chain. Exact,
not approximate.

**A scan that cannot return every holder is a skipped hour, never a partial
tree.** `getProgramAccounts` refuses rather than truncating on a large holder
set (`references.md`, verified 2026-09-01), and the cranker treats that refusal
as a skip. A truncated snapshot would produce a root that verifies perfectly
while leaving holders out of the eligible set — a silent disenfranchisement
with a valid proof attached, which is the worst failure this design has.

The rebuild command is published on the verify page, not buried in a repo.

Domain-separated leaf and node hashing (distinct prefix bytes) — without it a
node can be presented as a leaf.

---

## 5. Threat model

Named because "we thought about security" is not a threat model.

### T1 — Pump.fun installs a transfer hook on `$PUMP`

**The most serious risk in the project.** The `$PUMP` mint carries a live
`transferHook` extension: authority `DMdBa812dBW1CHVhmTyUyVcrBnSbZbfoFC7U14k4riH1`,
`programId: null` as of 2026-09-01. No hook runs today. That authority can
install one at any time, executing on every `$PUMP` transfer, without our
consent or knowledge.

**Prevention:** `redeem` is written hook-aware from day one (§3.5). A benign
hook — a fee, a log, a registry — then works with no upgrade at all.

**Detection:** a job reads the mint's `transferHook.programId` **every hour**
and alerts on any change. CLAUDE.md's "verify behaviour, not state" applies: one
read at deploy proves nothing about the next twelve months.

**Response, by case:**
- *Benign hook.* Nothing to do. Confirm a redemption on mainnet, publish the
  signature, restate the D7 renunciation commitment.
- *Hook we can satisfy but not automatically* (needs new accounts our resolver
  does not derive). Timelocked upgrade, 72 hours' public notice, redemption
  paused for nobody in the meantime because the old path still works until the
  hook lands.
- *Hook that blocks or taxes our transfers.* **There is no fix and the reserve
  is stranded.** The response is disclosure within the hour, in the same words,
  on the site and from the bot. Nothing in the copy may have promised otherwise.

**This risk is the sole reason D7 does not renounce the upgrade authority.**

### T2 — The Pump.fun buyback lapses

The 50%-of-net-revenue buyback-and-burn was announced April 2026 for **12
months**, so it lapses around **April 2027**. Our collection completes ~5.5
months after genesis; the redemption promise lasts forever. The programme will
almost certainly expire while pieces are still redeemable.

**Response: none, mechanically, and that is the correct answer.** Building a
path out of `$PUMP` means an oracle, a swap, and a governance decision about
when to pull it — the entire surface D3 exists to avoid.

**What we do instead is a copy rule:** nothing on the site, in the bot, or in
any document describes the buyback as a property of the reserve. It is a third
party's current policy with a stated expiry, and where it is mentioned at all it
is mentioned with that date.

### T3 — Multisig compromise

**The three Squads keys are held by one person.** The multisig is not a
distribution of trust and is never described as one. **The protection is the
72-hour timelock**, not the 2-of-3.

Residual: someone with all three keys waits 72 hours and upgrades the program to
drain the reserve. The mitigation is that the pending upgrade is on-chain and
public for those 72 hours, surfaced on the front page, and holders can redeem
inside the window.

**During Phase 1 the timelock protects nothing**, because the multisig holds the
fees directly rather than a program doing so. That is the honest cost of
shipping before the audit and it is why Phase 1 is called temporary custody in
the copy (D8).

### T4 — Crank key compromise

The crank key's total authority is *spending its own SOL on permissionless
instructions*. **The program must be correct in a world where the crank key is
public**, and the test suite drives every instruction from an adversarial key to
prove it. Worst case: an attacker pays for our transactions.

### T5 — We publish a dishonest snapshot

Mitigated by publication, not by cryptography: the root binds a named slot of
public state (§4). We publish the rebuild script, and we run it ourselves
against a random sample of past issuances and publish the output, so the check
is demonstrated rather than merely offered.

### T6 — Merkle proof forgery

Domain-separated hashing; the root commits `eligible_supply`; a proof must show
its leaf's range contains the point *and* that `range_end - range_start` equals
the leaf's balance. A proof that does not partition the interval does not
verify.

### T7 — Redemption arithmetic

Share computed from supply read before the burn; burn before transfer; checked
math throughout; floor division with the remainder staying in the reserve. The
`live_supply >= 100` count cap blocks the first-redeemer drain.

### T8 — Reserve donation

Anyone can send `$PUMP` to the reserve ATA. This only raises backing and is
harmless. The share is computed from the **ATA balance read on-chain**, never
from an internal counter, so a donation is reflected immediately and a counter
can never drift from reality.

### T9 — Meteora interface change

Our pool's fee config is a frozen static config and integrators cannot change
it. A Meteora program upgrade could still change the CPI interface and break
`claim_fees`. Response: timelocked upgrade. Note that fees keep accruing in the
position while `claim_fees` is broken — nothing is lost, only delayed.

### T10 — Pool front-run and token ordering

Two build-time facts, both easy to get wrong once and impossible to fix after:

- **`$PUMP` must sort as token B.** The pool PDA derives from the config plus
  the *sorted* mint pair, and `collect_fee_mode = 1` collects in token B. The
  `$DRAKES` mint keypair is therefore **ground until its pubkey sorts below**
  `pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn`. Get this backwards and every
  fee arrives in `$DRAKES` instead of `$PUMP`, and the whole design inverts.
- **The pool is created and seeded in one bundle**, before the mint is public,
  so nobody creates a competing pool on a different config and splits liquidity.

### T11 — Randomness liveness and grinding

If Switchboard does not reveal before the next hour's request, **the issuance is
skipped and the index does not advance**. There is no re-request. This is what
removes grinding, and the reason it has to work this way is sharper than it
first looks: the reveal is fetched off-chain from the oracle gateway, so a
caller **can see the outcome before submitting it** and simply decline to send
a transaction they dislike. One request must therefore be one shot. If a
re-request were allowed inside the same hour, that caller would get as many
shots as they could pay for, which is grinding with extra steps.

A caller who stalls an issuance cannot re-roll it. They can only destroy it.

### T13 — Everything Switchboard needs signed, the authority signs

**Found by trying to run the rehearsal, not by reading the spec.** All three
randomness instructions — `init`, `commit`, `reveal` — require the randomness
account's `authority` to **sign** (`references.md`, on-chain IDL, 2026-09-01).

That one fact cascades:

1. **The authority must be the config PDA.** If it were a keypair, only its
   holder could commit or reveal, and `request_issuance` and `settle_issuance`
   would both become permissioned — which is precisely what D16 refused.
2. **So `settle_issuance` cannot sit behind a reveal.** A PDA cannot sign a
   top-level instruction, so a `randomnessReveal` placed beside our instruction
   in the same transaction can never be authorised. **`settle_issuance`
   performs the reveal itself, by CPI**, taking the oracle's signed gateway
   response as arguments. It then reads the value back out of the account
   rather than trusting the argument: the caller supplies bytes, and only
   Switchboard's verification decides what the randomness is.
3. **And `initialize` must create the randomness account**, for the same
   reason — `randomnessInit` needs the authority's signature, so the account
   cannot be created with a PDA authority from outside the program. This is
   **not yet implemented**; it is what blocks the devnet rehearsal.

None of this weakens the permissionless property, which is the point of paying
the extra complexity: anybody can fetch the gateway response and settle.

### T12 — The oracle is chosen by whoever calls `request_issuance`

Switchboard's `randomness_commit` takes the `oracle` account as an argument
(`references.md`, read 2026-09-01). The queue does not assign it; the caller
names it. `request_issuance` is permissionless, so the caller who lands first
each hour picks the oracle that will serve that hour.

An adversary who names a dead oracle burns one transaction fee and costs the
collection one hour. It destroys no piece — `issued_count` does not advance —
but repeated, it **stretches the collection indefinitely**, which is why §2's
166d16h is a floor.

#### What the chain publishes, and what it lets the program assert

Read from `switchboard-on-demand` 0.13.0 on 2026-09-01, the same way the rest
of §5 was:

- **`QueueAccountData.oracle_keys: [Pubkey; 78]`** with `oracle_keys_len` — the
  crate's own words: *"the addresses of the quote oracles who have a valid
  verification status and have heartbeated on-chain recently."* The helper
  `idx_of_oracle(&Pubkey) -> Option<usize>` is on the account.
- **`QueueAccountData.node_timeout: i64`** — the queue's own staleness
  threshold, published rather than chosen by us.
- **`OracleAccountData.last_heartbeat: i64`** and **`is_on_queue: u8`** and
  **`queue: Pubkey`**.

So `request_issuance` asserts, with **no new authority and no privilege for the
operator**:

1. `queue == config.queue`, written once at `initialize`.
2. `queue.idx_of_oracle(oracle).is_some()` — in the live set.
3. `oracle.queue == queue` and `oracle.is_on_queue == 1`.
4. `clock.unix_timestamp - oracle.last_heartbeat <= queue.node_timeout` —
   inside the queue's own freshness window.

**That reduces the attack from "name any account" to "name an oracle
Switchboard itself currently considers live and heartbeating."**

**And the freshness assertion is the one carrying the weight — measured, not
assumed.** On 2026-09-01 the devnet queue listed nine oracles as its live set,
all with `is_on_queue == 1`, and **three of them had not heartbeated in six to
fifteen days** against a `node_timeout` of 300 seconds (`references.md`).
Membership alone would have let a caller stall an hour that same day. A third
of the published "live" set was dead. The residual
is an oracle that heartbeats and then declines to serve a reveal, which is a
Switchboard-level failure that hits every consumer of the queue and is not
something we can out-engineer.

#### The permissioned window, evaluated and rejected

The proposal was: for the first N minutes of each hour only a known crank key
may call `request_issuance`, with a permissionless fallback afterwards.

**The strongest case for it:** it removes the fee race, so the honest crank does
not have to outbid anybody to protect the hour.

**Why it is rejected anyway, and the reason is not a small one:**

1. **It does not fix T12.** The fallback is permissionless by construction, so
   an adversary waits N minutes and names a bad oracle. To close that, the
   fallback would need the oracle assertions above — and once those exist, they
   are doing all the work and the window protects nothing.
2. **It writes an operator privilege into a program whose entire claim is that
   nobody has one.** Inside the window we would pick the oracle, fetch the
   reveal off-chain, see the outcome, and be able to decline to send it, with
   nobody else able to start that hour. Today that is a race we usually win; the
   window makes it a right the program grants us. The honest copy for it reads
   *"the operator has an exclusive window each hour in which only they may start
   the issuance, and may decline to complete it"* — and that sentence costs more
   than the fee race does.
3. It adds an immutable key to config. Losing it degrades gracefully (the
   fallback still runs), so this is the least of the three, but it is one more
   thing that can be wrong at `initialize` for a benefit that is already zero
   by (1).

**Verdict: the four assertions, no window, `request_issuance` stays
permissionless to everybody including us.** The fee race stays, and it is
harmless: whoever wins it can only name an oracle the queue says is live.

**Not verified:** whether Switchboard's own `randomness_commit` handler already
enforces queue membership or its `curr_idx` round-robin. If it does, assertions
2 and 3 are belt and braces. They are cheap, so they stay either way, and
nothing in this design depends on the answer.

---

## 6. The copy rule

**The protocol *issues* pieces to holders. Nobody wins anything.**

This is not squeamishness. It is accuracy first — a proportional distribution to
holders is not a contest and has no winners — and caution second: we are not
qualified to make a legal characterisation, so we describe the mechanism and
decline the vocabulary that makes the characterisation for us.

**Banned, case-insensitive, on word boundaries, in every string a person can
read:**

```
win  wins  winner  winners  winning  won
ticket  tickets
prize  prizes
lottery  lotteries  lotto
raffle  raffles
jackpot  jackpots
gamble  gambling  bet  bets  betting  wager
odds  luck  lucky  chance to
```

**Use instead:**

| Not this | This |
|---|---|
| the winner | the holder it was issued to · the recipient |
| you won a Drake | a Drake was issued to you |
| your odds | your share of eligible supply |
| the draw | the issuance |
| tickets | there is no analogue; do not reach for one |
| prize / payout | redemption · share of the reserve |

`draw` is banned in copy and in identifiers alike. The instructions are
`request_issuance` and `settle_issuance`, the column is `issue_at`, the job is
the issuance cranker. A vocabulary enforced only at the surface leaks the first
time somebody writes a page title from a variable name.

### The test

`src/lib/copy/__tests__/lexicon.test.ts` walks every user-facing source — pages,
components, bot templates, metadata strings, email, error messages — and fails
on any banned term.

**It carries a control, because a check that returns nothing needs one**
(CLAUDE.md). The same test asserts that the word `issued` appears at least
twenty times across the same file set. If the scanner is pointed at an empty
glob, the banned-term half passes silently and the control half fails loudly,
which is the correct failure.

Falsify it by adding `winner` to a page and watching it go red. That check is
part of the test's own documentation.

---

## 7. What the site must say, and must not

**Must say, on the same screen as the number:**
- The redeemable amount **in `$PUMP`** as the headline. USD is secondary,
  smaller, and stamped with the slot it was read at.
- *The floor is worth whatever `$PUMP` is worth, and `$PUMP` can go to zero.*
  (Exact wording is open question Q7 — it gets written once, when asked for.)
- During Phase 1: **temporary custody**, the multisig address, the trigger and
  the deadline for redemption opening (D8, D11).
- The upgrade authority, in D7's words: one person, 72 hours' notice.
- **Balances freeze when the hour is requested, not when it settles.** The
  snapshot root is committed at `request_issuance` and `settle_issuance` only
  reads it, so **buying between the request and the settle does not make you
  eligible for that hour.** Said plainly, or the first person it happens to
  will reasonably think they were cheated.
- **How many Sovereigns and Ancients remain**, read off the survivor set. It is
  the reason random issuance order was worth its cost, and it stays truthful
  when the answer is zero.

**Must never say:** backed · guaranteed · floor price · yield · investment ·
returns · safe · risk-free. And never the buyback as a property of the reserve
(T2).

### What we may claim, and what we may not

The difference matters more here than anywhere else on the site, because every
sentence in the left column is checkable by a stranger and every sentence we
are tempted to add to it is not.

**May claim — each one verifiable without trusting us:**

- **The Phase 1 program holds nothing and has no instruction that moves value.**
  Readable from the IDL and the bytecode, which is published and matched to the
  deployed hash.
- **Zero team allocation, no presale, no allowlist, no mint page.** The whole
  supply is in the pool (D6), on chain.
- **The recipient is derived, never chosen** — a published snapshot root plus
  oracle randomness, recomputable by anybody from the leaf set we publish.
- **An hour cannot be requested twice.** Structural: the issuance account is
  seeded with the hour, so a second request fails because the account exists.
- **The tier of every piece was fixed before issuance 1**, committed by the
  manifest hash in `initialize`.

**May not claim, and the reasons are ours to state before somebody else does:**

- ~~"The team cannot touch the reserve."~~ **False during Phase 1.** It is
  temporary custody by a 2-of-3 Squads multisig whose three keys are held by one
  person (D7, D8). Anyone who calls that custodial is right.
- ~~"Immutable", "ownerless", "trustless".~~ **False.** The upgrade authority is
  a multisig with a 72-hour timelock, and it exists because `$PUMP`'s live
  transfer-hook authority can strand the reserve (T1). One person, after 72
  hours' public notice, can change the program that holds the reserve.
- ~~"Provably fair."~~ The snapshot is **recomputable, not trustless** (§4). We
  build the tree. The input is public chain state, so a lie would be permanent
  public evidence — that is a strong claim and it is not the same claim.
- ~~"The collection completes on <date>."~~ 166 days and 16 hours is a **floor**
  (§2, T12). Every skipped hour pushes it out.

**Every number on the site is a cache of an on-chain read and is labelled with
its slot.** A payout shows as settled because a burn and a transfer are on
chain, not because a job marked a row. The page is read by the person who did
not send the transaction.

## 8. Stack

Next.js + Neon Postgres + Vercel, identical to nftraffle. Anchor + Squads;
Metaplex Core for the collection; Meteora DAMM v2 for the pool; Switchboard
On-Demand for randomness; Helius for RPC, DAS and snapshot reads; Irys for
Arweave (whole collection: **~$8**, verified). One X account.

Postgres is a **cache and an index, never a source of truth** for anything the
chain knows. Its job is making the site fast and the gallery filterable. If it
were dropped entirely, every number on the site would still be derivable from
the chain, and that property is a test, not an aspiration.

---

## 9. Art: the avatar constraint and the visible ladder

Two owner requirements, recorded 2026-09-01 (`docs/decisions.md` D12, D13).
Both are art requirements with a code gate, and the gate is what makes them
normative rather than taste.

### 9.1 The piece is an avatar first

A piece lives in two places a person actually looks at, and neither is the
2048×2048 master: a **48 px circle** in a timeline and a **~130 px circle** on a
profile, over a dark chrome and a light one. The square master is a delivery
format, not the product surface.

**Rules, in the order they bind:**

1. **Face and eyes sit in the centre of the frame.** Not centred in the bust —
   centred in the crop that survives.
2. **Nothing load-bearing in the corners.** A circle inscribed in a square
   discards **21.5%** of the area, all of it at the edges.
3. **Silhouette and expression read at 48 px.** The signature is a dark
   irregular shape with one bright seam through it; at 48 px that is all there
   is, and it has to be enough.
4. **Contrast is measured, not judged**, against both chromes.
5. **A relic that the circle amputates is a relic that does not exist** for the
   holder who uses the piece as an avatar.

**The tile is opaque**, and this is the thing the requirement as stated does not
account for: every piece carries its own muted background field
(`illustrator-brief.md`, composition), so nothing composites directly onto X's
background. There are therefore **two** contrast questions, not one, and only
the first is about the creature:

- **body against its own field** — does the black body separate from the muted
  field it sits on, at 48 px, after downscale;
- **field against the chrome** — does the tile separate from `#000` and from
  `#FFF`, or does the avatar dissolve into the timeline on one of the two
  themes.

A single mid-luminance field can clear both chromes. A field chosen only
against one of them cannot.

### 9.2 The guard

Part of B1, run against the illustrator's layers **at every milestone, before
the milestone is accepted** — not once at the end, when the money is spent.

For every one of the 4,000 composites, and for each of `#000` and `#FFF`:

| # | Assertion | Why it is machine-checkable |
|---|---|---|
| 1 | The delivered face mask lies wholly inside the circle at 88% radius | pure geometry |
| 2 | Body-versus-field contrast inside the circle clears its floor at 48 px | luminance after downscale |
| 3 | Tile mean luminance clears both chromes | one number against two constants |
| 4 | The seam still occupies a minimum count of pixels above a luminance delta at 48 px | the signature survived the downscale |
| 5 | The relic keeps a minimum fraction of its unmasked area after the circular crop | geometry |

**What this guard must never become is a filter that selects for flat art.**
Every threshold is measured on the *masked and downscaled* image, and no
threshold may be one that a painted piece can only pass by flattening
(`illustrator-brief.md` explicitly rejects cel-shaded flats and uniform
outlines). If a threshold and the brief ever disagree, the brief is the one
that was paid for.

**And one thing here is not machine-checkable and must not pretend to be:**
whether an epic *reads as epic* at 48 px. That is verified by a rendered contact
sheet per tier that the owner signs off. A metric for "recognisable" is a metric
we would be grading ourselves with.

**That sign-off is an explicit gate on the illustrator's milestone 2**, before
the largest of the three payments (`illustrator-brief.md`). It forces the
smallest hoard state to be delivered with the seams rather than with the rest,
because the sheet cannot be rendered without it.

### 9.3 Every piece has a tier, and the tier is visible

Five tiers, named for stature rather than for money — a ladder of gold would
imply an economic difference that does not exist (§9.5):

| Tier | Share | Count |
|---|---|---|
| **Whelp** | 60% | 2,400 |
| **Wyrm** | 25% | 1,000 |
| **Elder** | 12% | 480 |
| **Ancient** | 2.75% | 110 |
| **Sovereign** | 0.25% | 10 |

**Exact counts, not probabilities.** All 4,000 exist before issuance 1, their
tiers fixed in the manifest whose hash `initialize` commits (§3.1). Rarity is
therefore verifiable *in advance* by anybody, which is a stronger claim than any
distribution guarantee.

**Block stratification is gone**, and it went with the thing that made it
possible. Issuance order is now random (§3.3), so there is no "block of 400" to
put a Sovereign in. This is a real loss and the number is published rather than
discovered later:

| No Sovereign issued in the last… | Probability |
|---|---|
| 400 hours | **34.8%** |
| 500 hours | 26.3% |
| 1,000 hours | 5.6% |

Under the old stratification each of those was zero by construction. Ancients
are unaffected (a 400-hour drought is 8 × 10⁻⁶). **"N Sovereigns remain" is the
gain and it is honest in both directions** — it can also read "the Sovereigns
ran out five weeks ago", and the site shows the count either way.

### 9.4 The tier owns form. Nothing owns the index any more.

**Random issuance order killed the clock, and the honest thing is to say so.**
When pieces went out in order, two axes were functions of the index and the
artwork was a clock that drew the falling backing curve — the best property the
old lore had (D18). A random survivor order means the index is no longer a date,
so **Hoard and Slumber become rolled traits with exact published counts**, and
no trait is derived from anything.

What is bought for it: suspense on both axes, rarity checkable before issuance 1
rather than argued about after, and "N Sovereigns remain".

**Hoard is never the tier signal, and this is the hard rule.** The obvious move
after freeing it is to let a Sovereign sleep on a mountain and a Whelp on a
coin — it is the most legible possible signal at 48 px. **It is also the art
contradicting the copy on the one sentence the product cannot afford to muddy:**
every piece redeems for exactly the same share (§9.5). A tier signalled by a
visibly bigger pile of money says the opposite, to everyone, at a glance.

So the tier is carried by the two things that survive a 48 px circle and imply
nothing about value:

| Carrier | Owned by | Tier signature |
|---|---|---|
| **Seam** — the vein through the scales | tier | shape, not brightness. Ancient and Sovereign get forms no other tier has. |
| **Relic** — what it keeps from the hoard | tier | each tier draws from its own pool; high-tier relics change the silhouette. |
| Hoard — how much it sleeps on | **rolled**, published counts | never a tier signal |
| Slumber — how deeply it sleeps | **rolled**, published counts | never a tier signal |
| Scale — body finish | rolled | |

**Background is not a tier signal** either, for the reason it never was: the
brief fixes it as one low-saturation field that recedes and never competes, and
a tier-coloured background is the most common way a generative collection looks
cheap.

**The test that catches the real failure** is: render the Ancient and Sovereign
seam forms at the *smallest* hoard state, mask to 48 px, and assert the tier is
still distinguishable from a Whelp. A ladder with correct counts and an
invisible Sovereign is the failure that ships.

### 9.5 What rarity must never touch

**Rarity is cosmetic. A one-of-one redeems for exactly the same share as the
plainest common** (§1, property 2). That sentence ships on the same screen as
the rarity table, every time it appears, because a visible ladder is an
invitation to assume the ladder is economic — and here it is not, ever, by
construction: `redeem` computes a share from `live_supply` and reads no trait.

---

## 10. The site: type, colour, and what the page refuses

Chosen 2026-09-01 from three built directions. The two that were not chosen are
in `docs/discarded-2026-09-01-instrument.md` and
`docs/discarded-2026-09-01-hoard.md`, with what each was for and what it cost.
The round that preceded them is `docs/references-web.md`.

**The claim: the collection is the page.** All 4,000 exist already, their tiers
fixed before the first went out, and the fact worth looking at is *which ones are
still in there*. So the plate — every piece, at once — is the hero, and the hour
sits above it in the masthead.

### 10.1 What it does not cede

1. **The clock is the first thing on the screen, at 390 and at 1440.** It is in
   the masthead, above the rule, and it may not be pushed below the fold by
   anything. This was taken from the direction that made the page nothing else.
2. **The plate is above the fold on desktop and one scroll away on mobile.**
3. **Every number is server-rendered and carries its slot.** Never a spinner,
   never an em-dash on first paint. The reference round's sharpest finding was a
   comparable site whose fold arrives as `Loading live chain state…`.
4. **Rarity is findable, never ranked.** Tiers are colour on the plate and a
   count in the caption — *"10 of 10 Sovereign remain"* — and nothing says a
   rarer piece is worth more, because it is not (§9.5).
5. **Empty slots are drawn.** The unissued are the subject as much as the issued.
6. **No image is invented.** Where art will go there is a marked hole at its real
   size with the 48 px avatar guard beside it (§9.1, §9.2). No stock, no
   generated stand-in, no borrowed mood reference.
7. **One accent, spent on the rarest two tiers**, and on nothing else.

### 10.2 Type

**Instrument Serif** (display, upright — never italic) + **Inter** (body,
tabular figures).

| Role | Face | Size |
|---|---|---|
| Masthead clock | Instrument Serif | `clamp(3.5rem, 17vw, 5.5rem)` |
| Plate title, entry title | Instrument Serif | 1.75 rem / `clamp(2rem, 6vw, 3.25rem)` |
| Lede, verdict | Instrument Serif | 1.25 rem / 1.75 rem |
| Body, data | Inter 400/500/600 | 1 rem |
| Labels | Inter, `0.18em`, uppercase | 0.75 rem |

The clock is capped at 5.5 rem rather than pushed higher so the header stays
short enough that the plate is still inside the fold at 1440 × 900.

### 10.3 Colour

OKLCH, light band, warm. Tokens live in `tokens.css`; nothing in the CSS
declares a colour that is not one of them.

| Token | Value | Where |
|---|---|---|
| `--color-paper` | `oklch(96% 0.008 85)` | ground — parchment, not white |
| `--color-paper-2` | `oklch(93% 0.011 85)` | issued fill, table stripe, `<pre>` |
| `--color-ink` | `oklch(21% 0.012 60)` | display, values |
| `--color-ink-2` | `oklch(42% 0.012 60)` | prose |
| `--color-ink-3` | `oklch(60% 0.010 60)` | notes |
| `--color-rule` | `oklch(84% 0.012 70)` | empty slots, hairlines |
| `--color-accent` | `oklch(46% 0.18 27)` | Sovereign, a failed verdict |
| `--color-accent-2` | `oklch(70% 0.11 27)` | Ancient |

The three lower tiers are warm greys of increasing darkness, so the plate reads
as a field with rare things in it rather than as five categories.

### 10.4 Motion

**The seconds, and a 120 ms colour change on hover.** Nothing reveals, nothing
parallaxes, nothing animates on scroll. `prefers-reduced-motion` collapses even
the hover.

### 10.5 The two checks on `/verify`, and why they are two

- **Live, last 24.** `point` is a pure function of the revealed value and the
  eligible supply, both carried by the event, so the last twenty-four hours are
  checked in the reader's own request against the chain — about five seconds.
  It is complete for what it claims and it can genuinely fail.
- **Full replay.** Which piece an hour issued depends on every take before it,
  so it cannot be checked from a window. A job walks the whole history and
  writes a dated row; the page renders it and says, in those words, that **it is
  a record of a job we ran, not evidence about the chain.**
- **The command is printed next to both.** A reader who only ever presses our
  button has verified nothing about us.

Postgres holds the indexed events and the replay rows. **It is a cache and the
page treats it as one**: nothing rendered as a fact about the chain is read from
it, and when the chain does not answer the page says so rather than serving the
cache in its place.

### 10.6 The absence

The hoard gets **one line at the foot** — *"the hoard is empty and there is no
pool sending anything to it yet"* — and no frame of its own. One of the
discarded directions gave it a gold-edged section at poster scale, which put the
emptiest fact on the site in its largest object.

The mechanism is stated as a mechanism: *"Every trade of $DRAKES sends 2% in
$PUMP to the hoard."* **Never `backed`**, which §7 lists among the words this
project may not use, and which is exactly the sentence that would be easiest to
write.
