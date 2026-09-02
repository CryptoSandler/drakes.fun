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

### D21 — The verifier reads the chain; the published set is a cache it reconciles

`snapshot.ts pieces` rebuilds the survivor permutation from the
`IssuanceSettled` events, paginated over the program's signatures, and checks
each hour against the `piece_id` the program emitted. It reads no account of
ours and, since this decision, no artifact of ours.

**Forced by the 2026-09-01 rehearsal.** The replay ran off the published
artifacts, two of which had been deleted while the issuances they described were
on chain. It was two takes behind from its first line and reported **0 of 49
matching** — indistinguishable from the arithmetic being wrong. An afternoon
went into looking for a defect that did not exist.

**The three findings are kept apart**, because they call for three different
responses and the old tool collapsed them into one:

| | Means | Exit |
|---|---|---|
| `GAP missing` | we failed to publish an artifact; our record has a hole | 4 |
| `WARN partial` | a recovery stub with no leaf set, so the root was not checked | 0 |
| `FAIL disagrees` | an artifact contradicts the chain — the only one that is a defect | 1 |

**`minted` gates the take.** `settle_issuance` calls `survivors.take` only while
`issued_count < collection_size`. Past 4,000 the issuance still fires and emits
with `piece_id = u16::MAX`, consuming no survivor. A replay that takes on every
event runs one ahead of the chain from that hour on and never recovers — the
same failure shape as a missing artifact, from the opposite cause. Not reachable
on devnet at 51 issuances, and it would have been a live defect at 4,000.

**Cost:** the replay now needs an RPC with full history, where before it needed
only a directory. That is the right trade — the offline form is still there as
`pieces <dir>` and prints, in its own output, that it is replaying our record
rather than the chain.

### D22 — The cranker is a supervised process, not a cron target

The schedule is anchored on chain — `issue_at(n) = genesis + n · period`, and
the program derives the hour itself — so **nothing a host does to a trigger time
can make the protocol drift.** What a late trigger costs is the *window*: an
hour is requestable exactly once and there is no re-request.

That inverts the hosting question. The property worth buying is not trigger
precision, it is *wake at the boundary with enough of the window left to retry*,
and a process that schedules itself against the on-chain genesis has it for
free. The host's job is then one thing: keep the process running.

**GitHub Actions was right to reject** for a sharper reason than "imprecise":
its measured ~1h32 exceeds the period, so a trigger does not merely arrive late,
it arrives in an hour that has already closed.

**Vercel cron is disqualified on the plan we have**, and not marginally. The
`sandler` team is Hobby, where the minimum interval is **once per day**,
precision is **±59 minutes**, and an hourly expression **fails deployment**
(Vercel's limits page, read 2026-09-01). Even on Pro the unit of work — request,
wait for the oracle, then a reveal that must land in the same transaction as the
settle — belongs in a process rather than a request handler.

**Decided by the owner, 2026-09-01: Railway Hobby**, US$5/month, account and
payment theirs. The VPS under systemd was the written recommendation and the
owner took the alternative it named — no machine to patch, which was the
argument against the VPS all along. The unit file stays in the document because
only the supervisor differs; `scripts/crank-loop.ts` does not know which host it
is on.

**Prepared, not deployed.** `railway.toml` is committed, the process serves
`/healthz`, and the service has never been created: creating an account and
attaching a card is the owner's step, and CLAUDE.md is explicit that anything
paid is paid by a route the owner decides and that this repository never records
which. The devnet run of 2026-09-01 therefore ran from a developer machine, and
`docs/crank-hosting-run.md` says so rather than implying otherwise.

**The healthcheck verdict is derived, never set.** `/healthz` compares the
instant the loop last woke against the schedule's own period and answers 503
past two of them. There is no `healthy` flag, because a flag keeps reporting
healthy from inside a loop that has stopped looping — which is the one state the
whole hosting batch exists to notice. Two periods rather than one, since an hour
may legitimately spend its entire window failing and retrying.

**Alerting is ntfy.sh**, one HTTPS POST with no dependency — and, decisively,
**no account**. Telegram was built first and discarded: it needs an account the
project would have to own, and an account adjacent to the pseudonym is a question
better removed than managed.

**The topic is the password**, in ntfy's own words, so it is generated with
`openssl rand -hex 16`, refused under 32 characters, kept out of the repository,
and never written to a log — including the failure paths, which is where a URL
usually leaks. Anyone holding it can read every alert and publish forgeries into
the same channel.

**A 200 is not a delivery.** The publish endpoint echoes the message it stored;
a 200 carrying anything else is a request that went elsewhere, which is what
ntfy's own front page returns. The sink checks the event, the id, and that the
echoed topic is ours.

### D23 — The site shows no reserve until one exists

The front page reads the chain at request time for the last issuance and its
recipient. For the reserve it reads a **named address' `$PUMP` balance at a
slot** — and in Phase 1 that address is deliberately **unset**, because the
Phase 1 program holds nothing (D8) and there is no `$DRAKES` mint or pool yet.

The page therefore says *"there is no reserve yet"*, in the neutral wording, and
carries the D8 custody sentence including *"anyone who calls that custodial is
right"*. **A `0.000000 $PUMP` next to the word "reserve" is not a smaller
version of the figure, it is a false one**, on the number this project is
ultimately judged by.

The mechanism fits both futures: `RESERVE_OWNER` switches it on and nothing else
changes. **Closed by the owner, 2026-09-01: nothing is shown until the pool exists.**
Not a reserve figure, and not the Phase 1 custody balance under its real name
either — no number at all, including no zero. The reserve section appears when
there is a pool accruing fees into it and not before.

That is stricter than the mechanism requires and the strictness is the point: a
figure labelled *temporary custody* still trains a reader to look for a number
in that spot, and the number would be one the project does not yet stand behind.
`RESERVE_OWNER` stays unset, and setting it is a deliberate act at B3, not a
default that drifts into being.

**`$PUMP` is Token-2022** (`references.md`, 2026-09-01), so the balance is read
by filtering `getTokenAccountsByOwner` on the mint, and no associated-token
address is derived. An ATA derived with the SPL Token program id is a different,
empty account — a confident zero on exactly the wrong number.

**Postgres is a cache and the page reads none of it.** DESIGN.md §7: every
figure on the site is a cache of an on-chain read, labelled with its slot. The
event runner fills `issuance_events` so a future list page does not make 8,000
RPC calls; nothing in it is authoritative, and losing the table costs one re-run.

### D24 — The `$DRAKES`/`$PUMP` pool is blocked on a Meteora token badge

**B3 cannot be executed as written.** DAMM v2 refuses to create a pool for a
Token-2022 mint that carries a `transferHook` extension unless a Meteora **token
badge** exists for it — and it refuses even when the hook's `programId` is null,
which is exactly `$PUMP`'s state today. `create_token_badge` is gated on a
Meteora `operator` signature, `$PUMP` has no badge, and there are **zero DAMM v2
pools holding `$PUMP`** on mainnet against 1.39M for wSOL as a control.

Isolated on devnet for 0.04 SOL: the same pool, same payer, same config, same
SPL-Token partner, created successfully with a plain Token-2022 mint and failed
with `AccountOwnedByWrongProgram` on the badge PDA when the mint carried the
extension. `docs/moneypath-devnet.md`.

**Nothing is decided here, because the decision is not ours.** The three ways
out are: ask Meteora to issue a badge for `$PUMP`; pair against something else;
or use a venue that accepts hooked mints. Each is a different product, and the
first is a dependency on a counterparty the design currently assumes it does not
need.

**What this changes immediately:** B3's step 1 — grinding a `$DRAKES` mint
keypair so it sorts below `$PUMP` — must not be run until the venue is settled,
because the sort order is a property of the *pair* and a ground keypair is only
useful for the pair it was ground for.

### D25 — A destination is asserted on the instruction, never taken from a library

`DESIGN.md` §3 already said no destination is ever taken from a caller. The
devnet money-path rehearsal showed that is not enough: a claim built with
Meteora's SDK helper sent **the entire fee to the operator key** because the
destination accounts passed were not in that helper's parameter schema, were
dropped in silence, and the destination defaulted to `owner`. The transaction
succeeded.

**The rule now reads: the account occupying the destination slot of the built
instruction is checked against the address we intend, before signing.** It does
not depend on knowing a library's parameter names, which is why it is the check
worth having. Implemented in `scripts/verify-fee-path.ts` and falsified by
pointing the receiver at the operator — the script refuses and names both
addresses.

### D26 — ~~The pair is `$DRAKES`/wSOL~~ — **the pair is superseded 2026-09-02 by D30**; the conversion rule survives

**Read D30 first.** There is no pool of ours: `$DRAKES` launches on pump.fun.
Everything below about the pair, the sort order and the CI assertion is history
and is kept because the reasoning is what D30 argued against. **The conversion
rule survives whole** — the fee still arrives in SOL — but two of its numbers
moved, marked below.

**Decided by the owner, 2026-09-01, after D24 showed the `$PUMP` pool cannot be
created.** The pool is `$DRAKES`/**wSOL** on the same public static config
(`collect_fee_mode = 1`, wSOL as token B), so the fee arrives in SOL. The hoard
is still `$PUMP`; what changed is how it gets in.

**Validated on devnet the same day**, which is the point of deciding after a
rehearsal rather than before one: an all-SPL pair asks for no token badge and
the pool created on the first attempt, wSOL as token B, `collect_fee_mode = 1`
(`docs/moneypath-devnet.md` and `docs/vaultclaim-devnet.md`).

**B3 is unblocked and step 1 is done.** The `$DRAKES` mint keypair is ground to
sort **below wSOL** so wSOL is token B — `1212YJcDwzgLXxmwbtmkYaEB53p6y958cn2tENt3C3dM`,
its secret at `~/.local/share/drakes-mainnet/` and never in this repository.
Grinding below wSOL takes ~43 tries against ~21 for `$PUMP`, because wSOL's
first byte is `0x06`. `scripts/check-mint-order.ts` asserts the order against a
literal address and the assertion runs in CI, because it is the one property
that cannot be fixed once the pool exists (T10).

**The conversion rule is published rather than left to judgement** — ~~25 SOL,
weekly ceiling, monthly floor above 5 SOL~~, Jupiter, 2-of-3, every signature on
`/verify`. `DESIGN.md` §3.6 carries the numbers and the reasons.

**The threshold is 5 SOL and the floor's condition is 1 SOL (D30, 2026-09-02).**
The figures struck above were sized for a flat 1.6% fee; against pump.fun's
schedule 25 SOL is 417 days of waiting on the bonding curve. They are struck
rather than overwritten because a ledger that edits its own numbers cannot be
audited — `DESIGN.md` §3.6 is the live rule.

**The cost, stated because it is new:** between the trade and the conversion the
hoard holds SOL and not `$PUMP`. The monthly floor bounds that at thirty days
and does not remove it. The site may not say the hoard tracks `$PUMP`
continuously.

### D27 — Every hoard conversion is indexed from its own transaction

The operator supplies a **signature and nothing else**;
`scripts/record-hoard-purchase.ts` reads the amounts out of that transaction's
pre and post token balances, refuses a transaction where the vault did not spend
the quote and receive the hoard token, and stores the signature beside the
figures. `/verify` prints both.

**Why it is written this way.** A table of amounts typed in by an operator is a
claim about the chain; a table derived from signatures is an index of it. The
difference is whether a reader who fetches the signature can catch us, and the
whole page is built on the answer being yes.

## D28 — The first conversion is seeded by the creator, and the row says so
*Decided by the owner, 2026-09-01.*

`/verify` would otherwise launch with an empty hoard table and a rule describing
conversions that have never happened. The creator puts SOL in the vault before
launch and the multisig converts it under the same 2-of-3 ceremony, so the table
is born with a real transaction in it.

**The row is marked `seeded by the creator, not from fees`.** SOL in a vault is
fungible: no reader can derive that provenance from the chain, which makes it the
only asserted column in a table whose whole point is that its figures are
derived. Marking it is what keeps the rest of the table trustworthy. The column
is written by `--seeded` on `scripts/record-hoard-purchase.ts`, defaults to
`fees`, and is constrained to those two values by migration `0004`.

## D29 — The Bestiary goes to production on `drakes.fun` reading devnet
*Decided by the owner, 2026-09-01, reversing "production stays on the
placeholder until mainnet".*

The site is live on the real domain now, and the chain under it is devnet. The
standing rule was to wait; the owner's reason for not waiting is theirs, and the
job here is to make a devnet-backed public page honest rather than to argue it.

**What carries the honesty, and all of it is env-driven:**

- **The cluster chip is filled rather than outlined** on anything that is not
  mainnet. A neutral pill reading `devnet` is a label nobody reads.
- **A sentence at the foot of `/`** — *"These issuances are a rehearsal on
  devnet. Mainnet has not started."* — and the equivalent at the head of
  `/verify`, where a reader has come specifically to trust something.
- **Both are conditioned on the server-side classification**, so pointing
  `RPC_URL` and `ISSUANCE_PROGRAM` at mainnet removes them **with no deploy of
  code**, which was the owner's condition.
- **The noindex triple is unchanged** and verified against the domain with
  deployment protection off.

**One thing changed underneath.** `readConfig` threw on a missing `RPC_URL`,
which is right for a script and wrong for an origin the public can reach: it
would have rendered a stack trace where the page should be. Both pages now say
*"this deployment is not pointed at a chain"* and show no figures. `CLAUDE.md`:
refusing is the safe failure.

## D30 — The launch venue is pump.fun, and B3 is retired
*Decided by the owner, 2026-09-02, after `docs/round-2026-09-02-pumpfun.md`.
Supersedes D26 and, with it, D3's direct Meteora pool. The reasoning and the
numbers are `DESIGN.md` §9.6 and §1.1; this is the policy.*

`$DRAKES` launches on pump.fun's own bonding curve and graduates to PumpSwap.
There is no pool of ours, no liquidity of ours to seed, and no position of ours
to lock.

**What made the decision.** D24 found that DAMM v2 refuses a pool for a
Token-2022 mint carrying a `transferHook` without a Meteora badge, `$PUMP` has
none, and no DAMM v2 pool holds it. D26 routed around that with a
`$DRAKES`/wSOL pool. The owner's call is that a venue with its own distribution
is worth more than a venue whose fee we chose, and the fee is the thing being
traded away — see D31, which is the same decision seen from the copy's side.

**What it retires.**

- **B3 in full**, and with it the one step this project called unfixable: the
  mint no longer has a sort order to satisfy, because there is no pair of ours
  for it to sort in (`DESIGN.md` T10 is now history). The CI assertion that
  pinned the order is deleted in b22; `scripts/check-mint-order.ts` becomes
  `scripts/check-ground-mint.ts`, an identity check and nothing else.
- **The Meteora badge request** (`docs/meteora-badge-request.md`). Never sent,
  now moot.
- **The `$DRAKES`/wSOL devnet pool as a launch rehearsal.** Its findings survive
  — the Squads ceremony, the packet ceiling, the destination assertion — because
  they were about Squads and Jupiter, not about Meteora.

**What it keeps.**

- **The ground mint as an identity pin.** `1212YJcDwzgLXxmwbtmkYaEB53p6y958cn2tENt3C3dM`
  is still the mint `$DRAKES` launches with, because pump.fun's `create` takes
  the mint as a signer and a keypair published in advance is a mint nobody can
  claim was swapped at launch. The `pump` suffix is their grinder's convention
  and is not enforced by the program — observed on a live coin, 2026-09-02.
- **§3.6 entire**, because `collect_coin_creator_fee` pays in **wSOL**, which is
  the premise §3.6 was written on. Its threshold moved; the rule did not.

**Two numbers moved with it, and both are in `DESIGN.md`:**

1. **§3.6's threshold is 5 SOL, and its floor condition is 1 SOL.** It was 25
   SOL and 5, sized for a flat 1.6% fee. Under pump.fun's schedule 25 SOL is
   **417 days** of waiting on the bonding curve — a rule that reads as a promise
   and behaves as an excuse. The ceiling (7 days) and the floor (30 days) are
   unchanged.
2. **The headline states no rate.** The fee is a band pump.fun sets — 0.300% on
   the curve, up to 0.950%, down to 0.050% — so the site says *"every trade
   sends its creator fee to the hoard"* and puts the read table, with its date,
   on `/verify`.

**The cost, stated because it is new and permanent.** `create` takes `creator`
as an argument, so the Squads vault is the creator from launch with no PDA
signing — but `set_creator` is gated on an authority that belongs to pump.fun.
**If the creator is wrong at launch it is wrong forever**, which is why C3 is
one of the three irreversible steps in `docs/launch-runbook.md` and why it was
rehearsed end to end on devnet (`docs/pumpfun-create-devnet.md`).

**The second cost: the schedule is not ours.** Meteora's static config was
immutable and pump.fun's `FeeConfig` is theirs to change. `scripts/check-pump-schedule.ts`
runs daily against the real account and `/verify` degrades to "not confirmed"
after a week without one, which is the honest failure and not a fix.

**Revisit if:** pump.fun changes the fee schedule against us, or a venue appears
that pays a flat rate at size. Neither undoes the launch — the creator and the
mint are fixed — so a revisit is about where the *next* thing launches.

## D31 — The hoard is a secondary property, not the thesis
*Decided by the owner, 2026-09-02. The full argument and the corrected fee
table are `DESIGN.md` §1 and §1.1.*

**§1 is the hourly issuance and nothing else**: one piece an hour to a holder,
chosen in proportion to their holding, never chosen by us, recomputable by a
stranger. The hoard moved to §1.1 with a real figure, off the front page's
pitch, and to the bottom of `/verify` below the two checks and the command.

**Why.** The hoard was the centre of §1 when the fee was expected to be a flat
1.6%. pump.fun's schedule pays **least exactly where the collection is worth
most** — 0.950% while the coin is small, 0.050% above 98,240 SOL of market cap.
A property with that shape cannot be the reason to hold anything, and a pitch
that leads with it is a pitch that gets weaker as the project succeeds.

**What it forbids, on top of §7's ban on `backed`:** the hoard may not be the
subject of a headline, of the masthead, or of the first three lines of any
pitch. Describing it with its real number, in its own place, is allowed and is
what the site does.

**What it does not touch.** `redeem` is unchanged and still Phase 2. Nothing
about the mechanism was removed — only its place in the argument.

**It survived its own correction, which is the reason to trust it.** The fee was
reported here as a flat 0.05% and that was wrong: the `FeeConfig` account is
owned by a third program, `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ`, so a
discriminator scan under the two programs whose IDLs declare it returned zero
results that read exactly like "not deployed". Read from the real account the
creator's share is 0.300% on the curve and up to 0.950% on PumpSwap. **D31 was
decided on the shape and not on the magnitude** — the rate decays as the coin
grows either way — so the better number did not put the hoard back in the first
three lines.

**Revisit if:** the fee schedule ever pays *more* at size. That would invert the
shape the decision was made on, and it is pump.fun's to change.

## D8 addendum — when the upgrade authority is revoked
*2026-09-02.*

D8 says the Phase 1 program holds nothing, which is what makes it deployable
before an audit. That leaves a window: **a mainnet program with real value under
it and an upgrade authority still alive.**

**The authority is not held by one key during that window.** Launch step C1b
hands it to the Squads 2-of-3 immediately after the deploy and before
`initialize`, so the program is mutable only by two people who both have to
agree. Rehearsed on devnet against the deployed program, including a loader
instruction executed by the vault through a real 2-of-3
(`docs/upgrade-authority-devnet.md`).

**Revocation is tied to a condition, not to a date: Phase 2 audited and
deployed.** Revoking earlier means a bug in Phase 1 is permanent; revoking later
than that has no argument for it, because by then the thing the authority exists
to fix has been replaced. It is a one-way door and it gets its own round when
the condition is met — it is deliberately **not** a step in
`docs/launch-runbook.md`.

## Still open

- ~~**Q3 — Launchpad.**~~ **Closed 2026-09-02 by D30**: pump.fun is not an
  addition to a pool of ours, it is the venue. There is no Meteora pool to be
  *also* anything to.
- **Q7 — The floor sentence.** The exact public wording of "the floor is worth
  whatever `$PUMP` is worth" is a promise the moment it ships. It gets written
  once, when asked for explicitly.
- **The `Exhausted` sentence.** D10 is a one-way door and needs its own line of
  copy. Same rule as Q7: written once, when asked for.
- **The asset's URI is not bound to its piece, and only the program can bind
  it.** `settle_issuance` takes `name` and `uri` from the caller and mints
  with them unvalidated; the piece id is chosen inside the same instruction, so
  the cranker cannot pass the right one and today's default names the asset for
  the hour instead of the piece. Found by B2 on 2026-09-02
  (`docs/upload.md`). **The recommendation is that the program build the URI
  on chain from a `base_uri` written once by `initialize`** — an Anchor
  change, cheap while Phase 1 holds nothing and impossible after the upgrade
  authority is revoked (D8). It is a change to the on-chain program, so it gets
  its own round before a line is written.
- **A proper trademark clearance search** in classes 9, 35, 41 and 42. D1 used a
  web search over Justia and Trademarkia, which is not clearance. It runs before
  real money goes into the brand.
- **EVM collection collision** for "Drakes". Never checked; OpenSea's API needs a
  key this project does not have.
- **The owner's Quantums text.** The source document for the D19/D20 round is
  **not in this repository**: it was never pasted. The round was argued from the
  owner's summary in chat instead, and that is a gap in the ledger — every other
  external claim here carries a source and a date.
