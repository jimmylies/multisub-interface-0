import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { selectedChain, getTransports } from './lib/chains'

export const config = getDefaultConfig({
  appName: 'MultiClaw Interface',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID',
  chains: [selectedChain],
  transports: getTransports(),
  ssr: false,
})

export { selectedChain }
