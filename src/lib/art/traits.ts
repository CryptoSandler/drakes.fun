// The trait table of `docs/traits.md`, as data.
//
// Caller: `scripts/generate-collection.ts` and its tests. The document is the
// argument; this is the thing that runs, and the test asserts they agree on
// every count.
//
// **Counts, never weights.** `DESIGN.md` §9.3 (D13) makes rarity checkable in
// advance, which is only true if the manifest is built from exact multisets.
// A generator that sampled a distribution would make the claim false on its
// first run and nobody would notice until somebody counted.

export const TIER_SIZES = {
  Whelp: 2400,
  Wyrm: 1000,
  Elder: 480,
  Ancient: 110,
  /** By hand, one at a time. The generator refuses to produce these. */
  Sovereign: 10,
} as const

export type Tier = keyof typeof TIER_SIZES
export const GENERATED_TIERS = ['Whelp', 'Wyrm', 'Elder', 'Ancient'] as const
export type GeneratedTier = (typeof GENERATED_TIERS)[number]

export const LAYERS = ['field', 'body', 'head', 'eyes', 'mouth', 'chain', 'garment', 'hoard'] as const
export type Layer = (typeof LAYERS)[number]

export type Pools = Record<GeneratedTier, Record<Layer, Record<string, number>>>

export const POOLS: Pools = {
  Whelp: {
    field: { slate: 500, moss: 500, rust: 480, graphite: 460, clay: 460 },
    body: { charcoal: 700, carbon: 700, pitch: 550, basalt: 450 },
    head: { stub: 800, swept: 700, twin: 500, crown: 400 },
    eyes: { amber: 700, bronze: 650, pale: 600, white: 450 },
    mouth: { closed: 1100, bared: 800, smoke: 500 },
    chain: { none: 1200, cord: 700, curb: 500 },
    garment: { none: 900, hood: 600, puffer: 500, tee: 400 },
    hoard: { none: 1900, few: 400, pile: 100 },
  },
  Wyrm: {
    field: { slate: 220, moss: 200, rust: 200, graphite: 190, clay: 190 },
    body: { charcoal: 300, carbon: 260, pitch: 240, basalt: 200 },
    head: { swept: 320, twin: 280, crown: 220, barbed: 180 },
    eyes: { amber: 280, bronze: 260, pale: 240, gold: 220 },
    mouth: { closed: 400, bared: 340, smoke: 260 },
    chain: { none: 420, curb: 320, rope: 260 },
    garment: { none: 300, hood: 260, puffer: 240, varsity: 200 },
    hoard: { none: 700, few: 220, pile: 80 },
  },
  Elder: {
    field: { slate: 100, moss: 100, rust: 100, graphite: 90, clay: 90 },
    body: { carbon: 130, pitch: 130, basalt: 120, obsidian: 100 },
    head: { twin: 140, crown: 130, barbed: 110, antlered: 100 },
    eyes: { bronze: 130, pale: 120, gold: 120, split: 110 },
    mouth: { bared: 180, smoke: 160, flame: 140 },
    chain: { curb: 180, rope: 160, cuban: 140 },
    garment: { hood: 130, puffer: 130, varsity: 110, trench: 110 },
    hoard: { none: 300, few: 130, pile: 50 },
  },
  Ancient: {
    field: { slate: 25, rust: 25, graphite: 30, clay: 30 },
    body: { pitch: 30, basalt: 30, obsidian: 30, scorched: 20 },
    head: { crown: 30, barbed: 30, antlered: 30, fractured: 20 },
    eyes: { gold: 30, split: 30, molten: 30, blind: 20 },
    mouth: { smoke: 40, flame: 40, roar: 30 },
    chain: { rope: 40, cuban: 40, plated: 30 },
    garment: { puffer: 30, varsity: 30, trench: 30, cloak: 20 },
    hoard: { none: 60, few: 30, pile: 20 },
  },
}

/** Every pool sums to its tier. Called before anything is generated. */
export function assertPoolsSum(): void {
  for (const tier of GENERATED_TIERS) {
    for (const layer of LAYERS) {
      const total = Object.values(POOLS[tier][layer]).reduce((a, b) => a + b, 0)
      if (total !== TIER_SIZES[tier]) {
        throw new Error(
          `${tier}.${layer} sums to ${total}, not ${TIER_SIZES[tier]}. ` +
            'Rarity is exact counts (D13); a pool that does not sum is a distribution.',
        )
      }
    }
  }
  const all = Object.values(TIER_SIZES).reduce((a, b) => a + b, 0)
  if (all !== 4000) throw new Error(`the tiers sum to ${all}, not 4000`)
}

/** mulberry32: same table on every machine, from one seed. */
export function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export interface Piece {
  id: number
  tier: Tier
  handmade: boolean
  traits: Record<Layer, string>
}

/**
 * The collection, built from exact multisets and then de-duplicated.
 *
 * Each layer's multiset is shuffled independently and zipped, which keeps every
 * variant's count exact by construction. Zipping can still hand two pieces the
 * same tuple, so collisions are repaired by swapping one layer's value with
 * another piece **in the same tier** — which preserves the counts — and the
 * caller asserts uniqueness afterwards rather than trusting the repair.
 */
export function buildCollection(seed: number): Piece[] {
  assertPoolsSum()
  const random = rng(seed)
  const pieces: Piece[] = []
  let id = 0

  for (const tier of GENERATED_TIERS) {
    const columns: Record<Layer, string[]> = {} as Record<Layer, string[]>
    for (const layer of LAYERS) {
      const bag: string[] = []
      for (const [variant, count] of Object.entries(POOLS[tier][layer])) {
        for (let i = 0; i < count; i += 1) bag.push(variant)
      }
      columns[layer] = shuffled(bag, random)
    }
    for (let i = 0; i < TIER_SIZES[tier]; i += 1) {
      const traits = {} as Record<Layer, string>
      for (const layer of LAYERS) traits[layer] = columns[layer][i]!
      pieces.push({ id: id++, tier, handmade: false, traits })
    }
  }

  for (const tier of ['Sovereign'] as const) {
    for (let i = 0; i < TIER_SIZES[tier]; i += 1) {
      // Placeholders in the manifest until the ten are drawn. They carry
      // `handmade` so nothing downstream treats them as generated.
      const traits = {} as Record<Layer, string>
      for (const layer of LAYERS) traits[layer] = `sovereign-${i + 1}`
      pieces.push({ id: id++, tier, handmade: true, traits })
    }
  }

  repairDuplicates(pieces, random)
  return pieces
}

const key = (p: Piece) => LAYERS.map((l) => p.traits[l]).join('|')

/**
 * Makes every combination unique **without changing a single count**.
 *
 * Zipping eight independently shuffled multisets hands about 6% of a 2,400-piece
 * tier a tuple somebody else already has — 244 collisions across the collection
 * at seed 1. The repair is a *swap* between two pieces of the same tier, never
 * an overwrite: overwriting would change a variant's frequency, and the exact
 * frequencies are the property this file exists to keep (D13).
 *
 * A first version picked the layer and the partner at random and did not
 * converge in twenty passes, because a random swap resolves one clash about as
 * often as it creates another. This one searches: for each clashing piece it
 * walks layers and partners in a fixed order, seeded only in where it starts,
 * and accepts the first swap that leaves **both** pieces unique. That makes the
 * repair deterministic and monotone — the number of clashes never rises.
 */
function repairDuplicates(pieces: Piece[], random: () => number): void {
  // Recomputed per pass. Freeing a partner's old key can free a key another
  // not-yet-processed clash is still sitting on, which left exactly one
  // duplicate at seed 1 — found by the assertion downstream, not by reasoning.
  for (let pass = 0; pass < 8; pass += 1) {
    if (repairPass(pieces, random) === 0) return
  }
  throw new Error('could not make every combination unique in 8 passes')
}

function repairPass(pieces: Piece[], random: () => number): number {
  const taken = new Map<string, Piece>()
  const clashing: Piece[] = []
  for (const piece of pieces) {
    const k = key(piece)
    if (taken.has(k)) clashing.push(piece)
    else taken.set(k, piece)
  }

  for (const piece of clashing) {
    if (piece.handmade) throw new Error(`#${piece.id} is handmade and collides; fix the manifest`)
    const partners = pieces.filter((q) => q.tier === piece.tier && !q.handmade && q.id !== piece.id)
    const start = Math.floor(random() * partners.length)
    let fixed = false

    for (let step = 0; step < partners.length && !fixed; step += 1) {
      const other = partners[(start + step) % partners.length]!
      for (const layer of LAYERS) {
        if (piece.traits[layer] === other.traits[layer]) continue
        const beforeOther = key(other)
        const a = piece.traits[layer]!
        const b = other.traits[layer]!
        piece.traits[layer] = b
        other.traits[layer] = a
        const newPiece = key(piece)
        const newOther = key(other)
        const pieceFree = !taken.has(newPiece)
        const otherFree = !taken.has(newOther) || taken.get(newOther) === other
        if (pieceFree && otherFree) {
          taken.delete(beforeOther)
          taken.set(newPiece, piece)
          taken.set(newOther, other)
          fixed = true
          break
        }
        piece.traits[layer] = a
        other.traits[layer] = b
      }
    }
    if (!fixed) throw new Error(`could not place #${piece.id} uniquely; the pools are too small`)
  }
  return duplicates(pieces).length
}

export function duplicates(pieces: Piece[]): string[] {
  const seen = new Set<string>()
  const dupes: string[] = []
  for (const p of pieces) {
    const k = key(p)
    if (seen.has(k)) dupes.push(`#${p.id} ${k}`)
    seen.add(k)
  }
  return dupes
}

/** Counted back out of the built collection, never taken from the pools. */
export function countVariants(pieces: Piece[], tier: GeneratedTier, layer: Layer): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of pieces) {
    if (p.tier !== tier) continue
    out[p.traits[layer]] = (out[p.traits[layer]] ?? 0) + 1
  }
  return out
}
