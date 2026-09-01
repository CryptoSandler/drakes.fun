# Decisions

Policy the owner decided, with what it costs and what would make it worth
revisiting. A decision lives here and not in a commit message, because the
person who needs it is an operator six months from now, not a reviewer.

---

## Decided 2026-09-01

### D1 — The species is **Cinders**, ticker `$CINDER`, domain `cinders.fun`

Cinders are the embers of dead memecoins. The name marks the species, not the
mechanism.

**Cost:** a defunct Solana project called `Cinder` (singular, WildWorks, shut
down 2023-02-08) carries a faint negative memory. Trademark registers not
searched. See `references.md`.

**Revisit if:** a register search turns up a live mark in software or
entertainment.

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

## Still open

- **Q5 — Mature endgame.** 100% to reserve is decided (D4). What happens if
  `live_supply` reaches zero is not: `DESIGN.md` proposes an `Exhausted` state
  where `claim_fees` refuses rather than depositing into a vault with no
  possible claimant. Needs a yes.
- **Q3 — Launchpad.** A direct Meteora pool is decided by D3. Whether to *also*
  do anything on pump.fun's own surface for distribution is not.
- **Q7 — The floor sentence.** The exact public wording of "the floor is worth
  whatever PUMP is worth" is a promise the moment it ships. It gets written
  once, when asked for explicitly.
- **The audit deadline date.** D8 requires a published date. Not chosen.
- **Trademark register search** for "Cinder"/"Cinders". Not run.
