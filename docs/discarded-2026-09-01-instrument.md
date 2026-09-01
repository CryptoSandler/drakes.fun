# Discarded — *Instrument*

> **Discarded 2026-09-01.** Direction B (*Bestiary*) was chosen and is now
> `DESIGN.md` §10. This file is kept because the reason a direction lost is worth
> as much as the reason one won — and because two of its ideas survived into the
> chosen page: the clock's promotion to the masthead came from *Instrument*, and
> *Hoard*'s gold vault is the thing the chosen page deliberately refuses, which
> is why the absence is one line at the foot and not a section.

## The claim

**The page is the clock.** The reason a stranger opens this from X is that
something happens on the hour, so the hour is the entire fold and everything
else is a readout underneath it. It is an instrument on a rack, not a brochure:
you look at it to find out where the protocol *is right now*, and it answers in
under a second.

It refuses the thing that would be easiest to take from Quantums — the
4,000-cell grid as hero — on purpose. The grid is here, but small, near the
bottom, as one more readout. If the collection is the hero then the hour is not,
and the hour is what recurs.

## What it does not cede

1. **The countdown is the largest object on every viewport.** `clamp(4.5rem,
   22vw, 15rem)`. If a change makes something else bigger, the change is wrong.
2. **No image, anywhere.** Not "the art is not ready" — there is no slot for it.
   The page has to be complete without art, and this one is complete by
   construction rather than by promise.
3. **Every number is server-rendered and tabular.** The reference round's
   sharpest finding was Quantums' fold arriving as `—` and `Loading live chain
   state…`; ours arrive in the HTML. Tabular figures so the countdown does not
   jitter as digits change width.
4. **One typeface.** A terminal page that pairs a serif with a mono is a
   terminal page in a costume.
5. **One accent, on data and actions only.** Amber appears on the network chip,
   the issued cells, the numerals of the pitch, and the button. Nowhere else.

## Type

**JetBrains Mono, 300/400/500/700**, and nothing else.

| Role | Size | Weight |
|---|---|---|
| Countdown | `clamp(4.5rem, 22vw, 15rem)` | 300 |
| Record value | 1.5 rem | 400 |
| Body | 0.9375 rem | 400 |
| Label | 0.6875 rem, `0.16em` tracking, uppercase | 400 |

Weight 300 on the clock is the whole typographic idea: at 240 px a 400 reads as
a wall, and a thin cut at that size reads as an instrument face.

## Palette

OKLCH, dark band.

| Token | Value | Where |
|---|---|---|
| `--color-paper` | `oklch(15% 0.004 250)` | ground |
| `--color-ink` | `oklch(93% 0.005 250)` | the clock, values |
| `--color-ink-2` | `oklch(70% 0.006 250)` | prose |
| `--color-ink-3` | `oklch(52% 0.006 250)` | labels, notes |
| `--color-rule` | `oklch(28% 0.006 250)` | the rails |
| `--color-accent` | `oklch(84% 0.17 92)` | live state, issued, actions |

Five greys and one amber. The blue-shifted hue (250) on every neutral is what
keeps the black from reading as brown next to the amber.

## Motion

**One thing moves: the seconds.** No reveals, no parallax, no scroll-triggered
anything. Hover on the pager and the button is a 120 ms colour transition, and
`prefers-reduced-motion` collapses even that.

The argument: a page whose subject is a clock should have exactly one moving
element, and it should be the clock. Anything else competes with the only thing
on the page that is genuinely live.

## Structure

`nav (terminal rail) → countdown → last issuance as a record → three numbered
lines → the collection as a strip → verify → footer rail`

Rails rather than cards. Every section is separated by a 1 px rule at full
width, so the page reads as a stack of readouts on one instrument face rather
than a set of floating panels.

## The gallery

`/gallery`, 48 px circles — the size the avatar guard is written against
(`DESIGN.md` §9.2) and the size a piece is seen at on X — **paginated 500 at a
time**, which is the one thing this direction takes wholesale from Quantums
because it is the right answer to 4,000 things on a phone.

**Two mistakes were made here and both are worth recording.** The first grid used
`minmax(48px, 1fr)` and stretched every circle to 110 px at 390 px wide, which is
not the size the guard governs. The second drew *issued* as a slightly lighter
ring, and 220 issued pieces were invisible among 3,780 empty ones — the state
the page exists to show was the state you could not see. Issued is now a filled
disc; waiting is a hole.

**Tiers here are a placeholder and the page says so above the grid**, not in a
footnote. The real allocation is fixed by a manifest that does not exist until
B1, and a tier a reader could check against a manifest that is not published is
the exact dishonesty `/verify` exists to make impossible.

## What this direction is bad at

Said plainly, because the point of three is to choose:

- **It is cold.** There is no lore, no dragon, nothing anyone would screenshot
  for its looks. If the token needs desire rather than confidence, this is the
  wrong one.
- **It gives the art nowhere to go.** When B1 delivers, this page has no slot
  for it above the fold without breaking its own first rule.
- **Its gallery is a data view, not a bestiary.** You can see *how many* are
  issued; you cannot enjoy *which*.
- **On desktop the fold is half-empty by choice**, and at 1440 px that reads as
  deliberate to some people and as unfinished to others.
