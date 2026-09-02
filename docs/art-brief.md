# Illustrator brief — Drakes

4,000 dragons. One is issued every hour, by a program, to somebody holding the
token. **The piece is somebody's avatar before it is anything else.**

This brief is written to be worked from without knowing who commissioned it, and
the commissioner expects the same in return: **no name is needed on either side**
and none will be asked for. Payment and delivery are arranged through whatever
channel you prefer that does not require one.

---

## 1. The creature

**A black dragon that lives in a city.**

- **Black, and not flat black.** Painted volume — the light comes from one
  source and the body reads as mass, not as a shape filled in. Where scales
  catch light they catch it in a seam, not an outline.
- **Fire is internal.** The glow comes from inside the throat and between the
  scales, as though the animal is a furnace with cracks. Very little open flame.
- **Chains and streetwear.** A curb chain at the neck, a hood or a puffer across
  the shoulders. Worn, not styled. This is the one place the piece is allowed to
  be funny, and it should be dry rather than cute.
- **The hoard is a small pile of coins**, low in the frame, and it is a trait
  that most pieces do not have. It is never a measure of anything.

**What it is not:** not a mascot, not chibi, not cel-shaded, not a uniform
outline around every element, not a "clean vector" treatment. Not a knight, not
a castle, not a fantasy tavern. No text in the image, ever.

## 2. Style, in words rather than pictures

**Reference points, named to be argued with rather than copied.**

- **DeGods** — for how much presence a single character holds at small sizes,
  and for a palette that stays restrained while the character does not.
- **Bored Ape Yacht Club** — for the trait system's discipline: a fixed set of
  layers that always land in the same place, so 4,000 of them look like one
  collection and not like 4,000 drawings.
- **Pudgy Penguins** — for warmth. It is the thing most dragon art misses: our
  animal should look like something you would keep, not something you would
  fight.

**None of those is the target.** The target is a painted, three-quarter bust of a
black dragon, on a solid muted field, that a stranger would recognise as ours
after seeing three of them.

## 3. Composition — the part that is a rule and not a preference

The piece lives in a **48 px circle** in a timeline and a **~130 px circle** on a
profile, over both a dark and a light interface. The square master is a delivery
format, not the product.

1. **Three-quarter bust.** Head and upper chest. No full body, no scene.
2. **Face and eyes centred in the frame** — centred in the *crop that survives*,
   not in the bust.
3. **Nothing load-bearing in the corners.** A circle inscribed in a square throws
   away **21.5%** of the area, all of it at the edges.
4. **Every piece carries its own opaque muted field.** Nothing composites onto
   the interface's background. The field has to separate from both a black
   chrome and a white one — a field chosen against only one of them fails on the
   other theme.
5. **The silhouette plus one bright seam has to be enough.** At 48 px that is
   all that is left. If the piece needs its details to be read, it is not
   finished.

## 4. Delivery format

- **PNG, 2000 × 2000, with alpha**, one file per layer, plus one flattened
  composite per piece for reference.
- **Layers named exactly**, lowercase, in composite order:
  `01-field`, `02-body`, `03-head`, `04-eyes`, `05-mouth`, `06-chain`,
  `07-garment`, `08-hoard`.
- **Every layer registered to the same 2000 × 2000 canvas**, so layers combine
  without repositioning. A layer that only works in one combination is a layer
  that has to be redrawn.
- Variants named as in `docs/traits.md` — `02-body-charcoal.png`.
- **No baked shadows between layers.** If the body's shadow falls on the
  garment, it belongs in the garment file, not in the body's.

`docs/traits.md` holds the full variant list and the exact count of each.

## 5. The check that runs on every delivery

A script masks each composite to the 48 px circle, downscales it, and measures:
body against its own field, the tile against both chromes, and whether the seam
survived. **It runs before a milestone is accepted, not after all the work is
done.** It exists so that a disagreement about "reads at small size" is settled
with a number instead of taste.

It will never ask you to flatten the art. If a threshold and this brief ever
disagree, this brief is right and the threshold is wrong.

## 6. Milestones and what is paid at each

| # | Delivery | Paid |
|---|---|---|
| **1** | **Three finished pieces**, one Whelp, one Elder, one Ancient — full layer stacks, all eight layers, in the delivery format. | **20%** |
| **2** | **Every variant of every layer, once**: the complete pool from `docs/traits.md` drawn but not yet combined, plus a rendered contact sheet per tier. | **50%** |
| **3** | **The ten Sovereigns**, painted one at a time rather than combined, and any fixes the contact sheets surfaced. | **30%** |

**Milestone 1 is where the style is agreed** and it is deliberately small: three
pieces is enough to know whether this is working, and cheap enough for either
side to walk away.

**Milestone 2 has an explicit gate** beyond the automated check: a contact sheet
per tier that has to read as a ladder — a stranger shown the five sheets should
be able to put them in order without being told the order. That is judged by a
person, because a metric for "recognisable" would be us grading ourselves.

**Revisions:** two rounds per milestone are included. The brief tries to be
specific enough that they are not needed.

## 7. What you own and what we do

You keep the right to show the work. We take the right to use it for the
collection and its marketing. **We will not resell the source files as a pack,
and we will not train a model on them** — the second one in writing, because the
first is obvious and the second is not.

The five tier names are **Whelp, Wyrm, Elder, Ancient, Sovereign**. A tier is
never announced by a badge, a border or a colour of gold — it is in the drawing
or it is nowhere.
