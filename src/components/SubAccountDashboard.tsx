import { useAccount } from 'wagmi'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useSubAccountLimits } from '@/hooks/useSafe'
import { ROLES, ROLE_NAMES } from '@/lib/contracts'
import { useHasRole } from '@/hooks/useSafe'

export function SubAccountDashboard() {
  const { address } = useAccount()

  const { data: limits } = useSubAccountLimits(address)

  const { data: hasExecuteRole } = useHasRole(address, ROLES.DEFI_EXECUTE_ROLE)
  const { data: hasTransferRole } = useHasRole(address, ROLES.DEFI_TRANSFER_ROLE)

  if (!address) {
    return (
      <Card variant="glass">
        <CardHeader>
          <CardTitle>My Agent</CardTitle>
          <CardDescription>Connect your wallet to view your agent details</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!hasExecuteRole && !hasTransferRole) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Agent</CardTitle>
          <CardDescription>No roles assigned</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-warning-muted p-4 border border-warning/20 rounded-xl">
            <p className="text-secondary text-small">
              This address does not have any roles assigned. Contact the Safe owner to request
              access.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!limits) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Agent</CardTitle>
          <CardDescription>Loading limits...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center">
            <div className="mx-auto border-2 border-accent-primary border-t-transparent rounded-full w-8 h-8 animate-spin" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const [maxSpendingBps, , rawWindowDuration] = limits
  const windowDuration = rawWindowDuration > 0n ? rawWindowDuration : 86400n

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>My Agent</CardTitle>
          <CardDescription>Your roles and limits</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {/* Roles */}
            <div className="bg-gradient-to-r from-info-muted to-success-muted p-4 border border-info/20 rounded-xl">
              <p className="mb-3 font-medium text-primary text-small">Active Roles</p>
              <div className="flex gap-2">
                {hasExecuteRole && (
                  <Badge variant="info">{ROLE_NAMES[ROLES.DEFI_EXECUTE_ROLE]}</Badge>
                )}
                {hasTransferRole && (
                  <Badge variant="success">{ROLE_NAMES[ROLES.DEFI_TRANSFER_ROLE]}</Badge>
                )}
              </div>
              <p className="mt-3 text-caption text-tertiary">
                Window Duration: {(Number(windowDuration) / 3600).toFixed(0)} hours
              </p>
            </div>

            {/* Spending Limit */}
            <div className="p-4 border rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <p className="font-medium text-sm">Spending Limit</p>
                <Badge variant="secondary">
                  {(Number(maxSpendingBps) / 100).toFixed(2)}% of portfolio
                </Badge>
              </div>
              <p className="text-muted-foreground text-xs">
                Maximum spending within {(Number(windowDuration) / 3600).toFixed(0)}h window. Oracle
                tracks usage across all operations.
              </p>
              <div className="bg-blue-50 dark:bg-blue-950/30 mt-3 p-2 border border-blue-200 dark:border-blue-900 rounded">
                <p className="text-blue-700 dark:text-blue-300 text-xs">
                  ✨ Acquired tokens (from swaps/deposits) are FREE for 24h
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
