export interface BlockRange {
  fromBlock: bigint
  toBlock: bigint
}

export function getBlockRanges(fromBlock: bigint, toBlock: bigint, chunkSize: bigint) {
  const ranges: BlockRange[] = []
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = start + chunkSize - 1n
    ranges.push({ fromBlock: start, toBlock: end < toBlock ? end : toBlock })
  }
  return ranges
}
