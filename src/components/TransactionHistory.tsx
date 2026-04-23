import { useState, useMemo } from 'react'
import {
  History,
  Download,
  FileText,
  FileJson,
  ClipboardCopy,
  RefreshCw,
  Inbox,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/tooltip'
import { SkeletonCard, SkeletonText, SkeletonBadge } from '@/components/ui/skeleton'
import { FadeInUp, StaggerList, StaggerItem } from '@/components/ui/motion'
import { TransactionRow } from '@/components/TransactionRow'
import { TransactionFilters } from '@/components/TransactionFilters'
import {
  useTransactionHistory,
  useMultipleTransactionHistories,
  useFilteredTransactions,
  getUniqueTokens,
  type TransactionFilter,
} from '@/hooks/useTransactionHistory'
import { useTokensMetadata } from '@/hooks/useTokenMetadata'
import { useSubAccountNames } from '@/hooks/useSubAccountNames'
import { exportToCSV, exportToJSON, copyToClipboard } from '@/lib/export'
import { cn } from '@/lib/utils'

interface TransactionHistoryProps {
  subAccount?: `0x${string}`
  /** When provided, fetches and merges history for multiple sub-accounts (used for owner views). Takes precedence over `subAccount`. */
  subAccounts?: `0x${string}`[]
  className?: string
}

// Skeleton loader for transaction rows
function TransactionRowSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 rounded-lg bg-elevated border border-subtle">
      <div className="p-2 rounded-lg bg-elevated-2">
        <div className="w-5 h-5 rounded bg-elevated animate-pulse" />
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <SkeletonText width="w-24" />
          <SkeletonBadge />
        </div>
        <SkeletonText width="w-48" />
      </div>
      <div className="flex flex-col items-end gap-1">
        <SkeletonText width="w-16" />
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded bg-elevated-2 animate-pulse" />
          <div className="w-3 h-3 rounded bg-elevated-2 animate-pulse" />
        </div>
      </div>
    </div>
  )
}

// Empty state component
function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <FadeInUp className="flex flex-col items-center justify-center py-12 text-center">
      <div className="p-4 rounded-full bg-elevated-2 mb-4">
        <Inbox className="w-8 h-8 text-tertiary" />
      </div>
      <h3 className="text-lg font-medium text-primary mb-2">
        {hasFilters ? 'No matching transactions' : 'No transactions yet'}
      </h3>
      <p className="text-sm text-secondary max-w-md">
        {hasFilters
          ? 'Try adjusting your filters to see more transactions.'
          : 'Transaction history will appear here once you start using your sub-account.'}
      </p>
    </FadeInUp>
  )
}

// Export dropdown menu
function ExportMenu({
  onExportCSV,
  onExportJSON,
  onCopyClipboard,
  disabled,
}: {
  onExportCSV: () => void
  onExportJSON: () => void
  onCopyClipboard: () => void
  disabled: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <Tooltip content="Export transactions">
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          className={cn(
            'p-2 rounded-lg transition-colors',
            disabled
              ? 'text-tertiary cursor-not-allowed'
              : 'text-secondary hover:text-primary hover:bg-elevated-2'
          )}
        >
          <Download className="w-4 h-4" />
        </button>
      </Tooltip>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full right-0 mt-1 w-48 py-1 bg-elevated border border-subtle rounded-lg shadow-lg z-20 animate-fade-in">
            <button
              onClick={() => {
                onExportCSV()
                setIsOpen(false)
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-primary hover:bg-elevated-2 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Export as CSV
            </button>
            <button
              onClick={() => {
                onExportJSON()
                setIsOpen(false)
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-primary hover:bg-elevated-2 transition-colors"
            >
              <FileJson className="w-4 h-4" />
              Export as JSON
            </button>
            <div className="border-t border-subtle my-1" />
            <button
              onClick={() => {
                onCopyClipboard()
                setIsOpen(false)
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-primary hover:bg-elevated-2 transition-colors"
            >
              <ClipboardCopy className="w-4 h-4" />
              Copy to clipboard
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function TransactionHistory({
  subAccount,
  subAccounts,
  className,
}: TransactionHistoryProps) {
  // Filter state
  const [filter, setFilter] = useState<TransactionFilter>({
    type: 'all',
    opType: 'all',
    dateRange: 'all',
    tokens: [],
    agent: 'all',
  })
  const { getAccountName } = useSubAccountNames()

  // Fetch transaction history — multi-account when subAccounts is provided, single otherwise
  const isMultiAccount = !!subAccounts && subAccounts.length > 0
  const singleQuery = useTransactionHistory({
    subAccount,
    filter: { dateRange: filter.dateRange },
    enabled: !isMultiAccount,
  })
  const multiQuery = useMultipleTransactionHistories({
    subAccounts,
    filter: { dateRange: filter.dateRange },
    enabled: isMultiAccount,
  })

  const transactions = isMultiAccount ? multiQuery.data : singleQuery.data
  const isLoading = isMultiAccount ? multiQuery.isLoading : singleQuery.isLoading
  const isError = isMultiAccount ? multiQuery.isError : singleQuery.isError
  const isFetching = isMultiAccount ? multiQuery.isFetching : singleQuery.isFetching
  const refetch = isMultiAccount ? multiQuery.refetch : singleQuery.refetch

  // Apply client-side filters
  const filteredTransactions = useFilteredTransactions(transactions, filter)

  // Get unique tokens for filter dropdown
  const uniqueTokenAddresses = useMemo(
    () => (transactions ? getUniqueTokens(transactions) : []),
    [transactions]
  )

  // Fetch token metadata for filter dropdown
  const { data: tokenMetadata } = useTokensMetadata(uniqueTokenAddresses)

  // Map tokens to filter options
  const availableTokens = useMemo(() => {
    if (!tokenMetadata) return []
    return uniqueTokenAddresses.map(address => ({
      address,
      symbol: tokenMetadata.get(address)?.symbol || `${address.slice(0, 6)}...`,
    }))
  }, [uniqueTokenAddresses, tokenMetadata])

  const availableAgents = useMemo(() => {
    if (!subAccounts || subAccounts.length === 0) return []

    return subAccounts.map(address => ({
      address,
      label: getAccountName(address) || `${address.slice(0, 6)}...${address.slice(-4)}`,
    }))
  }, [getAccountName, subAccounts])

  // Export handlers
  const handleExportCSV = () => {
    if (filteredTransactions.length > 0) {
      exportToCSV(filteredTransactions)
    }
  }

  const handleExportJSON = () => {
    if (filteredTransactions.length > 0) {
      exportToJSON(filteredTransactions)
    }
  }

  const handleCopyClipboard = async () => {
    if (filteredTransactions.length > 0) {
      await copyToClipboard(filteredTransactions)
    }
  }

  // Check if any filters are active
  const hasActiveFilters =
    filter.type !== 'all' ||
    filter.opType !== 'all' ||
    filter.dateRange !== 'all' ||
    (filter.tokens?.length ?? 0) > 0 ||
    filter.agent !== 'all'

  // Loading state
  if (isLoading) {
    return (
      <SkeletonCard className={className}>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-elevated-2">
                <div className="w-5 h-5 rounded bg-elevated animate-pulse" />
              </div>
              <SkeletonText
                width="w-40"
                height="h-6"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <TransactionRowSkeleton key={i} />
          ))}
        </CardContent>
      </SkeletonCard>
    )
  }

  // Error state
  if (isError) {
    return (
      <Card className={className}>
        <CardContent className="py-12">
          <FadeInUp className="flex flex-col items-center justify-center text-center">
            <div className="p-4 rounded-full bg-error/10 mb-4">
              <History className="w-8 h-8 text-error" />
            </div>
            <h3 className="text-lg font-medium text-primary mb-2">Failed to load history</h3>
            <p className="text-sm text-secondary mb-4">
              There was an error loading your transaction history.
            </p>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-primary-inverse rounded-lg hover:bg-accent-hover transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>
          </FadeInUp>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-info/10 text-info">
              <History className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2">
              <CardTitle>Transaction History</CardTitle>
              <Badge
                variant="default"
                className="text-xs"
              >
                {filteredTransactions.length}
                {transactions && filteredTransactions.length !== transactions.length && (
                  <span className="text-tertiary"> / {transactions.length}</span>
                )}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Tooltip content={isFetching ? 'Refreshing...' : 'Refresh'}>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  isFetching
                    ? 'text-tertiary cursor-not-allowed'
                    : 'text-secondary hover:text-primary hover:bg-elevated-2'
                )}
              >
                <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
              </button>
            </Tooltip>

            <ExportMenu
              onExportCSV={handleExportCSV}
              onExportJSON={handleExportJSON}
              onCopyClipboard={handleCopyClipboard}
              disabled={filteredTransactions.length === 0}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filters */}
        <TransactionFilters
          filter={filter}
          onFilterChange={setFilter}
          availableTokens={availableTokens}
          availableAgents={availableAgents}
        />

        {/* Transaction list */}
        {filteredTransactions.length === 0 ? (
          <EmptyState hasFilters={hasActiveFilters} />
        ) : (
          <div className="overflow-y-auto max-h-[560px] pr-1 mr-1 scrollbar-thin">
            <StaggerList className="space-y-2">
              {filteredTransactions.map((tx, index) => (
                <StaggerItem key={tx.id}>
                  <TransactionRow
                    transaction={tx}
                    index={index}
                    showAgent={isMultiAccount}
                  />
                </StaggerItem>
              ))}
            </StaggerList>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
