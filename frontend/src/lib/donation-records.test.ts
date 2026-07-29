import { encodeAbiParameters, encodeEventTopics, parseAbiItem, type Hex } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import {
  mergeDonationRecords,
  parsePositiveDonationAmount,
  readConfirmedDonation,
  persistDonationWithMessage,
  restorePendingDonationForUser,
  type ChainDonation,
  type PendingDonation,
} from './donation-records.ts'

const donation: PendingDonation = {
  txHash: '0xabc',
  amountWei: '1000000000000000',
  wallet: '0x123',
  timestamp: 1_722_222_222,
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

describe('parsePositiveDonationAmount', () => {
  it('accepts a positive ETH amount', () => {
    expect(parsePositiveDonationAmount('0.0001')).toBe(100_000_000_000_000n)
  })

  it.each(['0', '0.0', '', '-1', 'not-a-number'])('rejects non-positive or invalid amount %j', (amount) => {
    expect(() => parsePositiveDonationAmount(amount)).toThrow('捐赠金额必须大于 0 ETH')
  })
})

describe('mergeDonationRecords', () => {
  it('uses chain amount, wallet, and timestamp while adding the off-chain message', () => {
    const chainDonation: ChainDonation = {
      txHash: '0xABC',
      donor: '0xCHAIN',
      amount: 100_000_000_000_000n,
      timestamp: 1_722_222_222,
    }

    const [merged] = mergeDonationRecords([chainDonation], [{
      id: 1,
      created_at: '2020-01-01T00:00:00.000Z',
      chain: 'arbitrum',
      contract_address: '0xcontract',
      donor_wallet: '0xwrong',
      donor_user_id: null,
      donor_email: null,
      donor_name: 'aicat',
      amount_eth: 999,
      tx_hash: '0xabc',
      message: '加油！',
      is_anonymous: true,
    }])

    expect(merged).toMatchObject({
      txHash: '0xABC',
      donor: '0xCHAIN',
      amount: 100_000_000_000_000n,
      timestamp: 1_722_222_222,
      name: 'aicat',
      message: '加油！',
    })
  })

  it('keeps confirmed chain donations even when no Supabase metadata exists', () => {
    const chainDonation: ChainDonation = {
      txHash: '0xdef',
      donor: '0xdonor',
      amount: 1n,
      timestamp: 1_722_222_223,
    }

    expect(mergeDonationRecords([chainDonation], [])).toEqual([{
      ...chainDonation,
      name: null,
      email: null,
      message: null,
      isAnonymous: true,
    }])
  })

  it('does not show database rows that have no matching on-chain event', () => {
    expect(mergeDonationRecords([], [{
      id: 2,
      created_at: '2020-01-01T00:00:00.000Z',
      chain: 'arbitrum',
      contract_address: '0xcontract',
      donor_wallet: '0xwallet',
      donor_user_id: null,
      donor_email: null,
      donor_name: 'not confirmed',
      amount_eth: 1,
      tx_hash: '0xmissing',
      message: 'should not render',
      is_anonymous: true,
    }])).toEqual([])
  })
})

describe('readConfirmedDonation', () => {
  it('decodes the authoritative donor and amount from the contract receipt', () => {
    const event = parseAbiItem('event Donated(address indexed donor, uint256 amount)')
    const donor = '0x0000000000000000000000000000000000000123'
    const contract = '0x0000000000000000000000000000000000000456'

    expect(readConfirmedDonation({
      transactionHash: '0xABC',
      status: 'success',
      logs: [{
        address: contract,
        topics: encodeEventTopics({ abi: [event], eventName: 'Donated', args: { donor } }) as readonly Hex[],
        data: encodeAbiParameters([{ type: 'uint256' }], [100_000_000_000_000n]),
      }],
    }, contract)).toEqual({
      txHash: '0xABC',
      donor,
      amount: 100_000_000_000_000n,
    })
  })

  it('rejects failed receipts or receipts without this contract event', () => {
    expect(() => readConfirmedDonation({
      transactionHash: '0xfailed',
      status: 'reverted',
      logs: [],
    }, '0x0000000000000000000000000000000000000456')).toThrow('捐赠交易未成功确认')
  })
})

describe('restorePendingDonationForUser', () => {
  it('attaches the verified identity after returning from the session bridge', () => {
    expect(restorePendingDonationForUser(donation, {
      id: 'user-1',
      email: 'donor@example.com',
      name: 'Donor',
    })).toEqual({
      ...donation,
      userId: 'user-1',
      userEmail: 'donor@example.com',
      name: 'aicat',
      isAnonymous: false,
    })
  })
})
