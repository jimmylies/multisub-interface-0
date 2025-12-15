import { useState } from 'react'
import { useAccount } from 'wagmi'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { ROLES, ROLE_NAMES, ROLE_DESCRIPTIONS } from '@/lib/contracts'
import { PROTOCOLS, type Protocol } from '@/lib/protocols'
import { useHasRole, useIsAddressAllowed, useAllowedAddresses } from '@/hooks/useSafe'

// Get all contract addresses from all protocols
const ALL_PROTOCOL_ADDRESSES = PROTOCOLS.flatMap(p => p.contracts.map(c => c.address))

export function MyPermissionsCard() {
  const { address, isConnected } = useAccount()
  const [showProtocols, setShowProtocols] = useState(false)

  const { data: hasExecuteRole } = useHasRole(address, ROLES.DEFI_EXECUTE_ROLE)
  const { data: hasTransferRole } = useHasRole(address, ROLES.DEFI_TRANSFER_ROLE)
  const { data: allowedAddresses } = useAllowedAddresses(address, ALL_PROTOCOL_ADDRESSES)

  const hasAnyAllowedProtocol = allowedAddresses && allowedAddresses.size > 0

  if (!isConnected) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>My Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-small text-tertiary">Connect wallet to view permissions</p>
        </CardContent>
      </Card>
    )
  }

  const hasAnyRole = hasExecuteRole || hasTransferRole

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle>My Permissions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Active Roles */}
        <div>
          <p className="mb-2 text-caption text-tertiary uppercase tracking-wider">Active Roles</p>
          <div className="flex flex-wrap gap-2">
            {hasExecuteRole && <Badge variant="info">{ROLE_NAMES[ROLES.DEFI_EXECUTE_ROLE]}</Badge>}
            {hasTransferRole && (
              <Badge variant="success">{ROLE_NAMES[ROLES.DEFI_TRANSFER_ROLE]}</Badge>
            )}
            {!hasAnyRole && <Badge variant="outline">No Roles</Badge>}
          </div>
        </div>

        {/* Capabilities */}
        {hasAnyRole && (
          <div className="space-y-3">
            <p className="text-caption text-tertiary uppercase tracking-wider">Capabilities</p>

            {hasExecuteRole && (
              <div className="flex items-center gap-2 text-small">
                <span className="text-info">⚡</span>
                <span className="text-primary">{ROLE_DESCRIPTIONS[ROLES.DEFI_EXECUTE_ROLE]}</span>
              </div>
            )}

            {hasTransferRole && (
              <div className="flex items-center gap-2 text-small">
                <span className="text-success">💸</span>
                <span className="text-primary">{ROLE_DESCRIPTIONS[ROLES.DEFI_TRANSFER_ROLE]}</span>
              </div>
            )}

            {hasAnyAllowedProtocol ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowProtocols(!showProtocols)}
                  className="gap-1 w-full"
                >
                  {showProtocols ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                  {showProtocols ? 'Hide' : 'Show'} Allowed Protocols
                </Button>

                {showProtocols && address && (
                  <div className="space-y-2 max-h-48">
                    {PROTOCOLS.map((protocol, index) => (
                      <ProtocolAccessCompact
                        key={protocol.id}
                        protocol={protocol}
                        subAccount={address}
                        index={index}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-small text-tertiary">No Protocol Permissions set</p>
            )}
          </div>
        )}

        {/* No Permissions Message */}
        {!hasAnyRole && (
          <div className="bg-elevated-2 p-3 border border-subtle rounded-lg">
            <p className="text-caption text-tertiary">
              No permissions yet. A Safe owner needs to grant you roles.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface ProtocolAccessCompactProps {
  protocol: Protocol
  subAccount: `0x${string}`
  index: number
}

function ProtocolAccessCompact({ protocol, subAccount, index }: ProtocolAccessCompactProps) {
  const contractChecks = protocol.contracts.map(contract => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { data: isAllowed } = useIsAddressAllowed(subAccount, contract.address)
    return { contract, isAllowed }
  })

  const allowedContracts = contractChecks.filter(c => c.isAllowed).length
  const hasAccess = allowedContracts > 0

  if (!hasAccess) return null

  return (
    <div
      className="flex justify-between items-center bg-elevated p-2 rounded-lg animate-fade-in-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <Tooltip
        content={
          '- ' +
          contractChecks
            .filter(c => c.isAllowed)
            .map(c => c.contract.name)
            .join('\n- ')
        }
        className="text-left whitespace-pre-line"
        align="left"
      >
        <Badge
          variant="info"
          className="text-xs cursor-help"
        >
          {protocol.name}
        </Badge>
      </Tooltip>
      {allowedContracts > 0 && (
        <span className="text-caption text-tertiary">
          {allowedContracts} contract{allowedContracts !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}
