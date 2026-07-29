import { buildHeatmapWeeks, heatmapLevel } from '../lib/heatmap.ts'

interface CheckIn {
  day: bigint
  points: bigint
  score: bigint
  timestamp: number
}

export default function Heatmap({ events }: { events: CheckIn[] }) {
  const weeks = buildHeatmapWeeks(Date.now(), events)
  const colors = [
    'bg-slate-200 dark:bg-slate-800',
    'bg-emerald-100',
    'bg-emerald-200',
    'bg-emerald-300',
    'bg-emerald-400',
    'bg-emerald-500',
  ]

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2">
          <div className="grid grid-rows-7 gap-1 pt-0 text-[10px] leading-3 text-slate-400" aria-hidden="true">
            <span>一</span><span /> <span>三</span><span /> <span>五</span><span /> <span>日</span>
          </div>
          <div className="flex gap-1" role="grid" aria-label="最近 90 天签到记录，按北京时间显示">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-rows-7 gap-1">
                {week.map((cell, dayIndex) => cell ? (
                  <div
                    key={cell.dateKey}
                    role="gridcell"
                    aria-label={`${cell.dateKey}，${cell.points} 分`}
                    title={`${cell.dateKey} · ${cell.points} 分`}
                    className={`h-3 w-3 rounded-sm ${colors[heatmapLevel(cell.points)]}`}
                  />
                ) : (
                  <div key={`empty-${dayIndex}`} className="h-3 w-3" aria-hidden="true" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="mr-auto">北京时间（UTC+8）</span>
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
