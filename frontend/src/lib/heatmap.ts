const DAY_MS = 86_400_000
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000
const DAYS_SHOWN = 90

interface HeatmapEvent {
  day: bigint
  points: bigint
}

export interface HeatmapCell {
  dateKey: string
  points: bigint
}

export function contractDayToDateKey(day: bigint) {
  return new Date(Number(day) * DAY_MS).toISOString().slice(0, 10)
}

export function timestampToUtc8DateKey(timestampMs: number) {
  return new Date(timestampMs + UTC8_OFFSET_MS).toISOString().slice(0, 10)
}

export function buildHeatmapWeeks(nowMs: number, events: HeatmapEvent[]) {
  const today = BigInt(Math.floor((nowMs + UTC8_OFFSET_MS) / DAY_MS))
  const firstDay = today - BigInt(DAYS_SHOWN - 1)
  const pointsByDay = new Map<bigint, bigint>()

  for (const event of events) {
    pointsByDay.set(event.day, (pointsByDay.get(event.day) ?? 0n) + event.points)
  }

  // Unix epoch day 0 was Thursday, so +3 makes Monday index 0.
  const leadingEmptyCells = Number((firstDay + 3n) % 7n)
  const cells: Array<HeatmapCell | null> = Array.from({ length: leadingEmptyCells }, () => null)

  for (let offset = 0; offset < DAYS_SHOWN; offset += 1) {
    const day = firstDay + BigInt(offset)
    cells.push({
      dateKey: contractDayToDateKey(day),
      points: pointsByDay.get(day) ?? 0n,
    })
  }

  while (cells.length % 7 !== 0) cells.push(null)

  return Array.from({ length: cells.length / 7 }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7),
  )
}

export function heatmapLevel(points: bigint) {
  if (points >= 100n) return 5
  if (points >= 80n) return 4
  if (points >= 60n) return 3
  if (points >= 40n) return 2
  if (points > 0n) return 1
  return 0
}
