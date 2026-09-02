// OKLCH to a WCAG contrast ratio, so a palette is measured rather than eyeballed.
//
// Caller: `src/lib/site/__tests__/contrast.test.ts`, which reads `tokens.css`
// and recomputes every pair in BOTH themes on every run. Nothing at runtime
// calls this; it is a guard, and its job is to fail.
//
// **Why compute rather than declare.** A dark theme built by inverting a light
// one produces ratios nobody measured: the same ink on a dark ground is a
// different number, and the pair that breaks is usually the one nobody thought
// of — here it was amber-chip-with-light-text, which reads fine in the head and
// is 1.6:1 on the screen. A table of ratios in a document goes stale the first
// time a token moves. This reads the tokens.

/** sRGB in [0,1]. */
export interface Rgb {
  r: number
  g: number
  b: number
}

/** `oklch(46% 0.18 27)` — the only colour syntax `tokens.css` is allowed to use. */
export function parseOklch(value: string): { l: number; c: number; h: number } {
  const m = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value.trim())
  if (m === null) throw new SyntaxError(`not an oklch() colour: ${value}`)
  return { l: Number(m[1]) / 100, c: Number(m[2]), h: Number(m[3]) }
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

/**
 * OKLCH -> OKLab -> linear sRGB -> sRGB, the published matrices.
 *
 * Out-of-gamut components are clamped, which is what a browser does when it
 * paints one, so the ratio computed here is the ratio a reader sees.
 */
export function oklchToRgb(value: string): Rgb {
  const { l: L, c, h } = parseOklch(value)
  const hr = (h * Math.PI) / 180
  const a = c * Math.cos(hr)
  const b = c * Math.sin(hr)

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l3 = l_ ** 3
  const m3 = m_ ** 3
  const s3 = s_ ** 3

  const lr = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
  const lg = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
  const lb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3

  const gamma = (u: number) =>
    u <= 0.0031308 ? 12.92 * u : 1.055 * Math.abs(u) ** (1 / 2.4) - 0.055

  return { r: clamp01(gamma(lr)), g: clamp01(gamma(lg)), b: clamp01(gamma(lb)) }
}

/** WCAG 2.x relative luminance. */
export function luminance({ r, g, b }: Rgb): number {
  const lin = (u: number) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG 2.x contrast ratio, 1 to 21. Order of the arguments does not matter. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(oklchToRgb(a))
  const lb = luminance(oklchToRgb(b))
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Two decimals, so a report and an assertion read the same number. */
export const ratio = (a: string, b: string): number =>
  Math.round(contrastRatio(a, b) * 100) / 100

/**
 * The floors, per role, and they are not all 4.5.
 *
 * `DESIGN.md` §10.3 carries the same table in prose. A floor written in one
 * place and enforced in another drifts; this is the enforced one.
 */
export const FLOOR = {
  /** WCAG AA for body text. Prose, labels, table cells, the footer. */
  text: 4.5,
  /** WCAG AA for large text: the clock, the display headings, the lede. */
  largeText: 3,
  /** WCAG 1.4.11 for a UI component or a meaningful graphic. */
  nonText: 3,
  /**
   * A hairline that separates but carries no meaning on its own.
   *
   * Stated rather than waived: a rule at 1.5 is visible on a calibrated screen
   * and is not a control, and the layout does not depend on seeing it.
   */
  hairline: 1.4,
} as const

export type Floor = keyof typeof FLOOR
