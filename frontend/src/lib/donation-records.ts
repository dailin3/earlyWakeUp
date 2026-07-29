import { decodeEventLog, formatEther, parseAbiItem, parseEther, type Hex } from 'viem'

import { CONTRACT_ADDRESS } from '../constants.ts'
import type { DonationRecord } from '../supabase.ts'

export interface PendingDonation {
  txHash: string
  amountWei: string
  wallet: string
  timestamp: number
  name: string | null
  isAnonymous: boolean
  userId: string | null
  userEmail: string | null
}

export interface ChainDonation {
  txHash: string
  donor: string
  amount: bigint
  timestamp: number
}

export interface DisplayDonation extends ChainDonation {
  name: string | null
  email: string | null
  message: string | null
  isAnonymous: boolean
}

interface DonationReceipt {
  transactionHash: string
  status: string
  logs: Array<{
    address: string
    topics: readonly Hex[]
    data: Hex
  }>
}

const donatedEvent = parseAbiItem('event Donated(address indexed donor, uint256 amount)')

export function parsePositiveDonationAmount(amount: string) {
  try {
    const wei = parseEther(amount)
    if (wei <= 0n) throw new Error()
    return wei
  } catch {
    throw new Error('捐赠金额必须大于 0 ETH')
  }
}

export function readConfirmedDonation(receipt: DonationReceipt, contractAddress: string) {
  if (receipt.status !== 'success') throw new Error('捐赠交易未成功确认')

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue

    try {
      const decoded = decodeEventLog({
        abi: [donatedEvent],
        eventName: 'Donated',
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      })
      return {
        txHash: receipt.transactionHash,
        donor: decoded.args.donor,
        amount: decoded.args.amount,
      }
    } catch {
      // The receipt can contain unrelated logs from the same contract.
    }
  }

  throw new Error('捐赠交易未成功确认')
}

export function mergeDonationRecords(
  chainDonations: ChainDonation[],
  metadataRecords: DonationRecord[],
): DisplayDonation[] {
  const metadataByHash = new Map(
    metadataRecords.map((record) => [record.tx_hash.toLowerCase(), record]),
  )

  return chainDonations.map((donation) => {
    const metadata = metadataByHash.get(donation.txHash.toLowerCase())
    return {
      ...donation,
      name: metadata?.donor_name ?? null,
      email: metadata?.donor_email ?? null,
      message: metadata?.message ?? null,
      isAnonymous: metadata?.is_anonymous ?? true,
    }
  })
}

export function restorePendingDonationForUser(
  donation: PendingDonation,
  user: { id: string; email?: string; name?: string },
): PendingDonation {
  return {
    ...donation,
    userId: user.id,
    userEmail: user.email ?? null,
    name: donation.name || user.name || user.email || null,
    isAnonymous: false,
  }
}

export interface DonationInsert {
  chain: string
  contract_address: string
  donor_wallet: string
  donor_user_id: string | null
  donor_email: string | null
  donor_name: string | null
  amount_eth: number
  tx_hash: string
  message: string | null
  is_anonymous: boolean
  confirmed: boolean
}

export async function persistDonationWithMessage(
  donation: PendingDonation,
  message: string,
  insert: (record: DonationInsert) => Promise<void>,
) {
  await insert({
    chain: 'arbitrum',
    contract_address: CONTRACT_ADDRESS.toLowerCase(),
    donor_wallet: donation.wallet.toLowerCase(),
    donor_user_id: donation.userId,
    donor_email: donation.userEmail,
    donor_name: donation.name,
    amount_eth: Number(formatEther(BigInt(donation.amountWei))),
    tx_hash: donation.txHash.toLowerCase(),
    message: message.trim() || null,
    is_anonymous: donation.isAnonymous,
    confirmed: true,
  })
}
