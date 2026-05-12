import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { selectedChain, getTransports } from './lib/chains'
import { getDeployment } from './lib/deployments'

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID
if (!walletConnectProjectId || walletConnectProjectId === 'YOUR_PROJECT_ID') {
  // RainbowKit / WalletConnect needs a real projectId to broker mobile-wallet
  // sessions. Without one, WC v2 silently degrades to broken QR-code flows.
  // Log loudly at boot so this isn't a mystery in production deploys.
  console.warn(
    '[wagmi] VITE_WALLETCONNECT_PROJECT_ID is unset. Mobile wallet connections via WalletConnect will not work. Get a free id at https://cloud.walletconnect.com.'
  )
}

if (!getDeployment(selectedChain.id).subgraphUrl) {
  // The default URL in lib/subgraph.ts points at a placeholder that returns
  // "Not found". When missing, log so the user knows the subgraph-backed
  // features (Acquired Balances, Transaction History, Recipient Whitelist
  // history) are falling back to direct RPC calls. Per-chain override:
  // VITE_SUBGRAPH_URL_BASE / VITE_SUBGRAPH_URL_BASE_SEPOLIA, or the legacy
  // single-chain VITE_SUBGRAPH_URL.
  console.warn(
    `[wagmi] No subgraph URL configured for chain ${selectedChain.id}. Subgraph-backed reads will fall back to eth_getLogs, which is rate-limited on public RPCs.`
  )
}

export const config = getDefaultConfig({
  appName: 'MultiClaw Interface',
  projectId: walletConnectProjectId || 'YOUR_PROJECT_ID',
  chains: [selectedChain],
  transports: getTransports(),
  ssr: false,
})

export { selectedChain }
