import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TooltipIcon } from '@/components/ui/tooltip'
import { Skeleton, SkeletonBadge } from '@/components/ui/skeleton'
import {
  useSpendingAllowance,
  useSubAccountLimits,
  useSafeValue,
  useIsValueStale,
} from '@/hooks/useSafe'
import { formatUSD } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'

interface SpendingAllowanceCardProps {
  address: `0x${string}`
}

export function SpendingAllowanceCard({ address }: SpendingAllowanceCardProps) {
  const { data: allowance, isLoading: allowanceLoading } = useSpendingAllowance(address)
  const { data: limits, isLoading: limitsLoading } = useSubAccountLimits(address)
  const { data: safeValue, isLoading: valueLoading } = useSafeValue()
  const { data: isStale } = useIsValueStale(3600) // 1 hour threshold

  if (allowanceLoading || limitsLoading || valueLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2 text-base">
              Spending Allowance
              <TooltipIcon content="Loading..." />
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <Skeleton className="rounded w-32 h-8" />
              <Skeleton className="rounded w-24 h-3" />
            </div>
            <SkeletonBadge />
          </div>
          <div className="space-y-2">
            <Skeleton className="rounded-full w-full h-2" />
            <div className="flex justify-between">
              <Skeleton className="rounded w-20 h-3" />
              <Skeleton className="rounded w-20 h-3" />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!allowance || !limits || !safeValue) {
    return null
  }

  // Calculate max allowance from limit percentage
  const [maxSpendingBps] = limits
  const [totalValueUSD] = safeValue
  const maxAllowance = (totalValueUSD * BigInt(maxSpendingBps)) / 10000n

  // Calculate percent used
  const percentUsed =
    maxAllowance > 0n ? Number(((maxAllowance - allowance) * 10000n) / maxAllowance) / 100 : 0

  // Determine color coding
  const percentRemaining = 100 - percentUsed
  let statusColor: 'green' | 'yellow' | 'red' = 'green'
  let statusVariant: 'default' | 'secondary' | 'destructive' = 'default'

  if (percentRemaining < 25) {
    statusColor = 'red'
    statusVariant = 'destructive'
  } else if (percentRemaining < 50) {
    statusColor = 'yellow'
    statusVariant = 'secondary'
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2 text-base">
            Spending Allowance
            <TooltipIcon content="The oracle tracks your spending across all operations. Remaining allowance is calculated based on your spending limit and the Safe's portfolio value." />
          </CardTitle>
          {isStale && (
            <Badge
              variant="outline"
              className="text-yellow-600 dark:text-yellow-400 text-xs"
            >
              Stale Data
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <p className="font-bold text-2xl">${formatUSD(allowance)}</p>
            <p className="text-muted-foreground text-xs">Remaining allowance</p>
          </div>
          <Badge variant={statusVariant}>{percentRemaining.toFixed(1)}% left</Badge>
        </div>

        <div className="space-y-2">
          <Progress
            value={percentUsed}
            className="h-2"
          />
          <div className="flex justify-between text-muted-foreground text-xs">
            <span>Used: ${formatUSD(maxAllowance - allowance)}</span>
            <span>Max: ${formatUSD(maxAllowance)}</span>
          </div>
        </div>

        {percentRemaining < 25 && (
          <div className="bg-red-50 dark:bg-red-950/30 p-2 border border-red-200 dark:border-red-900 rounded">
            <p className="text-red-700 dark:text-red-300 text-xs">
              ⚠️ Low allowance remaining. Further operations may be blocked.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
