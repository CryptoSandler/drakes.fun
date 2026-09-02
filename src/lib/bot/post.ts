// What one post says, and nothing about how it is sent.
//
// Caller: `src/lib/bot/run.ts`, and the tests, which scan the OUTPUT of this
// module against the copy lexicon rather than its source.
//
// **The post is a pointer, not a record.** Everything it asserts is on chain
// and the link goes to the page that recomputes it (`/verify/<hour>`). So the
// rule for what goes in is narrow: a fact the reader can check by following the
// link, and the sentence that says what kind of fact it is.
//
// **Three things this file refuses to say, each for a written reason:**
//
// 1. **A tier, unless the manifest that fixes tiers is committed on chain and
//    the table we hold hashes to it.** `placeholderTier` exists so the gallery
//    can be designed; publishing it as a piece's rarity would be asserting
//    something a reader could check against the manifest and find false
//    (`src/lib/site/collection.ts`, D13). The gate is absolute — the config's
//    `manifest_hash` against the sha256 of the file we are reading tiers from —
//    and its closed state is silence, not a guess.
// 2. **Anything about the hoard.** D31: it may not be the subject of a
//    headline, and every post is a headline.
// 3. **Which cluster it is on, quietly.** A rehearsal post that reads like a
//    mainnet one is a lie a screenshot makes permanent, so the marker is the
//    first line and not a footnote (D29, and CLAUDE.md on showing the network).
//
// The vocabulary of contests is banned in copy AND in identifiers (`DESIGN.md`
// §6); a post is the most public copy this project produces.

/** X's limit for a standard post. Enforced on the raw text, which is stricter
 *  than X's own count: it shortens links to a fixed width, so raw-under-280
 *  cannot become over-280 after their transformation. No remembered number is
 *  load-bearing here. */
export const MAX_LENGTH = 280

export interface Issuance {
  hour: bigint
  /** False when the hour closed without issuing. */
  issued: boolean
  /** Only meaningful when `issued`. */
  pieceId: number
  recipient: string
  snapshotSlot: bigint
  /** True when the hour settled at all. A settled hour can still issue nothing. */
  settled: boolean
}

export interface PostContext {
  /** Classified server-side from the genesis hash. Never a URL, never a host. */
  cluster: string
  /** No trailing slash. */
  siteUrl: string
  /**
   * The piece's tier, or null. Null is the default and the safe state: see the
   * header. Supplied by a caller that verified the manifest, never derived here.
   */
  tier?: string | null
}

export interface Post {
  hour: bigint
  kind: 'issued' | 'nothing'
  text: string
  /** The permalink, so a caller can log it beside the post. */
  url: string
}

/** `2B7taMK…ZfxHu` — enough to recognise, never enough to mistake for the whole. */
export function shortAddress(address: string): string {
  if (address.length <= 12) return address
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}

/**
 * One settlement, as the post that announces it.
 *
 * Throws when the result would exceed the limit rather than truncating: a
 * truncated post loses its link, and a post without its link is an assertion
 * with no way to check it.
 */
export function buildPost(issuance: Issuance, context: PostContext): Post {
  const url = `${context.siteUrl}/verify/${issuance.hour}`
  const rehearsal =
    context.cluster === 'mainnet'
      ? ''
      : `${context.cluster.toUpperCase()} REHEARSAL — mainnet has not started.\n\n`

  const text = issuance.issued
    ? [
        rehearsal,
        `Drake #${issuance.pieceId}`,
        context.tier === null || context.tier === undefined ? '' : ` · ${context.tier}`,
        ` issued to ${shortAddress(issuance.recipient)}\n\n`,
        `Hour ${issuance.hour} — chosen from every $DRAKES holder, in proportion to what they `,
        `held at slot ${issuance.snapshotSlot}. Not chosen by us. Recompute it:\n\n`,
        url,
      ].join('')
    : [
        rehearsal,
        `Hour ${issuance.hour} issued nothing.\n\n`,
        issuance.settled
          ? 'The hour settled with no eligible supply to issue to. '
          : 'The oracle did not reveal inside the hour, so it closed unsettled. ',
        'The piece stays in the collection and the schedule does not shift:\n\n',
        url,
      ].join('')

  if (text.length > MAX_LENGTH) {
    throw new Error(`post for hour ${issuance.hour} is ${text.length} characters, over ${MAX_LENGTH}`)
  }
  return { hour: issuance.hour, kind: issuance.issued ? 'issued' : 'nothing', text, url }
}
