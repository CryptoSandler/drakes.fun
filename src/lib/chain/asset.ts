// The mpl-core asset a settlement minted, and whether it names the right piece.
//
// Caller: `scripts/verify-assets.ts`.
//
// **Why this file exists.** The program used to take `name` and `uri` from
// whoever cranked, and the piece id is chosen INSIDE `settle_issuance` — so no
// caller could know it, and the cranker's default named the asset for the
// HOUR. Measured on devnet 2026-09-02: hour 378 issued piece #2951 and the
// asset in that holder's wallet reads `Drake #379`. This is the check that
// catches that, and the acceptance test for the fix.
//
// **The layout is checked against a real account, not against a struct.** Read
// from `62zrUBQY2eq8NtX9bnhDiQzQaPjbCk9SL9kRkuBEnuHC` on 2026-09-02: key byte
// 1 (`AssetV1`), owner, an update-authority enum whose tag 2 is `Collection`,
// then two borsh strings, then one byte of `Option<seq>` left over.

import { encodeBase58 } from '../solana/base58.ts'

/** `AssetV1`. A collection account carries a different key and is skipped. */
export const ASSET_V1 = 1

export interface CoreAsset {
  address: string
  owner: string
  updateAuthority: string | null
  name: string
  uri: string
}

export function decodeAsset(address: string, data: Uint8Array): CoreAsset | null {
  if (data.length < 38 || data[0] !== ASSET_V1) return null
  const view = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  let at = 1
  const owner = encodeBase58(data.subarray(at, at + 32))
  at += 32
  const tag = data[at]!
  at += 1
  // 0 None, 1 Address, 2 Collection. Only None carries no pubkey.
  let updateAuthority: string | null = null
  if (tag !== 0) {
    updateAuthority = encodeBase58(data.subarray(at, at + 32))
    at += 32
  }
  const read = (): string => {
    const len = view.readUInt32LE(at)
    at += 4
    // A length past the end is a layout that moved, not a long name.
    if (at + len > data.length) throw new Error(`${address}: a string ran past the account`)
    const out = view.subarray(at, at + len).toString('utf8')
    at += len
    return out
  }
  return { address, owner, updateAuthority, name: read(), uri: read() }
}

/**
 * The piece id an asset claims, taken from its name and from its URI
 * separately — because the whole failure being hunted is the two of them
 * agreeing with each other and disagreeing with the chain.
 */
export function claimedPiece(asset: CoreAsset): { fromName: number | null; fromUri: number | null } {
  const trailing = /(\d+)\s*$/.exec(asset.name)
  const file = /(\d+)\.json$/.exec(asset.uri) ?? /(\d+)\s*$/.exec(asset.uri)
  return {
    fromName: trailing === null ? null : Number(trailing[1]),
    fromUri: file === null ? null : Number(file[1]),
  }
}

export interface AssetVerdict {
  hour: bigint
  /** What the event says was issued. The chain's answer. */
  pieceId: number
  asset: CoreAsset | null
  agrees: boolean
  why: string
}

/** Does the asset name the piece the event emitted? */
export function checkAsset(hour: bigint, pieceId: number, asset: CoreAsset | null): AssetVerdict {
  if (asset === null) {
    return { hour, pieceId, asset, agrees: false, why: 'no mpl-core asset found in the settle transaction' }
  }
  const claimed = claimedPiece(asset)
  if (claimed.fromName === null || claimed.fromUri === null) {
    return { hour, pieceId, asset, agrees: false, why: `name or uri carries no piece id: ${asset.name} · ${asset.uri}` }
  }
  if (claimed.fromName !== pieceId || claimed.fromUri !== pieceId) {
    return {
      hour, pieceId, asset, agrees: false,
      why: `the event issued piece ${pieceId}; the asset says ${claimed.fromName} (name) and ${claimed.fromUri} (uri)`,
    }
  }
  return { hour, pieceId, asset, agrees: true, why: 'the asset names the piece the event emitted' }
}
