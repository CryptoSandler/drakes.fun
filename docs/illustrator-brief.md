# Illustrator brief — Cinders

A brief for a paid, pseudonymous commission. Everything here is deliverable
scope; nothing here is negotiable art direction dressed as a suggestion.

**The name is not final.** `Cinders` is a working name. **No wordmark, no
lettering and no logo anywhere in the deliverables** — not on a background, not
on a relic, not in a corner. The art must survive the name changing.

---

## What a Cinder is

**A Cinder is the ember of a dead memecoin.** A coin went to zero. Everyone
left. What is left in the ash is a small, hunched, charred creature with a core
that never quite went out, still carrying one object from the thing it used to
be.

They are not cute. They are not sad. **They are stubborn.** The whole collection
has **one fixed mood: banked heat.** Something that has already lost, is not
performing about it, and is still burning.

This is the emotional brief and it is the part that matters most. Every ambiguity
below resolves toward *stubborn*, never toward *cute*, *tragic*, *cool*, or
*menacing*.

## World and hand before render

The reference points are **DeGods**, **Bored Ape Yacht Club**, and **Pudgy
Penguins**, and what is being referenced is craft, not style:

- **Painted volume.** Form built with light and shadow, not flat vector fills
  with an outline. A Cinder has weight and a surface you could touch.
- **A hand.** Visible authorship — brush decisions, asymmetry, texture that
  varies. Not a plugin, not a gradient mesh, not AI-smooth.
- **A world implied, never explained.** BAYC's clubhouse and Pudgy's ice exist
  off-frame. Ours is an ash field after a fire, and it is never drawn — only the
  ash on the creature and the muted haze behind it say it is there.

**Explicitly not wanted:** cel-shaded flats, thick uniform outlines, neon
cyberpunk, glossy 3D render, chrome, anything that reads as a Blender default.

## Composition — fixed for all 4,000

- **Three-quarter bust.** Same crop, same camera height, same distance, every
  piece. The character turns slightly; nothing else moves.
- **Muted background.** A single low-saturation field with a soft vignette —
  smoke-grey, ash-warm, cold slate. It recedes and never competes. It is not a
  trait axis and it is never a scene.
- **Square, 2048×2048** master. Legible at **32×32** is a hard requirement, not
  an aspiration: at thumbnail size a Cinder must read as *a dark irregular
  silhouette with one bright seam burning through it*.
- One light source: **the creature's own core**, from inside the seam, lighting
  the underside of its own crust. Ambient fill is cold and weak, so the warm
  interior light is the only warm thing in frame.

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
3. **Silhouette and expression legible at 48 px.** Same requirement as the
   32×32 test above, now with a circular crop over it.
4. **The relic must survive the crop.** A relic that reads only because of a
   corner is a relic that does not exist for the holder using the piece as an
   avatar.
5. **The background field carries its own job.** The tile is opaque, so nothing
   composites onto X directly — which means there are two contrast questions,
   not one: the **body against its own field**, and the **field against both
   chromes**. A field chosen to look right on a dark theme and left to fend for
   itself on a light one is a rejected field. One mid-luminance value clears
   both; a very dark or very light one cannot.

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

**Deliverable that makes this possible: a registered face mask** — one
flat mask per body marking the face and eyes — so the check is geometry rather
than opinion.

## The five traits

Three are rolled. **Two are functions of the piece's index** and their curves
are published, rendered as a full 4,000-wide strip, before the first piece
exists. The illustrator delivers *endpoints and steps*, not 4,000 drawings —
composition is programmatic.

### Rolled

**1 · Ash** — the body material. 5 values, each a full painted body.
`charcoal` · `bone` · `slag` · `salt` · `obsidian`

**2 · Seam** — the crack the light comes through. 5 values, delivered as
overlays registered to the body. This is the 32px signature, so each must be
distinguishable as a *shape* at thumbnail size.
`hairline` · `fork` · `lattice` · `shatter` · `ring`

**3 · Relic** — the one object it kept from the coin it used to be. ~24 values
including `none`. Small, held or worn, never larger than the head. Painted with
the same weight as the body — a relic that looks pasted on is a rejected relic.
**The list is not flat: it is partitioned by tier** (see *The ladder* below),
and the brief asks for pools, not a bag.

> a snapped diamond hand · a bent laser eye, unlit · a scorched paper hand ·
> a stiff dead cat · a torn rug fringe · a broken red candlestick · a deflated
> balloon · a cracked rocket nosecone · a melted moon boot · a curled chart
> printout · a tiny gravestone · a heavy sack, still held · a snapped ledger ·
> a burnt whitepaper roll · a frozen tear · a bell with no clapper ·
> a single unpaired shoe · a keycard, delaminating · a wilted laurel ·
> a cracked hourglass, empty · a stopped watch · a folded ladder ·
> a cracked mirror shard · `none`

`none` is the rare state, not the default: roughly 3% of the collection carries
nothing, and those are the bare Cinders.

### Derived from the index — the collection cools as it fills

**4 · Ember** — core glow intensity. **12 delivered states**, from
white-hot (piece 1) to a dull red pinpoint (piece 4,000). Monotonic. Affects the
seam's brightness, its colour temperature, and how far its light reaches onto
the crust.

**5 · Settle** — how much drifted ash has come to rest on it. **8 delivered
states**, from clean (piece 1) to half-buried (piece 4,000). Monotonic.
Shoulders, crown, and the relic collect it first.

Together these read as one continuous cooling across 166 days. Piece 1 is
white-hot and clean. Piece 4,000 is nearly out and half-buried. **Nobody can
claim a later batch is worse art, because the curve is public before the first
piece is issued.**

## The ladder — rarity has to be *seen*

Every piece sits at one of five levels, and the level must be readable **in a
timeline, at 48 px, without opening the piece**:

| Level | Count of 4,000 |
|---|---|
| Common | 2,400 |
| Uncommon | 1,000 |
| Rare | 480 |
| Epic | 110 |
| One-of-one | 10 |

### The rule that decides how the level is signalled

> **The index owns light. The level owns form.**

**Ember and Settle already belong to the index.** A level signalled by glow,
brightness, colour temperature or ash cover would be a level that reads as a
*date* — an epic at piece 3,900 would look like a common, correctly, because its
ember is nearly out. So brightness is not available, and neither is the
background: it stays the single low-saturation field that recedes and never
competes.

That leaves the two things that survive a 48 px circle anyway, which is the
point:

- **Seam geometry.** Each level's crack has a form of its own, distinguishable
  as a *shape* in silhouette. **Epic gets two forms nobody else has** — two
  seam overlays beyond the five, reserved.
- **Relic pool.** Each level has its own pool. **Epic relics change the
  silhouette** — something that alters the outline of the piece, not a detail
  inside it. One-of-ones are designed individually and owe nothing to the pools.

### What we need delivered per level

Not a flat list. For each of Common, Uncommon, Rare and Epic: **the seam form,
the relic pool, and the surface state** that identifies it — where "state" means
a treatment of the crust or the seam's edge that holds up in silhouette, never a
change of brightness.

**The acceptance test for the whole ladder** is one sheet: **the epic seam forms
rendered at the dimmest ember state, masked to a 48 px circle.** If an epic
still reads as an epic there, the ladder works. If it does not, the ladder is
decoration in the only place people look at it.

**Rarity is cosmetic and stays cosmetic.** Every piece redeems for exactly the
same share of the reserve regardless of level — a one-of-one and the plainest
common are worth the same to the protocol. This is stated so the art is never
asked to carry an economic signal it does not have.

## Deliverables

| | Item | Count |
|---|---|---|
| 1 | Character sheet — front, ¾, profile, a 32×32 silhouette test, **and a 48 px circular-crop test over `#000` and `#FFF`** | 1 |
| 2 | Ash bodies, fully painted, ¾ bust, registered | 5 |
| 3 | Seam overlays, registered to the bodies — **5 base + 2 epic-exclusive** | **7** |
| 4 | Relics, painted, registered, with shadow, **partitioned into per-level pools** | 24 |
| 5 | Ember states — seam brightness + spill, as layers | 12 |
| 6 | Settle states — ash accumulation, as layers | 8 |
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
delivered** — the circular crop at 48 px and 130 px over both chromes, and the
48 px epic-legibility sheet at the last milestone. This is in the brief so it is
not a surprise at payment time: the guard runs on the layers, and a milestone
that fails it is reworked before it is paid.

Market for a generative PFP layer set of this scope: **$2,000–6,000** for a
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
