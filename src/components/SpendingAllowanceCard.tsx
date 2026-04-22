import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TooltipIcon } from '@/components/ui/tooltip'
import { Skeleton, SkeletonBadge } from '@/components/ui/skeleton'
import {
  useSpendingAllowance,
  useSubAccountLimits,
  useSafeValue,
  useIsValueStale,
  useIsOracleless,
  useCumulativeSpent,
  useWindowStart,
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
  const { data: isOracleless } = useIsOracleless()
  const { data: cumulativeSpent, isLoading: spentLoading } = useCumulativeSpent(address)
  const { data: windowStart, isLoading: windowLoading } = useWindowStart(address)

  if (
    allowanceLoading ||
    limitsLoading ||
    (valueLoading && !isOracleless) ||
    spentLoading ||
    windowLoading
  ) {
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

  if (!limits || (!isOracleless && (!allowance || !safeValue))) {
    return null
  }

  // Calculate max allowance based on mode
  // Oracle mode: BPS or USD limit, tracked via spendingAllowance
  // Oracleless mode: USD-only limit; remaining = maxSpendingUSD - cumulativeSpent
  const [maxSpendingBps, maxSpendingUSD, windowDuration] = limits
  let maxAllowance: bigint
  let remainingAllowance: bigint
  const nowSec = BigInt(Math.floor(Date.now() / 1000))
  const ws = windowStart ?? 0n
  const isWindowExpired = ws !== 0n && nowSec > ws + windowDuration
  const effectiveSpent = isWindowExpired ? 0n : (cumulativeSpent ?? 0n)

  if (isOracleless) {
    maxAllowance = maxSpendingUSD
    remainingAllowance = maxSpendingUSD > effectiveSpent ? maxSpendingUSD - effectiveSpent : 0n
  } else {
    const [totalValueUSD] = safeValue!
    maxAllowance =
      maxSpendingUSD > 0n ? maxSpendingUSD : (totalValueUSD * BigInt(maxSpendingBps)) / 10000n
    const remainingBySpent = maxAllowance > effectiveSpent ? maxAllowance - effectiveSpent : 0n
    remainingAllowance = allowance! < remainingBySpent ? allowance! : remainingBySpent
  }
  const isOracleAllowanceLagging =
    !isOracleless &&
    allowance !== undefined &&
    maxAllowance > effectiveSpent &&
    allowance < (maxAllowance > effectiveSpent ? maxAllowance - effectiveSpent : 0n)
  const isPriorSessionConstraint =
    !isWindowExpired &&
    effectiveSpent > 0n &&
    allowance !== undefined &&
    remainingAllowance < allowance

  // Derive displayed spent from the final remaining so it's accurate in both oracle and oracleless modes.
  // In oracle mode, cumulativeSpent may lag or stay at 0 while getSpendingAllowance is the real source of truth.
  const displayedSpent = maxAllowance > remainingAllowance ? maxAllowance - remainingAllowance : 0n

  // Calculate percent used
  const percentUsed =
    maxAllowance > 0n
      ? Number(((displayedSpent > maxAllowance ? maxAllowance : displayedSpent) * 10000n) / maxAllowance) / 100
      : 0

  // Determine color coding
  const percentRemaining = 100 - percentUsed
  let statusVariant: 'default' | 'secondary' | 'destructive' = 'default'

  if (percentRemaining < 25) {
    statusVariant = 'destructive'
  } else if (percentRemaining < 50) {
    statusVariant = 'secondary'
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2 text-base">
            Spending Allowance
            <TooltipIcon
              content={
                isOracleless
                  ? 'In oracleless mode, the spending budget is the fixed USD limit per window. There is no oracle tracking — only on-chain cumulative enforcement.'
                  : "The oracle tracks your spending across all operations. Remaining allowance is calculated based on your spending limit and the Safe's portfolio value."
              }
            />
          </CardTitle>
          {isOracleless ? (
            <Badge
              variant="outline"
              className="text-accent-primary text-xs"
            >
              Oracleless
            </Badge>
          ) : isStale ? (
            <Badge
              variant="outline"
              className="text-yellow-600 dark:text-yellow-400 text-xs"
            >
              Stale Data
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <p className="font-bold text-2xl">${formatUSD(remainingAllowance)}</p>
            <p className="text-muted-foreground text-xs">
              {isOracleless ? 'Remaining this window' : 'Remaining allowance'}
            </p>
          </div>
          <Badge variant={statusVariant}>{percentRemaining.toFixed(1)}% left</Badge>
        </div>

        <div className="space-y-2">
          <Progress
            value={percentUsed}
            className="h-2"
          />
          <div className="flex justify-between text-muted-foreground text-xs">
            <span className="flex items-center gap-1">
              Used: ${formatUSD(displayedSpent)}
              {isPriorSessionConstraint && (
                <TooltipIcon content="This address already spent during the current window. If the agent was deleted and re-added, that earlier spend is still counted until the window expires." />
              )}
              {!isPriorSessionConstraint && isOracleAllowanceLagging && (
                <TooltipIcon content="Your spending limit was increased, but the oracle-managed remaining allowance has not fully refreshed yet. The used amount is based on actual spent value, not the stale allowance snapshot." />
              )}
            </span>
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
