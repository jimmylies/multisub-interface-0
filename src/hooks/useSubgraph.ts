import { useQuery } from '@tanstack/react-query'
import { createSubgraphClient, ACQUIRED_BALANCES_QUERY, AcquiredBalanceUpdated, AcquiredTokenWithTimestamp } from '@/lib/subgraph'

export function useAcquiredBalancesFromSubgraph(
  subAccountAddress?: `0x${string}`,
  options?: {
    enabled?: boolean
  }
) {
  return useQuery({
    queryKey: ['acquiredBalancesSubgraph', subAccountAddress],
    queryFn: async (): Promise<Map<string, AcquiredTokenWithTimestamp>> => {
      if (!subAccountAddress) return new Map()

      const client = createSubgraphClient()
      const data = await client.request<{ acquiredBalanceUpdateds: AcquiredBalanceUpdated[] }>(
        ACQUIRED_BALANCES_QUERY,
        { subAccount: subAccountAddress.toLowerCase() }
      )

      // Group by token: analyze balance changes to track oldest active batch
      const tokenMap = new Map<string, AcquiredTokenWithTimestamp>()

      // Data is sorted by timestamp asc (oldest first)
      // Analyze balance changes to determine oldest batch timestamp
      for (const event of data.acquiredBalanceUpdateds) {
        const tokenKey = event.token.toLowerCase()
        const existingToken = tokenMap.get(tokenKey)
        const currentBalance = BigInt(event.newBalance)
        const currentTimestamp = parseInt(event.blockTimestamp)

        if (!existingToken) {
          // First event for this token
          tokenMap.set(tokenKey, {
            token: event.token,
            balance: currentBalance,
            timestamp: currentTimestamp,
            lastBalance: currentBalance,
          })
        } else {
          const lastBalance = existingToken.lastBalance
          let newTimestamp = existingToken.timestamp

          // Analyze balance changes to maintain accurate oldest batch timestamp
          if (currentBalance > lastBalance) {
            // INCREASE: New acquisition
            if (lastBalance === 0n) {
              // Reacquisition after complete depletion = new oldest batch
              newTimestamp = currentTimestamp
            }
            // Else: keep oldest timestamp (new batch added to FIFO queue)
          } else if (currentBalance === 0n) {
            // Complete depletion = reset timestamp
            newTimestamp = 0
          }
          // Partial consumption (balance decrease but > 0): keep existing timestamp (conservative)

          tokenMap.set(tokenKey, {
            ...existingToken,
            balance: currentBalance,
            timestamp: newTimestamp,
            lastBalance: currentBalance,
          })
        }
      }

      return tokenMap
    },
    enabled: Boolean(subAccountAddress) && (options?.enabled !== false),
    refetchInterval: 30000, // 30s
    staleTime: 10000, // 10s
  })
}
