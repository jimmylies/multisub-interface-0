import { useAccount } from 'wagmi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CopyButton } from '@/components/ui/copy-button'
import { useSafeAddress } from '@/hooks/useSafe'
import { useUserRoles } from '@/hooks/useUserRoles'

export function SafeStatus() {
  const { address, isConnected } = useAccount()
  const { data: safeAddress } = useSafeAddress()
  const { isSafeOwner, isDualRole, isLoading } = useUserRoles()

  if (!isConnected) {
    return null
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <CardTitle className="text-base">Safe Info</CardTitle>
          <Badge variant="success" icon={<StatusDot />}>
            Active
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Safe Address */}
          <div className="bg-elevated-2 p-3 border border-subtle rounded-lg">
            <p className="mb-1 text-caption text-tertiary uppercase tracking-wider">Safe</p>
            <div className="flex items-center gap-1">
              <p className="font-mono text-primary text-small truncate">
                {safeAddress && typeof safeAddress === 'string'
                  ? `${safeAddress.slice(0, 6)}...${safeAddress.slice(-4)}`
                  : 'Loading...'}
              </p>
              {safeAddress && <CopyButton value={safeAddress} />}
            </div>
          </div>

          {/* Your Address */}
          <div className="bg-elevated-2 p-3 border border-subtle rounded-lg">
            <p className="mb-1 text-caption text-tertiary uppercase tracking-wider">You</p>
            <div className="flex items-center gap-1">
              <p className="font-mono text-primary text-small truncate">
                {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected'}
              </p>
              {address && <CopyButton value={address} />}
            </div>
          </div>

          {/* Permission Level */}
          <div className="bg-elevated-2 p-3 border border-subtle rounded-lg">
            <p className="mb-1 text-caption text-tertiary uppercase tracking-wider">Role</p>
            {isLoading ? (
              <Badge variant="outline" className="text-xs">Checking...</Badge>
            ) : isDualRole ? (
              <div className="flex gap-1">
                <Badge variant="info" className="text-xs">Owner</Badge>
                <Badge variant="outline" className="text-xs">Sub</Badge>
              </div>
            ) : isSafeOwner ? (
              <Badge variant="info" className="text-xs">Safe Signer</Badge>
            ) : (
              <Badge variant="outline" className="text-xs">Sub-Account</Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function StatusDot() {
  return <span className="bg-success rounded-full w-2 h-2 status-pulse" />
}
