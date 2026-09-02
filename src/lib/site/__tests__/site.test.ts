// The config, the formatting, and the one regression this batch is most likely
// to ship silently: losing a leg of the noindex triple.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PUMP_MINT, readConfig } from '../config.ts'
import { formatAmount } from '../../chain/latest.ts'

const root = (p: string): string => fileURLToPath(new URL(`../../../../${p}`, import.meta.url))
const read = (p: string): string => readFileSync(root(p), 'utf8')

describe('the site config', () => {
  const base = {
    RPC_URL: 'https://example.invalid',
    ISSUANCE_PROGRAM: '7qHEeK3Q5UW5jKykXqWeShqpWCypm4hey2EzYGotkTUs',
  }

  it('refuses to render without an RPC or a program', () => {
    expect(() => readConfig({ ...base, RPC_URL: '' })).toThrow(/RPC_URL/)
    expect(() => readConfig({ ...base, ISSUANCE_PROGRAM: undefined })).toThrow(/ISSUANCE_PROGRAM/)
  })

  it('leaves the reserve owner undefined in Phase 1', () => {
    // Not a zero, and not a default address. The Phase 1 program holds nothing
    // (D8), and the page says that rather than rendering an empty vault.
    expect(readConfig(base).reserveOwner).toBeUndefined()
    expect(readConfig({ ...base, RESERVE_OWNER: '' }).reserveOwner).toBeUndefined()
    expect(readConfig({ ...base, RESERVE_OWNER: 'abc' }).reserveOwner).toBe('abc')
  })

  it('carries the $PUMP mint from references.md, exactly', () => {
    expect(PUMP_MINT).toBe('pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn')
    expect(readConfig(base).pumpMint).toBe(PUMP_MINT)
  })
})

describe('formatting a token amount', () => {
  it('never touches a float', () => {
    expect(formatAmount(1_234_567n, 6)).toBe('1.234567')
    expect(formatAmount(0n, 6)).toBe('0.000000')
    expect(formatAmount(1n, 6)).toBe('0.000001')
    expect(formatAmount(1_500_000_000_000n, 6)).toBe('1,500,000.000000')
    expect(formatAmount(42n, 0)).toBe('42')
  })

  it('survives a value that would lose precision as a Number', () => {
    // 2^53 + 1. A float round-trip renders this as ...992.
    expect(formatAmount(9_007_199_254_740_993n, 0)).toBe('9,007,199,254,740,993')
  })
})

describe('the noindex triple', () => {
  // Three independent places, because any one of them can be dropped in a
  // config change and none of them reports its own absence. The placeholder
  // shipped with all three; this asserts the Next app still does.
  it('sends the header from next.config.ts', () => {
    expect(read('next.config.ts')).toMatch(/X-Robots-Tag'?,?\s*value: 'noindex, nofollow, noarchive, noimageindex'/)
  })

  it('sends the header from vercel.json too', () => {
    const vercel = JSON.parse(read('vercel.json')) as {
      headers: { headers: { key: string; value: string }[] }[]
      outputDirectory?: string
    }
    const tag = vercel.headers[0]!.headers.find((h) => h.key === 'X-Robots-Tag')
    expect(tag?.value).toBe('noindex, nofollow, noarchive, noimageindex')
    // The placeholder pinned the build to public/. Next builds its own output,
    // and leaving this set serves an empty directory.
    expect(vercel.outputDirectory).toBeUndefined()
  })

  it('disallows everything in robots.txt', () => {
    expect(read('app/robots.ts')).toMatch(/userAgent: '\*', disallow: '\/'/)
  })

  it('sets the meta tag in the layout', () => {
    const layout = read('app/layout.tsx')
    expect(layout).toMatch(/robots:\s*\{[^}]*index: false/)
    expect(layout).toMatch(/noarchive: true/)
    expect(layout).toMatch(/noimageindex: true/)
  })
})

/**
 * D29 put the Bestiary on drakes.fun reading devnet. Two things then became
 * load-bearing copy rather than decoration: the chip that names the cluster,
 * and the sentence that says the issuances are a rehearsal. Both are tied to
 * the server-side classification, and both are the kind of thing that gets
 * tidied away by someone who does not know why they are there.
 *
 * These are source assertions for the same reason the noindex ones are: the
 * failure is silent, and a rendering test would pass against a page whose
 * condition had been inverted.
 */
describe('the rehearsal disclosure', () => {
  it('shows the loud chip on every cluster that is not mainnet', () => {
    for (const page of ['app/page.tsx', 'app/verify/page.tsx']) {
      expect(read(page)).toMatch(/cluster === 'mainnet' \? '' : ' chip--rehearsal'/)
    }
  })

  it('says in words that mainnet has not started, and only off mainnet', () => {
    expect(read('app/page.tsx')).toMatch(/cluster !== 'mainnet' &&/)
    expect(read('app/page.tsx')).toMatch(/These issuances are a rehearsal on/)
    expect(read('app/page.tsx')).toMatch(/Mainnet has not started/)
    expect(read('app/verify/page.tsx')).toMatch(/Mainnet has not started/)
  })

  it('classifies the cluster server-side on both pages, never from the URL', () => {
    for (const page of ['app/page.tsx', 'app/verify/page.tsx']) {
      expect(read(page)).toMatch(/clusterName\(/)
    }
  })

  it('refuses to render figures when the deployment names no chain', () => {
    // A production origin with no RPC_URL used to throw. It now says so.
    expect(read('app/page.tsx')).toMatch(/missingConfig\(\)/)
    expect(read('app/verify/page.tsx')).toMatch(/missingConfig\(\)/)
  })
})
