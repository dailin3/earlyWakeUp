import { useState } from 'react'
import { X, User, LogIn } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
  onAnonymous: (isAnonymous: boolean, name: string | null) => void
  onLogin: () => void
  isLoggedIn: boolean
  userName: string | null
}

export default function DonateModal({ isOpen, onClose, onAnonymous, onLogin, isLoggedIn, userName }: Props) {
  const [mode, setMode] = useState<'choose' | 'anonymous'>('choose')
  const [name, setName] = useState('')

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">捐赠感谢名单</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </div>

        {isLoggedIn ? (
          // Already logged in - just confirm with their name
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              你将以下面的名字出现在感谢名单上：
            </p>
            <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 dark:bg-indigo-950/30">
              <User size={16} className="text-indigo-600 dark:text-indigo-300" />
              <span className="text-sm font-medium text-indigo-700 dark:text-indigo-200">
                {userName || '已登录用户'}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onAnonymous(true, null)}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                匿名
              </button>
              <button
                onClick={() => onAnonymous(false, userName)}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                确认
              </button>
            </div>
          </div>
        ) : mode === 'choose' ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              感谢你支持早起挑战！是否愿意留下名字，登上感谢名单？
            </p>
            <button
              onClick={() => setMode('anonymous')}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <User size={16} />
              匿名捐赠，留昵称
            </button>
            <button
              onClick={onLogin}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <LogIn size={16} />
              登录后留名
            </button>
            <button
              onClick={() => onAnonymous(true, null)}
              className="w-full text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              完全匿名，不留名
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              输入你想显示在感谢名单上的昵称：
            </p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：早起小王"
              maxLength={32}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setMode('choose')}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                返回
              </button>
              <button
                onClick={() => onAnonymous(true, name.trim() || null)}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                确认
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
