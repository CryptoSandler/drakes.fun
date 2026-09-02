// The register: one row per thing that happened, each with the signature that
// proves it and the date it carries.
//
// Caller: `app/verify/timeline/page.tsx`. Pure — it takes what the page read
// and orders it; it fetches nothing, so the ordering and the labelling are
// testable without a chain or a database.
//
// **Where each row's date comes from, because they do not come from the same
// place and a timeline that hides that is lying about its own axis.**
//
// - An **issuance** is dated by the schedule: `genesis + hour * period`, both
//   read from the config account. That is the instant the protocol names for
//   that hour, it is exact, and a stranger derives it from the same two numbers.
//   It is not the moment the transaction landed — the crank settles seconds to
//   minutes later — and the page says so rather than implying a precision it
//   does not have.
// - A **conversion** is dated by its transaction's own block time, read out of
//   the transaction when it was indexed (D27).
//
// **Every row carries a signature and nothing here is asserted except one
// column**, `funded_by`, which `provenanceLabel` already marks as the single
// thing in this project a reader cannot re-derive (D28).

import { issueAt, type Schedule } from '../protocol/schedule.ts'
import { provenanceLabel, type ProvenanceLabel } from './provenance.ts'

export interface IssuanceRow {
  kind: 'issuance'
  /** Unix seconds, derived from the schedule. */
  at: number
  hour: number
  /** Absent when the hour issued nothing. */
  pieceId: number | null
  recipient: string
  signature: string
  /** The permalink, which is where the proof for this row lives. */
  href: string
}

export interface ConversionRow {
  kind: 'conversion'
  /** Unix seconds, from the transaction's block time. */
  at: number
  solSpent: string
  pumpReceived: string
  signature: string
  source: ProvenanceLabel
}

export type Row = IssuanceRow | ConversionRow

export interface RawIssuance {
  hour: number
  minted: boolean
  pieceId: number
  recipient: string
  signature: string
}

export interface RawConversion {
  signature: string
  sol_spent: string
  pump_received: string
  block_time: string | null
  slot: string
  funded_by: unknown
}

/** The program's marker for "this hour issued nothing". */
const NOTHING_ISSUED = 0xffff

export function buildTimeline(args: {
  schedule: Schedule
  issuances: RawIssuance[]
  conversions: RawConversion[]
}): Row[] {
  const rows: Row[] = []

  for (const issuance of args.issuances) {
    rows.push({
      kind: 'issuance',
      // `issueAt` and not the arithmetic again: the protocol has one
      // definition of when hour N happens and this page must not carry a
      // second one that can drift from it.
      at: issueAt(args.schedule, issuance.hour),
      hour: issuance.hour,
      pieceId: issuance.minted && issuance.pieceId !== NOTHING_ISSUED ? issuance.pieceId : null,
      recipient: issuance.recipient,
      signature: issuance.signature,
      href: `/verify/${issuance.hour}`,
    })
  }

  for (const conversion of args.conversions) {
    // A row with no block time is dated `0` and would sort to the bottom of
    // time. It is dropped instead: a timeline entry whose position on the
    // timeline is unknown is not an entry, and inventing one from `slot` would
    // be arithmetic over a number that is not a clock.
    if (conversion.block_time === null) continue
    const at = Math.floor(new Date(conversion.block_time).getTime() / 1000)
    if (!Number.isFinite(at) || at <= 0) continue
    rows.push({
      kind: 'conversion',
      at,
      solSpent: conversion.sol_spent,
      pumpReceived: conversion.pump_received,
      signature: conversion.signature,
      source: provenanceLabel(conversion.funded_by),
    })
  }

  // Newest first, and ties broken by kind then signature so two things in the
  // same second render in the same order on every request.
  return rows.sort((a, b) =>
    b.at - a.at || a.kind.localeCompare(b.kind) || a.signature.localeCompare(b.signature),
  )
}

/** `2026-09-02 14:31 UTC`, and never a locale-dependent format. */
export function stamp(unixSeconds: number): string {
  return `${new Date(unixSeconds * 1000).toISOString().replace('T', ' ').slice(0, 16)} UTC`
}

/** `3YAeuFw7…nXDJU` — recognisable, never mistakable for the whole. */
export function shortSignature(signature: string): string {
  if (signature.length <= 20) return signature
  return `${signature.slice(0, 8)}…${signature.slice(-5)}`
}
