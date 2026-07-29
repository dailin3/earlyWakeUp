import { useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSubmit: (message: string) => void
  error?: string | null
  isSaving?: boolean
}

export default function MessageModal({ isOpen, onClose, onSubmit, error, isSaving = false }: Props) {
  const [message, setMessage] = useState('')

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">给 owner 留句话</h3>
          <button onClick={onClose} disabled={isSaving} className="text-slate-400 hover:text-slate-600 disabled:opacity-50 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </div>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
          你的留言会显示在感谢名单里。也可以跳过。
        </p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="加油！明天一定早起～"
          maxLength={140}
          rows={3}
          className="mb-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
        {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">保存失败：{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => onSubmit('')}
            disabled={isSaving}
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {isSaving ? '保存中…' : '跳过'}
          </button>
          <button
            onClick={() => onSubmit(message.trim())}
            disabled={isSaving}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {isSaving ? '保存中…' : '发送留言'}
          </button>
        </div>
      </div>
    </div>
  )
}
