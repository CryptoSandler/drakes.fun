# Decisions

Policy the owner decided, with what it costs and what would make it worth
revisiting. A decision lives here and not in a commit message, because the
person who needs it is an operator six months from now, not a reviewer.

---

## Decided 2026-09-01

### D1 — ~~The species is **Cinders**~~ — **REOPENED 2026-09-01, the name is in review**

The concept stands: the species is the ember of a dead memecoin, and the name
marks the species rather than the mechanism. **The word does not.** `Cinders`
and `$CINDER` are a **working name** in these documents and carry no commitment.

Binding while it is in review:

- **No domain is bought.** `cinders.fun` is not registered, and nothing is
  registered until the name is final — a registration is a paid receipt and a
  WHOIS record (CLAUDE.md, the no-doxx guard).
- **Nothing in code carries the name.** No identifier, no constant, no ticker,
  no database value, no migration. `package.json` holds a neutral placeholder
  and the slug is an unset environment variable, `PROJECT_SLUG`.
- **The trademark search is postponed** until there is a name to search. It runs
  before a domain is paid for, not after.
- **Documents keep using the working name** so they stay readable. Replacing it
  is a search-and-replace across `docs/` and `DESIGN.md`, and it is cheap
  precisely because it never entered the code.

**Cost:** everything downstream that wants a name waits — domain, ticker, X
handle, wordmark, and any art that bakes a wordmark in. **Why:** the name is
one-way in public. A ticker cannot be changed after a pool exists, and a handle
cannot be un-seen.

**Prior cost, still on the record if the word survives:** a defunct Solana
project called `Cinder` (singular, WildWorks, shut down 2023-02-08) carries a
faint negative memory. See `references.md`.

### D2 — The issuance is weighted by the fungible token, not by pieces held

Eligibility is a holder's share of eligible `$CINDER` supply at the snapshot
slot. Holding a Cinder does not change your share.

**Cost:** it is not the design the brief first described. **Why:** weighting by
pieces has an empty eligible set at issuance 1, earns nothing until pieces
trade, and concentrates — whoever is issued early is issued more often.

### D3 — Reserve in `$PUMP`, pure, no USDC leg

Pool: `$CINDER`/`$PUMP` on Meteora DAMM v2, static config
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

Zero `$CINDER` to the team, no presale, no vesting, no reserved wallet. The
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

### D9 — The ember is derived from the issuance index, curve published first

Two of five traits are functions of the index rather than rolls. The exact
functions are published, with a rendered strip of all 4,000 states, **before
issuance 1**.

**Cost:** removes two axes of randomness from the rarity table. **Why:** the
artwork becomes a clock, and no later batch can be accused of being worse art
because the curve was public before the first piece existed.

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

### D13 — Rarity is visible, stratified by index block, and cosmetic

Five levels: **common 2,400 · uncommon 1,000 · rare 480 · epic 110 ·
one-of-one 10.** Allocated in **blocks of 400**, so every block of 400
consecutive indices holds exactly 11 epics and exactly 1 one-of-one. Order
inside a block comes from the published seed; counts are fixed. The whole
index→tier table is published before issuance 1 in the manifest that gets
hashed.

**The tier is carried by Seam geometry and by tier-exclusive Relic pools —
never by Ember or Settle**, which are the index. *The index owns light; the
tier owns form.* Background is not a tier signal. `DESIGN.md` §9.3–9.4.

**Cost, and it is the real one:** a visible ladder on a collection whose entire
claim is that every piece redeems for the same amount invites the assumption
that the ladder is economic. It also creates a holder who was issued a common
by a process they did not choose and cannot re-roll — unlike a mint, there was
no purchase decision to regret. Mitigation is copy, and it is not optional:
**"a one-of-one redeems for exactly the same share as the plainest common"**
ships on the same screen as the rarity table, every time.

Second cost: the tier allocation is ours to generate, which is the same trust
shape as the snapshot — recomputable, not trustless. Publishing the full table
before issuance 1 is what converts "trust us about the one-of-ones" into a
commitment anyone can check afterwards.

**Cost to the brief:** two extra seam geometries reserved for epic, the relic
list partitioned into per-tier pools instead of one flat list of 24, and a
delivered face-registration mask. Expect the budget to move by roughly 10%.

**Revisit if:** the epic signature cannot be made legible at 48 px at the
dimmest ember state. Then the tier ladder is decoration in the only place
people look at it, and it should be dropped rather than faked.
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

- **The name.** The species name is **in review** — `Cinders`/`$CINDER` is a
  working name in these documents and nothing more. No domain is bought, no
  identifier in code carries it, and the project slug is an unset environment
  variable. When it lands it touches exactly three places: `package.json`, copy,
  and `SITE_URL` (CLAUDE.md).
- **Trademark register search.** Postponed until there is a name to search. It
  runs before any money is spent on a domain.
- **Q3 — Launchpad.** A direct Meteora pool is decided by D3. Whether to *also*
  do anything on pump.fun's own surface for distribution is not.
- **Q7 — The floor sentence.** The exact public wording of "the floor is worth
  whatever `$PUMP` is worth" is a promise the moment it ships. It gets written
  once, when asked for explicitly.
- **The `Exhausted` sentence.** D10 is a one-way door and needs its own line of
  copy. Same rule as Q7: written once, when asked for.
- **D11's deadline, before or after the step-down.** 180 days lands ~13 days
  after the creator's income stops. The owner may want 150.
