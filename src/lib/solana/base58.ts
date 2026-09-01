// Base58 (Bitcoin alphabet), by hand and on purpose.
//
// The rebuild script on the verify page is the one command a stranger has to be
// able to run to check us. `node rebuild.mjs` with nothing installed is a much
// better offer than one that starts with a package manager, so the snapshot
// path carries no dependency at all — this and `node:crypto` are the whole of
// it. Test vectors below are the addresses this project already hardcodes.
//
// Caller: `src/lib/snapshot/rpc.ts` and `scripts/rebuild-snapshot.ts`.

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const INDEX = new Map([...ALPHABET].map((c, i) => [c, i]))

export function decodeBase58(input: string): Uint8Array {
  if (input.length === 0) return new Uint8Array()
  const bytes: number[] = []
  for (const char of input) {
    let carry = INDEX.get(char)
    if (carry === undefined) throw new RangeError(`not base58: ${char}`)
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i]! * 58
      bytes[i] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  for (const char of input) {
    if (char !== '1') break
    bytes.push(0)
  }
  return Uint8Array.from(bytes.reverse())
}

export function encodeBase58(input: Uint8Array): string {
  if (input.length === 0) return ''
  const digits: number[] = []
  for (const byte of input) {
    let carry = byte
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i]! << 8
      digits[i] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  let out = ''
  for (const byte of input) {
    if (byte !== 0) break
    out += '1'
  }
  for (let i = digits.length - 1; i >= 0; i -= 1) out += ALPHABET[digits[i]!]
  return out
}
