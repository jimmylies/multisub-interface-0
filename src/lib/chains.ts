import { mainnet, sepolia, base, baseSepolia } from 'wagmi/chains'
import { http } from 'wagmi'
import type { Chain, Transport } from 'wagmi/chains'

export type NetworkName = 'sepolia' | 'mainnet' | 'base' | 'base-sepolia'

// Map network names to chain objects
const NETWORK_MAP: Record<NetworkName, Chain> = {
  sepolia,
  mainnet,
  base,
  'base-sepolia': baseSepolia,
}

// Default RPC URLs per network
const RPC_MAP: Record<NetworkName, string> = {
  sepolia: 'https://sepolia.drpc.org',
  mainnet: 'https://eth.llamarpc.com',
  base: 'https://mainnet.base.org',
  'base-sepolia': 'https://sepolia.base.org',
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

// Get network from env or default to Base
const networkName = (import.meta.env.VITE_NETWORK as NetworkName) || 'base'

// Validate network name
if (!NETWORK_MAP[networkName]) {
  throw new Error(
    `Invalid VITE_NETWORK: "${networkName}". Must be one of: ${Object.keys(NETWORK_MAP).join(', ')}`
  )
}

export const selectedChain = NETWORK_MAP[networkName]
export const selectedNetworkName: NetworkName = networkName

function getRpcUrl(): string | undefined {
  return RPC_MAP[networkName]
}

export function getRpcUrlForChainId(chainId: number): string | undefined {
  const chain = Object.values(NETWORK_MAP).find(candidate => candidate.id === chainId)
  if (!chain) return undefined

  const name = Object.entries(NETWORK_MAP).find(([, candidate]) => candidate.id === chainId)?.[0]
  if (!name) return undefined

  return RPC_MAP[name as NetworkName]
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

// Get transports with custom RPC if provided
export function getTransports(): Record<number, Transport> {
  const rpcUrl = getRpcUrl()

  if (rpcUrl) {
    return {
      [selectedChain.id]: http(rpcUrl),
    }
  }

  // Use default public RPC
  return {
    [selectedChain.id]: http(),
  }
}
