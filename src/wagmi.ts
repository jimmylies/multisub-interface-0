import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { mainnet, sepolia, base, polygon } from 'wagmi/chains'

export const config = getDefaultConfig({
  appName: 'MultiSub Interface',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID',
  chains: [sepolia /*, mainnet, base, polygon*/],
  ssr: false,
})
