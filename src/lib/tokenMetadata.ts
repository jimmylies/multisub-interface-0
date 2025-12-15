// Known tokens on Base mainnet
export const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6 },
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': { symbol: 'USDT', decimals: 6 },
  // '0x29f2d40b0605204364af54ec677bd022da425d03': { symbol: 'WBTC', decimals: 8 },
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { symbol: 'DAI', decimals: 18 },
}

export interface TokenMetadata {
  symbol: string
  decimals: number
}

export function getTokenMetadata(address: string): TokenMetadata {
  const metadata = KNOWN_TOKENS[address.toLowerCase()]
  if (metadata) return metadata

  // Fallback pour tokens inconnus
  return {
    symbol: `${address.slice(0, 6)}...${address.slice(-4)}`,
    decimals: 18,
  }
}
