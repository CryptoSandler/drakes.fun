// The manifest `initialize` commits, and the per-piece metadata behind it.
//
// Caller: `scripts/upload-collection.ts`. `scripts/generate-collection.ts`
// produces the allocation this reads; nothing else calls it.
//
// **Two manifests, and the difference matters.**
//
// `manifest.json` is the ALLOCATION: id, tier, traits, fixed by the published
// seed and provable before anyone knows who will be issued anything (D13). It
// exists before any upload.
//
// `manifest.final.json` is that plus the **URI of each piece**, which cannot
// exist until the bytes are uploaded and have addresses. The program's own
// `InitializeParams` says the hash commits "id, tier, traits, URI" — so the
// final manifest is what `initialize` commits, and the allocation's hash is an
// intermediate that must never be handed to C2.
//
// **What the metadata says, and what it refuses to say.** Tiers differ in
// appearance and in nothing else (D13); the description says that and makes no
// claim about worth, backing or redemption (§7, D31). It is the most widely
// copied copy this project will ever produce — every marketplace reprints it —
// so it is written once, plainly, and it promises nothing.

import { createHash } from 'node:crypto'
import type { Piece } from './traits.ts'

export const IMAGE_TYPE = 'image/png'

/** `0000.png` — fixed width so a folder sorts the way a person expects. */
export const pieceFile = (id: number, extension: string): string =>
  `${String(id).padStart(4, '0')}.${extension}`

export interface Allocation {
  version: number
  seed: number
  collectionSize: number
  tiers: Record<string, number>
  pieces: Piece[]
}

export interface Metadata {
  name: string
  description: string
  image: string
  attributes: { trait_type: string; value: string }[]
  properties: { files: { uri: string; type: string }[]; category: 'image' }
}

/**
 * One piece's metadata document.
 *
 * `imageBase` is the address the uploaded image folder got, with no trailing
 * slash — a gateway URL, because a wallet fetches it over HTTP and `ar://` is
 * not a scheme a browser resolves.
 */
export function metadataFor(piece: Piece, imageBase: string): Metadata {
  const image = `${imageBase}/${pieceFile(piece.id, 'png')}`
  return {
    name: `Drake #${piece.id}`,
    description:
      'One of 4,000 Drakes. Tiers differ in appearance and in nothing else: ' +
      'every piece carries the same claim on the collection as every other.',
    image,
    attributes: [
      { trait_type: 'Tier', value: piece.tier },
      ...Object.entries(piece.traits).map(([layer, variant]) => ({
        trait_type: layer.charAt(0).toUpperCase() + layer.slice(1),
        value: variant,
      })),
    ],
    properties: { files: [{ uri: image, type: IMAGE_TYPE }], category: 'image' },
  }
}

export interface FinalManifest extends Allocation {
  /** The transaction the image folder was uploaded under. */
  images: string
  /** The transaction the metadata folder was uploaded under. */
  metadata: string
  /** The gateway both are addressed through, with no trailing slash. */
  gateway: string
  /** Every piece, with the URI its asset should carry. */
  pieces: (Piece & { uri: string })[]
}

export function finalManifest(args: {
  allocation: Allocation
  images: string
  metadata: string
  gateway: string
}): FinalManifest {
  const base = args.gateway.replace(/\/$/, '')
  return {
    ...args.allocation,
    images: args.images,
    metadata: args.metadata,
    gateway: base,
    pieces: args.allocation.pieces.map((piece) => ({
      ...piece,
      uri: `${base}/${args.metadata}/${pieceFile(piece.id, 'json')}`,
    })),
  }
}

/**
 * The bytes whose sha256 `initialize` commits.
 *
 * Canonical: keys in declaration order, no whitespace, so the hash is a
 * function of the content and not of a formatter. Identical rule to
 * `generate-collection.ts`, deliberately — two hashing conventions in one
 * project is one convention too many.
 */
export const canonical = (manifest: unknown): string => JSON.stringify(manifest)

export const sha256Hex = (s: string): string => createHash('sha256').update(s).digest('hex')
