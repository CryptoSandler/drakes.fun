// The holder scan's shape, guarded where the failure is silent.
//
// The on-chain half lives in `scripts/verify-holder-scan.ts`, which plants a
// Token-2022 mint on devnet and asserts the old filter misses it. These are the
// parts that can fail in CI.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PartialScanError, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '../rpc.ts'

const source = readFileSync(new URL('../rpc.ts', import.meta.url), 'utf8')

/**
 * The file without its comments.
 *
 * `rpc.ts` explains the `dataSize: 165` incident in prose, so a test that greps
 * the whole file for `dataSize` fails on the explanation and passes on nothing.
 * A first version of this did exactly that. Assert on the code.
 */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*)/.test(l))
  .join('\n')

describe('the holder scan', () => {
  it('carries no dataSize filter', () => {
    // The whole defect in one line: `dataSize: 165` matched 10 of 626 accounts
    // on a real pump.fun mint, and they held nothing.
    expect(code).not.toMatch(/dataSize/)
    // ...and the filter it does carry is the mint, so the check is not passing
    // because the filters array vanished altogether.
    expect(code).toMatch(/filters: \[\{ memcmp: \{ offset: MINT_OFFSET/)
  })

  it('derives the token program from the mint instead of defaulting', () => {
    expect(code).toMatch(/tokenProgramOf/)
    expect(code).toMatch(/args\.tokenProgramId \?\? \(await tokenProgramOf/)
  })

  it('knows both token programs', () => {
    expect(TOKEN_PROGRAM_ID).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
    expect(TOKEN_2022_PROGRAM_ID).toBe('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
  })

  it('refuses an empty scan rather than letting zero equal zero', () => {
    expect(code).toMatch(/scan\.holdings\.length === 0/)
  })

  it('compares the scan against the supply at or after the scan slot', () => {
    expect(code).toMatch(/minContextSlot: Number\(minContextSlot\)/)
  })

  it('names both failures distinctly', () => {
    // One is the RPC refusing, which is loud. The other is the RPC succeeding
    // over a filter that excluded holders, which is not.
    const e = new PartialScanError(10n, 1000n, 3)
    expect(e.name).toBe('PartialScanError')
    expect(e.message).toMatch(/990 unaccounted for/)
    expect(e.message).toMatch(/SUCCEEDED/)
    expect(code).toMatch(/class ScanAbortedError/)
  })
})
