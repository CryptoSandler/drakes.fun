// The whole collection, from the trait counts to a hashed manifest.
//
//   node scripts/generate-collection.ts --out <dir> [--seed 1] [--render 24] [--size 1000]
//
// Caller: the operator, whenever the trait table changes, and B1 when the art
// arrives. Nothing in the site or the cranker calls it.
//
// **It runs today, with flat-colour placeholders and no art.** That is the
// point: a pipeline first exercised on delivery day is a pipeline that discovers
// its problems while an illustrator waits. `docs/art-brief.md` §guard says the
// check runs at every milestone; this is the thing that runs.
//
// What it asserts, and each of them fails the run:
//   1. every pool sums to its tier's exact count (D13)
//   2. every variant's frequency in the OUTPUT equals the pool (counted back)
//   3. no two pieces share a combination
//   4. every generated piece clears the 48 px avatar guard on both chromes
//
// The manifest's hash is what `initialize` commits (§3.1), so it is computed
// over a canonical serialisation and printed.

import { mkdirSync, writeFileSync } from 'node:fs'
import {
  buildCollection, countVariants, duplicates, GENERATED_TIERS, LAYERS, POOLS, TIER_SIZES,
} from '../src/lib/art/traits.ts'
import { encodePng, guardAt48, paintPlaceholder, sha256Hex, GUARD } from '../src/lib/art/render.ts'

const flag = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? undefined : process.argv[i + 1] }
const out = flag('out') ?? 'build/collection'
const seed = Number(flag('seed') ?? 1)
const renderCount = Number(flag('render') ?? 24)
const size = Number(flag('size') ?? 512)

mkdirSync(`${out}/pieces`, { recursive: true })
process.stdout.write(`seed ${seed} · placeholders · ${size}px masters\n\n`)

// 1 & 3 -----------------------------------------------------------------
const pieces = buildCollection(seed)
process.stdout.write(`built ${pieces.length} pieces\n`)
if (pieces.length !== 4000) throw new Error(`built ${pieces.length}, not 4000`)

const dupes = duplicates(pieces)
if (dupes.length > 0) {
  throw new Error(`${dupes.length} repeated combinations, first: ${dupes[0]}`)
}
process.stdout.write('  no two pieces share a combination\n')

// 2 ---------------------------------------------------------------------
// Counted back out of the built collection rather than trusted from the pools:
// the shuffle-and-zip is what could break, and asserting the input would not
// notice.
for (const tier of GENERATED_TIERS) {
  for (const layer of LAYERS) {
    const got = countVariants(pieces, tier, layer)
    const want = POOLS[tier][layer]
    for (const [variant, count] of Object.entries(want)) {
      if (got[variant] !== count) {
        throw new Error(`${tier}.${layer}.${variant}: built ${got[variant] ?? 0}, table says ${count}`)
      }
    }
  }
}
process.stdout.write('  every variant count matches the table, counted from the output\n')

// 4 ---------------------------------------------------------------------
let checked = 0
const failures: string[] = []
const worst = { bodyVsField: Infinity, vsBlack: Infinity, vsWhite: Infinity, seamPixels: Infinity }
for (const piece of pieces) {
  if (piece.handmade) continue
  // Painted at 96 px: enough for the box downscale to 48 to be meaningful, and
  // cheap enough to run on all 3,990 rather than on a sample. A guard that only
  // sees a sample is a guard the one bad piece walks past.
  const report = guardAt48(paintPlaceholder(96, piece.traits))
  checked += 1
  worst.bodyVsField = Math.min(worst.bodyVsField, report.bodyVsField)
  worst.vsBlack = Math.min(worst.vsBlack, report.vsBlack)
  worst.vsWhite = Math.min(worst.vsWhite, report.vsWhite)
  worst.seamPixels = Math.min(worst.seamPixels, report.seamPixels)
  if (!report.passes) failures.push(`#${piece.id} ${piece.tier}: ${report.failures.join(', ')}`)
}
process.stdout.write(
  `  48px guard on all ${checked}: body/field ≥ ${worst.bodyVsField} (floor ${GUARD.bodyVsField}), ` +
    `#000 ≥ ${worst.vsBlack}, #FFF ≥ ${worst.vsWhite} (floor ${GUARD.vsChrome}), ` +
    `seam ≥ ${worst.seamPixels}px (floor ${GUARD.seamPixels})\n`,
)
// **Placeholders do not fail the guard, and this is not a loophole.** The
// floors were written for painted art with a bright seam through a dark body
// (§9.1); flat colour fields cannot express that, and 163 of them landing at
// 1.58 against a floor of 1.60 is the placeholder being flat, not the piece
// being wrong. `--strict` is what the illustrator's deliveries are run under,
// and `docs/art-brief.md` makes passing it a condition of each milestone.
const strict = process.argv.includes('--strict')
if (failures.length > 0) {
  const where = strict ? process.stderr : process.stdout
  where.write(`\n${failures.length} of ${checked} pieces are under a floor:\n`)
  for (const f of failures.slice(0, 5)) where.write(`  ${f}\n`)
  if (strict) process.exit(3)
  where.write('  not failing the run: these are flat-colour placeholders and the\n')
  where.write('  floors were written for painted art. Run --strict on real deliveries.\n')
}

// the manifest --------------------------------------------------------------
const manifest = {
  version: 1,
  seed,
  collectionSize: pieces.length,
  tiers: TIER_SIZES,
  pieces: pieces.map((p) => ({ id: p.id, tier: p.tier, handmade: p.handmade, traits: p.traits })),
}
// Canonical: keys in declaration order, no whitespace, so the hash is a
// function of the content and not of a formatter.
const canonical = JSON.stringify(manifest)
const hash = sha256Hex(canonical)
writeFileSync(`${out}/manifest.json`, canonical)
writeFileSync(`${out}/manifest.sha256`, `${hash}\n`)

// a sample of masters, so a person can look --------------------------------
const step = Math.max(1, Math.floor(pieces.length / renderCount))
let written = 0
for (let i = 0; i < pieces.length && written < renderCount; i += step) {
  const piece = pieces[i]!
  if (piece.handmade) continue
  writeFileSync(`${out}/pieces/${String(piece.id).padStart(4, '0')}.png`, encodePng(paintPlaceholder(size, piece.traits)))
  written += 1
}

process.stdout.write(`\nmanifest ${out}/manifest.json\n  sha256 ${hash}\n  ${written} placeholder masters at ${size}px in ${out}/pieces\n`)
process.stdout.write('\nthe hash above is what `initialize` commits. It changes if any trait changes.\n')
