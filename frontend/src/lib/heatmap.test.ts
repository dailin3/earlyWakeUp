import { describe, expect, it } from 'vitest'
import {
  buildHeatmapWeeks,
  contractDayToDateKey,
  heatmapLevel,
  timestampToUtc8DateKey,
} from './heatmap.ts'

describe('contractDayToDateKey', () => {
  it('maps the contract day to its UTC+8 calendar date', () => {
    expect(contractDayToDateKey(19723n)).toBe('2024-01-01')
  })
})

describe('timestampToUtc8DateKey', () => {
  it('changes date exactly at UTC+8 midnight', () => {
    expect(timestampToUtc8DateKey(Date.parse('2023-12-31T15:59:59Z'))).toBe('2023-12-31')
    expect(timestampToUtc8DateKey(Date.parse('2023-12-31T16:00:00Z'))).toBe('2024-01-01')
  })
})

describe('buildHeatmapWeeks', () => {
  it('shows exactly 90 days in Monday-aligned week columns', () => {
    const weeks = buildHeatmapWeeks(Date.parse('2024-01-03T12:00:00Z'), [])
    const days = weeks.flat().filter((cell) => cell !== null)

    expect(days).toHaveLength(90)
    expect(weeks[0].slice(0, 4)).toEqual([null, null, null, null])
    expect(weeks[0][4]?.dateKey).toBe('2023-10-06')
    expect(days.at(-1)?.dateKey).toBe('2024-01-03')
  })

  it('aggregates points by contract day', () => {
    const weeks = buildHeatmapWeeks(Date.parse('2024-01-03T12:00:00Z'), [
      { day: 19723n, points: 40n },
      { day: 19723n, points: 20n },
    ])
    const jan1 = weeks.flat().find((cell) => cell?.dateKey === '2024-01-01')

    expect(jan1?.points).toBe(60n)
  })
})

describe('heatmapLevel', () => {
  it.each([
    [0n, 0],
    [20n, 1],
    [40n, 2],
    [60n, 3],
    [80n, 4],
    [100n, 5],
  ])('maps %s points to level %s', (points, level) => {
    expect(heatmapLevel(points)).toBe(level)
  })
})
