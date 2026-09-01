# Candidate B — *Bestiary*

> One of three. Not merged, not decided.

## The claim

**The collection is the page.** All 4,000 exist already, their tiers were fixed
before the first one went out, and the fact worth looking at is *which ones are
still in there*. So the plate — every piece, at once — is the hero, and the hour
is the date-line above it.

This is the one direction that takes Quantums' grid-as-hero, deliberately, and
pushes it where they do not go: theirs is a status display with three counters
under it. This one is a **catalogue** — a plate, a caption, and an entry for the
most recent specimen, in the voice of a natural-history sheet.

At 1440 px the whole collection fits on one screen. That is the argument in one
image: 4,000 slots, 229 filled, and you can find the ten Sovereigns by eye.

## What it does not cede

1. **The plate is above the fold on desktop and one scroll away on mobile.** If
   a change pushes it below a marketing section, the change is wrong.
2. **Rarity is findable, never ranked.** Tiers are colour on the plate and a
   count in the caption — *"102 of 110 Ancient remain"* — and nothing anywhere
   says a rarer piece is worth more, because it is not (`DESIGN.md` §9.5).
3. **Empty slots are drawn.** The 3,771 unissued are the subject as much as the
   229 issued; a page that only drew what had happened would lose the whole
   point of a fixed collection.
4. **Serif display, and the numerals are the display face.** `00:15` in
   Instrument Serif is the direction in one glyph.
5. **One accent, and it is spent on the rarest two tiers.** Red appears on
   Ancients and Sovereigns and on a hover state. Nowhere else.

## Type

**Instrument Serif** (display, upright — no italic headers) + **Inter** (body,
tabular figures).

| Role | Face | Size |
|---|---|---|
| Date-line clock | Instrument Serif | `clamp(3rem, 13vw, 6.5rem)` |
| Plate title, entry title | Instrument Serif | 1.75 rem / `clamp(2rem, 6vw, 3.25rem)` |
| Lede | Instrument Serif | 1.25 rem |
| Body, data | Inter 400/500/600 | 1 rem |
| Labels | Inter, `0.18em` tracking, uppercase | 0.75 rem |

## Palette

OKLCH, light band, warm.

| Token | Value | Where |
|---|---|---|
| `--color-paper` | `oklch(96% 0.008 85)` | ground — parchment, not white |
| `--color-ink` | `oklch(21% 0.012 60)` | display, values |
| `--color-ink-2` | `oklch(42% 0.012 60)` | prose |
| `--color-rule` | `oklch(84% 0.012 70)` | the empty slots, hairlines |
| `--color-accent` | `oklch(46% 0.18 27)` | Sovereign, hover |
| `--color-accent-2` | `oklch(70% 0.11 27)` | Ancient |

The three lower tiers are warm greys of increasing darkness, so the plate reads
as a *field* with rare things in it rather than as five categories.

## Motion

**The seconds, and a 120 ms colour change on hover.** Nothing reveals, nothing
parallaxes. A catalogue plate that animates on scroll is a catalogue plate
apologising for being a catalogue.

## Structure

`masthead (wordmark · what this is · verify) → date-line with the clock →
Plate I, the whole collection → tier caption → catalogue entry for the most
recent → colophon → rule`

`/gallery` is Plate II: the same pieces at **48 px**, 500 to a page. The home
plate answers *how much of the collection is out*; the gallery answers *which
ones, and what are they*.

## Two defects found in the captures and fixed

Recorded because a direction is only as good as what its author was willing to
look at.

- **The masthead wrapped at 390 px.** Three flex items let the middle one break
  onto a second line and shove `VERIFY` upward. It is now a three-column grid
  whose middle slot ellipses; the outer two never move.
- **Dashed rings at 9 px render as sprockets.** The empty slot on the dense
  plate was a dashed circle, which at that size reads as a gear, not a hole. The
  dashed rule now lives only at 48 px, where it reads.

## What this direction is bad at

- **The clock is smaller than the brief's priority implies.** It is the first
  thing and the largest type in the header, but at 13vw it is a date-line, not a
  countdown wall. If the hour is genuinely the product, A serves it better.
- **On mobile the plate is a long scroll** — 4,000 dots at a 12 px pitch is
  about 145 rows. It is beautiful at 1440 and merely *long* at 390.
- **It leans hardest on the placeholder.** The plate's whole charm is tier
  colour, and tier is exactly the thing that is not real yet. When B1 lands, this
  direction gets much better; until then it is showing a rehearsal of itself.
- **It reads as a museum.** Nothing here is fast or loud, and the traffic is
  arriving from a timeline that is both.
