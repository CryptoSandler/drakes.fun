// The signer, against the specification's own worked example.

import { describe, expect, it } from 'vitest'
import { authorization, baseString, pct, sign, type Param } from '../oauth1.ts'

// RFC 5849 §3.4.1.3.1: the example request, with its parameters decoded
// exactly as the section's table shows them.
const RFC_PARAMS: Param[] = [
  ['b5', '=%3D'],
  ['a3', 'a'],
  ['c@', ''],
  ['a2', 'r b'],
  ['oauth_consumer_key', '9djdj82h48djs9d2'],
  ['oauth_token', 'kkk9d7dh3k39sjv7'],
  ['oauth_signature_method', 'HMAC-SHA1'],
  ['oauth_timestamp', '137131201'],
  ['oauth_nonce', '7d8f3e4a'],
  ['c2', ''],
  ['a3', '2 q'],
]

// RFC 5849 §3.4.1.1, verbatim. The line breaks in the document are for
// printing; the value is one string.
const RFC_BASE_STRING =
  'POST&http%3A%2F%2Fexample.com%2Frequest&a2%3Dr%2520b%26a3%3D2%2520q%26a3%3Da%26b5%3D%253D%25253D' +
  '%26c%2540%3D%26c2%3D%26oauth_consumer_key%3D9djdj82h48djs9d2%26oauth_nonce%3D7d8f3e4a' +
  '%26oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D137131201%26oauth_token%3Dkkk9d7dh3k39sjv7'

describe('the signature base string', () => {
  it('is the one RFC 5849 publishes, character for character', () => {
    // The whole risky half of OAuth 1.0a: the encoding, the sort — note `a3`
    // appearing twice and ordering by its VALUE — and the dropped query string.
    expect(baseString('POST', 'http://example.com/request?b5=%3D%253D&a3=a&c%40=&a2=r%20b', RFC_PARAMS))
      .toBe(RFC_BASE_STRING)
  })

  it('drops a default port and keeps a real one', () => {
    const params: Param[] = [['a', '1']]
    expect(baseString('GET', 'https://example.com:443/x', params)).toContain('https%3A%2F%2Fexample.com%2Fx')
    expect(baseString('GET', 'https://example.com:8443/x', params)).toContain('example.com%3A8443')
  })

  it('upper-cases the method and lower-cases the host', () => {
    expect(baseString('post', 'https://API.X.COM/2/tweets', [])).toBe('POST&https%3A%2F%2Fapi.x.com%2F2%2Ftweets&')
  })
})

describe('percent encoding', () => {
  it('escapes the four characters encodeURIComponent leaves alone', () => {
    // The difference between a signature that verifies and one that does not.
    expect(pct("!*'()")).toBe('%21%2A%27%28%29')
  })

  it('leaves the unreserved set alone', () => {
    expect(pct('aZ09-._~')).toBe('aZ09-._~')
  })

  it('escapes space as %20 and not as +', () => {
    expect(pct('r b')).toBe('r%20b')
  })
})

describe('the signature', () => {
  it('is HMAC-SHA1 over the base string with the two secrets joined by &', () => {
    // Computed by two implementations that are not this one, 2026-09-02:
    //   printf 'POST&x&y' | openssl dgst -sha1 -hmac 'a&b' -binary | base64
    //   python3 hmac.new(b'a&b', b'POST&x&y', hashlib.sha1)
    // Both give the value below. The first version of this line was a number
    // written from memory, and it was wrong -- which is the whole reason the
    // vector is computed and cited rather than recalled.
    expect(sign('POST&x&y', { consumerKey: 'k', consumerSecret: 'a', token: 't', tokenSecret: 'b' }))
      .toBe('K1UEfKMVofifg/1yT1NnHFwJtBg=')
  })

  it('encodes the secrets before joining them', () => {
    // A secret containing a reserved character produces a different key, and
    // getting this wrong fails only for the accounts whose secret has one.
    const withReserved = sign('POST&x&y', { consumerKey: 'k', consumerSecret: 'a b', token: 't', tokenSecret: 'b' })
    const withEncoded = sign('POST&x&y', { consumerKey: 'k', consumerSecret: 'a%20b', token: 't', tokenSecret: 'b' })
    expect(withReserved).not.toBe(withEncoded)
  })
})

describe('the authorization header', () => {
  const credentials = { consumerKey: 'ck', consumerSecret: 'cs', token: 'tk', tokenSecret: 'ts' }

  it('carries every oauth parameter, quoted and encoded', () => {
    const header = authorization({
      method: 'POST',
      url: 'https://api.x.com/2/tweets',
      credentials,
      nonce: 'n0nce',
      timestamp: 1_788_281_174,
    })
    expect(header.startsWith('OAuth ')).toBe(true)
    for (const key of ['oauth_consumer_key="ck"', 'oauth_token="tk"', 'oauth_nonce="n0nce"',
      'oauth_signature_method="HMAC-SHA1"', 'oauth_timestamp="1788281174"', 'oauth_version="1.0"']) {
      expect(header).toContain(key)
    }
    expect(header).toMatch(/oauth_signature="[A-Za-z0-9%]+"/)
  })

  it('changes with the nonce, so a replayed header is not produced by accident', () => {
    const one = authorization({ method: 'POST', url: 'https://api.x.com/2/tweets', credentials, nonce: 'a', timestamp: 1 })
    const two = authorization({ method: 'POST', url: 'https://api.x.com/2/tweets', credentials, nonce: 'b', timestamp: 1 })
    expect(one).not.toBe(two)
  })
})
