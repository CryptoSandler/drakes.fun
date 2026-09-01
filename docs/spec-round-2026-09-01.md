# Spec round — 2026-09-01

> **Historical record. Do not edit to match later decisions.**
> §5 proposed three species — Cinders, Sprigs, Grubs — and the owner chose
> **none of them**: the species is **Drakes**, dragons, `$DRAKES`, `drakes.fun`
> (`decisions.md` D1, D18). Wherever this document says `$CINDER`, read
> `$DRAKES`. The reasoning is kept exactly as it was argued, because a round
> rewritten to agree with its own outcome is a round that proves nothing.

No code. Decisions, disagreements, and the questions only the owner can answer.
Every external number here is in `docs/references.md` with the date it was read.

---

## 0. The finding that reframes the brief

**Quantums does not weight its hourly draw by NFT holdings. It weights it by
the balance of a fungible ERC-20 called `$QUANT`.**

Their paper, section 2: "You hold a token, and once an hour the protocol picks
one holder and issues them a piece." Their front page, step 01: "Hold $QUANT."

The brief asked for the draw to be weighted by **how many pieces a holder owns**,
and asked me to work out how they bootstrap the first generation of holders
without a mint. There is no bootstrap problem to solve, because there is no
chicken and egg: on hour one, the eligible set is everyone who bought a fungible
token that has been trading since hour zero. The first piece goes to a random
token holder who has held for sixty minutes.

This is not a detail. Three things in the brief depend on it, and all three
break under the NFT-weighted reading:

1. **Bootstrap.** Weighted by pieces, the set of eligible holders at draw 1 is
   empty. Something has to seed it — an airdrop, a sale, a free claim — and every
   option contradicts "you cannot buy in at the mint", which is the entire hook.
2. **Where the money comes from.** Their 2% is a fee on **token** trades, taken
   in the reserve asset by a Uniswap v4 hook. It earns from hour zero, before a
   single piece exists. An NFT-royalty-funded version earns nothing until pieces
   exist and trade — and NFT royalties on Solana are not enforceable (§7).
3. **Concentration.** Weighted by pieces, whoever wins early wins more often.
   The distribution runs away from itself. Weighted by a fungible balance,
   winning a piece does not increase your odds of winning the next one, so the
   process is self-limiting.

**Decision I am proposing: copy the token-weighted design.** Everything below
assumes it. If the owner prefers the NFT-weighted version anyway, say so and I
will re-spec — but it is a materially different and, I think, worse product, and
I would want that on the record.

### The second finding: this is a hypothesis, not a proven model

Quantums was roughly **28 hours old** when I read it. 28 pieces issued of 4,000,
4 already burned, no audit at the URL its own sitemap advertises, and its own
"recent draws" feed rendering empty. We would not be replicating something that
worked. We would be running the same experiment on a different chain, in
parallel, with no more evidence than they have.

That is not a reason not to do it. It is a reason not to write copy that implies
the model is established, and a reason to treat their parameter choices as
guesses rather than findings.

---

## 1. What to copy, what to change, what to improve

| Mechanic | Theirs | Ours | Why |
|---|---|---|---|
| No mint page, no price, no allowlist | ✔ | **copy** | It is the product. |
| Draw weighted by fungible balance | ✔ | **copy** | §0. |
| One draw per hour, scheduled from the schedule so it cannot drift | ✔ | **copy** | Correct and cheap. |
| Fee taken in the reserve asset, not the project token | ✔ | **copy** | Means the reserve never sells our own token to fund itself. |
| Rarity is cosmetic; every piece redeems for the same share | ✔ | **copy** | Their reason is right: weighted redemption lets some holders raid the reserve faster than others. |
| Burn is permanent, the slot never refills | ✔ | **copy** | |
| A haircut stays behind on every claim so backing per remaining piece rises | 10% | **copy at 10%** | The one genuinely elegant piece of design in the paper. Whoever leaves pays a toll to whoever stays. |
| Excluded addresses fixed at deploy (pool, burn, program PDAs) | ✔ | **copy** | Pool liquidity must never win. |
| Draw keeps firing after 4,000, stops minting | ✔ | **copy** | Free, and it keeps the verify page alive forever. |
| Randomness | block hash; they state plainly it is sequencer-biasable | **change: Switchboard On-Demand VRF** | Solana has verifiable randomness and their chain did not. This is the one place we can be strictly better than them and it costs ~0.002 SOL per draw. |
| Holder weights | Fenwick tree inside the ERC-20, updated on every transfer | **change: off-chain snapshot, Merkle root committed on-chain** | Not portable. §2. |
| Reserve asset | tokenized SPY | **change: $PUMP** | Owner's call; I agree, with caveats. §3. |
| Ownerless, upgrade authority renounced at deploy | ✔ | **change: multisig + timelock, with a written path to renouncing** | §4. There is a specific, verified reason renouncing is dangerous here that does not apply to them. |
| Team allocation | zero | **copy: zero** | §7. |
| Creator share of the fee | zero | **change: 15%, hardcoded, stepping to 0% at 4,000** | §7. |
| Claim cap of 5% of reserve while fewer than 20 pieces live | ✔ | **improve: cap by count, not by fraction** | §7. Their cap is load-bearing and slightly wrong. |
| Phases (Minting / Mature / Empty) | ✔ | **copy the shape, change the endgame** | §7. |
| Art traits: colour, finish, pupil, accessory, background | — | **entirely different axes** | §5. Two of our traits are derived from the draw index, not rolled. |

---

## 2. The hourly draw

### The schedule

`draw_at` is wall-clock, on the hour, UTC, computed from the first draw's
instant and the draw index — never from when the previous draw settled, so a
late draw cannot push the schedule. This is nftraffle's rule and theirs, and
they agree for the same reason.

### The nftraffle lesson that transfers, and the one that does not

`src/lib/raffles/draw.ts` in nftraffle anchors a draw to an **instant**, not to a
predicted block number, and refuses any block whose own timestamp is not at or
after that instant and after the entry window closed. That redesign happened
because a predicted slot number arrived roughly a fifth early on mainnet — 317ms
real slots against 400ms assumed — and for anything running longer than about
four hours the "future" block hash was already public while entries were open.

**That rule transfers verbatim.** Our anchor is an instant; the settling slot is
the first slot at or after it; the check is against the slot's own timestamp.

**What does not transfer is the commit-reveal.** nftraffle's operator commits a
seed hash and reveals it later, and its own file says what that cannot do: "an
operator who dislikes the outcome can decline to reveal the seed... It cannot
make refusal impossible without an on-chain program." We now have the on-chain
program, so we should not ship the weaker mechanism. Switchboard's randomness is
requested by the program and fulfilled by an oracle; nobody involved can decline
to reveal, and the settle call is permissionless.

### The hard part: where do the weights come from

Quantums maintains every holder balance in a Fenwick tree **inside the token
contract**, updated on every ERC-20 transfer. On Solana this is not available:
an SPL token transfer does not call our program. There are three ways out.

**(a) Token-2022 transfer hook on our own token.** The genuine analogue — our
mint carries a hook program we write, and it updates a weight tree on every
transfer. Fully trustless, and I recommend against it: it puts a program we
wrote in the path of every single transfer of our own token, so a bug bricks the
token itself, not just the draw; it costs compute on every trade; and
transfer-hook tokens have uneven support across AMMs and aggregators. This is
the highest-variance option available and it is in the most dangerous place.

**(b) Off-chain snapshot with an on-chain Merkle commitment. ← recommended.**
`request_draw` records the current slot and commits a Merkle root of
`(holder, balance)` computed from token accounts at that slot, and requests
randomness. `settle_draw` resolves a random point in `[0, eligible_supply)`; the
winner (or anyone) presents the Merkle proof for the leaf whose cumulative range
contains it, and the program mints to that address.

What this is and is not: it is **recomputable**, not trustless. We build the
tree, so we could lie about it. But the input is public chain state at a named
slot, so anyone with an archival RPC can rebuild the tree and check the root —
and if we ever published a root that did not match, it is permanent, public
evidence. That is a stronger guarantee than nftraffle offers today, and it is
honest to describe it exactly that way rather than as "provably fair".

**(c) Weight by NFT holdings via `getAssetsByGroup`.** This is what the brief
asked for. Mechanically it is the same Merkle pattern with a different source,
so it costs no extra engineering — but it inherits every problem in §0. If the
owner picks it, it works; I just do not think it should be picked.

### Triple rejection

nftraffle's `deriveWinner` uses the full 256-bit digest modulo the ticket count
and documents the modulo bias as negligible (~2^-224) rather than rejection-
sampling it away, because the page's instructions have to be followable by a
human with a sha256 box. **Same call here**, same reason, and the verify page
shows the same arithmetic.

The brief's "rechazo triple" is a different thing and it does transfer: the
settle path refuses on three independent conditions — slot before the anchor,
slot before the snapshot, randomness not yet fulfilled — and each refusal has
its own message, because a draw that fails for three different reasons and says
one thing is a draw nobody can debug in public.

### Empty hours and cranking

Zero eligible supply: no mint, index does not advance. Copy.

The crank is permissionless and pays a capped bounty. **This is the single
highest-risk operational item in the project** and it is the one CLAUDE.md's
"every new module names its caller" rule exists for: a draw nobody cranks is a
collection that never issues. We run a cron cranker; the bounty exists so that
we are not the only one who can.

---

## 3. The reserve — $PUMP

The owner changed this from tokenized SPY to $PUMP. **I agree with the change,
for a reason stronger than the one given, and I disagree with one part of the
framing.**

### (a) The technical case, verified rather than assumed

I read both mints on mainnet. This is the part that decides it:

| | $PUMP | SPYx |
|---|---|---|
| Mint authority | **null** | live |
| Freeze authority | **null** | live |
| `permanentDelegate` | **none** | **live** |
| `pausableConfig` | **none** | **live** |
| On-chain liquidity | **$37.75M** | $1.83M |
| 24h volume | **$31.9M** | ~$2.7M |

**A `permanentDelegate` can move SPYx out of any account without the owner's
signature — including a vault PDA.** A `pausableConfig` authority can stop every
transfer. A "trustless burn-to-redeem vault" denominated in SPYx is not
trustless in any sense: the issuer can empty it or freeze it, at will, forever.
Quantums' paper names "issuer risk" in a paragraph about market liquidity; it
does not name the permanent delegate, and I think that is the most important
thing their paper omits.

$PUMP has none of those. It cannot be inflated, frozen, paused, or seized. On
the only axis that matters for a vault — *can a third party take what is in
it* — PUMP is not marginally better than SPYx, it is categorically better.

Liquidity is the second argument and it is also decisive: 20× deeper, 12× the
daily volume. SPYx at $1.83M of liquidity cannot absorb a redemption wave.

### (b) The cost, and how to say it honestly

**The reserve is now correlated with the thing that drives our volume.** SPY was
chosen by Quantums precisely because it is not: "The reserve gains value on days
with no trading at all, and on days when crypto is red and equities are not."
We are giving that up completely. When our token dumps, PUMP is likely dumping
too, so the floor falls at exactly the moment people want to use it. Anyone who
says otherwise is selling.

How to communicate it — this is a copy decision and it should be a hard rule:

1. **The primary number is denominated in PUMP.** "Each piece redeems for
   **412.7 PUMP**." That is a fact that does not move.
2. **USD is secondary, smaller, and stamped with the slot it was read at.**
   "≈ $1.88 at slot 443,323,882." Never a headline, never unqualified.
3. **The risk sentence appears on the same screen as the number**, not in a
   footer: *the floor is worth whatever PUMP is worth, and PUMP can go to zero.*
4. **Never the words "backed", "guaranteed", "floor price", or "value".** The
   piece is *redeemable for* a quantity of a volatile token. That is the whole
   claim and it is enough.

### A USDC floor: I recommend against it, and the reason is technical

The tempting version is "20% of every fee to USDC so there is always something".
The reason not to is not philosophical purity, it is this:

**Pairing our token against PUMP means the fee arrives as PUMP with no swap at
all.** Meteora DAMM v2's `collect_fee_mode = 1` (`OnlyB`) collects fees "only in
token B". Put PUMP as token B and every trading fee lands in PUMP directly —
exactly the property Quantums gets from their v4 hook, natively, from a deployed
audited AMM we do not write.

The moment you want a USDC leg, you need a swap. And a swap is the single most
expensive thing you can add to this program (§3d). **A 20% USDC floor buys 20%
of a number that is small anyway, and pays for it with the largest attack
surface in the design.** That trade is bad.

**Recommendation: pure PUMP, no USDC leg, and the risk stated in copy instead of
hedged in code.** If the owner wants the hedge anyway, it is buildable — it just
converts §4 from a small program into a medium one, with the audit cost to match.

### (c) Platform and regulatory risk — including one thing nobody has flagged

**The buyback has an expiry date.** Pump.fun's current programme — 50% of net
revenue to buyback-and-burn — was announced in **April 2026 for 12 months**,
so it lapses around **April 2027**. Our collection completes 4,000 hours after
the first draw: ~5.5 months, so the mint window closes before that. But **the
redemption promise outlives the programme by design — it is forever.** Whatever
PUMP's tokenomics are in 2028, our vault still holds PUMP and pieces are still
redeemable for it. Copy must never describe the buyback as a property of the
reserve. It is a property of a third party's current policy.

**Single-token concentration** is real and unhedgeable here. We are making a bet
on one company's token. Say it in those words.

**And the one that actually worries me: the transfer hook.** PUMP's mint carries
a live `transferHook` extension. Today `programId` is `null` — no hook runs. But
the hook *authority* (`DMdBa812dBW1CHVhmTyUyVcrBnSbZbfoFC7U14k4riH1`) is live
and can install a program that executes on **every PUMP transfer**, at any time,
without our involvement.

If that happens after we have deployed an immutable program whose redeem
instruction does not carry the hook's extra account metas, **every redemption
reverts, permanently, with no fix.** The reserve becomes unreachable. This is
not a hypothetical class of risk; it is a specific authority that exists right
now on the mint we are proposing to hold.

This single fact is the reason §4 does not renounce the upgrade authority.

### (d) The swap: there is no swap

The brief asked me to choose between a CPI to Jupiter from the program and an
off-chain keeper with limits. **Neither. Pair against PUMP and collect fees in
PUMP; there is nothing to swap.**

For the record, had a swap been needed:

- **A Jupiter CPI from the vault is not an option.** Jupiter routes take an
  arbitrary account list and CPI into arbitrary AMM programs. A vault
  instruction that forwards to it is, in security terms, an instruction that
  lets the caller make the vault call anything with the vault's authority. That
  is an arbitrary-CPI hole with a swap-shaped label on it.
- **A keeper is the lesser evil** *if* the amount handed to it per call is
  hard-capped, the destination is fixed, and the round trip is bounded — because
  then the blast radius is one capped batch, not the reserve.

The fact that the recommended design needs neither is a large part of why I
recommend it.

### (e) Being noticed by Pump.fun without being a parasite

The legitimate version and the opportunistic version differ in one thing:
whether you shipped first.

**Do:**
- Launch, run several hundred draws, and let the on-chain record exist before
  saying a word to anyone. A protocol with 300 hours of verifiable draws and a
  vault that has never been touched is a different conversation from a pitch.
- Never sell the PUMP. The reserve's only outward path is redemptions. That is
  verifiable and it is the whole difference between "holds PUMP" and "farms
  PUMP".
- Publish the reserve address on the front page from hour one so anyone,
  including them, can watch it.
- Be genuinely first at something specific: *the first NFT collection whose
  redemption is denominated in PUMP.* That is a true, checkable, narrow claim.

**Do not:**
- Use their marks, their name in ours, or imply endorsement.
- Ask for anything before there is a record.
- Build a governance/partnership story into the mechanism. Any mechanic that
  only pays off if Pump.fun cooperates is a mechanic that fails by default.

**Open question for the owner (§10, Q3):** launching our token on pump.fun's own
launchpad would make us their customer from block one, which is the strongest
legitimacy argument available — but pump.fun pairs against SOL, not PUMP, which
re-introduces the swap this whole design avoids. Distribution versus vault
simplicity. I lean vault simplicity; it is close.

---

## 4. Custody — the gated decision

### The custodial alternative, explicitly discarded

**Rejected.** Written reason, for `docs/decisions.md`:

> A custodial reserve makes "burn to redeem" a promise by an anonymous operator
> rather than a property of the chain. The product's one claim is that the floor
> is arithmetic instead of sentiment; a custodial floor is sentiment about a
> person nobody can identify. For a pseudonymous team it is worse than useless —
> the audience cannot price a reputation that does not exist, so they discount
> the backing to zero, which is the correct thing for them to do. It also
> converts a code risk into a legal one: holding other people's redeemable funds
> under a pseudonym is a materially different activity from publishing a
> program. The reserve is held by a program or the feature is not shipped.

### The minimum program

Five instructions. Every one of them has a fixed destination; none of them takes
a destination from the caller.

| # | Instruction | Signer | What it can do at worst |
|---|---|---|---|
| 1 | `initialize` | deployer, once | Sets immutable config: collection, pool, PUMP mint, creator ATA, split, first draw instant. Cannot run twice. |
| 2 | `claim_fees` | **permissionless** | CPI to Meteora `claim_position_fee` on the locked LP position. Funds can only land in the reserve ATA and the hardcoded creator ATA, in the hardcoded ratio. A caller gains nothing but the gas they spent. |
| 3 | `request_draw` | **permissionless** | Records slot, commits the snapshot Merkle root, requests Switchboard randomness. Refuses if the scheduled instant has not passed. |
| 4 | `settle_draw` | **permissionless** | Resolves the winner from fulfilled randomness + a Merkle proof, CPIs `mpl-core` to mint to that address, pays a capped crank bounty. |
| 5 | `redeem` | asset owner | CPI `mpl-core` burn, then `transfer_checked` a pro-rata share of PUMP from the reserve to the owner, less the 10% haircut, plus a flat SOL fee to the creator. |

**No withdraw. No sweep. No rescue. No pause. No fee setter.** Every parameter is
a constant or set once in `initialize`. Roughly 800–1,500 lines of Anchor, three
CPIs (Meteora, mpl-core, Switchboard) and one Token-2022 transfer.

The riskiest surfaces, named so a reviewer starts there: the Merkle proof
verification in `settle_draw`, the pro-rata arithmetic and rounding in `redeem`,
and re-entrancy around the burn-then-transfer ordering in `redeem` (burn first,
always, and compute the share from a supply read before the burn).

### Upgrade authority — I am not recommending renouncing it, and this is a change from the brief

The brief said "upgrade authority burned, or multisig + timelock declared".
**Recommendation: Squads multisig 2-of-3 with a published timelock (72h), and a
written, dated commitment to renounce.** Reasons, in order of weight:

1. **The transfer hook (§3c).** PUMP's hook authority is live. If a hook is
   installed after we go immutable and our redeem path cannot satisfy it, every
   redemption reverts forever and the reserve is stranded. An ownerless program
   cannot survive a dependency whose interface a third party can change
   unilaterally. Quantums does not face this: SPY on their chain is a plain
   ERC-20 and ERC-20 has no such extension point. **Their choice is right for
   their asset and wrong for ours**, and copying it here would be copying the
   conclusion without the argument.
2. A 72h timelock means an upgrade is visible before it lands, so anyone who
   dislikes it can redeem or sell first. That is a real protection and it is
   verifiable on-chain.
3. Renouncing stays the destination: the commitment is that the authority is
   burned once PUMP's transfer-hook authority is itself renounced, or a hook is
   installed and our path is confirmed compatible. Written, dated, published.

**The cost, stated honestly rather than buried:** 2-of-3 anonymous keys can, in
principle, upgrade the program to drain the vault after 72 hours' notice. That
is strictly worse than ownerless and there is no way to describe it otherwise.
The page must say so in those words. This is a decision-with-a-door and it is
the owner's, not mine — see §10 Q1.

### Audit, without doxxing — and the number

Doxxing is not required to buy an audit; most firms will engage an entity or a
pseudonym and take payment in crypto, though some run KYC. What is realistic:

| Layer | Cost | Value |
|---|---|---|
| Verified build (`solana-verify`) so deployed bytecode provably matches public source | ~0 | Non-negotiable. Without it the published source proves nothing. |
| Public source repository from day one | 0 | |
| **Paid audit, boutique Solana firm, small program** | **$15k–$35k; budget $25k** | The only thing on this list that finds the bug. |
| Public bug bounty, self-funded, e.g. 10% of reserve capped at $25k | contingent | Meaningful only after the audit; before it, it is a discount on an exploit. |

Market context: reported 2026 ranges are $7k–$20k for simple Solana programs and
$60k–$130k for standard Solana DeFi, with a stated 20–40% Rust premium. A
five-instruction program that custodies redeemable value sits at the top of
"simple", not the bottom.

**Asked directly, my answer is: no, this cannot be done responsibly without a
paid audit. The number is about $25,000.**

An unaudited ownerless vault holding other people's redeemable value is not a
lean launch, it is an unreviewed bearer instrument. And the amount at risk is
not what the reserve holds on day one — it is what it holds at the moment
somebody finds the bug, which is the maximum it will ever hold.

### The phased proposal — and my disagreement with myself, made explicit

There is a shape that ships before $25k exists, and I want to put it forward
while being clear it is a compromise:

- **Phase 1 (launch → audit).** Token, pool, draws, collection, verify page all
  live. Fees accrue to a **Squads 2-of-3 multisig**, published. **Redemption is
  not live**, and the page says so in those words, with the trigger: *redemption
  opens when the audited program is deployed; until then the reserve is held by
  a 2-of-3 multisig at this address and has never been spent.*
- **Phase 2.** Audited program deployed. Multisig transfers the reserve in.
  Redemption opens. Upgrade authority → multisig + 72h timelock.
- **Phase 3.** Authority renounced once the PUMP hook question resolves.

**This is temporary custody, which is the thing I discarded above.** The
difference I am claiming — declared, time-boxed, with a published trigger and an
address anyone can watch — is real but it is a difference of degree. Somebody
will call Phase 1 custodial and they will not be wrong. The alternative is
either not launching until $25k is spent, or launching an unaudited vault, and
of the three I think this is the least bad. The owner may reasonably disagree.

---

## 5. Art — three original species

The name is the **species mark**, the way `Quantums` names a species rather than
a mechanism. Short, plural, sayable in "tengo tres ___". All three domains and
tickers below were checked on 2026-09-01: `.fun` availability via the registrar,
ticker collisions against Jupiter with a >$50k liquidity threshold.

A rule that applies to all three, and that I think is the best idea in this
document:

> **Two of the five traits are derived from the draw index, not rolled.**

Their traits are all rolls. Ours make the artwork a clock: a piece looks the way
it does partly *because of when it was drawn*. Nobody can accuse a later batch of
being worse art, because the curve is published before draw 1 and it is the same
curve for everyone. And it gives the collection an ending that means something.

All 4,000 are pre-generated and uploaded to Arweave via Irys **before the first
draw**, with the full manifest hash published. Rarity tables published at the
same time. Rarity is cosmetic; every piece redeems for the same share.

### Concept A — **Cinders** · `cinders.fun` ✓ $1.99 · `$CINDER` free ← recommended

**What they are.** Small charred creatures: a lump of burnt matter that never
quite went out. Squat, ashy, with a live ember glowing through a crack in the
crust. They are what is left after a fire that decided to keep going.

**The 32px signature.** A dark irregular silhouette with **one bright seam**
burning through it. At thumbnail size you read a black shape and a glowing
crack — nothing else. It is the opposite of a circular eye mark in every way
that matters: irregular not round, dark not bright, one asymmetric line not a
concentric target.

**Traits.**
| Axis | Rolled or derived | Values |
|---|---|---|
| Ash — body material | rolled | charcoal, bone, slag, salt, obsidian |
| Seam — the crack pattern | rolled | hairline, fork, lattice, shatter, ring |
| Crust — surface | rolled | soot, glassed, mossed, frosted, gilded |
| **Ember — glow intensity** | **derived from draw index** | brightest at piece 1, nearly out at 4,000 |
| Set — what it rests in | rolled | ash bed, grate, ice, water, nothing |

**Why I recommend it.** Best thumbnail read of the three. The register — dark,
mineral, quiet — is uncrowded on Solana, where the field is animals and
cartoons. And the ember curve does real work: the collection visibly burns down
over 166 days, so the completion date is a thing you can see coming.

The species and the burn-to-redeem mechanic agree without the name describing
the mechanic. You burn a Cinder to claim it. That is resonance, not a
description.

### Concept B — **Sprigs** · `sprigs.fun` ✓ $1.99 · `$SPRIG` free

**What they are.** A two-leaf seedling that has decided it is a person: a stem,
a pair of leaves, and the seed husk still stuck on its head like a hat it has
not worked out how to remove.

**The 32px signature.** The **two-leaf V over a dark clump** — an instantly
legible plant silhouette that survives any amount of downscaling.

**Traits.** Leaf (shape and count) · Stem (curve and posture) · Vessel (pot,
crack in concrete, bare soil, glass, nothing) · **Growth (derived: barely
through the soil at piece 1, full leaf at 4,000)** · **Husk (derived: the seed
cap is still on early and shed late — the rare early ones are the ones that shed
it anyway)**.

**The honest downside.** Cute plant NFTs are a crowded genre and this one would
be carried entirely by the mechanism, not the art. It is the warmest and most
approachable of the three, which is worth something; it is also the most
forgettable.

### Concept C — **Grubs** · `grubs.fun` ✓ $1.99 · `$GRUB` free

**What they are.** Fat segmented larvae with small faces, permanently
mid-pupation, wearing whatever they last crawled through.

**The 32px signature.** The **fat comma silhouette with visible segment
ridges**. Zero overlap with an eye, a plant, or a rock, and the ridges give it
texture that survives at small sizes where a smooth shape goes to mush.

**Traits.** Segments (count and ridge style) · Carapace (colour and finish) ·
Bristles · Encrustation (soil, pollen, gold leaf, frost, tar) · **Pupation
(derived: the last pieces are visibly about to become something)**.

**The strongest single hook of the three.** The collection ends with 4,000
creatures on the edge of a transformation that has no sequel and never will.
That gives the completion date a meaning past arithmetic, and it is the kind of
thing people write threads about.

**The risk:** grubs are ugly on purpose, and "tengo tres Grubs" is a harder sell
than "tengo tres Cinders". High ceiling, lower floor.

### Not verified for any of them

Trademark and existing-collection collision. Three names against three
registrars is a ten-minute check but it is not one I have run, and it should be
run before money is spent on a domain.

### Pipeline

Deterministic layered composition from `(draw_index, trait_seed)`, rendered to
PNG at two sizes plus an SVG master. Rolled traits come from a seed published in
advance; derived traits are pure functions of the index. Metadata and images to
Arweave via Irys before draw 1, manifest hash published. **Irys cost is not
verified** — estimated well under $100 for ~4,000 assets, but it is an estimate.

---

## 6. Bot and page

**Every hour, on the hour**, one post: the piece, its number, its traits, the
winner (truncated), and the reserve — in PUMP first, USD second. One image, no
thread, no emoji storm. The point is the metronome: 4,000 posts, exactly on the
hour, is itself the marketing.

The bot posts only what it has read back from the chain (CLAUDE.md: money
verdicts are read off the chain). If the draw did not settle, it says the draw
did not settle. A bot that ever posts a winner that did not win is a bot nobody
believes again.

**Page.** Next + Neon + Vercel, identical to nftraffle.
- Next draw countdown, and the number of the piece it will issue.
- Reserve: PUMP as the headline, USD secondary with its slot, and the risk
  sentence on the same screen.
- Redeemable per piece, in PUMP.
- Your odds — connect a wallet, read your share of eligible supply live.
- **Verify**: for any draw, the slot, the snapshot root, the randomness account
  and its fulfilled value, the winner, and the arithmetic, laid out so a stranger
  can recompute it. Plus the command to rebuild the snapshot from an archival
  RPC and check the root. This page is the product's honesty and it gets built
  in the first batch, not the last.
- Gallery, filterable by trait, with rarity published.
- Contracts: program, reserve PDA, collection, pool, token — all linked to an
  explorer, all labelled verified or not, truthfully.

---

## 7. Economics — the debate

The owner relayed a proposal: 5% royalty split 3/2 reserve/creator, a 1–2% SOL
redemption fee, a ~2% creator allocation that composes in the draw, and a paid
genesis of the first N. **I disagree with most of it, and the disagreement is
mostly not about the numbers.**

### Where it goes wrong

**1. The NFT royalty is not a revenue line on Solana. This is the big one.**

Metaplex Core's Royalties plugin, per the docs read 2026-09-01: RuleSets
"control which programs can transfer Assets with royalties", and **"Royalty
collection/distribution is handled by marketplaces, not the Core program."**
`ruleSet: None` makes royalties advisory. The only hard enforcement is
`ProgramAllowList` — which enforces by refusing to let the asset trade anywhere
not on the list. In 2026 Magic Eden and Tensor both support Core and both make
creator royalties **buyer-optional** in the general case.

So the choice is: royalties that anyone can decline, or a collection that cannot
be traded on the two venues that matter. **A 5% royalty split 3/2 is a plan to
divide a number that will mostly be zero.**

This is precisely why Quantums does not fund its reserve from NFT royalties. It
funds it from a **2% fee on every trade of the fungible token**, which is not
optional because the AMM takes it before the swap settles.

**2. The creator allocation that composes in the draw is the first thing that
gets screenshotted, and correctly.** A creator who holds token weight is a
creator winning their own NFTs out of a draw they wrote, snapshotted, and
cranked. It does not matter that it is disclosed; it is indefensible on its face
and it hands every critic a one-image argument. Quantums has **zero** team
allocation, no presale, no vesting, and burns the LP rather than locking it —
and that is the bar this audience will measure against, because it is the
comparison they will actually make. **Hard no.**

**3. A percentage redemption fee needs a price oracle; a flat one does not.**
Charging 1–2% "of the payout" means valuing a PUMP payout on-chain, which means
an oracle, which means a dependency and an attack surface, for a fee worth
rounding-error money. Charge a **flat SOL fee** instead.

**4. The paid genesis is selling the only thing that is not for sale.** "You
cannot buy in at the mint" is the entire product. Selling the first N converts
the hook into a mint page with extra steps, for perhaps $20k–$50k. And it is
**unnecessary**, which is the part the proposal misses: in the token-weighted
design there is no genesis to sell, because the first piece goes to a token
holder who bought a token. The bootstrap is the token launch. There is nothing
to fund.

### What was not named

- **The fee on the token pool.** The whole revenue model. Not a supplement to
  the list — a replacement for it.
- **The 10% redemption haircut.** Quantums' cleverest mechanic and it was not in
  the list. It is not creator revenue — it stays in the reserve — but it is the
  thing that makes backing per piece rise on every exit, which is what makes
  holding rational.
- **The Mature-phase buyback.** After 4,000, they split the fee 1% reserve / 1%
  buyback-and-burn of their own token. That is a second revenue engine for the
  token side that costs nothing to build because it is the same fee stream.
- **The claim cap is load-bearing and theirs is slightly wrong.** Their
  `payout = min(share, reserve * 5%)` stops the first claimant walking off with
  an empty pot, and they say it is "dormant" after twenty pieces. But it is a
  cap on a *fraction*, so it stops binding as a function of live supply, not of
  time — and live supply falls when people burn. Ours should cap by **count**
  (no redemption until N pieces are live) which is a condition that cannot be
  gamed by burning.

### The recommended model

Pool: **our token / PUMP** on Meteora DAMM v2, static config index 15 —
**2% flat fee, `collectFeeMode: 1` (fees in token B = PUMP), no dynamic fee**,
config `HQ6vW45Kug23h2A4LkyUqB4UFfGx4LqY1uZLLfQemEjU`. Public config, any payer
can create the pool. Whole supply as liquidity in a **permanently locked
position** that still claims fees.

Meteora takes a fixed 20% protocol cut of the trading fee, so:

> **Net take = 2% × 80% = 1.6% of trade volume, arriving as PUMP, no swap.**

Split of that 1.6%:

| Phase | Reserve | Creator |
|---|---|---|
| **Minting** (under 4,000 issued) | **85%** | **15%** |
| **Mature** (4,000 issued) | **100%** *(or 50/50 reserve/buyback)* | **0%** |

**Why 85/15 and not 60/40.** Every basis point to the creator is subtracted from
a number printed on the front page. 15% of 1.6% is 0.24% of volume — small
enough that it does not visibly move backing per piece, large enough to fund 5.5
months of work. And **stepping to zero at 4,000** is worth more than the extra
points would be: it means the endgame is strictly better for holders than the
beginning, it is enforced by the same phase logic Quantums already validated,
and it converts "the creator takes a cut" into "the creator takes a cut *while
building it*", which is a sentence people accept.

**Does 3/2 kill the floor or kill the creator?** Neither, and that is the
problem with the question. 3/2 of a royalty that marketplaces make optional
kills *both*, because the number being split is near zero. The split that
matters is the split of the token fee, and there 60/40 would not kill the floor
either — it would just be greedy in a way this audience prices in immediately.
The binding constraint is not arithmetic, it is that the backing number is
public and permanent.

**Other creator revenue, in order of size:**
1. The 15% fee share. Everything else is a rounding error.
2. Flat SOL redemption fee, **0.05 SOL**, satisfying the portfolio's SOL-fee
   rule without touching the reserve — it is charged on top, not deducted.
   If 1,000 of 4,000 pieces are ever redeemed: 50 SOL ≈ $11k over years.
3. Token allocation: **zero**. Recommended.
4. Paid genesis: **zero**. Recommended.

### Projections

Effective take 1.6% of volume; reserve 85% of that; collection completes in
4,000 hours = **5.48 months**.

Real launches decay. The base case assumes volume **halves each month**, which
over 5.48 months totals ≈ **1.95× month-one volume**. The flat case is shown
only as an optimistic bound, not as a forecast.

**Decaying (the honest case):**

| | Month-1 volume | Total volume | Total fees | → Reserve | **Per piece** | → Creator |
|---|---|---|---|---|---|---|
| Flop | $2M | $3.9M | $62,400 | $53,040 | **$13.26** | $9,360 |
| Base | $20M | $39M | $624,000 | $530,400 | **$132.60** | $93,600 |
| Hit | $150M | $292.5M | $4,680,000 | $3,978,000 | **$994.50** | $702,000 |

**Flat volume (bound, not forecast):**

| | Monthly | Total volume | → Reserve | **Per piece** | → Creator |
|---|---|---|---|---|---|
| Flop | $2M | $11.0M | $149,056 | **$37.26** | $26,304 |
| Base | $20M | $109.6M | $1,490,560 | **$372.64** | $263,040 |
| Hit | $150M | $822M | $11,179,200 | **$2,794.80** | $1,972,800 |

Creator monthly, base decaying case: **$48k, $24k, $12k, $6k, $3k, $1.5k** —
front-loaded, which is honest about what this is. It is not an annuity.

**Three things these tables should be read with:**

1. **They are denominated in USD but paid in PUMP.** Every reserve figure moves
   with PUMP. A -60% PUMP drawdown makes the base case $53/piece, not $133.
2. **Backing per piece falls as the collection fills, structurally.** Quantums
   at hour 28 showed ~$3.5k of backing per live piece; filling to 4,000 at that
   level needs $700M of cumulative volume. Early holders are always
   over-backed and the number always comes down. Our page must show the
   *current* figure and never extrapolate it.
3. **High ceiling, low floor is right, but the floor is lower than "nothing".**
   In the flop case the reserve is $53k, redemption is live, and each piece
   redeems for about $13 — while the audit cost $25k. The project can complete
   successfully and still not repay its own setup. That is the actual downside
   and it should be on the table before a dollar is spent.

### The bootstrap that is both paid and honest

The owner asked whether there is a way to bootstrap that raises money *and*
respects "no mint". There is, and we do not need it — but for the record, the
version that would work is: **the token launch is the paid bootstrap.** People
pay for tokens; tokens pay the fee; the fee pays the reserve. Nobody buys a
piece and the hook survives intact. Any scheme that gives pieces to holders of
some other token (a snapshot of PUMP holders, say) raises nothing and buys
goodwill we would rather earn from the draws.

---

## 8. Stack, and what the owner has to provide

**Identical to nftraffle:** Next.js + Neon Postgres + Vercel, CryptoSandler
identity, worktree per batch, migrations numbered and never edited after
applying.

**Added for this project:** Anchor program + Squads multisig; Metaplex Core for
the collection; Meteora DAMM v2 for the pool; Switchboard On-Demand for
randomness; Helius for RPC, DAS and the snapshot reads; Irys for Arweave;
an X account and its API access.

**What the owner needs to decide or provide before batch one:**

| | Item | Note |
|---|---|---|
| 1 | **Species + name** | §5. Everything downstream is named from it: directory, repo, ticker, domain. |
| 2 | **Draw weighting: token or NFT** | §0. The largest single fork in the document. |
| 3 | **$25k for the audit, or the phased plan, or neither** | §4. |
| 4 | **Upgrade authority policy** | §4. Multisig+timelock vs renounce. One-way. |
| 5 | Pure PUMP vs USDC leg | §3. |
| 6 | Fee split and its step-down | §7. 85/15 → 0 proposed. |
| 7 | Domain purchase (~$2) | Under the project identity, never the personal one. |
| 8 | Squads multisig — three keys, custody plan | Who holds them and where. |
| 9 | Funding path for the LP and deploy costs | A chain link between wallets is permanent. CLAUDE.md, no-doxx guard. |
| 10 | X account + API tier | Hourly posting forever. |
| 11 | Helius, Vercel, Neon accounts | Project credentials only. |

---

## 9. Disagreements with the brief, stated rather than applied

1. **The draw is weighted by a fungible token, not by pieces.** The brief's
   premise about how Quantums bootstraps is wrong, and three parts of the design
   depend on it. §0.
2. **NFT royalties are not the revenue model and cannot be.** Marketplaces make
   them optional. §7.
3. **The upgrade authority should not be renounced at deploy.** PUMP's live
   transfer-hook authority can strand the reserve permanently. §4.
4. **No creator token allocation, and absolutely none that composes in the
   draw.** §7.
5. **No paid genesis.** It sells the hook and it is not needed. §7.
6. **No USDC leg**, because it is what forces the swap the design otherwise
   avoids. §3.
7. **Flat SOL redemption fee, not a percentage** — a percentage needs an oracle.
   §7.
8. **Not verifiable-by-construction, and we should not claim it is.** The
   snapshot is recomputable, not trustless. §2.
9. **Process:** the brainstorming skill asks for questions one at a time before
   a design. The owner asked for a report with the questions at the end, and I
   followed the owner. Noted so it is a choice and not a lapse.

## 10. Open questions

- **Q1 — Upgrade authority.** Multisig + 72h timelock (I recommend, §4) or
  renounce at deploy? Renouncing is cleaner to sell and risks a permanently
  stranded reserve. This is one-way and it is the owner's.
- **Q2 — Audit funding.** $25k up front, the phased plan with declared temporary
  custody, or do not ship redemption? §4.
- **Q3 — Launchpad vs vault simplicity.** Launch the token on pump.fun (best
  legitimacy, pairs against SOL, needs a swap) or a direct token/PUMP DAMM v2
  pool (no swap, smaller program, less distribution)? §3e.
- **Q4 — Species.** Cinders, Sprigs or Grubs. §5.
- **Q5 — Mature phase endgame.** After 4,000: 100% of the fee to the reserve, or
  50/50 reserve and buyback-and-burn of our token as Quantums does? The second
  gives the token a reason to exist after the collection ends. §7.
- **Q6 — Redemption cap.** Cap by live-piece count (I recommend) or by fraction
  of reserve as theirs does? §7.
- **Q7 — The sentence about the floor.** The exact copy for "the floor is worth
  whatever PUMP is worth" is a promise the moment it is published. It gets
  written once, when asked for explicitly. §3b, and CLAUDE.md "decisions with a
  door".
