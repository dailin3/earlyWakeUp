import { useEffect, useMemo, useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
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
  MessageCircle,
  Heart,
  LogIn,
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
import DonateModal from './components/DonateModal.tsx'
import MessageModal from './components/MessageModal.tsx'
import { supabase, type DonationRecord } from './supabase.ts'

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

interface PendingDonation {
  txHash: string
  amount: string
  wallet: string
  name: string | null
  isAnonymous: boolean
  userId: string | null
  userEmail: string | null
}

interface SupabaseUser {
  id: string
  email?: string
  name?: string
}

function toSupabaseUser(user: {
  id: string
  email?: string
  user_metadata?: Record<string, unknown>
}): SupabaseUser {
  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.user_metadata?.user_name

  return {
    id: user.id,
    email: user.email,
    name: typeof metadataName === 'string' ? metadataName : undefined,
  }
}

export default function App() {
  const { address, isConnected } = useAccount()
  const chainId = CHAIN.id
  const [donateAmount, setDonateAmount] = useState('0.001')
  const [checkIns, setCheckIns] = useState<CheckInEvent[]>([])
  const [donations, setDonations] = useState<DonateEvent[]>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawEvent[]>([])
  const [donationRecords, setDonationRecords] = useState<DonationRecord[]>([])
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null)
  const [showDonateModal, setShowDonateModal] = useState(false)
  const [showMessageModal, setShowMessageModal] = useState(false)
  const [pendingDonation, setPendingDonation] = useState<PendingDonation | null>(null)
  const [justDonated, setJustDonated] = useState(false)
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
  const { isSuccess: txSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId,
  })

  const isOwner = address && owner ? address.toLowerCase() === owner.toLowerCase() : false

  const now = useMemo(() => Math.floor(Date.now() / 1000), [txHash, isPending, justDonated])
  const cooldownEnd = cooldownStart && cooldown ? Number(cooldownStart) + Number(cooldown) : 0
  const timeLeft = Math.max(0, cooldownEnd - now)
  const progress = target && score && target > 0n ? Math.min(100, (Number(score) / Number(target)) * 100) : 0

  // Listen for Supabase auth state and pending OAuth callback
  useEffect(() => {
    if (!supabase) return

    const init = async () => {
      if (!supabase) return
      const { data } = await supabase.auth.getSession()
      if (data.session?.user) {
        setSupabaseUser(toSupabaseUser(data.session.user))
      }

      // Handle OAuth callback on load
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      if (code) {
        const stored = localStorage.getItem('earlywakeup_pending_donation')
        if (stored) {
          const pending: PendingDonation = JSON.parse(stored)
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          if (!error && data.session?.user) {
            const user = data.session.user
            await saveDonation({
              ...pending,
              userId: user.id,
              userEmail: user.email || null,
              name: pending.name || user.user_metadata?.full_name || user.user_metadata?.name || user.email || null,
              isAnonymous: false,
            })
            localStorage.removeItem('earlywakeup_pending_donation')
            setSupabaseUser(toSupabaseUser(user))
            setPendingDonation({ ...pending, userId: user.id, userEmail: user.email || null, isAnonymous: false })
            setShowMessageModal(true)
          }
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname)
        }
      }
    }
    init()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setSupabaseUser(toSupabaseUser(session.user))
      } else {
        setSupabaseUser(null)
      }
    })

    return () => {
      listener?.subscription.unsubscribe()
    }
  }, [])

  // Load chain events and Supabase donation records
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

  // Load Supabase donation records
  useEffect(() => {
    if (!supabase) return
    async function loadRecords() {
      if (!supabase) return
      const { data, error } = await supabase
        .from('donations')
        .select('*')
        .eq('contract_address', CONTRACT_ADDRESS.toLowerCase())
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) {
        console.error(error)
        return
      }
      setDonationRecords((data as DonationRecord[]) || [])
    }
    loadRecords()
  }, [txHash, justDonated])

  const saveDonation = async (donation: PendingDonation & { message?: string | null }) => {
    if (!supabase) return
    await supabase.from('donations').upsert(
      {
        chain: 'arbitrum',
        contract_address: CONTRACT_ADDRESS.toLowerCase(),
        donor_wallet: donation.wallet.toLowerCase(),
        donor_user_id: donation.userId,
        donor_email: donation.userEmail,
        donor_name: donation.name,
        amount_eth: Number(donation.amount),
        tx_hash: donation.txHash.toLowerCase(),
        message: donation.message || null,
        is_anonymous: donation.isAnonymous,
        confirmed: true,
      },
      { onConflict: 'tx_hash' }
    )
  }

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

  const handleDonate = async () => {
    if (!isConnected || !address) return
    const hash = await write({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'donate',
      chainId,
      value: parseEther(donateAmount),
    })
    if (hash) {
      const pending: PendingDonation = {
        txHash: hash,
        amount: donateAmount,
        wallet: address,
        name: null,
        isAnonymous: true,
        userId: null,
        userEmail: null,
      }
      setPendingDonation(pending)
      setShowDonateModal(true)
    }
  }

  // When on-chain donate transaction succeeds, we can optionally do something.
  // The modal is already open from handleDonate.
  useEffect(() => {
    if (txSuccess && pendingDonation && !justDonated) {
      setJustDonated(true)
    }
  }, [txSuccess, pendingDonation, justDonated])

  const handleDonateChoice = async (isAnonymous: boolean, name: string | null) => {
    if (!pendingDonation) return

    const donation = isAnonymous
      ? {
          ...pendingDonation,
          name: name || null,
          isAnonymous: true,
          userId: null,
          userEmail: null,
        }
      : {
          ...pendingDonation,
          name: name || supabaseUser?.name || supabaseUser?.email || null,
          isAnonymous: false,
          userId: supabaseUser?.id || null,
          userEmail: supabaseUser?.email || null,
        }

    if (!isAnonymous && !supabaseUser) {
      return
    }

    await saveDonation(donation)
    setPendingDonation(donation)
    setShowDonateModal(false)
    setShowMessageModal(true)
    setJustDonated((v) => !v)
  }


  const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const LOGIN_URL = isLocalDev ? '' : 'https://login.dailin.tech/auth/login'

  const handleLoginClick = () => {
    if (isLocalDev) {
      // 本地开发：直接用 Supabase OAuth（同一个 Supabase 项目）
      supabase?.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
    } else {
      // 生产环境：跳转到 login.dailin.tech，登录后 cookie 共享到 .dailin.tech
      window.location.href = LOGIN_URL
    }
  }

  const handleLoginDonate = () => {
    if (!pendingDonation) return
    // 保存待处理的捐赠信息，登录后回来处理
    localStorage.setItem('earlywakeup_pending_donation', JSON.stringify(pendingDonation))
    setShowDonateModal(false)
    if (isLocalDev) {
      supabase?.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
    } else {
      window.location.href = LOGIN_URL
    }
  }

  const handleMessageSubmit = async (message: string) => {
    if (!pendingDonation) return
    await saveDonation({ ...pendingDonation, message: message || null })
    setShowMessageModal(false)
    setPendingDonation(null)
    setJustDonated((v) => !v)
  }

  const handleSupabaseLogout = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setSupabaseUser(null)
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
          <div className="flex items-center gap-2">
            {supabaseUser && (
              <div className="hidden items-center gap-2 text-xs text-slate-500 dark:text-slate-400 md:flex">
                <User size={14} />
                <span className="max-w-[120px] truncate">{supabaseUser.name || supabaseUser.email || 'Logged in'}</span>
                <button onClick={handleSupabaseLogout} className="text-indigo-600 hover:underline">退出</button>
              </div>
            )}
            {!supabaseUser && (
              <button onClick={handleLoginClick} className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-950">
                <LogIn size={14} /> Login
              </button>
            )}
            <ConnectButton />
          </div>
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
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">任何人都可以向奖池存入 ETH，并登上感谢名单。</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400">
              <User size={16} /> Owner
            </h3>
            <div className="space-y-2">
              <button
                onClick={handleCheckIn}
                disabled={!isConnected || !isOwner || isPending}
                className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title={isConnected && !isOwner ? 'Only contract owner can check in' : undefined}
              >
                {isPending ? 'Confirm in wallet…' : isOwner ? 'Check In' : 'Only owner can check in'}
              </button>
              <button
                onClick={handleWithdraw}
                disabled={!isConnected || !isOwner || isPending || (claimable ?? 0n) === 0n}
                className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
              >
                {isPending ? 'Confirm in wallet…' : 'Withdraw'}
              </button>
            </div>
            {isConnected && !isOwner && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">只有 owner 可以签到和提取奖励。</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400">
            <Heart size={16} /> 90 天签到热力图
          </h3>
          <Heatmap events={checkIns} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400">
            <MessageCircle size={16} /> 感谢名单
          </h3>
          {donationRecords.length === 0 ? (
            <p className="text-sm text-slate-400">还没有捐赠记录，成为第一个支持者吧！</p>
          ) : (
            <div className="space-y-3">
              {donationRecords.map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300">
                        <User size={14} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {r.is_anonymous ? (r.donor_name || '匿名') : (r.donor_name || r.donor_email || 'Guest')}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {r.donor_wallet.slice(0, 6)}…{r.donor_wallet.slice(-4)} · {Number(r.amount_eth).toFixed(6)} ETH
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(r.created_at).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                  {r.message && (
                    <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                      <MessageCircle size={14} className="mt-0.5 shrink-0" />
                      {r.message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
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
                      <span className="text-indigo-700 dark:text-indigo-300">Donate {formatEth(e.amount)} ETH</span>
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
                    <span className="text-emerald-700 dark:text-emerald-300">Withdraw {formatEth(e.amount)} ETH</span>
                    <span className="text-xs text-slate-400">
                      {toUtc8Date(e.timestamp).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                )
              })}
          </div>
        </section>
      </div>

      <DonateModal
        isOpen={showDonateModal}
        onClose={() => setShowDonateModal(false)}
        onAnonymous={handleDonateChoice}
        onLogin={handleLoginDonate}
        isLoggedIn={!!supabaseUser}
        userName={supabaseUser?.name || supabaseUser?.email || null}
      />
      <MessageModal
        isOpen={showMessageModal}
        onClose={() => {
          setShowMessageModal(false)
          setPendingDonation(null)
        }}
        onSubmit={handleMessageSubmit}
      />
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
