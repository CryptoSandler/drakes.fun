# Web references

Sites read before designing anything, so that the three directions in B6 are
arguments against something rather than the first thing that came to mind.

**All eight were captured live and looked at** — 1440 × 900 and 390 × 844, real
Chromium, not a description of a page. Reading the HTML tells you the fonts and
the hex values; only the capture tells you what the fold actually gives a
stranger in the first second, and that is the only question that matters for
traffic arriving from X.

Every row carries the date it was read. A reference without one is a claim about
a site that may have shipped twice since.

Captures: `~/proyectos/evidencia/drakes/2026-09-01-b6-references/`.

---

## Quantums — `https://quantums.art/` · read 2026-09-01

The mother reference. `docs/references.md` covers its *mechanism*; this covers
its *page*.

**What it does well.** The hero is the collection: a 4,000-cell grid, one cell
per piece, nearly all dark, a scatter of coloured cells where pieces have been
issued. It is a gallery, a progress bar and a rarity chart in one object, and it
costs no artwork at all. On mobile the grid paginates into eight pages of 500
with `#1 to #500` and prev/next — a real answer to "4,000 things on a phone".
The stats row underneath is three words and three numbers: `ISSUED OF 4,000 ·
BURNED · UNISSUED`.

**What we would steal.** The grid-as-hero, outright. It is the single best idea
on any of these eight sites and it is a perfect fit for a collection whose
tiers are fixed in advance and whose issuance is public. Also the sentence *"one
draw every hour, on the hour"* sitting quietly to the right of the stats — the
mechanism stated once, in one line, with no diagram.

**What we would not.** **Its fold is empty on arrival.** Every number renders as
`—` and the page says `Loading live chain state…`; on mobile the reserve — the
most consequential figure on the site — is a 60 px word that reads
**`Loading…`**. Everything is client-fetched after paint. For a site whose whole
argument is "these numbers are real and checkable", the first impression is a
site that does not know its own numbers. We render ours on the server.

Also: the nav's centre slot is `NEXT DRAW —`, a label with no value next to it.
A countdown that is the reason people came should not be an empty dash in the
chrome.

---

## Hyperliquid — `https://hyperliquid.xyz/` · read 2026-09-01

**What it does well.** It is expensive because the *type* is expensive: a large,
well-cut high-contrast serif — *"Infrastructure to House All Finance"* — on
near-white, with body copy and a single mint-green CTA in the right column. One
saturated colour, used only where an action or a number is. Nav is a row of grey
pills, which reads as a control surface rather than a menu.

**What we would steal.** Serif display + exactly one saturated accent + generous
white; the accent appearing *only* on the action and the live data. The pill nav
is a good fit for a page that is mostly instrument.

**What we would not.** The logo wall (we have no counterparties and inventing
them is fabrication), and the mint particle field below the fold — decoration
that carries no information.

---

## pump.fun — `https://pump.fun/` · read 2026-09-01

Included because it is where `$PUMP` comes from and, more importantly, **it is
the register our traffic arrives from**.

**What it does well.** Density as an aesthetic, with no pretence of being a
brochure: a left icon rail, `⌘K` search, a live ticker of handles and P&L
scrolling across the top, and three simultaneous columns of leaderboard, feed
and trending. Numbers *are* the content. The ticker is the "something is
happening right now" device, and it never stops.

**What we would steal.** The live band. An hourly protocol has exactly one thing
worth putting in a ticker and it is the hour. Also the mono numerals and the
willingness to let a screen be dense.

**What we would not.** Everything about the register. Three overlays on first
paint (welcome modal + cookie banner + promo bar). And the casino read — the
copy rule in `DESIGN.md` §6 exists precisely so we are not this. **The useful
form of this reference is as a negative: our page has to look like it was made
by someone who thinks the numbers are checkable, on a screen the reader reached
from a site that thinks numbers are a slot machine.**

---

## Azuki — `https://www.azuki.com/` · read 2026-09-01 · mobile only

Desktop returned **403 to headless Chromium**; the mobile capture went through.
Recorded rather than smoothed over — a reference we only half-read is a
reference we half-trust.

**What it does well.** The fold is black, a red logo chip, three lines of heavy
condensed uppercase — *AZUKI CHAPTER 1 LAUNCHES SEPTEMBER* — one input, one
button. **The key art starts below the fold.** A collection whose entire value
proposition is its illustration chose to open with type.

**What we would steal.** Exactly that: heavy uppercase display on black with one
saturated accent, carrying the fold on its own. It is the demonstration that the
constraint *"the design has to hold with the art covered"* is not a compromise —
the best-funded art collection here made the same choice.

**What we would not.** Email capture (we have nothing to send), the chaptered
narrative, and the dependency on an illustration budget for everything past the
fold.

---

## Art Blocks — `https://www.artblocks.io/` · read 2026-09-01

**What it does well.** A `● LIVE FROM ART BLOCKS STUDIO` pill, green dot and
all, sitting over the work. It says "now" without a countdown and without
motion. Under it, the title in bold and *by Nat Sarkissian* in a light weight on
the same line — attribution as typography rather than as a metadata row. Further
down, circular artist avatars overlap square artwork tiles: PFP grammar and
gallery grammar in one component.

**What we would steal.** The live pill. And the circle-over-square overlap,
which is the closest thing on any of these sites to our PFP-first constraint
(`DESIGN.md` §9.1).

**What we would not.** The hero carousel with dot pagination — it hides content
behind a control nobody presses, and on a hero it is a tell.

---

## Zora — `https://zora.co/` · read 2026-09-01

**What it does well.** It made a token feel like a *post* rather than a chart.
Single centre column at roughly mobile width even on a 1440 desktop, one item
big, and the price sits inline with the like/comment/share row: `▲ $136 · 💬 3 ·
share ────── Buy`. An economic action in a social grammar.

**What we would steal.** The single-column-at-desktop discipline. Our page is
one object per screen — an hour, a piece, a recipient — and stretching that to
1440 would dilute it.

**What we would not.** The social apparatus. Follows, suggested users and
comments require a social graph; we have none, and building the shell of one is
the kind of thing that reads as a product pretending to be bigger than it is.

---

## Foundation — `https://foundation.app/` · read 2026-09-01

**Foundation is offline.** The site is a shutdown letter dated 27 April 2026:
*"Foundation is offline"*, in heavy grotesk on black over a faint square grid,
followed by a plain-language account of a sale that did not complete.

Kept in this file for two reasons, and the second is the important one.

**What we would steal.** The letter as a page shape: a date, one heavy line, and
running prose at a comfortable measure, on black with a hairline grid. It is the
most dignified page in this set and it cost nothing but restraint.

**What we would not.** Nothing to reject — there is no product here to reject.

**What it is actually evidence of.** A major NFT platform went dark in the same
year we are launching. The set of sites worth studying in this space is not
stable, and a reference round that had only read the HTML would have quoted its
fonts and never noticed it was a tombstone.

---

## Pudgy Penguins — `https://pudgypenguins.com/` · read 2026-09-01 · mobile only

Desktop returned **403 to headless Chromium**; the mobile capture went through.

**What it does well.** It stopped being an NFT site and became a brand: an
announcement bar, a cart, a hero selling a comic series, product photography,
and a scrolling marquee at the bottom — `PLUSHIES NOW LIVE · SHOP NOW · PAX
PENGU`. Total commitment to one register, executed to retail standards.

**What we would steal.** The bottom marquee as a persistent live strip, and the
commitment itself: a page that picks a register and does not hedge reads
expensive, whatever the register is.

**What we would not.** All of it, in substance. This is a toy brand; we are a
protocol that makes a redemption promise. Carousels, announcement bars, and
`FREE SHIPPING ON USA ORDERS OVER $50` are the wrong universe.

---

## What the round changed

Four things went into the three directions because of this round rather than in
spite of it:

1. **Server-render every number.** Quantums' fold is the failure mode, and it is
   the failure mode of a client-fetched chain read generally. Ours arrive in the
   HTML.
2. **The fold must hold with the art covered.** Azuki — the most art-rich
   collection here — opens with type. This is now a pass/fail criterion on all
   three directions rather than an aspiration.
3. **The grid-as-hero is real and it is Quantums'.** One direction takes it and
   pushes it somewhere Quantums does not go; the other two deliberately do not,
   so the set is not three versions of one borrowed idea.
4. **One saturated accent, on data and actions only.** Hyperliquid and Azuki
   arrive at this from opposite paper colours. It is the cheapest thing that
   reads expensive.

## What this round could not tell us

- **Two of the eight were read on mobile only** (Azuki, Pudgy — both 403 to
  headless desktop). Their desktop rhythm is unknown.
- **Motion is largely unread.** A still capture at 2.5 s after load misses
  scroll behaviour, hover states and any reveal. Nothing in the three directions
  rests on a motion idea taken from this set.
- **None of these sites carries our constraint.** Not one of them has to say
  "temporary custody", or refuse the word *winner*, or show a number that is
  deliberately absent. The register we need does not exist in the set, which is
  the argument for three directions rather than one.
