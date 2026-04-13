import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useAccount, usePublicClient } from 'wagmi'
import { parseAbiItem, type Address, type PublicClient } from 'viem'
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

const PROTOCOL_EXECUTION_EVENT = parseAbiItem(
  'event ProtocolExecution(address indexed subAccount, address indexed target, uint8 opType, address[] tokensIn, uint256[] amountsIn, address[] tokensOut, uint256[] amountsOut, uint256 spendingCost)'
)

const TRANSFER_EXECUTED_EVENT = parseAbiItem(
  'event TransferExecuted(address indexed subAccount, address indexed token, address indexed recipient, uint256 amount, uint256 spendingCost)'
)

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

function getMaxBlockLookback(dateRange: TransactionFilter['dateRange']): bigint {
  switch (dateRange) {
    case '24h':
      return 50_000n
    case '7d':
      return 250_000n
    case '30d':
      return 1_000_000n
    default:
      // "All time" fallback still needs a bounded window because Base Sepolia RPC
      // rejects huge eth_getLogs ranges. This covers a large recent history window.
      return 1_000_000n
  }
}

async function getLogsChunked({
  publicClient,
  address,
  event,
  args,
  fromBlock,
  toBlock,
}: {
  publicClient: PublicClient
  address: Address
  event: typeof PROTOCOL_EXECUTION_EVENT | typeof TRANSFER_EXECUTED_EVENT
  args: Record<string, Address>
  fromBlock: bigint
  toBlock: bigint
}) {
  const chunkSize = 9_500n
  const logs = []

  for (let startBlock = fromBlock; startBlock <= toBlock; startBlock += chunkSize + 1n) {
    const endBlock = startBlock + chunkSize > toBlock ? toBlock : startBlock + chunkSize
    const chunkLogs = await publicClient.getLogs({
      address,
      event,
      args,
      fromBlock: startBlock,
      toBlock: endBlock,
    })
    logs.push(...chunkLogs)
  }

  return logs
}

async function fetchHistoryFromLogs(
  publicClient: PublicClient,
  defiInteractor: Address,
  subAccount: Address,
  fromTimestamp: number,
  dateRange: TransactionFilter['dateRange']
): Promise<Transaction[]> {
  const latestBlock = await publicClient.getBlockNumber()
  const maxLookback = getMaxBlockLookback(dateRange)
  const fromBlock = latestBlock > maxLookback ? latestBlock - maxLookback : 0n

  const [protocolLogs, transferLogs] = await Promise.all([
    getLogsChunked({
      publicClient,
      address: defiInteractor,
      event: PROTOCOL_EXECUTION_EVENT,
      args: { subAccount },
      fromBlock,
      toBlock: latestBlock,
    }),
    getLogsChunked({
      publicClient,
      address: defiInteractor,
      event: TRANSFER_EXECUTED_EVENT,
      args: { subAccount },
      fromBlock,
      toBlock: latestBlock,
    }),
  ])

  const uniqueBlockNumbers = Array.from(
    new Set(
      [...protocolLogs, ...transferLogs]
        .map(log => log.blockNumber)
        .filter((blockNumber): blockNumber is bigint => blockNumber !== null)
    )
  )

  const blockEntries = await Promise.all(
    uniqueBlockNumbers.map(async blockNumber => {
      const block = await publicClient.getBlock({ blockNumber })
      return [blockNumber.toString(), Number(block.timestamp)] as const
    })
  )

  const blockTimestampMap = new Map<string, number>(blockEntries)

  const protocolTxs: Transaction[] = protocolLogs
    .map(log => {
      const timestamp = blockTimestampMap.get(log.blockNumber?.toString() ?? '') ?? 0
      return {
        id: `${log.transactionHash}-protocol-${log.logIndex?.toString() ?? '0'}`,
        type: 'protocol' as const,
        timestamp,
        blockNumber: Number(log.blockNumber ?? 0n),
        txHash: log.transactionHash,
        subAccount: log.args.subAccount!,
        target: log.args.target!,
        opType: Number(log.args.opType ?? 0) as OpType,
        tokensIn: (log.args.tokensIn ?? []) as string[],
        amountsIn: (log.args.amountsIn ?? []) as bigint[],
        tokensOut: (log.args.tokensOut ?? []) as string[],
        amountsOut: (log.args.amountsOut ?? []) as bigint[],
        spendingCost: (log.args.spendingCost ?? 0n) as bigint,
      }
    })
    .filter(tx => tx.timestamp >= fromTimestamp)

  const transferTxs: Transaction[] = transferLogs
    .map(log => {
      const timestamp = blockTimestampMap.get(log.blockNumber?.toString() ?? '') ?? 0
      return {
        id: `${log.transactionHash}-transfer-${log.logIndex?.toString() ?? '0'}`,
        type: 'transfer' as const,
        timestamp,
        blockNumber: Number(log.blockNumber ?? 0n),
        txHash: log.transactionHash,
        subAccount: log.args.subAccount!,
        token: log.args.token!,
        recipient: log.args.recipient!,
        amount: (log.args.amount ?? 0n) as bigint,
        spendingCost: (log.args.spendingCost ?? 0n) as bigint,
      }
    })
    .filter(tx => tx.timestamp >= fromTimestamp)

  return [...protocolTxs, ...transferTxs]
}

async function fetchTransactionHistoryForSubAccount({
  publicClient,
  defiInteractor,
  subAccount,
  filter,
  fromTimestamp,
}: {
  publicClient: PublicClient
  defiInteractor: Address
  subAccount: Address
  filter: TransactionFilter
  fromTimestamp: number
}): Promise<Transaction[]> {
  const shouldFetchProtocol = filter.type !== 'transfer'
  const shouldFetchTransfers = filter.type !== 'protocol'
  const opTypeFilter =
    shouldFetchProtocol && filter.opType && filter.opType !== 'all'
      ? [filter.opType]
      : undefined

  const discovered = new Map<string, Transaction>()

  try {
    const client = createSubgraphClient()
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

    const subgraphTransactions = [
      ...protocolResult.protocolExecutions.map(mapProtocolExecution),
      ...transferResult.transferExecuteds.map(mapTransferExecuted),
    ]

    subgraphTransactions.forEach(tx => {
      discovered.set(tx.id, tx)
    })
  } catch {
    // Fall through to on-chain logs
  }

  const rangeFilteredLogTransactions = await fetchHistoryFromLogs(
    publicClient,
    defiInteractor,
    subAccount,
    fromTimestamp,
    filter.dateRange
  )

  rangeFilteredLogTransactions.forEach(tx => {
    discovered.set(tx.id, tx)
  })

  return applyFilters(
    Array.from(discovered.values()).sort((a, b) => b.timestamp - a.timestamp),
    filter
  )
}

export function useTransactionHistory(options: UseTransactionHistoryOptions = {}) {
  const { address: connectedAddress } = useAccount()
  const publicClient = usePublicClient()
  const { defiInteractor } = useContractAddresses()

  const subAccount = options.subAccount || connectedAddress
  const filter = options.filter || {}
  const enabled = options.enabled !== false && !!subAccount && !!defiInteractor && !!publicClient

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
      if (!subAccount || !defiInteractor || !publicClient) return []

      return fetchTransactionHistoryForSubAccount({
        publicClient,
        defiInteractor,
        subAccount,
        filter,
        fromTimestamp,
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
  const publicClient = usePublicClient()
  const { defiInteractor } = useContractAddresses()
  const subAccounts = options.subAccounts || []
  const filter = options.filter || {}
  const enabled = options.enabled !== false && !!defiInteractor && !!publicClient && subAccounts.length > 0
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
        if (!defiInteractor || !publicClient) return []

        return fetchTransactionHistoryForSubAccount({
          publicClient,
          defiInteractor,
          subAccount,
          filter,
          fromTimestamp,
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
