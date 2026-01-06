import { useAccount } from 'wagmi'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useSubAccountLimits } from '@/hooks/useSafe'
import { ALL_ROLES, ROLE_NAMES } from '@/lib/contracts'
import { IS_CLAIM_ONLY_MODE } from '@/lib/config'
import { useHasRole } from '@/hooks/useSafe'

export function SubAccountDashboard() {
  const { address } = useAccount()

  const { data: limits } = useSubAccountLimits(address)

  const { data: hasExecuteRole } = useHasRole(address, ALL_ROLES.DEFI_EXECUTE_ROLE)
  const { data: hasTransferRole } = useHasRole(address, ALL_ROLES.DEFI_TRANSFER_ROLE)
  // In claim-only mode, hasClaimRole is same as hasExecuteRole (same ID)
  const hasClaimRole = hasExecuteRole

  if (!address) {
    return (
      <Card variant="glass">
        <CardHeader>
          <CardTitle>My Sub-Account</CardTitle>
          <CardDescription>Connect your wallet to view your sub-account details</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const hasAnyRole = IS_CLAIM_ONLY_MODE ? hasClaimRole : hasExecuteRole || hasTransferRole

  if (!hasAnyRole) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Sub-Account</CardTitle>
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

  // In claim-only mode, we don't need limits
  if (!IS_CLAIM_ONLY_MODE && !limits) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Sub-Account</CardTitle>
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

  const [maxSpendingBps, windowDuration] = limits || [0n, 0n]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>My Sub-Account</CardTitle>
          <CardDescription>Your roles and limits</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {/* Roles */}
            <div className="bg-gradient-to-r from-info-muted to-success-muted p-4 border border-info/20 rounded-xl">
              <p className="mb-3 font-medium text-primary text-small">Active Roles</p>
              <div className="flex gap-2">
                {IS_CLAIM_ONLY_MODE ? (
                  hasClaimRole && (
                    <Badge variant="info">{ROLE_NAMES[ALL_ROLES.CLAIM_ROLE]}</Badge>
                  )
                ) : (
                  <>
                    {hasExecuteRole && (
                      <Badge variant="info">{ROLE_NAMES[ALL_ROLES.DEFI_EXECUTE_ROLE]}</Badge>
                    )}
                    {hasTransferRole && (
                      <Badge variant="success">{ROLE_NAMES[ALL_ROLES.DEFI_TRANSFER_ROLE]}</Badge>
                    )}
                  </>
                )}
              </div>
              {!IS_CLAIM_ONLY_MODE && (
                <p className="mt-3 text-caption text-tertiary">
                  Window Duration: {(Number(windowDuration) / 3600).toFixed(0)} hours
                </p>
              )}
            </div>

            {/* Spending Limit - only in full mode */}
            {!IS_CLAIM_ONLY_MODE && (
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
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
