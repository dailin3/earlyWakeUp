import { describe, expect, it } from 'vitest'
import { getBlockRanges } from './blocks.ts'

describe('getBlockRanges', () => {
  it('splits an inclusive range into RPC-safe chunks', () => {
    expect(getBlockRanges(100n, 25_150n, 10_000n)).toEqual([
      { fromBlock: 100n, toBlock: 10_099n },
      { fromBlock: 10_100n, toBlock: 20_099n },
      { fromBlock: 20_100n, toBlock: 25_150n },
    ])
  })

  it('returns no ranges when the requested interval is empty', () => {
    expect(getBlockRanges(2n, 1n, 10_000n)).toEqual([])
  })
})
