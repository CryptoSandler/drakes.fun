// The publisher, against recorded response shapes — the only way to check it
// without an account, and the reason the shapes are written down here.

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AlreadyPosted, consoleSink, fileSink, PublishFailed, RateLimited, xSink } from '../sink.ts'
import { buildPost } from '../post.ts'

const post = buildPost(
  {
    hour: 378n, issued: true, pieceId: 2951,
    recipient: '2B7taMK2LvaJx7Rsf3cX4vUQAJbXbkX6FFH7Ud1ZfxHu',
    snapshotSlot: 491_686_001n, settled: true,
  },
  { cluster: 'mainnet', siteUrl: 'https://drakes.fun' },
)

const CREDENTIALS = {
  consumerKey: 'ck-public', consumerSecret: 'cs-SECRET-VALUE',
  token: 'tk-public', tokenSecret: 'ts-SECRET-VALUE',
}

const answer = (status: number, body: string, headers: Record<string, string> = {}) =>
  (async () => new Response(body, { status, headers })) as unknown as typeof fetch

describe('the console and file sinks', () => {
  it('write one JSON line carrying the whole post', () => {
    const lines: string[] = []
    return consoleSink((s) => lines.push(s)).publish(post).then(() => {
      const row = JSON.parse(lines[0]!) as { hour: string; text: string; url: string }
      expect(row.hour).toBe('378')
      expect(row.text).toBe(post.text)
      expect(row.url).toBe('https://drakes.fun/verify/378')
    })
  })

  it('append rather than overwrite, so a rehearsal keeps every post', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'bot-')), 'posts.jsonl')
    const sink = fileSink(path)
    await sink.publish(post)
    await sink.publish(post)
    expect(readFileSync(path, 'utf8').trim().split('\n')).toHaveLength(2)
  })
})

describe('the X sink', () => {
  it('returns the id and a link when the platform says it published', async () => {
    const published = await xSink(
      CREDENTIALS,
      answer(201, JSON.stringify({ data: { id: '1234567890', text: post.text } })),
    ).publish(post)
    expect(published.id).toBe('1234567890')
    expect(published.url).toBe('https://x.com/i/status/1234567890')
  })

  it('refuses a 2xx that published nothing', async () => {
    // The ntfy lesson: a 200 from a captive portal, a proxy interstitial or a
    // rewritten host looks exactly like success to a caller that only checks
    // `res.ok`.
    await expect(xSink(CREDENTIALS, answer(200, '<html>hello</html>')).publish(post))
      .rejects.toThrow(/not JSON/)
    await expect(xSink(CREDENTIALS, answer(200, JSON.stringify({ data: {} }))).publish(post))
      .rejects.toThrow(/without an id/)
  })

  it('reads the reset time out of the rate-limit response instead of assuming one', async () => {
    // X's published caps differ by tier and change; the server's own header is
    // the only number that is true right now.
    const error = await xSink(
      CREDENTIALS,
      answer(429, 'too many', { 'x-rate-limit-reset': '1788281174' }),
    ).publish(post).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RateLimited)
    expect((error as RateLimited).resetAtUnix).toBe(1_788_281_174)

    const noHeader = await xSink(CREDENTIALS, answer(429, 'too many')).publish(post).catch((e: unknown) => e)
    expect((noHeader as RateLimited).resetAtUnix).toBe(null)
  })

  it('reads a duplicate rejection as "already out there"', async () => {
    await expect(
      xSink(CREDENTIALS, answer(403, JSON.stringify({ detail: 'You are not allowed to create a duplicate status.' })))
        .publish(post),
    ).rejects.toBeInstanceOf(AlreadyPosted)
  })

  it('separates a server fault, which is worth retrying, from a rejection, which is not', async () => {
    const server = await xSink(CREDENTIALS, answer(503, 'upstream')).publish(post).catch((e: unknown) => e)
    expect((server as PublishFailed).retryable).toBe(true)
    const rejected = await xSink(CREDENTIALS, answer(401, 'Unauthorized')).publish(post).catch((e: unknown) => e)
    expect((rejected as PublishFailed).retryable).toBe(false)
  })

  it('never puts a secret in a request it sends or an error it throws', async () => {
    // The promise `alert.ts` makes about the ntfy topic, made here about four
    // credentials. The failure paths are where these leak.
    let sentHeaders = ''
    let sentBody = ''
    const capture = (async (_url: string, init: RequestInit) => {
      sentHeaders = JSON.stringify(init.headers)
      sentBody = String(init.body)
      return new Response('Unauthorized', { status: 401 })
    }) as unknown as typeof fetch

    const error = await xSink(CREDENTIALS, capture).publish(post).catch((e: unknown) => e)
    const everywhere = `${sentHeaders}\n${sentBody}\n${(error as Error).message}\n${(error as Error).stack ?? ''}`
    expect(everywhere).not.toContain('cs-SECRET-VALUE')
    expect(everywhere).not.toContain('ts-SECRET-VALUE')
    // The control: the scan is looking at the right strings, so the two
    // absences above are absences and not an empty haystack.
    expect(sentHeaders).toContain('ck-public')
    expect(sentBody).toContain('Drake #2951')
  })

  it('refuses to be built with a blank credential', async () => {
    // Otherwise the first symptom is a 401, which reads like a revoked key.
    expect(() => xSink({ ...CREDENTIALS, tokenSecret: '' })).toThrow(/tokenSecret is empty/)
  })
})
