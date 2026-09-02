# Adversarial round: launching `$DRAKES` on pump.fun

Owner's decision, 2026-09-02: `$DRAKES` launches on pump.fun and not in a pool
of our own. This supersedes **D26** (the `$DRAKES`/wSOL DAMM v2 pool) and **B3**
(grinding the mint for sort order against wSOL, the Meteora token badge).

**No code was written and nothing on the program or the site was touched.**
Every number below was read on **2026-09-02** from the source named beside it.

**Recorded as D30 and D31 in `docs/decisions.md` on 2026-09-02.** One number
below did not survive the round it belongs to: **§3.6's threshold is 5 SOL, not
the 25 discussed here**, and its floor condition is 1 SOL. The argument is left
as it was argued — it is the record of a round, not the rule — and `DESIGN.md`
§3.6 is the rule.

---

> ## TWO CORRECTIONS, same day
>
> **First I reported the documented tiers. Then I reported them as wrong. The
> second report was the error.**
>
> Building the schedule guard I scanned for the `FeeConfig` discriminator under
> the pump and PumpSwap programs — both of which declare the account in their
> IDL — found nothing, and concluded the tiers were not deployed and the fee was
> a flat 5 bps from `GlobalConfig`.
>
> **The account is owned by a third program**,
> `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ`. A failed devnet `buy` named it:
> `AccountOwnedByWrongProgram ... Right: pfeeUxB6...`. Read from the real
> account, the bonding curve pays the creator **30 bps** and PumpSwap carries
> **25 tiers** from 30 bps up to 95 and down to 5 — which is what the
> documentation said. Confirmed at runtime by the fee program's `GetFees`
> returning `lp 0 · protocol 95 · creator 30`.
>
> **So §1 below is right and the numbers stand.** The lesson is the one written
> into `pump-schedule.ts`: an IDL says what an account looks like and never says
> who owns it, and a discriminator scan under the wrong program returns zero
> results that read exactly like "not deployed".

## What was read, and where

| Fact | Source | Read |
|---|---|---|
| Fee schedule, both phases | `pump.fun/docs/fees` | 2026-09-02 |
| `collect_coin_creator_fee` accounts and signer | pump-public-docs, PumpSwap creator-fee page | 2026-09-02 |
| Bonding-curve program is live | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`, mainnet | 2026-09-02 |
| PumpSwap AMM is live | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`, mainnet | 2026-09-02 |
| A launched token's mint program and extensions | `2gMuEXhrfxEr71Hj1YacP9uRvdGFZtrUscbaNnNFpump`, mainnet | 2026-09-02 |
| Holder-account sizes for that mint | `getProgramAccounts`, mainnet | 2026-09-02 |

---

## 1. The fee, and it is not a single number

**Bonding curve:** total 1.25%, of which the creator gets **0.300%**.

**PumpSwap after graduation:** tiered by market cap, and the shape is the
finding — it rises, then decays.

| Market cap (SOL) | Creator | Total |
|---|---|---|
| 0 – 420 | 0.300% | 1.250% |
| **420 – 1,470** | **0.950%** | 1.200% |
| 4,420 – 9,820 | 0.750% | 1.000% |
| 19,650 – 24,560 | 0.600% | 0.850% |
| 49,120 – 54,030 | 0.300% | 0.550% |
| **98,240 +** | **0.050%** | 0.300% |

The creator's share is **highest between 420 and 1,470 SOL of market cap** and
**decays to a twentieth of that** above 98,240 SOL. Our Meteora plan was a flat
**1.6%**, forever, at any size.

### The projection, in SOL, with the tier applied to each case

| Scenario | Creator fee | Hoard / month | Under 1.6% | Ratio |
|---|---|---|---|---|
| on the curve, 20 SOL/day | 0.300% | 2 SOL | 10 SOL | 5.3× less |
| mcap 1,000, 500 SOL/day | 0.950% | 143 SOL | 240 SOL | 1.7× less |
| mcap 20,000, 5,000 SOL/day | 0.600% | 900 SOL | 2,400 SOL | 2.7× less |
| **mcap 100,000, 10,000 SOL/day** | **0.050%** | **150 SOL** | 4,800 SOL | **32× less** |

Time to the 25 SOL threshold of §3.6: 417 days on the curve, 5.3 days at the
small case, 0.8 days at the middle one, **5.0 days again at the large one** —
the same wait at a hundred times the volume.

---

## 2. The strongest case AGAINST, stated so it could change the decision

**The hoard's growth is anti-correlated with the project succeeding, in exactly
the band where success would be measured.**

This product is not a memecoin with a fee kicker. Its central sentence is that
trading feeds a hoard, and a piece can be burned for a share of it. The hoard is
the product. pump.fun's schedule pays a creator most while the coin is small and
least once it is large — which is correct incentive design *for pump.fun*, whose
problem is bootstrapping thousands of launches, and is backwards for a protocol
whose promise is a durable claim at scale.

At 98,240 SOL of market cap the creator's 0.050% is **the same rate as the
protocol's own cut** and a quarter of what liquidity providers take. If
`$DRAKES` works, the redemption promise gets thinner per unit of volume every
step of the way up.

**That is a real argument and it is not fatal, for one reason:** 1.6% of a pool
nobody trades is zero. D24 already established that the `$PUMP`-quoted pool
cannot be created at all, and the wSOL pool needs us to bring our own liquidity
and our own buyers. pump.fun is where the buyers are. **A worse rate on real
volume beats a better rate on none** — but the decision should be made knowing
the fee falls as the thing grows, not discovering it at 98,240 SOL.

---

## 3. The collision with the real code

### What survives unchanged

- **§3.6, the conversion rule.** `collect_coin_creator_fee` pays in **wSOL**,
  which is precisely the premise §3.6 was written on: the fee arrives in SOL and
  the multisig converts it to `$PUMP` on a published rule. **The rule needs no
  change at all.** 25 SOL threshold, 7-day ceiling, 30-day floor, Jupiter,
  2-of-3, listed on `/verify`.
- **The B9 size guard.** Wrapping a Jupiter swap in a Squads proposal is the
  same problem whatever the fee's origin.
- **The issuance program.** Nothing in `programs/issuance` reads the pool.

### What is thrown away

- **B3 in full.** The mint no longer needs to sort below wSOL: there is no pool
  of ours for it to sort in. The ground mint `1212YJcDwzgLXxmwbtmkYaEB53p6y958cn2tENt3C3dM`
  and its CI order guard become unnecessary — though the keypair is still usable
  as the coin's mint (§4).
- **The Meteora badge request.** Never sent; now moot.
- **The `$DRAKES`/wSOL devnet pool rehearsal**, as a launch rehearsal. Its
  *findings* survive — the SDK defects, the destination assertion, the Squads
  ceremony — because they were about Squads and Jupiter, not about Meteora.

### What the repo already knew that the discussion did not

**`src/lib/snapshot/rpc.ts` filters holder accounts on `dataSize: 165`, and a
pump.fun token is Token-2022.** Measured against a real launched mint on
2026-09-02:

    dataSize 165  (what we filter on today)     10 accounts
    dataSize 170  (Token-2022 ATA)             590 accounts
    dataSize 182                                 1 account
    no size filter                             600 accounts

**Our snapshot would have seen 10 of 600 holders — 1.7% of them — and produced a
Merkle root that verifies perfectly over the wrong set.** The scan-abort guard
in that file does not fire: the scan succeeds. The eligible supply would be
wrong, the recipient would be drawn from a fraction of holders, and `/verify`
would agree with itself because it recomputes from the same published root.

This is the single most valuable thing the round produced, and it was one RPC
call. The premise in the brief — *"the holder snapshot works the same, standard
SPL"* — is **false**, and it was worth checking rather than assuming.

The fix is small and is NOT written yet (no code this round): drop the
`dataSize` filter, pass the Token-2022 program id, and keep the `dataSlice`,
whose offsets are unchanged because the base account layout is identical.

### What is benign

The launched mint carries **only `metadataPointer` and `tokenMetadata`** — no
transfer hook, no transfer fee, no permanent delegate. So:

- balances mean what they say; no fee-on-transfer to model in the snapshot;
- **T1 does not apply**: there is no hook that could be installed to strand a
  pool, because the mint's extension set does not include one;
- the badge problem that killed the `$PUMP` pool cannot recur here.

---

## 4. The mint keypair

pump.fun's `create` takes the mint as a signer, so **a ground keypair can be
supplied**. Two mints observed on 2026-09-02 show the `pump` suffix is a
convention of their vanity grinder and not enforced by the program:
`2gMuEXhr…pump` has it, `F4PaKuUPQ5c5QdkXqqjcprjnWXpQ2Qh4aCadobjNT4vP` does not.

**Is it worth it?** The order-against-wSOL reason is gone. What remains is
identity: a mint we ground and published in advance is a mint nobody can claim
was swapped at launch. That is worth something and it costs nothing, since the
keypair already exists. **Recommendation: use it, and stop grinding for
anything.**

---

## 5. The claim path, and the good news in it

`collect_coin_creator_fee` on PumpSwap is **permissionless — no signer is
required.** Anyone may trigger it; the funds move from the creator vault to the
creator's token account and nowhere else.

That is exactly the shape `CLAUDE.md` asks for: *"the worst a stolen crank key
can do is pay for our transactions."* The crank can claim fees on a schedule and
a stolen crank key cannot redirect a lamport of it.

The vault is a PDA seeded `["creator_vault", coin_creator]`.

### The open question, and it is the one that decides the ceremony

**Can `coin_creator` be a Squads vault from launch?** The creator is whoever
signs `create`. A Squads vault is a PDA and can sign through a vault
transaction, so creating the coin *from* the multisig should set
`coin_creator` to the vault — and B9 already measured that a Squads proposal has
room for an instruction far smaller than a Jupiter route.

**Not verified.** `admin_set_coin_creator` exists but is Pump's admin, not ours,
so **if the creator is set wrong at launch we cannot fix it ourselves.** That
makes this the one thing to rehearse before launch rather than after, and it is
cheap: create a throwaway coin on mainnet from a disposable 2-of-3 and read back
`coin_creator`.

---

## Recommendation

**Launch on pump.fun, with three conditions, and none of them is optional.**

1. **Rehearse `create` from a Squads vault before the real launch.** The creator
   address is effectively permanent for us. Getting it wrong means the hoard's
   income belongs to a single key forever.
2. **Fix the snapshot before anything is issued.** Today it would silently see
   1.7% of holders. This is a correctness bug in the part of the system whose
   whole claim is that a stranger can recompute the recipient.
3. **Say the fee is variable, in the copy, from day one.** A site that says
   "1.6% of every trade reaches the hoard" when the real number moves between
   0.05% and 0.95% is the kind of sentence this project exists not to write.

**And the case against is worth carrying forward rather than closing:** if
`$DRAKES` reaches the top band, the hoard earns a twentieth of what the design
was sized on. That is not a reason to avoid the launchpad. It is a reason for
the redemption copy to never promise a rate.

---

## Product questions

1. **The headline number.** There is no single percentage any more. The honest
   forms are *"the creator fee on every trade goes to the hoard, and pump.fun
   sets that fee by market cap — today it is X%"* (accurate, needs a live read
   on the page) or *"every trade sends its creator fee to the hoard"* (accurate,
   no number, always true). **I recommend the second in the headline and the
   live number on `/verify`.** Your call: a headline with a moving number, or a
   headline with none.
2. **Do we say the fee falls as the coin grows?** It is true, it is public on
   pump.fun's own docs, and it is the kind of thing a reader discovers anyway.
   My recommendation is to state it in `DESIGN.md` §1's fine print. It is not a
   promise either way, so it is not a one-way door — but it is your call whether
   it goes on the site.
3. **The 25 SOL threshold of §3.6** now means 417 days on the curve and under a
   day in the middle case. Do we keep 25, or make the threshold a function of
   what has actually accrued?
4. **What happens to the ground mint's CI order guard** — delete it with B3, or
   keep the mint pinned for identity? I recommend keeping the pin and deleting
   the sort-order assertion.

## What is NOT established

- Whether `create` accepts a PDA signer (§5). **The one blocking unknown.**
- The bonding curve's own creator-fee claim instruction; only PumpSwap's was
  read. Fees accrue on the curve too, at 0.300%.
- Whether pump.fun's fee schedule is itself upgradeable. It is their program and
  their config; **the schedule we launch on is not one we control**, which is a
  different risk from Meteora's immutable static config and should be recorded
  as such.
