import { mainnet, sepolia } from 'wagmi/chains'
import { http } from 'wagmi'
import type { Chain, Transport } from 'wagmi/chains'

type NetworkName = 'sepolia' | 'mainnet'

// Map network names to chain objects
const NETWORK_MAP: Record<NetworkName, Chain> = {
  sepolia,
  mainnet,
}

// Get network from env or default to Sepolia
const networkName = (import.meta.env.VITE_NETWORK as NetworkName) || 'sepolia'

// Validate network name
if (!NETWORK_MAP[networkName]) {
  throw new Error(`Invalid VITE_NETWORK: "${networkName}". Must be "sepolia" or "mainnet"`)
}

export const selectedChain = NETWORK_MAP[networkName]

function getRpcUrl(): string | undefined {
  if (networkName === 'sepolia') {
    return 'https://sepolia.drpc.org'
  }
  if (networkName === 'mainnet') {
    return 'https://eth.llamarpc.com'
  }
  return undefined
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
