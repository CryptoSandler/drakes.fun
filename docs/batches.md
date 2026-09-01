# Batch plan

One worktree and one branch per batch (CLAUDE.md). The branch without migrations
merges first; the one with them rebases on top and re-runs. Every batch names
who calls what it builds.

Batches marked **⛔** must not start before the owner approves `DESIGN.md`.

---

## B0 — Scaffolding, and the copy test first

Next + Neon + Vercel skeleton, vitest with the advisory lock and the
`disposable_database` stamp, migration runner, ESLint, CI.

**The copy lexicon test ships in B0, before there is any copy**, so the rule is
never retrofitted against text somebody is attached to. `DESIGN.md` §6.

Caller: CI, on every push.
**Depends on:** nothing. **Blocks:** everything.

## B1 — Art pipeline and the published curve

Deterministic layered composition from `(index, trait_seed)`. Rolled traits from
a seed published in advance; **Ember and Settle are pure functions of the
index** and their curves render as a 4,000-wide strip that goes public before
issuance 1 (`docs/decisions.md` D9).

Runs against placeholder layers so the pipeline is finished and tested before
the illustrator delivers. Rarity table generated, not hand-written.

Caller: a one-shot script, run once, whose output is uploaded in B2.
**Depends on:** B0. **Parallel with:** the illustrator brief.

## B2 — Arweave upload and manifest

4,000 images plus metadata to Arweave via Irys. **~$8 at 2 GB** (verified,
`references.md`). Manifest hash published before anything mints.

Verification is behavioural, not a spot check: fetch a random 5% back from
Arweave gateways and diff against local bytes.

**Depends on:** B1 + final art.

## B3 — Mint, pool, liquidity ⛔

Three things in order, each irreversible:

1. **Grind the `$CINDER` mint keypair until its pubkey sorts below
   `pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn`.** `DESIGN.md` T10. Getting
   this backwards inverts the entire fee design and cannot be fixed after the
   pool exists.
2. Create the mint, whole supply, mint authority and freeze authority revoked.
3. Create the `$CINDER`/`$PUMP` pool on config
   `HQ6vW45Kug23h2A4LkyUqB4UFfGx4LqY1uZLLfQemEjU`, seed all liquidity,
   permanently lock the position. **One bundle**, before the mint is public
   (T10).

Full devnet rehearsal first, including a fee claim that lands in the PUMP-side
token, asserted rather than eyeballed.

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

Caller: `request_issuance` consumes the root; the cranker calls the builder; the
page and the published script both call the rebuilder.
**Depends on:** B4.

## B6 — Site

Countdown and the index of the piece it will issue; reserve in `$PUMP` with USD
secondary and its slot; redeemable per piece; your share of eligible supply;
gallery with published rarity; contracts, labelled verified truthfully; and the
Phase 1 temporary-custody disclosure with its trigger and deadline (D8).

**Depends on:** B5.

## B7 — The X bot

One post per hour: the piece, its index, its traits, the recipient, the reserve.
Posts only what it read back from the chain. If the issuance did not settle, it
says so.

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
