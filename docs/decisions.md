# Decisions

Policy the owner decided, with what it costs and what would make it worth
revisiting. A decision lives here and not in a commit message, because the
person who needs it is an operator six months from now, not a reviewer.

---

## Decided 2026-09-01

### D1 — The species is **Drakes**: dragons. `$DRAKES`, `drakes.fun`. **Closed 2026-09-01.**

A dragon asleep on its hoard. The name marks the species, not the mechanism —
`Drakes` is a species of dragon, the way `Quantums` names a species.

**The domain `drakes.fun` was bought by the owner on 2026-09-01** (Namecheap,
under the project identity). The name is settled and this decision is closed.

**Why it fits the mechanism without describing it.** The reserve is a **hoard**:
a pile of `$PUMP` a dragon sleeps on and guards. Every Drake custodies its share
of it. Redeeming is taking your share of the hoard and leaving. Nothing in the
name says "redemption", "vault" or "backed" — the metaphor carries it, which is
exactly what the copy rule needs (`DESIGN.md` §6).

**What the checks found, all run 2026-09-01, before and around the purchase:**

| | Result |
|---|---|
| `drakes.fun` | **Bought.** My own RDAP probe never answered for `.fun` (no endpoint at `rdap.org`), so availability was confirmed by the registrar at purchase, not by me. |
| `drakes.lol` (backup) | RDAP **404 — unregistered** at the time of the check. |
| `$DRAKES` on Jupiter | **20 results, none material.** Deepest liquidity **US$8,952**, largest market cap **US$36,532** — an order of magnitude under the >$50k threshold this project set. **But the ticker is saturated**: almost every hit is a Drake-the-rapper memecoin. |
| NFT collections | **Two exact collisions on Solana** — *Danger Valley Drakes* and *Lucid Drakes*, both live on Magic Eden — plus a crowded dragon field. EVM **not checked**. |
| Trademark | Live US marks for **DRAKE'S** in food and drink classes (pastry, beer, cocktails). **Nothing found in software, digital goods or entertainment classes.** |

**Cost, and it is real:**

1. **The ticker collides with a famous person, not with a project.** `$DRAKES`
   search results are dominated by rapper memecoins. That is a discovery
   problem every day and a publicity-rights problem if the branding ever drifts
   toward the person. **The art must never reference him**, and the brief says
   so.
2. **Two Solana collections already use the word "Drakes".** Neither is large,
   but "Drakes" is not a distinctive name in this exact market.

**Not an authoritative clearance search.** The trademark result came from a web
search over Justia and Trademarkia — not from USPTO TESS, EUIPO eSearch or the
WIPO Global Brand Database, none of which I queried directly. **A registered
mark in class 9 or 41 could exist and not appear above.** If the project ever
spends real money on the brand, that search gets run properly.

**Revisit if:** a clearance search turns up a live mark in class 9, 35, 41 or
42, or if the rapper association starts costing more than the name is worth.

### D18 — The lore: a dragon asleep on its hoard

The reserve is the **hoard**. Each Drake guards its share; burning one is that
Drake giving up its share and leaving.

**The tier owns the form.** Since D19 nothing owns the index:

- **Hoard** — how much gold it sleeps on. **Rolled**, exact counts published
  before issuance 1. It was index-derived; D19 ended that.
- **Slumber** — how deeply it sleeps. **Rolled**, same treatment.
- **Seam** and **Relic** are the tier carriers: geometry and silhouette, never
  quantity of gold (D13).

**The shrinking-hoard curve was the strongest argument for this lore, and D19
took it away.** Backing per piece does fall structurally as the collection fills
(`spec-round-2026-09-01.md` §7), and while issuance ran in order the art drew
exactly that. With a random survivor order the index is no longer a date, so the
curve depicts nothing. **The lore now stands on the metaphor alone** — the hoard
is the reserve, burning is a Drake taking its share and leaving — which is a
weaker claim than the one this decision was written with. Recorded rather than
quietly dropped.

**Cost:** the previous lore is dead and the words that carried it — cinder,
ember, ash, soot, charred — are now **banned in copy and identifiers alike**,
enforced by the lexicon guard. A leftover `emberCurve` in a component is how a
dead metaphor comes back and the site starts telling two stories.

### D2 — The issuance is weighted by the fungible token, not by pieces held

Eligibility is a holder's share of eligible `$DRAKES` supply at the snapshot
slot. Holding a Drake does not change your share.

**Cost:** it is not the design the brief first described. **Why:** weighting by
pieces has an empty eligible set at issuance 1, earns nothing until pieces
trade, and concentrates — whoever is issued early is issued more often.

### D3 — Reserve in `$PUMP`, pure, no USDC leg

Pool: `$DRAKES`/`$PUMP` on Meteora DAMM v2, static config
`HQ6vW45Kug23h2A4LkyUqB4UFfGx4LqY1uZLLfQemEjU` — 2% flat fee,
`collectFeeMode: 1` (fees in token B), no dynamic fee. Fees arrive as PUMP.
**No swap, no CPI to any aggregator, no keeper holding funds.**

**Cost:** the reserve is volatile and correlated with the thing that drives our
volume. The floor falls exactly when people want to use it. **Why no USDC leg:**
a USDC leg is what forces the swap this design otherwise does not need, and the
swap is the largest attack surface available.

**Revisit if:** PUMP's transfer-hook authority installs a hook we cannot satisfy
(see `DESIGN.md` T1), or PumpSwap liquidity for PUMP falls below roughly $5M.

### D4 — Fee split: 85% reserve / 15% creator while Minting, 0% creator in Mature

Net take is 2% × 80% = **1.6% of trade volume** (Meteora keeps a fixed 20%
protocol cut). At 4,000 issued the creator share steps to zero automatically and
100% goes to the reserve. The step is hardcoded and derived from `issued_count`;
no call performs it.

**Cost:** every basis point to the creator is subtracted from a number printed
on the front page. **Why 15 and not 40:** the number is public and permanent,
and this audience prices greed in immediately.

### D5 — Redemption fee is flat, 0.05 SOL

Charged on top of the payout, never deducted from it. Satisfies the portfolio's
SOL-fee rule without touching the reserve.

**Cost:** ~$5.18 at $103.62/SOL; economically a rounding error. **Why flat:** a
percentage of a PUMP payout requires pricing PUMP on-chain, i.e. an oracle, i.e.
a dependency and an attack surface, for rounding-error money.

### D6 — No creator token allocation. No paid genesis.

Zero `$DRAKES` to the team, no presale, no vesting, no reserved wallet. The
entire supply goes into the pool. Nothing is sold at issuance and there is no
way to buy in other than the open market.

**Cost:** foregoes the largest single up-front sum available. **Why:** a creator
holding token weight is a creator being issued their own pieces from a process
they wrote and crank. It is indefensible on its face regardless of disclosure.
And the paid genesis sells the only thing the product actually has.

### D7 — Upgrade authority: Squads 2-of-3 with a 72-hour timelock

**The three keys are held by the same person.** The multisig is not a
distribution of trust and must never be described as one. **The protection is
the timelock**: any upgrade is publicly visible for 72 hours before it can
land, so anyone who dislikes it can redeem or sell first.

**Written commitment, dated:** the upgrade authority is renounced once either
(a) PUMP's transfer-hook authority is itself renounced, or (b) a hook is
installed and the redeem path is confirmed compatible against it on mainnet.
Reviewed and restated publicly every 90 days from the Phase 2 deploy.

**Cost, in the words that must appear on the site:** one person, after 72 hours'
public notice, can change the program that holds the reserve. That is strictly
worse than an ownerless program and there is no way to describe it otherwise.

**Why not renounce at deploy:** PUMP's mint carries a live `transferHook`
authority. An ownerless program cannot survive a dependency whose interface a
third party changes unilaterally. See `DESIGN.md` T1.

### D8 — Custody is phased, and Phase 1 is called temporary custody in the copy

**Phase 1 (launch → audit):** the on-chain program performs issuance only and
**holds nothing**. The Meteora LP position is owned by the Squads multisig,
which claims the fees. Redemption does not exist — not closed by a flag, *not
present in the deployed program*.

**Phase 2:** the audited program, containing the reserve PDA, `claim_fees` and
`redeem`, is deployed. The multisig transfers the accumulated PUMP in and hands
the LP position to the program. Redemption opens.

**The audit (~US$25,000) is paid out of the creator's 15%.** Trigger and
deadline are published on the site from day one and are a promise once written:
redemption opens when the audited program is deployed, and no later than the
published deadline. If the deadline is missed the multisig's holdings and the
reason are published on that date.

**Cost, stated plainly and in the copy:** Phase 1 is **temporary custody**. One
person holds the reserve, the timelock protects nothing during it, and anyone
who calls it custodial is right. **Why:** the alternatives are shipping an
unaudited program that holds redeemable value, or not shipping. Of the three
this is the least bad, and the unaudited program holding *nothing* is what makes
it defensible.

### D9 — ~~The hoard is derived from the index~~ — **superseded 2026-09-01 by D19**

Two of five traits were functions of the issuance index, so the artwork was a
clock. **Random issuance order removed the index as a date** (D19), so Hoard and
Slumber became rolled traits with exact published counts.

What survives, and it is the part that mattered: **every trait of every piece is
fixed and published before issuance 1**, now committed by a manifest hash inside
`initialize` rather than merely posted. That is a stronger version of the same
promise.

**What was lost, stated once rather than buried:** the artwork no longer draws
the falling backing curve. That was the best property the lore had.

---

### D10 — `Exhausted` is adopted: at zero live supply, `claim_fees` refuses

When the last piece has been burned, the state derived from `live_supply == 0`
makes `claim_fees` refuse. The LP position keeps accruing fees and nobody ever
collects them.

**Cost, and it is a one-way door:** those fees are abandoned, permanently, with
no path that re-opens. There is also a second-order effect worth naming — a
holder who is *last* out finds the position still accruing after their burn, and
nothing is ever done with it. **It goes in the copy before it is ever true.**

**Why:** the alternative is depositing `$PUMP` forever into a vault with no
possible claimant, which is worse in every way that can be described to a
person. See `DESIGN.md` §2.

**Revisit if:** never, once deployed — it is program behaviour, not policy.

### D11 — The audit deadline is a formula, and a date is published with it

Redemption opens when the audited program is deployed, and no later than the
earlier of:

- **US$25,000 accumulated** in the creator's 15% share, or
- **150 days from issuance 1.**

If the audit has not been paid for by that date, **the shortfall is published on
that date** — the amount accumulated, the amount missing, and what happens next.

**Placeholder absolute date: 2027-01-30**, computed from a placeholder genesis
of 2026-09-02. It is recomputed and fixed at B8 when the genesis instant is set,
and the site shows the real one.

**Why 150 and not 180.** The collection completes at **166 days and 16 hours**
(`DESIGN.md` §2), and at 4,000 issued the creator's share steps to **zero**
(D4). A 180-day deadline lands ~13 days *after* the income has permanently
stopped, so a shortfall published on that date has no remaining funding path —
it is a deadline at the end of the runway. **150 days lands 16 days before
completion**, with the fee still flowing, so a shortfall is still a shortfall
somebody can act on.

**Cost:** ~16 days less accumulation before the promise binds, on a curve that
is front-loaded anyway — the base case earns most of its total in the first two
months (`spec-round-2026-09-01.md` §7). **Why it is worth it:** a deadline that
can only ever announce a failure is not a deadline.

**Revisit if:** never after publication. The date ships on the site from day one
and is a promise the moment it is written (D8).

### D12 — PFP-first: the piece is an avatar before it is an image

The binding surfaces are a 48 px circle in a timeline and a ~130 px circle on a
profile, over both of X's chromes. Face and eyes centred in the surviving crop,
nothing load-bearing in the corners, silhouette legible at 48 px, contrast
measured against `#000` and `#FFF`, and no relic that the circle amputates.

Enforced by a render guard in B1 that runs at **every illustrator milestone**,
before it is accepted. Full rules and the measurable assertions: `DESIGN.md`
§9.1–9.2.

**Cost:** it narrows the art. Same crop, face centred, corners empty and
legible at 48 px is a description of what makes generative collections
interchangeable, and it pulls against the brief's own "painted volume, a hand,
visible authorship". The resolution is that the **silhouette and the seam carry
48 px while the paint carries 130 px and up** — and that no threshold in the
guard may be one a painted piece can only pass by flattening.

**Revisit if:** the guard starts rejecting art the owner likes. That is the
signal that a threshold is wrong, not that the art is.

### D13 — Rarity is visible, named for stature, and cosmetic

Five tiers: **Whelp 2,400 · Wyrm 1,000 · Elder 480 · Ancient 110 ·
Sovereign 10.** Named for stature, never for metal or money — a Copper/Gold
ladder would imply an economic difference that does not exist.

**Block stratification is gone** (D19 made it impossible) and the cost is
published: a **34.8%** chance no Sovereign is issued in the last 400 hours,
**26.3%** in the last 500, **5.6%** in the last 1,000. Ancients are unaffected.

**The tier is carried by Seam geometry and tier-exclusive Relic pools. Never by
the hoard.** Letting a Sovereign sleep on a mountain would be the most legible
signal available at 48 px and also the art contradicting the copy on the one
sentence the product cannot afford to muddy: **every piece redeems for exactly
the same share.** `DESIGN.md` §9.3–9.5.

**Cost:** a visible ladder on a collection whose claim is equal redemption
invites the assumption that the ladder is economic. Mitigation is copy and it is
not optional: *"a Sovereign redeems for exactly the same share as the plainest
Whelp"* ships on the same screen as the rarity table, every time.

### D19 — Survivors: the piece is chosen at random, not in order

All 4,000 exist before issuance 1 with their tiers fixed, and each issuance
picks a **random survivor** from the unissued set. The same revealed randomness
answers both questions, **domain-separated** so one number is not doing two
jobs: `sha256(0x03 ‖ value)` picks the piece, `sha256(0x04 ‖ value)` picks the
holder.

**Mechanism:** Fisher-Yates swap-with-last over a 4,000 × `u16` array (8 KB,
~0.06 SOL of rent, once). O(1) per issuance, no scan, no bitmap. **No on-chain
tier table** — the program never reads a tier because rarity never touches
money; the manifest hash in `initialize` is what fixes the mapping in advance.

**What it costs, and the second one is the serious one:**

1. **Stratification dies.** D13 has the numbers.
2. **The refusal surface doubles.** T11 already lets whoever settles fetch the
   reveal off-chain and decline to submit it. Today they decline if they dislike
   the recipient; now also if they dislike **which piece** is going out. **Every
   hour that would issue a Sovereign to somebody else is an hour somebody has a
   reason to kill** — landing on the weakest part of the design.
3. The verify page must replay the survivor array. It is derivable from the
   events, so this is work, not a trust hole.

**What it buys:** suspense on both axes, rarity checkable before issuance 1
instead of argued about afterwards, and "N Sovereigns remain".

**Not new, and worth saying because it was assumed to be:** pre-generating all
4,000 and publishing them to Arweave before issuance 1 was **already** the
design (old D9, batches B1/B2). Irys stays at the verified **~US$8** and the
illustrator brief is unchanged — it delivers layers, and composition is
programmatic.

### D20 — The settle bounty is Phase 2, flat, and 0.001 SOL

**Not in Phase 1**, which holds nothing — that is what makes it deployable
before an audit (D8). Until Phase 2 the crank is us and the cost is ours,
roughly 5,000 lamports an hour.

In Phase 2: **0.001 SOL, flat, in lamports.** Total under 4 SOL across the whole
collection.

**Never a fraction.** `DESIGN.md` said "capped at 1/10,000 of the reserve", which
compounded over 4,000 issuances is `(1 - 1e-4)^4000 ≈ 0.67` — **about a third of
the reserve paid to crankers.** Corrected on 2026-09-01.

**It does not defend against T12.** The oracle griefer attacks at *request*
time by naming a stale oracle; paying the settler does not touch that. A bounty
on `request_issuance` would, marginally, and only by making honest requesters
likelier to win a race the attacker needs to win only sometimes. **In `$DRAKES`
it is impossible**: D6 gives the team zero allocation, so paying in the token
means buying it, which is the swap D3 exists to avoid.

### D14 — Process deviations accepted at B0

Three, all from CLAUDE.md or `batches.md`, all accepted with their reasons on
the record:

1. **The batch branch lives in the main worktree**, not a separate one. The
   failure the worktree rule prevents is two batches disagreeing about the
   schema; with one batch in flight and no migrations, it cannot occur. **The
   rule comes back the moment two batches overlap**, and the migration ordering
   rule is untouched.
2. **Next, Neon, the migration runner, the advisory lock and the
   `disposable_database` stamp moved from B0 to B5.** A migration runner that
   has never run against a Postgres instance is unverified code, and there is
   no project database yet.
3. **No README yet.**

**Cost:** (1) is a rule with a real failure mode behind it and this is the kind
of exception that quietly becomes the default. It is written down so the next
overlap is a decision and not a habit.
### D15 — `period_seconds` is written once by `initialize`, not compiled in

Devnet writes 60, mainnet writes 3,600. The rehearsal then runs **the same
bytecode** that goes to mainnet; a compile-time constant behind a feature flag
would rehearse a program that is never deployed.

**Cost:** one more value that can be wrong at `initialize`, and it is the value
the entire schedule derives from. **Paid at the deploy checklist** with an
absolute assertion against the literal — `period_seconds == 3600` — never an
equality against another variable that could itself be empty (CLAUDE.md, "a
schema guard is never `==`").

### D16 — T12: four on-chain assertions, and no permissioned window

`request_issuance` stays permissionless to everybody, us included. It asserts
the queue is the one written at `initialize`, that the named oracle is in the
queue's published live set, that the oracle agrees it is on that queue, and
that it heartbeated inside the queue's own `node_timeout`. Full evaluation:
`DESIGN.md` T12.

**The window was designed and rejected**, and the reason is the one that
matters here: it does not fix the attack (the fallback is permissionless by
construction, so an adversary waits it out), and it writes an operator
privilege — first refusal on every issuance — into a program whose claim is
that nobody has one.

**Cost:** the residual attack is real and stays. An oracle that heartbeats and
then declines to serve a reveal costs the collection an hour, and an adversary
who finds one can repeat it. **This is why the site says "no sooner than" and
never publishes a completion date.**

**Revisit if:** oracle-choice stalling is ever observed in practice. The next
move is not a window; it is pinning the oracle set at `initialize` and deriving
which one serves an hour from the index, so the caller has no choice at all.

### D17 — The mainnet snapshot is read through Helius, paginated, on a project key

Never an unpaginated `getProgramAccounts`: the public endpoints refuse a large
holder scan outright with `-32012` (`references.md`, verified 2026-09-01), and
refusing is the good case — a truncated scan would produce a root that verifies
perfectly with holders missing from the eligible set.

The read is paginated (DAS / `getTokenAccounts`), and **an incomplete page set
is a skipped hour, never a partial tree.**

**The key is created by the owner, under the project identity.** Never a
personal account (CLAUDE.md, the no-doxx guard). Nothing in this repository
records which route paid for it.

**Cost:** a paid dependency in the issuance path, and a second thing that can
be down at the top of the hour.

## Still open

- **Q3 — Launchpad.** A direct Meteora pool is decided by D3. Whether to *also*
  do anything on pump.fun's own surface for distribution is not.
- **Q7 — The floor sentence.** The exact public wording of "the floor is worth
  whatever `$PUMP` is worth" is a promise the moment it ships. It gets written
  once, when asked for explicitly.
- **The `Exhausted` sentence.** D10 is a one-way door and needs its own line of
  copy. Same rule as Q7: written once, when asked for.
- **A proper trademark clearance search** in classes 9, 35, 41 and 42. D1 used a
  web search over Justia and Trademarkia, which is not clearance. It runs before
  real money goes into the brand.
- **EVM collection collision** for "Drakes". Never checked; OpenSea's API needs a
  key this project does not have.
- **The owner's Quantums text.** The source document for the D19/D20 round is
  **not in this repository**: it was never pasted. The round was argued from the
  owner's summary in chat instead, and that is a gap in the ledger — every other
  external claim here carries a source and a date.
