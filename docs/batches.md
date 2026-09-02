# Batch plan

One worktree and one branch per batch (CLAUDE.md). The branch without migrations
merges first; the one with them rebases on top and re-runs. Every batch names
who calls what it builds.

Batches marked **⛔** must not start before the owner approves `DESIGN.md`.

---

## B0 — Scaffolding, and the copy test first

TypeScript, vitest, ESLint, CI — and the copy lexicon guard.

**The copy lexicon test ships in B0, before there is any copy**, so the rule is
never retrofitted against text somebody is attached to. `DESIGN.md` §6. It
scans whole file text, not string literals, because the ban covers identifiers;
its control is a fixture corpus plus an absolute assertion that the glob
resolved to a file we know exists.

**Split out of B0, deliberately:** Next + Neon + Vercel, the migration runner,
the advisory lock and the `disposable_database` stamp. A migration runner that
has never been run against a Postgres instance is unverified code, and there is
no project database yet. It lands with the first migration that needs it — B5
— against its own database, and B0 stays a batch with no migrations, which is
the one that merges first.

Caller: CI, on every push.
**Depends on:** nothing. **Blocks:** everything.

## B1 — Art pipeline, the published curve, the ladder, and the avatar guard

Deterministic layered composition from `(index, trait_seed)`. Rolled traits from
a seed published in advance; **Hoard and Slumber are pure functions of the
index** and their curves render as a 4,000-wide strip that goes public before
issuance 1 (`docs/decisions.md` D9, D18).

Runs against placeholder layers so the pipeline is finished and tested before
the illustrator delivers. Rarity table generated, not hand-written.

**The tier allocation** (D13): exact counts stratified in blocks of 400 — every
block holds exactly 11 epics and exactly 1 one-of-one, by construction, so the
"no bias toward early pieces" property is arithmetic and its test cannot flake.
Order inside a block comes from the published seed. The full index→tier table
is an output of this batch and goes into B2's manifest.

**The avatar guard** (D12, `DESIGN.md` §9.2): masks every composite to a circle
at 48 px and 130 px over `#000` and `#FFF` and asserts face-inside-safe-circle,
body-versus-field contrast, field-versus-both-chromes, seam survival, and relic
retention after the crop.

**Two tests, because they catch different failures:**
1. *Distribution* — per-block tier counts are exact. Catches a biased ladder.
2. *Legibility* — the epic seam forms, rendered at the **smallest** hoard state,
   masked to 48 px, still separate from the common forms. Catches the failure
   the distribution test passes straight through: unbiased counts with an epic
   nobody can see (`DESIGN.md` §9.4).

Caller: a one-shot script, run once, whose output is uploaded in B2 — **and the
milestone acceptance step for the illustrator, which runs the avatar guard on
each delivery before it is paid** (`docs/illustrator-brief.md`).
**Depends on:** B0. **Parallel with:** the illustrator brief.

## B2 — Arweave upload and manifest

4,000 images plus metadata to Arweave via Irys. **~$8 at 2 GB** (verified,
`references.md`). Manifest hash published before anything mints. **The manifest
carries the full index→tier table** (D13), so the allocation is fixed and
public before anyone knows who will be issued anything.

Verification is behavioural, not a spot check: fetch a random 5% back from
Arweave gateways and diff against local bytes.

**Depends on:** B1 + final art.

## B3 — ~~Mint, pool, liquidity~~ — **RETIRED 2026-09-02 by D30**

Three things in order, each irreversible:

1. **Grind the `$DRAKES` mint keypair until its pubkey sorts below
   `pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn`.** `DESIGN.md` T10. Getting
   this backwards inverts the entire fee design and cannot be fixed after the
   pool exists.
2. Create the mint, whole supply, mint authority and freeze authority revoked.
3. Create the `$DRAKES`/`$PUMP` pool on config
   `HQ6vW45Kug23h2A4LkyUqB4UFfGx4LqY1uZLLfQemEjU`, seed all liquidity,
   permanently lock the position. **One bundle**, before the mint is public
   (T10).

Full devnet rehearsal first, including a fee claim that lands in the PUMP-side
token, asserted rather than eyeballed.

**⛔ RETIRED IN FULL, 2026-09-02 (D30).** `$DRAKES` launches on pump.fun's own
bonding curve: there is no pool of ours, no liquidity of ours to seed, and no
position of ours to lock. **All three steps above are dead**, including the one
this document called unfixable — a mint has no sort order to satisfy when there
is no pair of ours for it to sort in. The CI assertion that pinned it was
deleted in b22 and `scripts/check-mint-order.ts` became
`scripts/check-ground-mint.ts`, an identity check.

**What replaced it** is C3 in `docs/launch-runbook.md`: one `create_v2` with the
Squads vault as `creator`, rehearsed end to end on devnet
(`docs/pumpfun-create-devnet.md`). It is still irreversible, for a different
reason — `set_creator` is gated on an authority that belongs to pump.fun.

**Kept:** the ground mint `1212YJcDwzgLXxmwbtmkYaEB53p6y958cn2tENt3C3dM` as an
identity pin, and the money-path findings from `docs/moneypath-devnet.md`, which
were about Squads and Jupiter rather than about Meteora.

**Depends on:** B0. **Gate:** owner signs each mainnet transaction.

## B4 — Phase 1 program: issuance ⛔

`initialize`, `request_issuance`, `settle_issuance`. Switchboard On-Demand.
**Holds no value** — that is what makes it deployable before the audit (D8).

Every instruction driven from an adversarial key in tests, to prove the crank
key can be public (T4).

Rehearsal is behavioural and is the acceptance criterion: **48 consecutive
hourly issuances on devnet with no drift, including one forced skip from
unfulfilled randomness and one from zero eligible supply** (T11). A single green
run proves nothing about an hourly job.

**Depends on:** B3.

## B5 — Snapshot, Merkle, and the verify page

The snapshot builder, domain-separated Merkle, the on-chain root commitment, and
the public rebuild script.

**The verify page ships here, not last.** It is the product's honesty and it is
the reason to trust every other number on the site.

**This batch brings the database with it** — Next + Neon + Vercel, the
migration runner, the advisory lock and the `disposable_database` stamp, split
out of B0 because they were unverifiable without a database. It is therefore
the first batch with migrations, and it rebases on top of anything without
them.

Caller: `request_issuance` consumes the root; the cranker calls the builder; the
page and the published script both call the rebuilder.
**Depends on:** B4.

**Landed 2026-09-01, in three branches merged in this order** (the two without
migrations first, then the one with them, per CLAUDE.md):

1. `b5-verify-from-chain` — the permutation is rebuilt from `IssuanceSettled`
   on chain and the published set became a cache that is reconciled (D21). The
   public README is the verification page in text form; the rendered page is
   still B6.
2. `b5-crank-host` — the cranker became a supervised process with its own
   genesis-anchored scheduler, an alert channel, and the hosting evaluation
   (D22, `docs/crank-hosting.md`).
3. `b5-site` — Next + Neon + Vercel, the migration runner, the advisory lock,
   the `disposable_database` stamp, the event runner, and a minimal front page
   that reads the chain and not the database (D23).

**Closed 2026-09-02.** The rendered `/verify` page went to production with the
site (D29, D31). The **per-issuance permalink `/verify/<n>`** and its proof
widget landed in b22, because B7's post has to link somewhere that shows the
reader the recipient, the piece and the proof it was derived rather than chosen.
The reconciliation and the replay remain commands.

## B6 — Site

Countdown and the index of the piece it will issue; reserve in `$PUMP` with USD
secondary and its slot; redeemable per piece; your share of eligible supply;
gallery with published rarity, **and the sentence that rarity is cosmetic on the
same screen as the ladder** (D13); contracts, labelled verified truthfully; and
the Phase 1 temporary-custody disclosure with its trigger and deadline (D8).

**Depends on:** B5.

## B7 — The X bot

One post per hour: the piece, the recipient, the slot it was drawn from, and the
link that recomputes it. Posts only what it read back from the chain. If the
issuance did not settle, it says so.

**Landed 2026-09-02 in b22.** `scripts/xbot.ts`, hourly on the crank host
(`docs/crank-hosting.md`), over `src/lib/bot/`. Full doc: `docs/xbot.md`.

**Two things the batch plan said and the build did not.** *Traits* are not in
the post and neither is *the reserve*: traits are fixed by a manifest that is
not committed yet, so a tier in a post would be a claim a reader could check and
find false (D13), and the reserve is the hoard, which D31 keeps out of every
headline. The tier appears on its own the day the manifest hash on chain matches
the file we hold — the gate is written and tested, and it is closed.

**Rehearsed over the whole devnet history**: 303 issuances, in hour order, with
the 3 gaps skipped and the 1 unsettled hour saying so.

**Depends on:** B4.

## B8 — Mainnet launch, Phase 1 ⛔

Genesis instant set, cranker live, bot live, curve and manifest published,
audit deadline published.

## B9 — Phase 2 program: vault and redemption ⛔

`claim_fees` and `redeem`, the reserve PDA, hook-aware `transfer_checked` (T1).
Written, then audited (~US$25k from the creator's 15%), then deployed. The
multisig moves the accumulated `$PUMP` in and hands over the LP position.
Upgrade authority → Squads 2-of-3 + 72h timelock (D7).

**Gate:** the audit report is public before redemption opens.

## B10 — Monitors

The hourly `$PUMP` `transferHook.programId` read (T1); the pending-upgrade
surface on the front page (T3); issuance-drift and skip alerting.

Small, and listed separately because it is the batch that gets skipped. T1's
detection is worthless if nobody built the reader.
