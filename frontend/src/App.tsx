import { useEffect, useMemo, useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi'
import { parseAbiItem, parseEther } from 'viem'
import {
  AlarmClock,
  Award,
  Clock,
  Gift,
  History,
  PiggyBank,
  Trophy,
  User,
  Wallet,
} from 'lucide-react'
import {
  ABI,
  CHAIN,
  CONTRACT_ADDRESS,
  formatEth,
  formatTimeLeft,
  formatTimestamp,
  toUtc8Date,
  UTC8_OFFSET,
} from './constants.ts'
import Heatmap from './components/Heatmap.tsx'

interface CheckInEvent {
  day: bigint
  points: bigint
  score: bigint
  timestamp: number
}

interface DonateEvent {
  donor: `0x${string}`
  amount: bigint
  timestamp: number
}

interface WithdrawEvent {
  owner: `0x${string}`
  amount: bigint
  score: bigint
  timestamp: number
}

export default function App() {
  const { address, isConnected } = useAccount()
  const chainId = CHAIN.id
  const [donateAmount, setDonateAmount] = useState('0.001')
  const [checkIns, setCheckIns] = useState<CheckInEvent[]>([])
  const [donations, setDonations] = useState<DonateEvent[]>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawEvent[]>([])
  const publicClient = usePublicClient({ chainId })

  const { data: ownerRaw } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'owner',
    chainId,
  })
  const owner = ownerRaw as `0x${string}` | undefined

  const { data: scoreRaw } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'score',
    chainId,
  })
  const score = scoreRaw as bigint | undefined

  const { data: targetRaw } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'target',
    chainId,
  })
  const target = targetRaw as bigint | undefined

  const { data: cooldownRaw } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'cooldown',
    chainId,
  })
  const cooldown = cooldownRaw as bigint | undefined

  const { data: cooldownStartRaw } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'cooldownStart',
    chainId,
  })
  const cooldownStart = cooldownStartRaw as bigint | undefined

  const { data: lastCheckInRaw } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'lastCheckIn',
    chainId,
  })
  const lastCheckIn = lastCheckInRaw as bigint | undefined

  const { data: claimableRaw } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'claimableReward',
    chainId,
  })
  const claimable = claimableRaw as bigint | undefined

  const { data: poolBalance } = useBalance({
    address: CONTRACT_ADDRESS,
    chainId,
  })

  const { writeContractAsync: write, isPending, data: txHash } = useWriteContract()
  const isOwner = address && owner ? address.toLowerCase() === owner.toLowerCase() : false

  const now = useMemo(() => Math.floor(Date.now() / 1000), [txHash, isPending])
  const cooldownEnd = cooldownStart && cooldown ? Number(cooldownStart) + Number(cooldown) : 0
  const timeLeft = Math.max(0, cooldownEnd - now)
  const progress = target && score && target > 0n ? Math.min(100, (Number(score) / Number(target)) * 100) : 0

  useEffect(() => {
    if (!publicClient) return
    async function load() {
      if (!publicClient) return
      const [logsCheckIn, logsDonate, logsWithdraw] = await Promise.all([
        publicClient.getLogs({
          address: CONTRACT_ADDRESS,
          event: parseAbiItem('event CheckedIn(uint256 indexed day, uint256 points, uint256 score)'),
          fromBlock: 0n,
          toBlock: 'latest',
        }),
        publicClient.getLogs({
          address: CONTRACT_ADDRESS,
          event: parseAbiItem('event Donated(address indexed donor, uint256 amount)'),
          fromBlock: 0n,
          toBlock: 'latest',
        }),
        publicClient.getLogs({
          address: CONTRACT_ADDRESS,
          event: parseAbiItem('event Withdrawn(address indexed owner, uint256 amount, uint256 score)'),
          fromBlock: 0n,
          toBlock: 'latest',
        }),
      ])

      const withTimestamp = async (
        logs: { blockNumber: bigint; transactionHash: `0x${string}` }[]
      ) => {
        return Promise.all(
          logs.map(async (log) => {
            const block = await publicClient.getBlock({ blockNumber: log.blockNumber })
            return { ...log, timestamp: Number(block.timestamp) }
          })
        )
      }

      const ci = (await withTimestamp(logsCheckIn)).map((l) => ({
        ...(l as unknown as { args: CheckInEvent }).args,
        timestamp: l.timestamp,
      }))

      const dn = (await withTimestamp(logsDonate)).map((l) => ({
        ...(l as unknown as { args: DonateEvent }).args,
        timestamp: l.timestamp,
      }))

      const wd = (await withTimestamp(logsWithdraw)).map((l) => ({
        ...(l as unknown as { args: WithdrawEvent }).args,
        timestamp: l.timestamp,
      }))

      setCheckIns(ci.sort((a, b) => b.timestamp - a.timestamp))
      setDonations(dn.sort((a, b) => b.timestamp - a.timestamp))
      setWithdrawals(wd.sort((a, b) => b.timestamp - a.timestamp))
    }
    load().catch(console.error)
  }, [publicClient, txHash])

  const handleCheckIn = () => {
    write({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'checkIn',
      chainId,
    })
  }

  const handleWithdraw = () => {
    write({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'withdraw',
      chainId,
    })
  }

  const handleDonate = () => {
    write({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'donate',
      chainId,
      value: parseEther(donateAmount),
    })
  }

  const currentWindow = useMemo(() => {
    const nowTs = Math.floor(Date.now() / 1000)
    const sec = (nowTs + UTC8_OFFSET) % 86400
    if (sec >= 19800 && sec < 23400) return { label: '100 分', color: 'text-emerald-600' }
    if (sec >= 23400 && sec < 25200) return { label: '80 分', color: 'text-emerald-500' }
    if (sec >= 25200 && sec < 27000) return { label: '60 分', color: 'text-emerald-400' }
    if (sec >= 27000 && sec < 28800) return { label: '40 分', color: 'text-emerald-300' }
    if (sec >= 28800 && sec < 30600) return { label: '20 分', color: 'text-emerald-300' }
    return { label: '不在窗口', color: 'text-slate-400' }
  }, [now])

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300">
              <AlarmClock size={20} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">EarlyWakeUp</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Arbitrum · {CONTRACT_ADDRESS.slice(0, 6)}…{CONTRACT_ADDRESS.slice(-4)}
              </p>
            </div>
          </div>
          <ConnectButton />
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card icon={<Trophy size={18} />} label="Score" value={score?.toString() ?? '...'} />
          <Card icon={<Award size={18} />} label="Target" value={target?.toString() ?? '...'} />
          <Card icon={<PiggyBank size={18} />} label="Pool" value={`${formatEth(poolBalance?.value)} ETH`} />
          <Card icon={<Gift size={18} />} label="Claimable" value={`${formatEth(claimable)} ETH`} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400">
              <Clock size={16} />
              <span>进度</span>
            </div>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">{progress.toFixed(1)}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-4 grid gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Row label="当前窗口" value={currentWindow.label} valueClass={currentWindow.color} />
            <Row
              label="冷却结束"
              value={cooldownStart && cooldownStart > 0n ? formatTimestamp(cooldownEnd) : '未开始'}
            />
            <Row
              label="剩余时间"
              value={cooldownStart && cooldownStart > 0n ? formatTimeLeft(timeLeft) : '-'}
            />
            <Row
              label="上次签到"
              value={lastCheckIn && lastCheckIn > 0n ? formatTimestamp(lastCheckIn) : '无'}
            />
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400">
              <Wallet size={16} /> Donate
            </h3>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.0001"
                min="0"
                value={donateAmount}
                onChange={(e) => setDonateAmount(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <button
                onClick={handleDonate}
                disabled={!isConnected || isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {isPending ? '…' : 'Donate'}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">任何人都可以向奖池存入 ETH。</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400">
              <User size={16} /> Owner
            </h3>
            <div className="space-y-2">
              <button
                onClick={handleCheckIn}
                disabled={!isConnected || !isOwner || isPending}
                className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {isPending ? 'Confirm in wallet…' : isOwner ? 'Check In' : 'Not owner'}
              </button>
              <button
                onClick={handleWithdraw}
                disabled={!isConnected || !isOwner || isPending || (claimable ?? 0n) === 0n}
                className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
              >
                Withdraw {claimable && claimable > 0n ? `(${formatEth(claimable)} ETH)` : ''}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <Heatmap events={checkIns} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400">
            <History size={16} /> History
          </h3>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {checkIns.length === 0 && donations.length === 0 && withdrawals.length === 0 && (
              <p className="text-sm text-slate-400">暂无事件。</p>
            )}
            {[...checkIns, ...donations, ...withdrawals]
              .sort((a, b) => b.timestamp - a.timestamp)
              .map((e, i) => {
                if ('points' in e) {
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800"
                    >
                      <span className="text-slate-600 dark:text-slate-400">签到 +{e.points.toString()} 分</span>
                      <span className="text-xs text-slate-400">
                        {toUtc8Date(e.timestamp).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  )
                }
                if ('donor' in e) {
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2 text-sm dark:bg-indigo-950/30"
                    >
                      <span className="text-indigo-700 dark:text-indigo-300">
                        Donate {formatEth(e.amount)} ETH
                      </span>
                      <span className="text-xs text-slate-400">
                        {toUtc8Date(e.timestamp).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  )
                }
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950/30"
                  >
                    <span className="text-emerald-700 dark:text-emerald-300">
                      Withdraw {formatEth(e.amount)} ETH
                    </span>
                    <span className="text-xs text-slate-400">
                      {toUtc8Date(e.timestamp).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                )
              })}
          </div>
        </section>
      </div>
    </div>
  )
}

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        {icon}
        <span>{label}</span>
      </div>
      <div className="font-mono text-lg font-semibold text-slate-900 dark:text-white">{value}</div>
    </div>
  )
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className={`font-medium ${valueClass ?? 'text-slate-900 dark:text-white'}`}>{value}</span>
    </div>
  )
}
