import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { decodeEventLog, type Address } from 'viem'
import { GUARDIAN_ABI } from '@/lib/contracts'
import { useContractAddresses } from '@/contexts/ContractAddressContext'
import { getBlockscoutApiUrl } from '@/lib/chains'

// Operation type mapping
export const OP_TYPES = {
  0: 'Unknown',
  1: 'Swap',
  2: 'Deposit',
  3: 'Withdraw',
  4: 'Claim',
  5: 'Approve',
} as const

export type OpType = keyof typeof OP_TYPES

// Unified transaction type
export interface Transaction {
  id: string
  type: 'protocol' | 'transfer'
  timestamp: number
  blockNumber: number
  txHash: string
  subAccount: string
  // Protocol specific
  target?: string
  opType?: OpType
  tokensIn?: string[]
  amountsIn?: bigint[]
  tokensOut?: string[]
  amountsOut?: bigint[]
  // Transfer specific
  token?: string
  recipient?: string
  amount?: bigint
  // Common
  spendingCost: bigint
}

export type TransactionFilter = {
  type?: 'all' | 'protocol' | 'transfer'
  opType?: OpType | 'all'
  dateRange?: 'all' | '24h' | '7d' | '30d'
  tokens?: string[]
  agent?: string | 'all'
}

interface UseTransactionHistoryOptions {
  subAccount?: `0x${string}`
  filter?: TransactionFilter
  enabled?: boolean
}

// Get timestamp for date range filter
function getTimestampForRange(range: TransactionFilter['dateRange']): number {
  const now = Math.floor(Date.now() / 1000)
  switch (range) {
    case '24h':
      return now - 24 * 60 * 60
    case '7d':
      return now - 7 * 24 * 60 * 60
    case '30d':
      return now - 30 * 24 * 60 * 60
    default:
      return 0 // All time
  }
}

// Apply filters to transactions
function applyFilters(transactions: Transaction[], filter: TransactionFilter): Transaction[] {
  let filtered = [...transactions]

  // Type filter
  if (filter.type && filter.type !== 'all') {
    filtered = filtered.filter(tx => tx.type === filter.type)
  }

  // OpType filter (only for protocol transactions)
  if (filter.opType && filter.opType !== 'all') {
    filtered = filtered.filter(tx => tx.type === 'protocol' && tx.opType === filter.opType)
  }

  // Token filter
  if (filter.tokens && filter.tokens.length > 0) {
    const tokensLower = filter.tokens.map(t => t.toLowerCase())
    filtered = filtered.filter(tx => {
      if (tx.type === 'transfer') {
        return tx.token ? tokensLower.includes(tx.token.toLowerCase()) : false
      }
      if (tx.type === 'protocol') {
        const hasTokenIn = tx.tokensIn?.some(t => tokensLower.includes(t.toLowerCase()))
        const hasTokenOut = tx.tokensOut?.some(t => tokensLower.includes(t.toLowerCase()))
        return hasTokenIn || hasTokenOut
      }
      return true
    })
  }

  if (filter.agent && filter.agent !== 'all') {
    const agentLower = filter.agent.toLowerCase()
    filtered = filtered.filter(tx => tx.subAccount.toLowerCase() === agentLower)
  }

  return filtered
}

/**
 * Fetch transaction history from blockscout API and decode Guardian events.
 */
async function fetchHistoryFromBlockscout(
  blockscoutUrl: string,
  guardian: Address,
  subAccount: Address,
  fromTimestamp: number
): Promise<Transaction[]> {
  try {
    const res = await fetch(
      `${blockscoutUrl}/api/v2/addresses/${subAccount}/transactions?filter=from`
    )
    if (!res.ok) return []
    const data = await res.json()
    const items: any[] = data.items || []

    // Only keep txs sent TO the guardian module
    const moduleTxs = items.filter(
      (tx: any) => tx.to?.hash?.toLowerCase() === guardian.toLowerCase() && tx.status === 'ok'
    )

    const transactions: Transaction[] = []

    for (const tx of moduleTxs) {
      try {
        const timestamp = Math.floor(new Date(tx.timestamp).getTime() / 1000)
        if (timestamp < fromTimestamp) continue

        const logsRes = await fetch(`${blockscoutUrl}/api/v2/transactions/${tx.hash}/logs`)
        if (!logsRes.ok) continue
        const logsData = await logsRes.json()
        const logs: any[] = logsData.items || []

        for (const log of logs) {
          if (log.address?.hash?.toLowerCase() !== guardian.toLowerCase()) continue

          try {
            const topics = (log.topics as (string | null)[]).filter(
              (t): t is string => t !== null
            ) as [`0x${string}`, ...`0x${string}`[]]

            const decoded = decodeEventLog({
              abi: GUARDIAN_ABI,
              data: log.data as `0x${string}`,
              topics,
            })

            if (decoded.eventName === 'ProtocolExecution') {
              const args = decoded.args as any
              transactions.push({
                id: `${tx.hash}-protocol-${log.index}`,
                type: 'protocol',
                timestamp,
                blockNumber: Number(tx.block_number ?? tx.block),
                txHash: tx.hash,
                subAccount: args.subAccount,
                target: args.target,
                opType: Number(args.opType) as OpType,
                tokensIn: args.tokensIn as string[],
                amountsIn: args.amountsIn as bigint[],
                tokensOut: args.tokensOut as string[],
                amountsOut: args.amountsOut as bigint[],
                spendingCost: args.spendingCost as bigint,
              })
            } else if (decoded.eventName === 'TransferExecuted') {
              const args = decoded.args as any
              transactions.push({
                id: `${tx.hash}-transfer-${log.index}`,
                type: 'transfer',
                timestamp,
                blockNumber: Number(tx.block_number ?? tx.block),
                txHash: tx.hash,
                subAccount: args.subAccount,
                token: args.token,
                recipient: args.recipient,
                amount: args.amount as bigint,
                spendingCost: args.spendingCost as bigint,
              })
            }
          } catch {
            // Not a matching event
          }
        }
      } catch {
        // Skip failed fetches
      }
    }

    return transactions
  } catch {
    return []
  }
}

async function fetchTransactionHistoryForSubAccount({
  blockscoutUrl,
  guardian,
  subAccount,
  filter,
  fromTimestamp,
}: {
  blockscoutUrl: string
  guardian: Address
  subAccount: Address
  filter: TransactionFilter
  fromTimestamp: number
}): Promise<Transaction[]> {
  const transactions = await fetchHistoryFromBlockscout(
    blockscoutUrl,
    guardian,
    subAccount,
    fromTimestamp
  )

  return applyFilters(
    transactions.sort((a: Transaction, b: Transaction) => b.timestamp - a.timestamp),
    filter
  )
}

export function useTransactionHistory(options: UseTransactionHistoryOptions = {}) {
  const { address: connectedAddress, chainId } = useAccount()
  const { addresses } = useContractAddresses()
  const guardian = addresses.guardian
  const blockscoutUrl = chainId ? getBlockscoutApiUrl(chainId) : undefined

  // Don't fall back to connectedAddress when explicitly disabled - avoids
  // polluting the query cache with a key that may collide with a multi-account query.
  const subAccount =
    options.enabled !== false ? options.subAccount || connectedAddress : options.subAccount
  const filter = options.filter || {}
  const enabled = options.enabled !== false && !!subAccount && !!guardian && !!blockscoutUrl

  return useQuery({
    queryKey: ['txHistory', subAccount, guardian, filter.dateRange, filter.type, filter.opType],
    queryFn: async () => {
      if (!subAccount || !guardian || !blockscoutUrl) return []

      return fetchTransactionHistoryForSubAccount({
        blockscoutUrl,
        guardian,
        subAccount,
        filter,
        fromTimestamp: getTimestampForRange(filter.dateRange),
      })
    },
    enabled,
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  })
}

interface UseMultipleTransactionHistoriesOptions {
  subAccounts?: `0x${string}`[]
  filter?: TransactionFilter
  enabled?: boolean
}

/**
 * Fetches transaction history for multiple sub-accounts in parallel.
 * Useful for owner views that need to show all activity across all agents.
 */
export function useMultipleTransactionHistories(
  options: UseMultipleTransactionHistoriesOptions = {}
) {
  const { chainId } = useAccount()
  const { addresses } = useContractAddresses()
  const guardian = addresses.guardian
  const blockscoutUrl = chainId ? getBlockscoutApiUrl(chainId) : undefined
  const subAccounts = options.subAccounts || []
  const filter = options.filter || {}
  const enabled =
    options.enabled !== false && !!guardian && !!blockscoutUrl && subAccounts.length > 0

  const queries = useQueries({
    queries: subAccounts.map(subAccount => ({
      queryKey: ['txHistory', subAccount, guardian, filter.dateRange, filter.type, filter.opType],
      queryFn: async () => {
        if (!guardian || !blockscoutUrl) return []

        return fetchTransactionHistoryForSubAccount({
          blockscoutUrl,
          guardian,
          subAccount,
          filter,
          fromTimestamp: getTimestampForRange(filter.dateRange),
        })
      },
      enabled: enabled && !!subAccount,
      staleTime: 60_000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
    })),
  })

  // Merge and deduplicate by tx id, sort newest first
  const data = useMemo(() => {
    const allTransactions: Transaction[] = []
    const seenIds = new Set<string>()
    for (const query of queries) {
      if (query.data) {
        for (const tx of query.data) {
          if (!seenIds.has(tx.id)) {
            allTransactions.push(tx)
            seenIds.add(tx.id)
          }
        }
      }
    }
    return allTransactions.sort((a, b) => b.timestamp - a.timestamp)
  }, [queries])

  const isLoading = queries.some(q => q.isLoading) || (enabled && queries.length === 0)
  const isError = queries.length > 0 && queries.every(q => q.isError)
  const isFetching = queries.some(q => q.isFetching)
  const refetch = () => {
    queries.forEach(q => q.refetch())
  }

  return { data, isLoading, isError, isFetching, refetch }
}

// Hook to get filtered transactions
export function useFilteredTransactions(
  transactions: Transaction[] | undefined,
  filter: TransactionFilter
) {
  if (!transactions) return []
  return applyFilters(transactions, filter)
}

// Get unique tokens from transactions
export function getUniqueTokens(transactions: Transaction[]): string[] {
  const tokens = new Set<string>()

  transactions.forEach(tx => {
    if (tx.type === 'transfer' && tx.token) {
      tokens.add(tx.token.toLowerCase())
    }
    if (tx.type === 'protocol') {
      tx.tokensIn?.forEach(t => tokens.add(t.toLowerCase()))
      tx.tokensOut?.forEach(t => tokens.add(t.toLowerCase()))
    }
  })

  return Array.from(tokens)
}
