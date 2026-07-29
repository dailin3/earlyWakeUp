import { describe, expect, it, vi } from 'vitest'

import { persistDonationWithMessage, type PendingDonation } from './donation-records.ts'

const donation: PendingDonation = {
  txHash: '0xabc',
  amount: '0.001',
  wallet: '0x123',
  name: 'aicat',
  isAnonymous: true,
  userId: null,
  userEmail: null,
}

describe('persistDonationWithMessage', () => {
  it('inserts an anonymous donation and its message in one write', async () => {
    const insert = vi.fn().mockResolvedValue(undefined)

    await persistDonationWithMessage(donation, '加油！', insert)

    expect(insert).toHaveBeenCalledOnce()
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      tx_hash: '0xabc',
      message: '加油！',
      is_anonymous: true,
    }))
  })

  it('does not hide database write failures', async () => {
    const failure = new Error('row-level security policy denied the insert')
    const insert = vi.fn().mockRejectedValue(failure)

    await expect(persistDonationWithMessage(donation, '加油！', insert)).rejects.toBe(failure)
  })
})
