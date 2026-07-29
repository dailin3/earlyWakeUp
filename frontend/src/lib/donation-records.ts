import { CONTRACT_ADDRESS } from '../constants.ts'

export interface PendingDonation {
  txHash: string
  amount: string
  wallet: string
  name: string | null
  isAnonymous: boolean
  userId: string | null
  userEmail: string | null
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
    amount_eth: Number(donation.amount),
    tx_hash: donation.txHash.toLowerCase(),
    message: message.trim() || null,
    is_anonymous: donation.isAnonymous,
    confirmed: true,
  })
}
