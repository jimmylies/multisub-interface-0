import { useQuery } from '@tanstack/react-query'
import {
  createSubgraphClient,
  ACQUIRED_BALANCES_QUERY,
  ACQUIRED_BALANCES_AGGREGATE_QUERY,
  ACCOUNT_AGGREGATE_QUERY,
  AcquiredBalanceUpdated,
  AcquiredBalanceAggregate,
  AccountAggregate,
  AcquiredTokenWithTimestamp,
} from '@/lib/subgraph'

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
    enabled: Boolean(subAccountAddress) && options?.enabled !== false,
    refetchInterval: 30000, // 30s
    staleTime: 10000, // 10s
  })
}

// Reads the `AcquiredBalance` aggregate entity (one row per (subAccount, token))
// in a single query. Use this in oracleless mode where the FIFO 24h-expiry
// countdown does not apply — the oldest-batch timestamp is not tracked here.
export interface AcquiredBalanceCurrent {
  token: string
  balance: bigint
  updatedAt: number
}

export function useAcquiredBalancesAggregate(
  subAccountAddress?: `0x${string}`,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['acquiredBalancesAggregate', subAccountAddress],
    queryFn: async (): Promise<Map<string, AcquiredBalanceCurrent>> => {
      if (!subAccountAddress) return new Map()

      const client = createSubgraphClient()
      const data = await client.request<{ acquiredBalances: AcquiredBalanceAggregate[] }>(
        ACQUIRED_BALANCES_AGGREGATE_QUERY,
        { subAccount: subAccountAddress.toLowerCase() }
      )

      const map = new Map<string, AcquiredBalanceCurrent>()
      for (const row of data.acquiredBalances) {
        map.set(row.token.toLowerCase(), {
          token: row.token,
          balance: BigInt(row.amount),
          updatedAt: parseInt(row.updatedAt),
        })
      }
      return map
    },
    enabled: Boolean(subAccountAddress) && options?.enabled !== false,
    refetchInterval: 30000,
    staleTime: 10000,
  })
}

// Reads the `Account` aggregate entity for a sub-account in one query.
// `cumulativeSpentIndexed` is a running total of every event-recorded
// `spendingCost` since the subgraph started indexing. It is NOT the
// current-window remaining-allowance figure — for that, read on-chain
// `cumulativeSpent(subAccount)` directly via `useCumulativeSpent`.
export function useAccountAggregate(
  subAccountAddress?: `0x${string}`,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['accountAggregate', subAccountAddress],
    queryFn: async (): Promise<AccountAggregate | null> => {
      if (!subAccountAddress) return null

      const client = createSubgraphClient()
      const data = await client.request<{ account: AccountAggregate | null }>(
        ACCOUNT_AGGREGATE_QUERY,
        { id: subAccountAddress.toLowerCase() }
      )
      return data.account
    },
    enabled: Boolean(subAccountAddress) && options?.enabled !== false,
    refetchInterval: 30000,
    staleTime: 10000,
  })
}
