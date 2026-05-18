import { mainnet, sepolia, base, baseSepolia } from 'wagmi/chains'
import { http } from 'wagmi'
import type { Chain } from 'wagmi/chains'
import type { Transport } from 'viem'
import { buildBaseTransport, buildBaseSepoliaTransport } from './rpcPool'

export type NetworkName = 'sepolia' | 'mainnet' | 'base' | 'base-sepolia'

// Map network names to chain objects
const NETWORK_MAP: Record<NetworkName, Chain> = {
  sepolia,
  mainnet,
  base,
  'base-sepolia': baseSepolia,
}

// Default RPC URLs for the non-Base chains. Base + Base Sepolia route through
// the multi-RPC pool in rpcPool.ts (Alchemy primary + public fallback shards),
// so they intentionally don't appear here. getRpcUrlForChainId() still
// surfaces a canonical URL for those for non-transport use (deep links etc).
const RPC_MAP: Partial<Record<NetworkName, string>> = {
  sepolia: 'https://sepolia.drpc.org',
  mainnet: 'https://eth.llamarpc.com',
}

// Canonical RPC URLs used outside the wagmi transport (e.g. copy-to-clipboard,
// MetaMask add-network deep links). For Base we report the primary endpoint
// from env, falling back to the public RPC so something is always returned.
const CANONICAL_RPC_MAP: Record<NetworkName, string> = {
  sepolia: RPC_MAP.sepolia ?? 'https://sepolia.drpc.org',
  mainnet: RPC_MAP.mainnet ?? 'https://eth.llamarpc.com',
  base:
    (import.meta.env.VITE_RPC_URL_BASE_PRIMARY as string | undefined) || 'https://mainnet.base.org',
  'base-sepolia':
    (import.meta.env.VITE_RPC_URL_BASE_SEPOLIA_PRIMARY as string | undefined) ||
    'https://sepolia.base.org',
}

const EXPLORER_BASE_MAP: Record<number, string> = {
  1: 'https://etherscan.io',
  10: 'https://optimistic.etherscan.io',
  137: 'https://polygonscan.com',
  8453: 'https://basescan.org',
  84532: 'https://sepolia.basescan.org',
  42161: 'https://arbiscan.io',
  11155111: 'https://sepolia.etherscan.io',
}

// Blockscout API base URLs per chain (used for tx history)
const BLOCKSCOUT_API_MAP: Record<number, string> = {
  1: 'https://eth.blockscout.com',
  10: 'https://optimism.blockscout.com',
  137: 'https://polygon.blockscout.com',
  8453: 'https://base.blockscout.com',
  84532: 'https://base-sepolia.blockscout.com',
  42161: 'https://arbitrum.blockscout.com',
  11155111: 'https://eth-sepolia.blockscout.com',
}

const CHAIN_LABEL_MAP: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  137: 'Polygon',
  8453: 'Base',
  84532: 'Base Sepolia',
  42161: 'Arbitrum',
  11155111: 'Ethereum Sepolia',
}

// Get network from env or default to Base Sepolia. Defaulting to testnet
// keeps a misconfigured deploy from silently targeting mainnet - set
// VITE_NETWORK=base explicitly when you mean production.
const networkName = (import.meta.env.VITE_NETWORK as NetworkName) || 'base-sepolia'

// Validate network name
if (!NETWORK_MAP[networkName]) {
  throw new Error(
    `Invalid VITE_NETWORK: "${networkName}". Must be one of: ${Object.keys(NETWORK_MAP).join(', ')}`
  )
}

export const selectedChain = NETWORK_MAP[networkName]
export const selectedNetworkName: NetworkName = networkName

export function getRpcUrlForChainId(chainId: number): string | undefined {
  const name = Object.entries(NETWORK_MAP).find(([, candidate]) => candidate.id === chainId)?.[0]
  if (!name) return undefined
  return CANONICAL_RPC_MAP[name as NetworkName]
}

export function getExplorerBase(chainId: number): string {
  return EXPLORER_BASE_MAP[chainId] || 'https://etherscan.io'
}

export function getChainLabel(chainId: number): string {
  return CHAIN_LABEL_MAP[chainId] || `Chain ${chainId}`
}

export function getBlockscoutApiUrl(chainId: number): string | undefined {
  return BLOCKSCOUT_API_MAP[chainId]
}

// Build the wagmi transport for the active chain. For Base + Base Sepolia we
// hand off to the multi-RPC pool (Alchemy primary + public fallback shards,
// staleness-filtered every 15s). For other chains we use the single hardcoded
// RPC, or viem's default public RPC if none is configured.
export function getTransports(): Record<number, Transport> {
  if (selectedChain.id === base.id) {
    return { [selectedChain.id]: buildBaseTransport() }
  }
  if (selectedChain.id === baseSepolia.id) {
    return { [selectedChain.id]: buildBaseSepoliaTransport() }
  }

  const rpcUrl = RPC_MAP[networkName]
  if (rpcUrl) {
    return { [selectedChain.id]: http(rpcUrl) }
  }
  return { [selectedChain.id]: http() }
}
