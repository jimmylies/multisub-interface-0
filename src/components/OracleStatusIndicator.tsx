import { Badge } from '@/components/ui/badge'
import { TooltipIcon } from '@/components/ui/tooltip'
import { useSafeValue, useIsValueStale, useIsOracleless } from '@/hooks/useSafe'
import { formatUSD, formatTimeAgo } from '@/lib/utils'

export function OracleStatusIndicator() {
  const { data: safeValue, isLoading } = useSafeValue()
  const { data: isStale } = useIsValueStale(3600) // 1 hour threshold
  const { data: isOracleless } = useIsOracleless()

  // In oracleless mode, there's no oracle to display status for
  if (isOracleless) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <div className="bg-accent-primary rounded-full w-2 h-2" />
        <span className="text-secondary">Oracleless mode</span>
        <TooltipIcon content="This vault has no oracle dependency. Spending is enforced solely by on-chain cumulative limits against a fixed USD cap." />
      </div>
    )
  }

  if (isLoading || !safeValue) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <div className="bg-gray-400 rounded-full w-2 h-2 animate-pulse" />
        <span>Oracle loading...</span>
      </div>
    )
  }

  const [totalValueUSD, lastUpdated, updateCount] = safeValue

  // Calculate time since last update
  const now = Math.floor(Date.now() / 1000)
  const timeSinceUpdate = now - Number(lastUpdated)

  // Determine status color based on time since update
  let statusColor = 'bg-green-500'
  let statusText = 'Active'
  let statusVariant: 'default' | 'secondary' | 'outline' = 'default'

  if (isStale || timeSinceUpdate > 3600) {
    // More than 1 hour or marked as stale
    statusColor = 'bg-yellow-500'
    statusText = 'Stale'
    statusVariant = 'outline'
  } else if (timeSinceUpdate > 900) {
    // More than 15 minutes
    statusColor = 'bg-blue-500'
    statusText = 'Updated'
    statusVariant = 'secondary'
  } else if (timeSinceUpdate > 300) {
    // More than 5 minutes
    statusColor = 'bg-green-400'
    statusText = 'Active'
    statusVariant = 'default'
  }

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-elevated border border-subtle">
      {/* Status indicator */}
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${statusColor} ${timeSinceUpdate < 300 ? 'animate-pulse' : ''}`}
        />
        <span className="font-medium text-sm text-primary">Oracle</span>
        <TooltipIcon content="The Chainlink oracle updates portfolio value and spending allowance data. Fresh data ensures accurate spending limits." />
        <Badge
          variant={statusVariant}
          className="text-xs"
        >
          {statusText}
        </Badge>
        {isStale && (
          <Badge
            variant="outline"
            className="text-warning text-xs"
          >
            ⚠️ Outdated
          </Badge>
        )}
      </div>

      {/* Stats - wrap on small screens */}
      <div className="flex flex-wrap items-center gap-4 ml-auto text-xs">
        <div className="text-right">
          <p className="font-semibold text-primary">${formatUSD(totalValueUSD)}</p>
          <p className="text-tertiary">Portfolio</p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-primary">{formatTimeAgo(lastUpdated)}</p>
          <p className="text-tertiary">Updated</p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-primary">#{Number(updateCount)}</p>
          <p className="text-tertiary">Updates</p>
        </div>
      </div>
    </div>
  )
}
