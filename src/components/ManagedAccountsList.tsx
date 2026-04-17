import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CopyButton } from '@/components/ui/copy-button'
import { useManagedAccounts } from '@/hooks/useSafe'
import { ROLE_NAMES, ROLES } from '@/lib/contracts'

/**
 * Example component demonstrating how to fetch and display managed accounts
 * from the Guardian contract by reading role assignment events
 */
export function ManagedAccountsList() {
  const { data: accounts = [], isLoading, error } = useManagedAccounts()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Managed Accounts</CardTitle>
          <CardDescription>Loading managed accounts from contract...</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Fetching role assignment events...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Managed Accounts</CardTitle>
          <CardDescription>Error loading accounts</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600">Error: {error.message}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Managed Accounts</CardTitle>
        <CardDescription>
          {accounts.length} account{accounts.length !== 1 ? 's' : ''} with active roles
        </CardDescription>
      </CardHeader>
      <CardContent>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No managed accounts found. Grant roles to addresses to see them here.
          </p>
        ) : (
          <div className="space-y-3">
            {accounts.map(account => (
              <div
                key={account.address}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <div className="flex items-center gap-1">
                    <p className="font-mono text-sm font-medium">
                      {account.address.slice(0, 6)}...{account.address.slice(-4)}
                    </p>
                    <CopyButton value={account.address} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Added: {account.addedAt ? new Date(account.addedAt * 1000).toLocaleString() : 'Unknown'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {account.hasExecuteRole && (
                    <Badge variant="secondary" className="text-xs">
                      {ROLE_NAMES[ROLES.DEFI_EXECUTE_ROLE]}
                    </Badge>
                  )}
                  {account.hasTransferRole && (
                    <Badge variant="secondary" className="text-xs">
                      {ROLE_NAMES[ROLES.DEFI_TRANSFER_ROLE]}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
