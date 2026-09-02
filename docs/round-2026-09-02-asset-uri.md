# Adversarial round: the asset's name and URI move on chain

*Asked for by the owner, 2026-09-02, after B2 found that nothing binds a minted
asset to the piece it represents. No code was written before this document.*

**The proposal.** `settle_issuance` stops taking `name` and `uri` from the
caller and builds them itself from a `base_uri` written once by `initialize`:
`uri = base_uri + piece_id + ".json"`.

---

## 1. The strongest case against

### 1.1 It puts the product's name in the most permanent place there is

`name = "Drake #" + piece_id` compiled into the program means **the species name
is in the IDL, on chain, forever** — and after D8's revocation, unfixable.
`CLAUDE.md` is explicit: no wordmark in an image, no name in a database value,
no ticker in a constant, *"not because the name might change, but because a name
scattered through a codebase is a name nobody can ever change."* An immutable
program is the worst instance of that rule this project could produce.

**This argument wins, and it changes the design rather than killing it.** The
prefix is **data**, written by `initialize` beside the base URI, so the program
carries no name at all. Both strings are the owner's to set once, in the same
transaction that fixes the manifest hash and the genesis instant.

### 1.2 The security gain is close to zero, and saying otherwise would be a lie

What a hostile crank key can do today is mint an asset whose name and image are
wrong. It **cannot** change the recipient, which piece leaves the survivor set,
the eligible supply, or where a single lamport goes — the program decides all
four, and B4's tests drive every instruction from an adversarial key to prove it.
So this is not a hole in the money path, and a round that sold it as one would be
selling a program change on a fear it had invented.

### 1.3 There is a version of this that needs no program change at all

`docs/upload.md` already records it: the site serves `/a/<hour>`, reads the chain,
and answers with the metadata of whatever piece that hour issued. Zero Anchor,
zero redeploy, zero new rehearsal, and it produces a **correct** URI rather than
a merely fixed one.

**Its cost is the reason it loses**: the asset's metadata would be served by us.
A wallet resolving a Drake would depend on our origin staying up and staying
honest, forever, for an asset whose whole claim is that the chain is the
evidence. That is the one centralisation this project has refused everywhere else
— `/verify` reads the chain, the reserve is read at a slot, a payout is derived
from a burn. Routing every asset's identity through our server contradicts all of
it.

### 1.4 It spends the upgrade window on cosmetics

D8 keeps Phase 1 upgradeable precisely because it holds nothing. Every upgrade is
also a chance to introduce a defect into a program that is about to hold value,
and this one buys metadata correctness.

**The counter is the deadline.** The window closes at revocation and does not
reopen. A defect that can only be fixed by an upgrade should be fixed while
upgrades exist, and *"the asset in a holder's wallet names a piece that is still
in the collection"* is a defect that is permanent per asset, not per program.

## 2. The collision with the real code

**What the repository already knew that the proposal did not:**

- **`Config` has 256 unused bytes and they are exactly where the new fields
  go.** `Config::SIZE` reserves `32 * MAX_EXCLUDED` = 256 bytes for `excluded`,
  the rig runs with **zero** exclusions, and Borsh writes a 4-byte length and
  stops. Read from the devnet config on 2026-09-02: 489 bytes, of which the 256
  after `manifest_hash` are **all zero**. Two `String`s appended after
  `manifest_hash` therefore deserialize on the *existing* account as empty
  strings — the upgraded program can read the rig's current config with no
  realloc and no migration instruction.
- **Every off-chain parser reads `Config` by offset** — `src/lib/site/collection.ts`,
  `scripts/crank-loop.ts`, `scripts/xbot.ts`. `manifest_hash` already sits at a
  dynamic offset behind a `Vec`, so appending *after* it leaves all three
  untouched. Appending anywhere else would break the site, the cranker and the
  bot at once.
- **`SettleParams` gets smaller, not bigger.** `src/lib/crank/issue.ts` hand-encodes
  the borsh for settle; dropping two `String`s shortens the transaction. The
  `assetName` injection point disappears with them, and with it the last place
  the crank could name a piece.
- **The one-config-per-program rule decides the rehearsal shape.** The config PDA
  seed is `[CONFIG_SEED]` with no discriminator, so a program has exactly one
  config for its whole life and `initialize` cannot run twice. The rig's config
  was written before these fields existed and will read them as empty forever.

**So the rehearsal is two deployments and they prove different things:**

1. **Upgrade the existing devnet program through the Squads 2-of-3.** Proves the
   upgrade path itself — the same ceremony C1b rehearsed, now carrying a real
   change — and proves the **guard**: against a config whose `base_uri` is empty,
   `settle_issuance` must refuse to mint rather than mint `.json` with nothing in
   front of it.
2. **A second devnet program with a fresh `initialize`** carrying a real
   `base_uri`. Proves the happy path: the asset minted at hour N names exactly the
   piece the event emitted.

Neither alone is the rehearsal. The first without the second proves a refusal;
the second without the first skips the ceremony this change has to survive.

## 3. What is recommended

**Do it, with the name as data.** Three fields' worth of change:

    initialize:  base_uri: String, name_prefix: String   -- written once, with
                                                            the manifest hash
    settle:      name = name_prefix + piece_id
                 uri  = base_uri + {piece_id:04} + ".json"

**And require both non-empty at mint time.** A config that predates them refuses
to issue rather than minting a broken URI — which is the behaviour the existing
devnet rig will demonstrate the moment it is upgraded, and the reason the guard
is worth having rather than an abstraction.

**What this does not fix, stated so nobody reads it as fixed.** The URI is
correct by construction; whether the *bytes at that URI* are the right ones is
the manifest's job, and the manifest hash is what commits that (B2). The program
still cannot check the content of a URL, and no program can.

**Outcome, 2026-09-02.** Built, upgraded onto the devnet rig through the 2-of-3,
and rehearsed on both sides: the guard refuses against a config that predates the
fields, and a throwaway program proved the happy path 2 of 2. Recorded as **D32**.

**The honest summary:** this is a correctness change with a small security
by-product, taken now because the window closes at revocation and never reopens.
The version that needs no program change works and was rejected for one reason —
it would make our server the authority for what a Drake is.
