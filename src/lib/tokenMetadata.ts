import type { NetworkName } from '@/lib/chains'

export interface TokenMetadata {
  symbol: string
  decimals: number
}

export interface TrackedToken {
  symbol: string
  address: `0x${string}`
  decimals: number
}

// Known tokens per network - used for display labels and tracked balances
const KNOWN_TOKENS_BY_NETWORK: Record<NetworkName, Record<string, TokenMetadata>> = {
  base: {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6 },
    '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
    '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': { symbol: 'USDT', decimals: 6 },
    '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { symbol: 'DAI', decimals: 18 },
  },
  'base-sepolia': {
    '0x036cbd53842c5426634e7929541ec2318f3dcf7e': { symbol: 'USDC', decimals: 6 },
    '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
  },
  mainnet: {
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18 },
    '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6 },
    '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18 },
  },
  sepolia: {
    '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238': { symbol: 'USDC', decimals: 6 },
    '0xfff9976782d46cc05630d1f6ebab18b2324d6b14': { symbol: 'WETH', decimals: 18 },
  },
}

const currentNetwork = ((import.meta.env.VITE_NETWORK as NetworkName | undefined) ||
  'base') as NetworkName

export const KNOWN_TOKENS = KNOWN_TOKENS_BY_NETWORK[currentNetwork] ?? KNOWN_TOKENS_BY_NETWORK.base

// Tracked tokens for balance display (derived from known tokens)
export const TRACKED_TOKENS: TrackedToken[] = Object.entries(KNOWN_TOKENS).map(
  ([address, meta]) => ({
    symbol: meta.symbol,
    address: address as `0x${string}`,
    decimals: meta.decimals,
  })
)

export function getTokenMetadata(address: string): TokenMetadata {
  const metadata = KNOWN_TOKENS[address.toLowerCase()]
  if (metadata) return metadata

  return {
    symbol: `${address.slice(0, 6)}...${address.slice(-4)}`,
    decimals: 18,
  }
}
