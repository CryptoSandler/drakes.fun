# Cinders — design

Normative. A verdict cites this file with it open, or it is not yet a verdict.
Policy the owner decided lives in `docs/decisions.md`; external facts and the
date they were read live in `docs/references.md`.

---

## 1. The thesis

**4,000 pieces that cannot be bought at issuance. One per hour, issued by the
protocol to a `$CINDER` holder chosen in proportion to their holding. Every
trade of `$CINDER` pays 2%, taken in `$PUMP`, into a reserve. Any piece can be
burned to redeem its share of that reserve, and the slot it leaves never
refills.**

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

Cinders are the embers of dead memecoins: what is left of a coin that went out,
and kept a core lit anyway. The species names itself. It does not describe the
mechanism.

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
schedule. The collection completes 4,000 hours after genesis: **166 days and 16
hours**, a date known before the first piece exists.

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

Immutable after this call: the `$CINDER` mint, the `$PUMP` mint (asserted
literally equal to `pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn`, per CLAUDE.md
"a schema guard is never `==` against another variable"), the Core collection,
the Meteora pool and position, the creator ATA, the genesis instant, the
excluded-address set, and the 85/15 split.

**Excluded addresses**, fixed here and never editable — pool vault, reserve PDA,
config PDA, creator ATA, the burn address, and the Meteora position. Excluded
from both the eligible set and the denominator, so pool liquidity is never
issued a piece and cannot dilute anyone's share.

### 2. `request_issuance`

Permissionless. Refuses unless `now >= issue_at(next_index)`.

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

- `AnchorTooEarly` — the settling slot is before `issue_at(index)`.
- `SnapshotNotFrozen` — no root committed for this index.
- `RandomnessNotFulfilled` — the Switchboard account has no value yet.

Resolves a point in `[0, eligible_supply)` from the fulfilled randomness, takes
a Merkle proof for the leaf whose range contains it, CPIs `mpl-core` to mint the
asset to that address, and pays the crank a bounty capped at 1/10,000 of the
reserve. Emits the slot, the root, the randomness account and value, the
eligible supply, the recipient and their balance — every input needed to
recompute the result.

**Modulo bias** is present at roughly 2^-224 and is documented rather than
rejection-sampled away, for the same reason nftraffle documents it: the verify
page's instructions have to be followable by a person with a hash tool, and
"compute this, and if it exceeds a threshold, do it again" is a procedure
readers get wrong.

### 4. `claim_fees` *(Phase 2)*

Permissionless. CPIs Meteora's `claim_position_fee` on the permanently locked
position. Fees arrive as `$PUMP` because the pool is configured
`collect_fee_mode = 1` and `$PUMP` is token B.

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

At the request slot we read every `$CINDER` token account, drop the excluded
set, sort, assign contiguous ranges, and Merkle-ize. The root goes on chain
before the randomness exists.

**This is recomputable, not trustless, and the site says exactly that.** We
build the tree, so we could lie about it. The input is public chain state at a
named slot, so anyone with an archival RPC can rebuild it and compare — and a
root that did not match would be permanent public evidence. The rebuild command
is published on the verify page, not buried in a repo.

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
  `$CINDER` mint keypair is therefore **ground until its pubkey sorts below**
  `pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn`. Get this backwards and every
  fee arrives in `$CINDER` instead of `$PUMP`, and the whole design inverts.
- **The pool is created and seeded in one bundle**, before the mint is public,
  so nobody creates a competing pool on a different config and splits liquidity.

### T11 — Randomness liveness and grinding

If Switchboard does not fulfil before the next hour's request, **the issuance is
skipped and the index does not advance**. There is no re-request. This is what
removes grinding: a caller who stalls an issuance cannot re-roll it, they can
only destroy it, which costs them the same piece it costs everyone else.

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
| you won a Cinder | a Cinder was issued to you |
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
  the deadline for redemption opening.
- The upgrade authority, in D7's words: one person, 72 hours' notice.

**Must never say:** backed · guaranteed · floor price · yield · investment ·
returns · safe · risk-free. And never the buyback as a property of the reserve
(T2).

**Every number on the site is a cache of an on-chain read and is labelled with
its slot.** A payout shows as settled because a burn and a transfer are on
chain, not because a job marked a row. The page is read by the person who did
not send the transaction.

---

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

- **body against its own field** — does the charred body separate from the ash
  haze it sits on, at 48 px, after downscale;
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

### 9.3 Every piece has a tier, and the tier is visible

Four tiers plus the ten one-of-ones. **Exact counts, not probabilities** — all
4,000 are pre-generated before issuance 1 (D9), so there is nothing to sample:

| Tier | Share | Count | Per block of 400 |
|---|---|---|---|
| Common | 60% | 2,400 | 240 |
| Uncommon | 25% | 1,000 | 100 |
| Rare | 12% | 480 | 48 |
| Epic | 2.75% | 110 | 11 |
| One-of-one | 0.25% | 10 | **1** |

**The allocation is stratified in blocks of 400**, which is the whole answer to
"the ladder must not be biased toward early pieces". Within a block the order is
shuffled from the published seed; the *counts* are fixed. Every block of 400
consecutive indices contains exactly eleven epics and exactly one one-of-one, by
construction, at every point in the 166 days.

This is deliberately not "sample uniformly and test that it came out even". A
statistical test over one realised allocation is a test that can pass while the
collection still has a visibly epic-poor stretch somebody screenshots — and it
is a test that flakes. The property is asserted as arithmetic instead.

**The tier table is published in full, index by index, before issuance 1**, in
the same manifest whose hash goes public (B2). This is not decoration: we
generate the allocation, so the only thing that stops "they steered the
one-of-ones" is that the whole mapping was fixed and public before anyone knew
who would be issued anything.

### 9.4 The index owns light. The tier owns form.

This is the rule that makes 9.3 survive contact with D9, and it is the
collision the requirement does not see on its own.

Two of the five axes are already functions of the index: **Ember** (core glow,
white-hot at 1 → dull at 4,000) and **Settle** (drifted ash, clean → half
buried). **A tier signalled by brightness, glow, colour temperature or ash
cover is a tier that reads as a date.** An epic at index 3,900 would look like a
common, correctly, because its ember is nearly out — and the distribution guard
in 9.3 would still pass, because the counts are right and the *legibility* is
what broke.

So the tier is carried on axes the index does not touch, and both of them are
the ones that survive a 48 px circle:

| Carrier | Owned by | Tier signature |
|---|---|---|
| **Seam** — the crack's geometry | tier | shape, not brightness. Epic gets forms no other tier has. |
| **Relic** — the object it kept | tier | each tier draws from its own pool; epic-only relics change the silhouette. |
| Ember — the light through the seam | **index** | never a tier signal |
| Settle — the ash on it | **index** | never a tier signal |
| Ash — body material | rolled, free of both | |

**Background is not a tier signal.** `illustrator-brief.md` fixes it as a
single low-saturation field that "recedes and never competes… is not a trait
axis and it is never a scene", and a tier-coloured background is both the most
common way a generative collection looks cheap and a direct contradiction of a
line somebody was paid to work to.

**The test that catches the real failure** is therefore not the distribution
test. It is: **render the epic seam forms at the dimmest ember state, mask to
48 px, and assert the tier is still distinguishable from the common forms.**
Bias-free counts with an illegible epic is the failure mode that ships.

### 9.5 What rarity must never touch

**Rarity is cosmetic. A one-of-one redeems for exactly the same share as the
plainest common** (§1, property 2). That sentence ships on the same screen as
the rarity table, every time it appears, because a visible ladder is an
invitation to assume the ladder is economic — and here it is not, ever, by
construction: `redeem` computes a share from `live_supply` and reads no trait.
