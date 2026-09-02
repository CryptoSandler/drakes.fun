// How a conversion's `funded_by` reaches the screen.
//
// Caller: `app/verify/page.tsx`, the Source column of the hoard table.
//
// **The incident.** Migration `0004` added `funded_by` and was applied to the
// test database and not to production. The row therefore arrived without the
// field, and the page read
//
//     b.funded_by === 'creator' ? 'seeded by the creator…' : 'fees'
//
// which turned `undefined` into **`fees`** — a claim about where money came
// from, rendered from the absence of any claim at all. Nothing threw, nothing
// looked wrong, and the wrong answer was the reassuring one.
//
// This is the same rule the rest of the project already follows about empty
// results: a value that is not one of the two known values is not quietly
// mapped to either of them. `funded_by` is the ONE asserted column in a table
// whose whole point is that its figures are derived, so it is the last place a
// default belongs.

export type Provenance = 'fees' | 'creator'

export interface ProvenanceLabel {
  kind: Provenance | 'unknown'
  text: string
}

const LABELS: Record<Provenance, string> = {
  fees: 'fees',
  // The owner's wording, D28. It is copy, and it says what it is.
  creator: 'seeded by the creator, not from fees',
}

/**
 * A ternary here would be a bug by construction: it has two branches and there
 * are three cases. `undefined`, `null`, `''` and anything the check constraint
 * does not admit all land in `unknown`, which the page renders as a fault
 * rather than as a provenance.
 */
export function provenanceLabel(value: unknown): ProvenanceLabel {
  if (value === 'fees' || value === 'creator') return { kind: value, text: LABELS[value] }
  return {
    kind: 'unknown',
    text: 'source not recorded — this row predates the column or the schema is behind',
  }
}
