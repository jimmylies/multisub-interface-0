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

      // Fetch metadata for each token
      const results = await Promise.allSettled(
        tokenAddresses.map(async address => {
          const addressLower = address.toLowerCase()

          // Check if token is in KNOWN_TOKENS first (cache hit)
          const known = KNOWN_TOKENS[addressLower]
          if (known) {
            return { address: addressLower, metadata: known }
          }

          // Fetch from contract
          try {
            const [symbol, decimals] = await Promise.all([
              publicClient.readContract({
                address,
                abi: ERC20_ABI,
                functionName: 'symbol',
              }),
              publicClient.readContract({
                address,
                abi: ERC20_ABI,
                functionName: 'decimals',
              }),
            ])

            return {
              address: addressLower,
              metadata: { symbol: symbol as string, decimals: decimals as number },
            }
          } catch (error) {
            // Fallback for invalid ERC20 or network errors
            console.warn(`Failed to fetch metadata for token ${address}:`, error)
            return {
              address: addressLower,
              metadata: {
                symbol: `${address.slice(0, 6)}...${address.slice(-4)}`,
                decimals: 18,
              },
            }
          }
        })
      )

      // Process results
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          metadataMap.set(result.value.address, result.value.metadata)
        }
      })

      return metadataMap
    },
    enabled: Boolean(publicClient && tokenAddresses && tokenAddresses.length > 0),
    staleTime: 5 * 60 * 1000, // 5 minutes - token metadata rarely changes
    gcTime: 30 * 60 * 1000, // 30 minutes garbage collection
  })
}
