// The posts, checked as text — because the text is the product here.

import { describe, expect, it } from 'vitest'
import { buildPost, MAX_LENGTH, shortAddress, type Issuance } from '../post.ts'
import { findBanned } from '../../copy/lexicon.ts'

const issued: Issuance = {
  hour: 378n,
  issued: true,
  pieceId: 2951,
  recipient: '2B7taMK2LvaJx7Rsf3cX4vUQAJbXbkX6FFH7Ud1ZfxHu',
  snapshotSlot: 491686001n,
  settled: true,
}
const mainnet = { cluster: 'mainnet', siteUrl: 'https://drakes.fun' }

describe('the post', () => {
  it('names the piece, the recipient and the slot, and links the permalink', () => {
    const post = buildPost(issued, mainnet)
    expect(post.text).toContain('Drake #2951')
    expect(post.text).toContain('2B7t…fxHu')
    expect(post.text).toContain('491686001')
    expect(post.text).toContain('https://drakes.fun/verify/378')
    expect(post.url).toBe('https://drakes.fun/verify/378')
  })

  it('never prints the recipient in full', () => {
    // The permalink shows the whole address. A post is a pointer, and a
    // full address in a post is the thing people screenshot out of context.
    expect(buildPost(issued, mainnet).text).not.toContain(issued.recipient)
  })

  it('says which cluster it is on, first, when it is not mainnet', () => {
    const post = buildPost(issued, { ...mainnet, cluster: 'devnet' })
    expect(post.text.startsWith('DEVNET REHEARSAL — mainnet has not started.')).toBe(true)
  })

  it('says nothing about the cluster on mainnet', () => {
    expect(buildPost(issued, mainnet).text).not.toMatch(/REHEARSAL/)
  })

  it('carries no tier by default, and carries one only when it is given', () => {
    // The default is the safe state: tiers are fixed by a manifest that is not
    // committed yet, so a tier here would be checkable and false.
    expect(buildPost(issued, mainnet).text).not.toMatch(/Elder|Whelp|Sovereign/)
    expect(buildPost(issued, { ...mainnet, tier: 'Elder' }).text).toContain('Drake #2951 · Elder')
  })

  it('says an hour issued nothing, and which of the two reasons it was', () => {
    const unsettled = buildPost({ ...issued, issued: false, settled: false }, mainnet)
    expect(unsettled.text).toContain('Hour 378 issued nothing.')
    expect(unsettled.text).toContain('did not reveal')
    expect(unsettled.kind).toBe('nothing')

    const empty = buildPost({ ...issued, issued: false, settled: true }, mainnet)
    expect(empty.text).toContain('no eligible supply')
  })

  it('fits, at the worst case this collection can produce', () => {
    // Every field at the widest the protocol can actually reach: 4,000 pieces
    // at one an hour cannot pass a six-digit hour even with every hour skipped
    // ten times over, Solana slots are eleven digits inside this decade, the
    // piece is four, and Sovereign is the longest tier name. The cluster marker
    // is included, because a rehearsal post is the longest kind.
    const worst = buildPost(
      {
        hour: 999_999n,
        issued: true,
        pieceId: 9999,
        recipient: '2B7taMK2LvaJx7Rsf3cX4vUQAJbXbkX6FFH7Ud1ZfxHu',
        snapshotSlot: 99_999_999_999n,
        settled: true,
      },
      { cluster: 'devnet', siteUrl: 'https://drakes.fun', tier: 'Sovereign' },
    )
    expect(worst.text.length).toBeLessThanOrEqual(MAX_LENGTH)
    // The margin is stated so that a copy edit that eats it fails here rather
    // than at the first Sovereign.
    expect(MAX_LENGTH - worst.text.length).toBeGreaterThanOrEqual(15)
  })

  it('refuses an hour no schedule can reach rather than shipping it short', () => {
    expect(() =>
      buildPost(
        { ...issued, hour: 18_446_744_073_709_551_615n, snapshotSlot: 18_446_744_073_709_551_615n },
        { ...mainnet, cluster: 'devnet', tier: 'Sovereign' },
      ),
    ).toThrow(/over 280/)
  })

  it('refuses to publish an over-length post rather than truncating it', () => {
    // Truncation would take the link, which is the only part that makes the
    // rest checkable.
    expect(() =>
      buildPost(issued, { ...mainnet, siteUrl: `https://${'x'.repeat(280)}.example` }),
    ).toThrow(/over 280/)
  })

  it('uses none of the banned vocabulary, in any shape a post can take', () => {
    // The corpus scan already covers this file's source. This covers its
    // OUTPUT, which is what a reader sees, and it is the assertion that would
    // catch a banned word arriving through a tier name or a cluster name.
    const shapes = [
      buildPost(issued, mainnet),
      buildPost(issued, { ...mainnet, cluster: 'devnet', tier: 'Sovereign' }),
      buildPost({ ...issued, issued: false, settled: false }, mainnet),
      buildPost({ ...issued, issued: false, settled: true }, { ...mainnet, cluster: 'testnet' }),
    ]
    for (const post of shapes) expect(findBanned(post.text)).toEqual([])

    // The control: the scanner is known to work on this corpus, so an empty
    // result above means clean and not broken.
    expect(findBanned('a lottery ticket')).not.toEqual([])
  })
})

describe('the address', () => {
  it('shortens to four and four', () => {
    expect(shortAddress('2B7taMK2LvaJx7Rsf3cX4vUQAJbXbkX6FFH7Ud1ZfxHu')).toBe('2B7t…fxHu')
  })

  it('leaves a short string alone rather than producing an ellipsis of nothing', () => {
    expect(shortAddress('abc')).toBe('abc')
  })
})
