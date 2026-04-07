import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import {
  createSubgraphClient,
  PROTOCOL_EXECUTION_QUERY,
  TRANSFER_EXECUTED_QUERY,
  type ProtocolExecution,
  type TransferExecuted,
} from '@/lib/subgraph'
import { useContractAddresses } from '@/contexts/ContractAddressContext'

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
  token?: string | 'all'
}

interface UseTransactionHistoryOptions {
  subAccount?: `0x${string}`
  filter?: TransactionFilter
  enabled?: boolean
}

// Convert raw protocol execution to unified transaction
function mapProtocolExecution(exec: ProtocolExecution): Transaction {
  return {
    id: exec.id,
    type: 'protocol',
    timestamp: Number(exec.blockTimestamp),
    blockNumber: Number(exec.blockNumber),
    txHash: exec.transactionHash,
    subAccount: exec.subAccount,
    target: exec.target,
    opType: Number(exec.opType) as OpType,
    tokensIn: exec.tokensIn,
    amountsIn: exec.amountsIn.map(a => BigInt(a)),
    tokensOut: exec.tokensOut,
    amountsOut: exec.amountsOut.map(a => BigInt(a)),
    spendingCost: BigInt(exec.spendingCost),
  }
}

// Convert raw transfer to unified transaction
function mapTransferExecuted(transfer: TransferExecuted): Transaction {
  return {
    id: transfer.id,
    type: 'transfer',
    timestamp: Number(transfer.blockTimestamp),
    blockNumber: Number(transfer.blockNumber),
    txHash: transfer.transactionHash,
    subAccount: transfer.subAccount,
    token: transfer.token,
    recipient: transfer.recipient,
    amount: BigInt(transfer.amount),
    spendingCost: BigInt(transfer.spendingCost),
  }
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
    filtered = filtered.filter(tx => tx.type !== 'protocol' || tx.opType === filter.opType)
  }

  // Token filter
  if (filter.token && filter.token !== 'all') {
    const tokenLower = filter.token.toLowerCase()
    filtered = filtered.filter(tx => {
      if (tx.type === 'transfer') {
        return tx.token?.toLowerCase() === tokenLower
      }
      if (tx.type === 'protocol') {
        const hasTokenIn = tx.tokensIn?.some(t => t.toLowerCase() === tokenLower)
        const hasTokenOut = tx.tokensOut?.some(t => t.toLowerCase() === tokenLower)
        return hasTokenIn || hasTokenOut
      }
      return true
    })
  }

  return filtered
}

export function useTransactionHistory(options: UseTransactionHistoryOptions = {}) {
  const { address: connectedAddress } = useAccount()
  const { defiInteractor } = useContractAddresses()

  const subAccount = options.subAccount || connectedAddress
  const filter = options.filter || {}
  const enabled = options.enabled !== false && !!subAccount && !!defiInteractor

  const fromTimestamp = getTimestampForRange(filter.dateRange)

  return useQuery({
    queryKey: [
      'transactionHistory',
      subAccount,
      defiInteractor,
      fromTimestamp,
      filter.type,
      filter.opType,
    ],
    queryFn: async () => {
      if (!subAccount) return []

      const client = createSubgraphClient()

      // Skip queries based on type filter
      const shouldFetchProtocol = filter.type !== 'transfer'
      const shouldFetchTransfers = filter.type !== 'protocol'

      // Build opType filter for subgraph (only when filtering protocol transactions)
      const opTypeFilter =
        shouldFetchProtocol && filter.opType && filter.opType !== 'all'
          ? [filter.opType]
          : undefined

      // Fetch based on type filter
      const [protocolResult, transferResult] = await Promise.all([
        shouldFetchProtocol
          ? client.request<{ protocolExecutions: ProtocolExecution[] }>(PROTOCOL_EXECUTION_QUERY, {
              subAccount: subAccount.toLowerCase(),
              fromTimestamp: fromTimestamp.toString(),
              opTypes: opTypeFilter,
            })
          : Promise.resolve({ protocolExecutions: [] }),
        shouldFetchTransfers
          ? client.request<{ transferExecuteds: TransferExecuted[] }>(TRANSFER_EXECUTED_QUERY, {
              subAccount: subAccount.toLowerCase(),
              fromTimestamp: fromTimestamp.toString(),
            })
          : Promise.resolve({ transferExecuteds: [] }),
      ])

      // Map to unified transaction type
      const protocolTxs = protocolResult.protocolExecutions.map(mapProtocolExecution)
      const transferTxs = transferResult.transferExecuteds.map(mapTransferExecuted)

      // Merge and sort by timestamp (most recent first)
      const allTransactions = [...protocolTxs, ...transferTxs].sort(
        (a, b) => b.timestamp - a.timestamp
      )

      return allTransactions
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
  const { defiInteractor } = useContractAddresses()
  const subAccounts = options.subAccounts || []
  const filter = options.filter || {}
  const enabled = options.enabled !== false && !!defiInteractor && subAccounts.length > 0
  const fromTimestamp = getTimestampForRange(filter.dateRange)

  const queries = useQueries({
    queries: subAccounts.map(subAccount => ({
      queryKey: [
        'transactionHistory',
        subAccount,
        defiInteractor,
        fromTimestamp,
        filter.type,
        filter.opType,
      ],
      queryFn: async () => {
        const client = createSubgraphClient()
        const shouldFetchProtocol = filter.type !== 'transfer'
        const shouldFetchTransfers = filter.type !== 'protocol'
        const opTypeFilter =
          shouldFetchProtocol && filter.opType && filter.opType !== 'all'
            ? [filter.opType]
            : undefined

        const [protocolResult, transferResult] = await Promise.all([
          shouldFetchProtocol
            ? client.request<{ protocolExecutions: ProtocolExecution[] }>(
                PROTOCOL_EXECUTION_QUERY,
                {
                  subAccount: subAccount.toLowerCase(),
                  fromTimestamp: fromTimestamp.toString(),
                  opTypes: opTypeFilter,
                }
              )
            : Promise.resolve({ protocolExecutions: [] }),
          shouldFetchTransfers
            ? client.request<{ transferExecuteds: TransferExecuted[] }>(TRANSFER_EXECUTED_QUERY, {
                subAccount: subAccount.toLowerCase(),
                fromTimestamp: fromTimestamp.toString(),
              })
            : Promise.resolve({ transferExecuteds: [] }),
        ])

        const protocolTxs = protocolResult.protocolExecutions.map(mapProtocolExecution)
        const transferTxs = transferResult.transferExecuteds.map(mapTransferExecuted)
        return [...protocolTxs, ...transferTxs]
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
