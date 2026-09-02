// Flat-colour placeholders, a PNG encoder, and the 48 px avatar guard.
//
// Caller: `scripts/generate-collection.ts`.
//
// **No image dependency, on purpose.** The pipeline has to run before there is
// any art and on a machine that has installed nothing, so the PNG is written by
// hand over `node:zlib` — the same reason the snapshot path hand-writes base58.
// When the illustrator delivers, the placeholder painter is replaced and
// everything else here — the mask, the downscale, the measurements — stays.
//
// **The placeholders are flat and the guard must never reward that.**
// `DESIGN.md` §9.2: no threshold may be one that a painted piece can only pass
// by flattening. These shapes exist to prove the pipeline runs, not to be a
// style.

import { deflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'

export interface Rgb { r: number; g: number; b: number }

/** A tiny palette per variant. Placeholder colour, never a design decision. */
const HUES: Record<string, Rgb> = {
  slate: { r: 60, g: 66, b: 74 }, moss: { r: 58, g: 70, b: 56 },
  rust: { r: 82, g: 58, b: 48 }, graphite: { r: 72, g: 70, b: 68 },
  clay: { r: 86, g: 68, b: 56 },
  charcoal: { r: 26, g: 26, b: 28 }, carbon: { r: 20, g: 20, b: 22 },
  pitch: { r: 16, g: 16, b: 18 }, basalt: { r: 32, g: 30, b: 32 },
  obsidian: { r: 12, g: 12, b: 16 }, scorched: { r: 38, g: 26, b: 22 },
  amber: { r: 224, g: 158, b: 62 }, bronze: { r: 226, g: 106, b: 52 },
  pale: { r: 214, g: 210, b: 196 }, white: { r: 240, g: 238, b: 232 },
  gold: { r: 232, g: 186, b: 78 }, split: { r: 200, g: 120, b: 90 },
  molten: { r: 244, g: 120, b: 40 }, blind: { r: 150, g: 148, b: 142 },
}
const hue = (name: string): Rgb => HUES[name] ?? { r: 128, g: 120, b: 112 }

export class Bitmap {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.data = new Uint8ClampedArray(width * height * 4)
  }

  set(x: number, y: number, c: Rgb, alpha = 1): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const i = (y * this.width + x) * 4
    const d = this.data
    d[i] = d[i]! * (1 - alpha) + c.r * alpha
    d[i + 1] = d[i + 1]! * (1 - alpha) + c.g * alpha
    d[i + 2] = d[i + 2]! * (1 - alpha) + c.b * alpha
    d[i + 3] = 255
  }

  fill(c: Rgb): void {
    for (let y = 0; y < this.height; y += 1) for (let x = 0; x < this.width; x += 1) this.set(x, y, c)
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: Rgb, alpha = 1): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const dx = (x - cx) / rx
        const dy = (y - cy) / ry
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, alpha)
      }
    }
  }

  at(x: number, y: number): Rgb {
    const i = (y * this.width + x) * 4
    return { r: this.data[i]!, g: this.data[i + 1]!, b: this.data[i + 2]! }
  }
}

/** The placeholder painter. Replaced wholesale when art arrives. */
export function paintPlaceholder(size: number, traits: Record<string, string>): Bitmap {
  const bmp = new Bitmap(size, size)
  const s = (n: number) => Math.round((n * size) / 100)
  bmp.fill(hue(traits.field!))
  // Body: a mass low and centred, so the 48 px crop keeps it.
  bmp.ellipse(s(50), s(62), s(30), s(34), hue(traits.body!))
  // Head, centred in the crop that survives (§9.1 rule 1).
  bmp.ellipse(s(50), s(42), s(22), s(20), hue(traits.body!))
  // Horns break the outline for the tiers that have them.
  if (traits.head !== 'stub') {
    bmp.ellipse(s(38), s(26), s(5), s(10), hue(traits.body!))
    bmp.ellipse(s(62), s(26), s(5), s(10), hue(traits.body!))
  }
  // The seam: the one bright thing, which is the whole 48 px signature.
  bmp.ellipse(s(50), s(52), s(4), s(16), hue(traits.eyes!), 0.75)
  // Eyes, the centre of the frame.
  bmp.ellipse(s(43), s(40), s(4), s(3), hue(traits.eyes!))
  bmp.ellipse(s(57), s(40), s(4), s(3), hue(traits.eyes!))
  if (traits.mouth === 'flame' || traits.mouth === 'roar') {
    bmp.ellipse(s(50), s(56), s(7), s(5), hue('molten'), 0.9)
  }
  if (traits.chain !== 'none') bmp.ellipse(s(50), s(72), s(16), s(3), hue('gold'), 0.9)
  if (traits.garment !== 'none') bmp.ellipse(s(50), s(88), s(30), s(10), hue(traits.field!), 0.55)
  if (traits.hoard !== 'none') bmp.ellipse(s(20), s(90), s(10), s(5), hue('gold'), 0.85)
  return bmp
}

/** Box downscale. Nearest-neighbour would let a one-pixel seam survive by accident. */
export function downscale(src: Bitmap, size: number): Bitmap {
  const out = new Bitmap(size, size)
  const f = src.width / size
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0, g = 0, b = 0, n = 0
      for (let sy = Math.floor(y * f); sy < Math.floor((y + 1) * f); sy += 1) {
        for (let sx = Math.floor(x * f); sx < Math.floor((x + 1) * f); sx += 1) {
          const c = src.at(sx, sy)
          r += c.r; g += c.g; b += c.b; n += 1
        }
      }
      out.set(x, y, { r: r / n, g: g / n, b: b / n })
    }
  }
  return out
}

const luminance = (c: Rgb): number => {
  const lin = (u: number) => { const v = u / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
}
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

export interface GuardReport {
  /** Body against its own field, inside the circle, after downscale (§9.1). */
  bodyVsField: number
  /** The tile against a dark chrome and a light one. */
  vsBlack: number
  vsWhite: number
  /** Pixels of the seam that survived: the signature at 48 px. */
  seamPixels: number
  passes: boolean
  failures: string[]
}

export const GUARD = {
  /** A shape inside its own tile, not text: WCAG 1.4.11's floor. */
  bodyVsField: 1.6,
  /** The tile must separate from BOTH chromes, or it dissolves on one theme. */
  vsChrome: 1.25,
  /**
   * **Provisional, and it must be calibrated at milestone 1.**
   *
   * The seam is the one bright thing in a dark silhouette and it is what makes
   * a piece recognisable at 48 px (§9.1 rule 3). Measuring it on flat-colour
   * placeholders is measuring nothing: with two flat regions the "brightest
   * 30% of the range" is half the circle, and this metric reported 992 pixels
   * where a real seam is a few dozen. The number stays here so the shape of the
   * check is in place; the floor is set against the illustrator's first
   * delivery and not before. `DESIGN.md` §9.2: if a threshold and the brief
   * disagree, the brief is the one that was paid for.
   */
  seamPixels: 12,
  /** Marks the floors that have not yet met real art. */
  provisional: ['seamPixels'] as const,
} as const

/**
 * The §9.2 guard, run on the masked and downscaled image.
 *
 * Deliberately measured inside the circle: a circle inscribed in a square
 * discards 21.5% of the area, and a relic the circle amputates does not exist
 * for the holder using the piece as an avatar.
 */
export function guardAt48(full: Bitmap): GuardReport {
  const small = downscale(full, 48)
  const c = 23.5
  const r = 24
  const inside: Rgb[] = []
  for (let y = 0; y < 48; y += 1) {
    for (let x = 0; x < 48; x += 1) {
      if ((x - c) ** 2 + (y - c) ** 2 <= r * r) inside.push(small.at(x, y))
    }
  }
  const lums = inside.map(luminance).sort((a, b) => a - b)
  const dark = lums[Math.floor(lums.length * 0.15)]!
  const light = lums[Math.floor(lums.length * 0.85)]!
  const mean = lums.reduce((a, b) => a + b, 0) / lums.length
  const seamFloor = dark + (light - dark) * 0.7
  const seamPixels = lums.filter((l) => l >= seamFloor).length

  const report: GuardReport = {
    bodyVsField: Math.round(ratio(dark, light) * 100) / 100,
    vsBlack: Math.round(ratio(mean, 0) * 100) / 100,
    vsWhite: Math.round(ratio(mean, 1) * 100) / 100,
    seamPixels,
    passes: true,
    failures: [],
  }
  if (report.bodyVsField < GUARD.bodyVsField) report.failures.push(`body/field ${report.bodyVsField} < ${GUARD.bodyVsField}`)
  if (report.vsBlack < GUARD.vsChrome) report.failures.push(`vs #000 ${report.vsBlack} < ${GUARD.vsChrome}`)
  if (report.vsWhite < GUARD.vsChrome) report.failures.push(`vs #FFF ${report.vsWhite} < ${GUARD.vsChrome}`)
  if (report.seamPixels < GUARD.seamPixels) report.failures.push(`seam ${report.seamPixels}px < ${GUARD.seamPixels}`)
  report.passes = report.failures.length === 0
  return report
}

/** A minimal PNG, written by hand so the pipeline needs nothing installed. */
export function encodePng(bmp: Bitmap): Buffer {
  const raw = Buffer.alloc((bmp.width * 4 + 1) * bmp.height)
  let o = 0
  for (let y = 0; y < bmp.height; y += 1) {
    raw[o++] = 0
    for (let x = 0; x < bmp.width; x += 1) {
      const i = (y * bmp.width + x) * 4
      raw[o++] = bmp.data[i]!; raw[o++] = bmp.data[i + 1]!
      raw[o++] = bmp.data[i + 2]!; raw[o++] = bmp.data[i + 3]!
    }
  }
  const chunk = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), body])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(bmp.width, 0); ihdr.writeUInt32BE(bmp.height, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

let table: number[] | null = null
function crc32(buf: Buffer): number {
  if (table === null) {
    table = []
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table.push(c)
    }
  }
  let c = 0xffffffff
  for (const byte of buf) c = table[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return c ^ 0xffffffff
}

export const sha256Hex = (s: string): string => createHash('sha256').update(s).digest('hex')
