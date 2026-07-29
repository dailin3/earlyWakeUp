import { describe, expect, it } from 'vitest'
import { formatDate, formatTimestamp } from '../constants.ts'

describe('formatTimestamp', () => {
  it('preserves the exact on-chain check-in time in UTC+8', () => {
    expect(formatTimestamp(1_785_276_112n)).toBe('7月29日 06:01')
  })
})

describe('formatDate', () => {
  it('formats an event block timestamp as a UTC+8 calendar date', () => {
    expect(formatDate(1_785_276_112n)).toBe('2026/7/29')
  })
})
