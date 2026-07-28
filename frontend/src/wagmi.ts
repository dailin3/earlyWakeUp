import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { arbitrum } from 'wagmi/chains'
import { http } from 'viem'

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'YOUR_WALLETCONNECT_PROJECT_ID'

export const config = getDefaultConfig({
  appName: 'EarlyWakeUp',
  projectId,
  chains: [arbitrum],
  transports: {
    [arbitrum.id]: http('https://arbitrum-one-rpc.publicnode.com'),
  },
  ssr: false,
})
