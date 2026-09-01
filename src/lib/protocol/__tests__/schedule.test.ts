import { describe, expect, it } from 'vitest'
import {
  MAINNET_PERIOD_SECONDS,
  earliestCompletionUnix,
  isRequestable,
  issueAt,
  requestWindow,
  type Schedule,
} from '../schedule.ts'
import { COLLECTION_SIZE } from '../state.ts'

const schedule: Schedule = { genesisUnix: 1_800_000_000, periodSeconds: MAINNET_PERIOD_SECONDS }

describe('the schedule', () => {
  it('is computed from the index, never from the previous settlement', () => {
    expect(issueAt(schedule, 0)).toBe(schedule.genesisUnix)
    expect(issueAt(schedule, 1)).toBe(schedule.genesisUnix + 3_600)
    expect(issueAt(schedule, 4_000)).toBe(schedule.genesisUnix + 4_000 * 3_600)
  })

  // Falsifies the drift the whole design exists to prevent: a settlement that
  // arrives late must not move the next instant.
  it('does not drift when an issuance settles late', () => {
    const late = issueAt(schedule, 7) + 3_599
    expect(isRequestable(schedule, 8, late)).toBe(false)
    expect(issueAt(schedule, 8)).toBe(schedule.genesisUnix + 8 * 3_600)
  })

  it('opens a window that closes when the next index opens', () => {
    expect(requestWindow(schedule, 5)).toEqual({
      opensAt: issueAt(schedule, 5),
      closesAt: issueAt(schedule, 6),
    })
  })

  it('reports the earliest completion, which is 166 days and 16 hours', () => {
    const seconds = earliestCompletionUnix(schedule, COLLECTION_SIZE) - schedule.genesisUnix
    expect(seconds).toBe(4_000 * 3_600)
    expect(seconds / 86_400).toBeCloseTo(166 + 16 / 24, 6)
  })

  it('refuses a negative or fractional index', () => {
    expect(() => issueAt(schedule, -1)).toThrow(/non-negative/)
    expect(() => issueAt(schedule, 1.5)).toThrow(/integer/)
  })
})
