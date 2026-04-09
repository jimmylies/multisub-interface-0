import { useAccount, useChainId } from 'wagmi'
import { useSafeAddress, useManagedAccounts, useSafeValue, useIsValueStale } from '@/hooks/useSafe'
import { Badge } from '@/components/ui/badge'
import { TooltipIcon } from '@/components/ui/tooltip'
import { ViewSwitcher } from '@/components/ViewSwitcher'
import { Skeleton } from '@/components/ui/skeleton'
import { getChainLabel } from '@/lib/chains'
import { formatUSD, formatTimeAgo } from '@/lib/utils'

export function StatsBar() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { data: safeAddress } = useSafeAddress()
  const { data: accounts } = useManagedAccounts()

  if (!isConnected) return null

  const networkName = getChainLabel(chainId)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 animate-fade-in">
      {/* Stats Group - Left */}
      <div className="flex flex-wrap gap-3">
        <StatItem
          label="Safe"
          value={safeAddress ? 'Connected' : 'Not configured'}
          status={safeAddress ? 'success' : 'warning'}
        />
        <ViewSwitcher />
        <StatItem
          label="Sub-Accounts"
          value={(accounts?.length ?? 0).toString()}
          status="default"
        />
        <StatItem
          label="Network"
          value={networkName}
          status="default"
        />
      </div>

      {/* Oracle Status - Right */}
      <OracleStatusCompact />
    </div>
  )
}

function OracleStatusCompact() {
  const { data: safeValue, isLoading } = useSafeValue()
  const { data: isStale } = useIsValueStale(3600)

  if (isLoading || !safeValue) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-elevated border border-subtle">
        <Skeleton className="w-2 h-2 rounded-full" />
        <Skeleton className="h-3 w-12 rounded" />
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-4 w-20 rounded" />
      </div>
    )
  }

  const [totalValueUSD, lastUpdated, updateCount] = safeValue
  const now = Math.floor(Date.now() / 1000)
  const hasOracleUpdate = lastUpdated > 0n
  const timeSinceUpdate = hasOracleUpdate ? now - Number(lastUpdated) : Number.POSITIVE_INFINITY

  let statusColor = 'bg-success'
  let statusText = 'Active'
  const badgeVariant = !hasOracleUpdate || isStale ? 'outline' : 'default'

  if (!hasOracleUpdate) {
    statusColor = 'bg-warning'
    statusText = 'Pending'
  } else if (isStale || timeSinceUpdate > 3600) {
    statusColor = 'bg-warning'
    statusText = 'Stale'
  } else if (timeSinceUpdate > 900) {
    statusColor = 'bg-info'
    statusText = 'Updated'
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-elevated border border-subtle">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${statusColor} ${timeSinceUpdate < 300 ? 'animate-pulse' : ''}`} />
        <span className="text-caption text-tertiary uppercase tracking-wider">Oracle</span>
        <TooltipIcon content="Chainlink oracle for portfolio value" />
      </div>
      <Badge variant={badgeVariant} className="text-xs">
        {statusText}
      </Badge>
      <div className="flex items-center gap-4 text-xs">
        <div className="text-right">
          <span className="font-semibold text-primary">${formatUSD(totalValueUSD)}</span>
        </div>
        <div className="text-right hidden sm:block">
          <span className="text-tertiary">{formatTimeAgo(lastUpdated)}</span>
        </div>
      </div>
    </div>
  )
}

interface StatItemProps {
  label: string
  value: string
  status?: 'success' | 'warning' | 'info' | 'default'
}

function StatItem({ label, value, status = 'default' }: StatItemProps) {
  const statusColors = {
    success: 'bg-success',
    warning: 'bg-warning',
    info: 'bg-info',
    default: 'bg-tertiary',
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-elevated border border-subtle min-w-[140px]">
      <div
        className={`w-2 h-2 rounded-full ${statusColors[status]} ${status === 'success' ? 'status-pulse' : ''}`}
      />
      <div className="flex flex-col">
        <span className="text-caption text-tertiary uppercase tracking-wider">{label}</span>
        <span className="text-small font-medium text-primary">{value}</span>
      </div>
    </div>
  )
}
