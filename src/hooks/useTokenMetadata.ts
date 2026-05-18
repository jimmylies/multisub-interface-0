import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { ERC20_ABI } from '@/lib/contracts'
import { KNOWN_TOKENS, TokenMetadata } from '@/lib/tokenMetadata'

/**
 * Hook to fetch ERC20 token metadata (symbol, decimals) for multiple tokens
 * Falls back to KNOWN_TOKENS for performance
 */
export function useTokensMetadata(tokenAddresses?: `0x${string}`[]) {
  const publicClient = usePublicClient()

  return useQuery({
    queryKey: ['tokensMetadata', tokenAddresses],
    queryFn: async (): Promise<Map<string, TokenMetadata>> => {
      if (!publicClient || !tokenAddresses || tokenAddresses.length === 0) {
        return new Map()
      }

      const metadataMap = new Map<string, TokenMetadata>()

      // Split into cached vs needs-fetch. Cached tokens skip the network
      // entirely — KNOWN_TOKENS covers USDC/WETH/etc.
      const toFetch: `0x${string}`[] = []
      for (const address of tokenAddresses) {
        const addressLower = address.toLowerCase()
        const known = KNOWN_TOKENS[addressLower]
        if (known) {
          metadataMap.set(addressLower, known)
        } else {
          toFetch.push(address)
        }
      }

      if (toFetch.length === 0) {
        return metadataMap
      }

      // One multicall covering symbol+decimals for every unknown token,
      // ordered [s0, d0, s1, d1, …]. Replaces the prior N×2 readContract
      // fan-out which dominated public-RPC traffic on dashboards with many
      // acquired tokens.
      const calls = toFetch.flatMap(address => [
        { address, abi: ERC20_ABI, functionName: 'symbol' as const },
        { address, abi: ERC20_ABI, functionName: 'decimals' as const },
      ])
      const results = await publicClient.multicall({
        contracts: calls,
        allowFailure: true,
      })

      toFetch.forEach((address, idx) => {
        const symbolResult = results[idx * 2]
        const decimalsResult = results[idx * 2 + 1]
        const addressLower = address.toLowerCase()

        if (symbolResult.status === 'success' && decimalsResult.status === 'success') {
          metadataMap.set(addressLower, {
            symbol: symbolResult.result as string,
            decimals: decimalsResult.result as number,
          })
        } else {
          // Fallback for non-conforming ERC20s — keep the same shape as
          // before so callers don't need to handle a missing entry.
          console.warn(`Failed to fetch metadata for token ${address}`)
          metadataMap.set(addressLower, {
            symbol: `${address.slice(0, 6)}...${address.slice(-4)}`,
            decimals: 18,
          })
        }
      })

      return metadataMap
    },
    enabled: Boolean(publicClient && tokenAddresses && tokenAddresses.length > 0),
    staleTime: 5 * 60 * 1000, // 5 minutes - token metadata rarely changes
    gcTime: 30 * 60 * 1000, // 30 minutes garbage collection
  })
}
