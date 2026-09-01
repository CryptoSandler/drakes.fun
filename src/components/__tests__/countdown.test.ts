import { describe, expect, it } from 'vitest'
import { format } from '../Countdown.tsx'

describe('the countdown format', () => {
  it('drops the hour slot below an hour, so mm:ss is the shape at a 60-minute period', () => {
    expect(format(59)).toBe('00:59')
    expect(format(600)).toBe('10:00')
    expect(format(3599)).toBe('59:59')
  })

  it('grows an hour slot rather than overflowing minutes', () => {
    expect(format(3600)).toBe('1:00:00')
    expect(format(7325)).toBe('2:02:05')
  })

  it('floors at zero instead of rendering a negative clock', () => {
    // The tab was asleep across a boundary. A "-03:12" is worse than a 00:00.
    expect(format(0)).toBe('00:00')
    expect(format(-5)).toBe('00:00')
  })
})
