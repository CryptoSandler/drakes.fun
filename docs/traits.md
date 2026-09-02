# Traits: the layers, the variants, and the counts that sum to 4,000

**Exact counts, not probabilities.** `DESIGN.md` §9.3 (D13) makes rarity
verifiable *in advance*: the manifest fixes every piece before issuance 1 and
`initialize` commits its hash. A generator that rolled probabilities would make
that claim false on the first run, so every number below is a count and every
column sums.

| Tier | Count | Made by |
|---|---|---|
| Whelp | 2,400 | generator |
| Wyrm | 1,000 | generator |
| Elder | 480 | generator |
| Ancient | 110 | generator |
| **Sovereign** | **10** | **by hand, one at a time** |
| | **4,000** | |

The generator therefore produces **3,990** pieces. The ten Sovereigns are painted
one at a time and enter the manifest as fixed entries; nothing about them is
rolled (§9.5: rarity is never a price signal, so a Sovereign is *more work*, not
a better number).

---

## The layers, in composite order

| # | Layer | Opaque | Notes |
|---|---|---|---|
| 1 | `field` | yes | the muted background the tile needs (§9.1) |
| 2 | `body` | no | the black dragon, painted volume |
| 3 | `head` | no | horns and crest |
| 4 | `eyes` | no | the centre of the 48 px crop |
| 5 | `mouth` | no | closed, bared, or breathing fire |
| 6 | `chain` | no | the neck piece |
| 7 | `garment` | no | streetwear across the shoulders |
| 8 | `hoard` | no | **a rolled trait**, not a tier |

**The hoard is a trait and never a tier.** It is a small pile of coins in the
frame, and it is rolled independently of the ladder so that a Whelp can have one
and a Sovereign can lack one. Tying it to the tier would make it read as a
payout, which is the one thing §9.5 forbids.

---

## Per-tier variant counts

Each tier has its own pools. **Within a tier every column sums to the
tier's own count**, so a variant's frequency is a fact and not an outcome.

### Whelp — 2,400

| Layer | Variants and counts |
|---|---|
| `field` | slate 500 · moss 500 · rust 480 · graphite 460 · clay 460 |
| `body` | charcoal 700 · carbon 700 · pitch 550 · basalt 450 |
| `head` | stub 800 · swept 700 · twin 500 · crown 400 |
| `eyes` | amber 700 · bronze 650 · pale 600 · white 450 |
| `mouth` | closed 1,100 · bared 800 · smoke 500 |
| `chain` | none 1,200 · cord 700 · curb 500 |
| `garment` | none 900 · hood 600 · puffer 500 · tee 400 |
| `hoard` | none 1,900 · few 400 · pile 100 |

### Wyrm — 1,000

| Layer | Variants and counts |
|---|---|
| `field` | slate 220 · moss 200 · rust 200 · graphite 190 · clay 190 |
| `body` | charcoal 300 · carbon 260 · pitch 240 · basalt 200 |
| `head` | swept 320 · twin 280 · crown 220 · barbed 180 |
| `eyes` | amber 280 · bronze 260 · pale 240 · gold 220 |
| `mouth` | closed 400 · bared 340 · smoke 260 |
| `chain` | none 420 · curb 320 · rope 260 |
| `garment` | none 300 · hood 260 · puffer 240 · varsity 200 |
| `hoard` | none 700 · few 220 · pile 80 |

### Elder — 480

| Layer | Variants and counts |
|---|---|
| `field` | slate 100 · moss 100 · rust 100 · graphite 90 · clay 90 |
| `body` | carbon 130 · pitch 130 · basalt 120 · obsidian 100 |
| `head` | twin 140 · crown 130 · barbed 110 · antlered 100 |
| `eyes` | bronze 130 · pale 120 · gold 120 · split 110 |
| `mouth` | bared 180 · smoke 160 · flame 140 |
| `chain` | curb 180 · rope 160 · cuban 140 |
| `garment` | hood 130 · puffer 130 · varsity 110 · trench 110 |
| `hoard` | none 300 · few 130 · pile 50 |

### Ancient — 110

| Layer | Variants and counts |
|---|---|
| `field` | slate 25 · rust 25 · graphite 30 · clay 30 |
| `body` | pitch 30 · basalt 30 · obsidian 30 · scorched 20 |
| `head` | crown 30 · barbed 30 · antlered 30 · fractured 20 |
| `eyes` | gold 30 · split 30 · molten 30 · blind 20 |
| `mouth` | smoke 40 · flame 40 · roar 30 |
| `chain` | rope 40 · cuban 40 · plated 30 |
| `garment` | puffer 30 · varsity 30 · trench 30 · cloak 20 |
| `hoard` | none 60 · few 30 · pile 20 |

### Sovereign — 10, by hand

No pools. Ten pieces made one at a time, each with its own `field`, and each entering the
manifest with `handmade: true`. The generator refuses to produce them.

---

## The visual signature of each tier

Read at **48 px in a circle**, which is where the ladder has to be legible
(§9.1). None of these is a colour swap.

| Tier | Signature at 48 px |
|---|---|
| **Whelp** | one seam of light, low on the frame. The silhouette is compact. |
| **Wyrm** | the seam runs the height of the head; horns break the circle's edge. |
| **Elder** | two seams that cross, and the first metal — a chain always present. |
| **Ancient** | the field itself carries light; the head fills more of the crop. |
| **Sovereign** | the only tier where the creature meets the viewer's eye directly. |

**A tier is never announced by a badge, a border, a number or a colour of gold.**
`DESIGN.md` §9.5: nothing may say a rarer piece is worth more, because it is not.

---

## What the counts guarantee, and what they do not

- **Every variant's frequency is exact** and checkable against the manifest
  before the first issuance.
- **No two pieces share a full combination.** `scripts/generate-collection.ts`
  asserts it and fails the build rather than shipping a duplicate.
- They do **not** guarantee that every combination is used — the pools are far
  larger than the counts, deliberately, so the collection is a sample of a much
  bigger space rather than an exhaustive enumeration of a small one.
