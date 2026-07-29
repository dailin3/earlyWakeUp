import { type Abi, parseAbi } from 'viem'
import { arbitrum } from 'wagmi/chains'

export const CONTRACT_ADDRESS = '0xb0806037080B02B8d333fEb43c53F2F03522C4cF'
export const CONTRACT_DEPLOYMENT_BLOCK = 488_673_659n

export const CHAIN = arbitrum

export const ABI: Abi = parseAbi([
  'constructor(uint256 _target, uint256 _cooldown)',
  'function owner() view returns (address)',
  'function score() view returns (uint256)',
  'function target() view returns (uint256)',
  'function cooldown() view returns (uint256)',
  'function cooldownStart() view returns (uint256)',
  'function lastCheckIn() view returns (uint256)',
  'function currentDay() view returns (uint256)',
  'function currentTimeOfDay() view returns (uint256)',
  'function currentPoints() view returns (uint256)',
  'function missedDays() view returns (uint256)',
  'function penalizedScore() view returns (uint256)',
  'function claimableReward() view returns (uint256)',
  'function checkIn()',
  'function withdraw()',
  'function donate() payable',
  'event CheckedIn(uint256 indexed day, uint256 points, uint256 score)',
  'event Donated(address indexed donor, uint256 amount)',
  'event Withdrawn(address indexed owner, uint256 amount, uint256 score)',
  'error NotOwner()',
  'error TargetNotSet()',
  'error CooldownNotOver()',
  'error AlreadyCheckedInToday()',
  'error NotInCheckInWindow()',
  'error NothingToWithdraw()',
  'error TransferFailed()',
  'error InvalidTarget()',
  'error InvalidCooldown()',
])

export const UTC8_OFFSET = 8 * 60 * 60

export function formatEth(wei: bigint | undefined, digits = 6) {
  if (wei === undefined) return '...'
  const n = Number(wei) / 1e18
  return n.toLocaleString('en-US', { maximumFractionDigits: digits })
}

export function formatPercent(score: bigint | undefined, target: bigint | undefined) {
  if (!score || !target || target === 0n) return '0.0'
  return ((Number(score) / Number(target)) * 100).toFixed(1)
}

export function formatTimeLeft(seconds: bigint | number) {
  const s = Math.max(0, Number(seconds))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function formatTimestamp(timestamp: bigint | number) {
  return new Date(Number(timestamp) * 1000).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(timestamp: bigint | number) {
  return new Date(Number(timestamp) * 1000).toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
  })
}
