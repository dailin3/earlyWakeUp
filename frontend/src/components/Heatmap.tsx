import { toUtc8Date } from '../constants.ts'

interface CheckIn {
  day: bigint
  points: bigint
  score: bigint
  timestamp: number
}

export default function Heatmap({ events }: { events: CheckIn[] }) {
  const today = new Date()
  const days = Array.from({ length: 90 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (89 - i))
    d.setHours(0, 0, 0, 0)
    return d
  })

  const byDay = new Map<string, bigint>()
  for (const e of events) {
    const date = toUtc8Date(e.day * 86400n - BigInt(8 * 60 * 60))
    const key = date.toISOString().split('T')[0]
    byDay.set(key, (byDay.get(key) ?? 0n) + e.points)
  }

  const weeks: Date[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }

  const level = (date: Date) => {
    const key = date.toISOString().split('T')[0]
    const points = byDay.get(key)
    if (!points) return 'bg-slate-200 dark:bg-slate-800'
    if (points >= 100n) return 'bg-emerald-500'
    if (points >= 80n) return 'bg-emerald-400'
    if (points >= 60n) return 'bg-emerald-300'
    if (points >= 40n) return 'bg-emerald-200'
    return 'bg-emerald-100'
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">最近 90 天签到</h3>
      <div className="flex gap-1 overflow-x-auto pb-2">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((d, di) => (
              <div
                key={di}
                title={d.toLocaleDateString('zh-CN')}
                className={`w-3 h-3 rounded-sm ${level(d)}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>少</span>
        <div className="w-3 h-3 rounded-sm bg-slate-200 dark:bg-slate-800" />
        <div className="w-3 h-3 rounded-sm bg-emerald-100" />
        <div className="w-3 h-3 rounded-sm bg-emerald-200" />
        <div className="w-3 h-3 rounded-sm bg-emerald-300" />
        <div className="w-3 h-3 rounded-sm bg-emerald-400" />
        <div className="w-3 h-3 rounded-sm bg-emerald-500" />
        <span>多</span>
      </div>
    </div>
  )
}
