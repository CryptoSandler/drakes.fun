// The account layout, against an account the chain actually holds.
//
// The bytes below are hour 378 of the 2026-09-01 devnet rehearsal rig, read
// from `1NgAE9oWa2zF9VB4pyDo9j41MzTJAY2kdjBxtZNm5q3` on **2026-09-02**. A
// layout checked against a struct definition and not against a real account is
// a layout that reads plausibly and is wrong where nothing looks.

import { describe, expect, it } from 'vitest'
import { decodeIssuance, ISSUANCE_SIZE, NOTHING_ISSUED } from '../issuance.ts'

const ADDRESS = '1NgAE9oWa2zF9VB4pyDo9j41MzTJAY2kdjBxtZNm5q3'
const RECORDED =
  'e8NLYL9cPar/egEAAAAAAAD8AAAAcYhOHQAAAACCoqq3OqJCUbOOa5aI9BbKQ6dJdQ0Sy7Ri5n6WeQ1NIqTTY/j' +
  't9UY9ILXmwEMwUsdIAXf3k42a+gRKxY5CvyCfQKpoCzANAACOdKr69TLO2OBmaTvGxvtRubr+JbNgEDY+buLyHt' +
  'XFXO9Zl2oAAAAAARFzSOFLkSh/FGghRnJPh/rDy6ZWEc0uCobIWqqVN1UAzyrrSswEAACHCw=='

const bytes = () => new Uint8Array(Buffer.from(RECORDED, 'base64'))

describe('the issuance account', () => {
  it('is the size the program declares', () => {
    // `Issuance::SIZE` in programs/issuance/src/lib.rs.
    expect(bytes()).toHaveLength(ISSUANCE_SIZE)
  })

  it('decodes the hour, the piece and the recipient the chain recorded', () => {
    const issuance = decodeIssuance(ADDRESS, bytes())
    expect(issuance.hour).toBe(378n)
    expect(issuance.pieceIndex).toBe(252)
    expect(issuance.settled).toBe(true)
    expect(issuance.pieceId).toBe(2951)
    expect(issuance.recipient).toBe('2B7taMK2LvaJx7Rsf3cX4vUQAJbXbkX6FFH7Ud1ZfxHu')
    expect(issuance.point).toBe(5275476765391n)
    expect(issuance.eligibleSupply).toBe(14500001000000n)
    expect(issuance.address).toBe(ADDRESS)
  })

  it('lands the point inside the eligible supply, which is the invariant', () => {
    // Not a restatement of the two numbers above: it is the one relationship
    // that has to hold for the recipient walk to mean anything, and a shifted
    // offset breaks it while both fields still read as plausible integers.
    const issuance = decodeIssuance(ADDRESS, bytes())
    expect(issuance.point).toBeLessThan(issuance.eligibleSupply)
    expect(issuance.pieceId).toBeLessThan(4000)
    expect(issuance.pieceId).not.toBe(NOTHING_ISSUED)
  })

  it('refuses anything that is not an issuance account', () => {
    expect(() => decodeIssuance(ADDRESS, new Uint8Array(100))).toThrow(/not an issuance account/)
  })

  it('refuses a settled byte that is neither 0 nor 1', () => {
    // Borsh admits exactly two values. A third means the layout moved, and a
    // decoder that shrugs at it publishes a confident wrong recipient.
    const broken = bytes()
    broken[141] = 7
    expect(() => decodeIssuance(ADDRESS, broken)).toThrow(/layout has changed/)
  })
})
