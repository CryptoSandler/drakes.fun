# Illustrator brief — Drakes

A brief for a paid, pseudonymous commission. Everything here is deliverable
scope; nothing here is negotiable art direction dressed as a suggestion.

**No wordmark, no lettering, no logo anywhere in the deliverables** — not on a
background, not on a relic, not in a corner. And **no reference to any real
person.** The ticker `$DRAKE` already collides with a famous musician's
memecoins (`docs/decisions.md` D1); the art must never make that association
look intentional.

---

## What a Drake is

**A Drake is a dragon asleep on its hoard.** Not questing for treasure —
**it already has it.** The whole collection has **one fixed posture: already
made it.** Something that got there, is not performing about it, and is
sleeping on the proof.

They are not cute. They are not noble. They are not menacing. **They are
settled.** Every ambiguity below resolves toward *already made it*, never
toward *fierce*, *cute*, *tragic*, or *heroic*.

### The register

**Black dragon, street, a chain.** This is the part that decides everything
else, and it is not high fantasy:

- **Black.** The body is black — the axis is the *finish* of that black, never
  a colour swap.
- **Street.** The posture, the attitude and the jewellery come from a city, not
  a cave. A chain is not an accessory here, it is the character.
- **A hoard, not a lair.** The gold is under the creature, in frame, and it is
  the second thing you read after the silhouette.

**Explicitly not wanted:** high-fantasy dragons, castles, knights, wings spread
in flight, fire breath, medieval anything, cel-shaded flats, thick uniform
outlines, neon cyberpunk, glossy 3D, chrome, anything that reads as a Blender
default.

## World and hand before render

The reference points are **DeGods**, **Bored Ape Yacht Club**, and **Pudgy
Penguins**, and what is being referenced is craft, not style:

- **Painted volume.** Form built with light and shadow, not flat vector fills
  with an outline. A Drake has weight and a surface you could touch.
- **A hand.** Visible authorship — brush decisions, asymmetry, texture that
  varies. Not a plugin, not a gradient mesh, not AI-smooth.
- **A world implied, never explained.** BAYC's clubhouse and Pudgy's ice exist
  off-frame. Ours is a city that already paid out, and it is never drawn — only
  the chain, the posture and the gold say it is there.

A **mood reference image** supplied by the owner lives in
`docs/references/hero-mood.*`. It is an **AI-generated mood reference, not an
asset and not a layer** — it exists to settle the register in one look, and
nothing in it may be traced, composited or delivered.

## Composition — fixed for all 4,000

- **Three-quarter bust.** Same crop, same camera height, same distance, every
  piece. The character turns slightly; nothing else moves.
- **Muted background.** A single low-saturation field with a soft vignette. It
  recedes and never competes. It is not a trait axis and it is never a scene.
- **Square, 2048×2048** master. Legible at **32×32** is a hard requirement: at
  thumbnail size a Drake must read as *a dark irregular silhouette with one
  bright seam through it, sitting on something that glints.*
- One warm light source: **the gold**, from below, bouncing up onto the
  underside of the jaw and the chest. Ambient fill is cold and weak, so the
  hoard is the only warm thing in frame — and the creature is lit by its own
  wealth, which is the entire idea.

## The avatar constraint — read this before the composition above

**These pieces are avatars first.** The square master is a delivery format. The
surfaces that decide whether the work succeeded are a **48 px circle** in a
timeline and a **~130 px circle** on a profile, seen against a black chrome and
a white one. A piece that is beautiful at 2048 and a grey smudge at 48 has
failed at the only size most people will ever see it.

A circle inscribed in the square **throws away 21.5% of the area, all of it in
the corners.** So:

1. **Face and eyes centred in the frame** — centred in the circle that
   survives, not in the bust.
2. **Nothing load-bearing in the corners.** Not the relic, not the seam's
   terminus, not a silhouette read.
3. **Silhouette and expression legible at 48 px**, under a circular crop.
4. **The relic must survive the crop.** A relic that reads only because of a
   corner does not exist for the holder using the piece as an avatar.
5. **The chain is the exception that proves the rule.** It sits high on the
   chest, inside the safe circle. A chain that the crop cuts in half is a
   rejected chain.
6. **The background field carries its own job.** The tile is opaque, so nothing
   composites onto X directly — which means two contrast questions, not one:
   the **black body against its own field**, and the **field against both
   chromes**. A very dark field puts a black dragon on black on a dark theme
   and the avatar disappears. One mid-luminance value clears both.

**How it is checked.** Every delivery is run through a render guard that masks
each composite to a circle at 48 px and 130 px, over `#000` and `#FFF`, and
measures: face inside the safe circle, body-versus-field contrast, field
against both chromes, whether the seam survives the downscale, and how much of
the relic the crop keeps. **This runs at every milestone, before that milestone
is accepted** — not once at the end.

The guard measures the masked, downscaled image, and no threshold in it may be
one that a painted piece can only pass by flattening. If the guard and this
brief ever disagree, this brief wins: the painted volume and the visible hand
are the thing being bought.

**Deliverable that makes this possible: a registered face mask** — one flat
mask per body marking the face and eyes — so the check is geometry, not opinion.

## The five traits

Three are rolled. **Two are functions of the piece's index** and their curves
are published, rendered as a full 4,000-wide strip, before the first piece
exists. The illustrator delivers *endpoints and steps*, not 4,000 drawings —
composition is programmatic.

### Rolled

**1 · Scale** — the finish of the black. 5 values, each a full painted body.
`jet` · `oil-slick` · `gunmetal` · `onyx` · `bronze-black`

**2 · Seam** — the vein of gold running through the scales. 5 base values plus
**2 reserved for epic**, delivered as overlays registered to the body. This is
the 32px signature, so each must be distinguishable as a *shape* at thumbnail
size.
`hairline` · `fork` · `lattice` · `shatter` · `ring` · + 2 epic-only

**3 · Relic** — the one thing it keeps out of the hoard, worn or held. ~24
values including `none`. Small, never larger than the head, painted with the
same weight as the body — a relic that looks pasted on is a rejected relic.
**The list is partitioned by tier** (see *The ladder*), not a flat bag.

> a cuban link, heavy · a single cracked tooth on a cord · a bent crown, worn
> low · a bezel watch, stopped · a signet ring too big for the claw · a coin
> pressed into a scale · a snapped chain, still knotted · a grill, one tooth
> gold · a key on a loop · a bottle cap · a dice, loaded · a pendant with the
> face rubbed off · a cigar band · a nameplate with no name · a broken clasp ·
> a padlock, open · a ring of keys to nothing · a chipped medallion ·
> a hoop earring · a torn ticket stub · a bent spoon · a pocket watch chain ·
> a lighter, empty · `none`

`none` is the rare state, not the default: roughly 3% carry nothing, and those
are the bare Drakes.

### Derived from the index — the hoard runs down as the collection fills

**4 · Hoard** — how much it sleeps on. **12 delivered states**, from a mountain
of gold (piece 1) to **a single coin** (piece 4,000). Monotonic. Affects how
much gold is in frame, how far the warm bounce light reaches, and how high the
creature sits.

**5 · Slumber** — how deeply it is asleep. **8 delivered states**, from an eye
half open and alert (piece 1) to fully under (piece 4,000). Monotonic. Reads in
the eyelid, the jaw and how much the body has settled into the pile.

Together these read as one continuous descent across 166 days. Piece 1 sleeps
shallow on a mountain. Piece 4,000 sleeps deep on one coin. **Nobody can claim
a later batch is worse art, because the curve is public before the first piece
is issued.**

**And the curve is telling the truth.** Backing per piece genuinely falls as the
collection fills — the hoard grows, but it is split among more Drakes, so each
piece is issued against a smaller share than the one before it
(`spec-round-2026-09-01.md` §7). The art is not decorating the mechanism, it is
drawing it.

## The ladder — rarity has to be *seen*

Every piece sits at one of five levels, readable **in a timeline, at 48 px,
without opening the piece**:

| Level | Count of 4,000 |
|---|---|
| Common | 2,400 |
| Uncommon | 1,000 |
| Rare | 480 |
| Epic | 110 |
| One-of-one | 10 |

### The rule that decides how the level is signalled

> **The index owns the hoard. The level owns the form.**

**Hoard and Slumber already belong to the index.** A level signalled by *how
much gold is in frame* would be a level that reads as a *date* — an epic at
piece 3,900 would look like a common, correctly, because it has almost no
hoard. So quantity of gold is not available, and neither is the background: it
stays the single low-saturation field that recedes and never competes.

That leaves the two things that survive a 48 px circle anyway:

- **Seam geometry.** Each level's vein has a form of its own, distinguishable
  as a *shape* in silhouette. **Epic gets two forms nobody else has.**
- **Relic pool.** Each level has its own pool. **Epic relics change the
  silhouette** — something that alters the outline, not a detail inside it.
  One-of-ones are designed individually and owe nothing to the pools.

### What we need delivered per level

Not a flat list. For each of Common, Uncommon, Rare and Epic: **the seam form,
the relic pool, and the surface state** that identifies it — where "state" means
a treatment of the scales or the seam's edge that holds up in silhouette, never
more gold and never a brighter light.

**The acceptance test for the whole ladder** is one sheet: **the epic seam forms
rendered at the smallest hoard state, masked to a 48 px circle.** If an epic
still reads as an epic there, the ladder works. If it does not, the ladder is
decoration in the only place people look at it.

**Rarity is cosmetic and stays cosmetic.** Every piece redeems for exactly the
same share of the hoard regardless of level — a one-of-one and the plainest
common are worth the same to the protocol. This is stated so the art is never
asked to carry an economic signal it does not have.

## Deliverables

| | Item | Count |
|---|---|---|
| 1 | Character sheet — front, ¾, profile, a 32×32 silhouette test, **and a 48 px circular-crop test over `#000` and `#FFF`** | 1 |
| 2 | Scale bodies, fully painted, ¾ bust, registered | 5 |
| 3 | Seam overlays, registered to the bodies — **5 base + 2 epic-exclusive** | **7** |
| 4 | Relics, painted, registered, with shadow, **partitioned into per-level pools** | 24 |
| 5 | Hoard states — gold volume + bounce light, as layers | 12 |
| 6 | Slumber states — eyelid, jaw, how far the body has settled | 8 |
| 7 | Backgrounds | 3 |
| 8 | Ten one-of-ones, designed individually | 10 |
| 9 | **Face masks** — flat registered mask of face and eyes, one per body | **5** |

**Format:** layered PSD *and* flattened PNG per layer, 2048×2048, transparent
where it must composite, exact pixel registration across every layer. A layer
that is two pixels off ruins 4,000 images at once, so registration is checked on
delivery with a diff, not by eye.

**Rights:** full assignment, work for hire, worldwide, irrevocable, including
the right to sublicense. The buyer is a pseudonymous entity.

## Cost and hiring

**Budget: US$3,500–5,000**, paid from the creator's 15% fee share, in three
milestones: character sheet approved (30%) · bodies + seams (40%) · relics,
states and one-of-ones (30%). **Add roughly 10% for the ladder and the avatar
work** — two epic seams, the per-level relic pools, and the face masks.

**Every milestone is accepted only after the render guard passes on what was
delivered** — the circular crop at 48 px and 130 px over both chromes. The guard
runs on the layers, and a milestone that fails it is reworked before it is paid.

### Milestone 2 has one extra step, and it is a human one

**Milestone 2 is not accepted until the buyer has signed off on a contact
sheet: every seam form, epic included, rendered at the smallest hoard state,
masked to a 48 px circle, over both chromes.** The machine measures contrast and
geometry; whether an epic still *reads as* an epic there is a judgement, made by
a person looking at the sheet, before the largest payment of the three.

**This changes one delivery order.** The hoard states are milestone 3 work, but
the sheet cannot exist without the smallest one — so **the smallest hoard state
ships with milestone 2, alongside the seams.** One state early, out of twelve.
It is the state the whole ladder has to survive: at the rich end everything is
legible, and no decision is being made there.

**Market** for a generative PFP layer set of this scope: **$2,000–6,000** for a
competent illustrator, **$8,000–20,000** for someone whose portfolio sits
alongside the reference collections. The recommended budget buys the top of the
first band, which is the right trade — the mechanism is the product, and the art
has to be good enough not to be the reason people pass.

**Where, pseudonymously:** X DMs to artists already working under handles in
this space (most are, and they will not ask who you are); ArtStation and Cara
open-for-commission listings; Behance. Pay in SOL or USDC.

**Two things to be honest about with yourself:**

1. **A contract signed by a pseudonym is weakly enforceable.** The practical
   protection is milestone escrow and never paying ahead of delivery — not the
   document. Write the document anyway; it sets expectations even when it cannot
   be litigated.
2. **Paying an illustrator creates a link.** They will know a wallet, a
   communication channel, and a project. That is the largest deliberate
   deanonymisation surface in the whole build (CLAUDE.md, the no-doxx guard).
   Use a channel and a wallet that exist only for this, and decide that before
   the first message, not after.
