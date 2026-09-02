// OAuth 1.0a request signing, because posting as an account needs user context
// and OAuth 2.0's user tokens expire in hours.
//
// Caller: `src/lib/bot/sink.ts`, for the one request this project makes to X.
//
// **Why not a dependency.** An hourly poster that runs forever, on a host that
// holds a key, is a bad place to add an npm package with a transitive tree: the
// no-doxx guard makes every third-party surface a thing to justify, and this is
// forty lines of RFC 5849 over `node:crypto`.
//
// **Why this is verifiable without an X account.** The part that is easy to get
// wrong is not the HMAC — that is one call into audited crypto — it is the
// signature base string: the percent-encoding rules, the sort, and the
// normalisation. RFC 5849 §3.4.1.3.1 publishes an example request and §3.4.1.1
// publishes the exact base string it must produce, so the risky half is checked
// against the specification rather than against a live endpoint that would tell
// us only "401".

import { createHmac } from 'node:crypto'

/**
 * RFC 3986 percent-encoding. `encodeURIComponent` leaves `!*'()` alone and the
 * specification does not, which is a difference that produces a valid-looking
 * signature that verifies nowhere.
 */
export function pct(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

export type Param = readonly [name: string, value: string]

/**
 * The signature base string for a request.
 *
 * `params` carries every query parameter, every form parameter and every
 * `oauth_*` parameter except the signature itself, **decoded**. A JSON body is
 * not a form and contributes nothing, which is why the X call signs only its
 * `oauth_*` set.
 */
export function baseString(method: string, url: string, params: Param[]): string {
  const parsed = new URL(url)
  // Scheme and host lowercased, default ports dropped, query and fragment gone.
  const isDefaultPort =
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  const host = isDefaultPort ? parsed.hostname : parsed.host
  const base = `${parsed.protocol.toLowerCase()}//${host.toLowerCase()}${parsed.pathname}`

  const normalised = params
    .map(([name, value]) => [pct(name), pct(value)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([name, value]) => `${name}=${value}`)
    .join('&')

  return `${method.toUpperCase()}&${pct(base)}&${pct(normalised)}`
}

export interface Credentials {
  consumerKey: string
  consumerSecret: string
  token: string
  tokenSecret: string
}

export function sign(base: string, credentials: Credentials): string {
  const key = `${pct(credentials.consumerSecret)}&${pct(credentials.tokenSecret)}`
  return createHmac('sha1', key).update(base).digest('base64')
}

/**
 * The `Authorization` header value for one request.
 *
 * `nonce` and `timestamp` are arguments rather than read from the environment,
 * so the whole header is a pure function and the test can assert a byte.
 */
export function authorization(args: {
  method: string
  url: string
  credentials: Credentials
  nonce: string
  /** Unix seconds. */
  timestamp: number
  /** Query or form parameters, if any. A JSON body contributes none. */
  params?: Param[]
}): string {
  const oauth: Param[] = [
    ['oauth_consumer_key', args.credentials.consumerKey],
    ['oauth_nonce', args.nonce],
    ['oauth_signature_method', 'HMAC-SHA1'],
    ['oauth_timestamp', String(args.timestamp)],
    ['oauth_token', args.credentials.token],
    ['oauth_version', '1.0'],
  ]
  const signature = sign(
    baseString(args.method, args.url, [...oauth, ...(args.params ?? [])]),
    args.credentials,
  )
  return `OAuth ${[...oauth, ['oauth_signature', signature] as Param]
    .map(([name, value]) => `${pct(name)}="${pct(value)}"`)
    .join(', ')}`
}
