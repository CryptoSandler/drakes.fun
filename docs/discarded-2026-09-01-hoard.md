# Discarded — *Hoard*

> **Discarded 2026-09-01.** Direction B (*Bestiary*) was chosen and is now
> `DESIGN.md` §10. This file is kept because the reason a direction lost is worth
> as much as the reason one won — and because two of its ideas survived into the
> chosen page: the clock's promotion to the masthead came from *Instrument*, and
> *Hoard*'s gold vault is the thing the chosen page deliberately refuses, which
> is why the absence is one line at the foot and not a section.

## The claim

**The hour is the mechanism; the hoard is the reason.** So the page is a poster
about the hoard — and because the hoard does not exist in Phase 1, the largest
object below the fold is a sealed, empty frame that says exactly that.

The only gold on the page is spent on the thing that is not there. That is the
whole design: an accent used once, around an absence, so that scarcity of colour
and scarcity of substance are the same fact.

## What it does not cede

1. **The absence is stated at poster scale, not in a footnote.** `EMPTY, AND
   SEALED`, in the display face, in the only gold on the page. D23 says no
   figure until the pool exists; this direction argues that the *absence itself*
   is worth a section.
2. **Gold appears exactly once.** If a second element takes gold, the vault stops
   meaning anything.
3. **No image, and the placeholder is a marked frame.** There is no dragon on
   this page. The lore is carried entirely by five words of display type, which
   is the test the brief set: it has to hold with the art covered, and here
   there is no art to uncover.
4. **The statement comes before the clock.** Deliberate, and it is this
   direction's cost — see below.

## Type

**Anton** (display, uppercase, roman) + **Work Sans** (body).

| Role | Size |
|---|---|
| Slab | `clamp(3.25rem, 15vw, 8.5rem)` |
| Sub-slab, vault shout, last-one line | `clamp(2rem, 8vw, 5rem)` |
| Clock | `clamp(2.75rem, 11vw, 6rem)`, in the display face |
| Body | 1.0625 rem |
| Kickers | 0.75 rem, `0.24em` tracking |

The clock is set in Anton rather than the body face on purpose: in this
direction the countdown is part of the poster, not an instrument readout.

## Palette

OKLCH, dark band, warm — and deliberately **not** near-black. Oxblood.

| Token | Value | Where |
|---|---|---|
| `--color-paper` | `oklch(17% 0.045 35)` | ground |
| `--color-paper-3` | `oklch(13% 0.035 35)` | inside the vault |
| `--color-ink` | `oklch(93% 0.020 80)` | bone — the display type |
| `--color-ink-2` | `oklch(74% 0.028 45)` | prose, the sub-slab |
| `--color-gold` | `oklch(80% 0.130 85)` | **the vault, and nothing else** |

Against candidate A this differs on two of the three diversification axes:
display style (display-heavy vs mono) and accent hue (neutral bone vs warm
amber). The paper band is dark in both, which is why the ground is oxblood and
not the same near-black.

## Motion

**The seconds, and a 130 ms colour swap on the button.** A poster does not
animate.

## Structure

`slab nav → poster (kicker · three-line slab · sub-slab · clock + counts ·
progress bar) → the last one, as one line → three columns of creed → THE VAULT →
verify → rule`

`/gallery` exists because the brief requires it, and it is deliberately not the
hero: the bar on the poster answers *how much is still in the hoard*, and the
gallery is where you go to see them one at a time, 48 px, 500 to a page.

## One defect found in the captures and fixed

At `--text-slab: 11rem` the three-line slab pushed the clock to y≈792 of a
900 px viewport — inside the fold on paper, and cut off on a laptop with browser
chrome. Capped at 8.5 rem on desktop; the phone keeps 15vw, where there is
height to spend.

## What this direction is bad at

- **It breaks the brief's first priority.** The clock is *in* the fold but it is
  not the first thing you see; the statement is. If the hour is the product,
  this is the wrong direction and A is the right one. This is a deliberate trade
  and it is the main thing to accept or reject.
- **It puts the emptiest fact on the site in the largest frame.** A reader who
  arrives excited meets a sealed vault. That may be exactly the right honesty,
  or exactly the wrong first impression — it is a product decision, not a design
  one.
- **It promises a look the project cannot yet deliver.** The register asks for
  art, and when B1 arrives it will have to be good enough to sit under this
  type. A and B degrade gracefully if the art is mediocre; this one does not.
- **Anton is a strong, recognisable face.** It reads as confident and it also
  reads as *a poster*, and posters date faster than instruments.
