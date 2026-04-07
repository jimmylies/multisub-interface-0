import { mainnet, sepolia, base, baseSepolia } from 'wagmi/chains'
import { http } from 'wagmi'
import type { Chain, Transport } from 'wagmi/chains'

type NetworkName = 'sepolia' | 'mainnet' | 'base' | 'base-sepolia'

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

// Get network from env or default to Base
const networkName = (import.meta.env.VITE_NETWORK as NetworkName) || 'base'

// Validate network name
if (!NETWORK_MAP[networkName]) {
  throw new Error(
    `Invalid VITE_NETWORK: "${networkName}". Must be one of: ${Object.keys(NETWORK_MAP).join(', ')}`
  )
}

export const selectedChain = NETWORK_MAP[networkName]

function getRpcUrl(): string | undefined {
  return RPC_MAP[networkName]
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
