import { useState } from 'react'
import { useAccount } from 'wagmi'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { ALL_ROLES, ROLE_NAMES, ROLE_DESCRIPTIONS } from '@/lib/contracts'
import { IS_CLAIM_ONLY_MODE } from '@/lib/config'
import { PROTOCOLS, Protocol } from '@/lib/protocols'
import { SubAccountDashboard } from '@/components/SubAccountDashboard'
import { SpendingAllowanceCard } from '@/components/SpendingAllowanceCard'
import { AcquiredBalancesCard } from '@/components/AcquiredBalancesCard'
import { useHasRole, useIsAddressAllowed } from '@/hooks/useSafe'

export function MyPermissions() {
  const { address, isConnected } = useAccount()
  const [showProtocols, setShowProtocols] = useState(false)

  const { data: hasExecuteRole } = useHasRole(address, ALL_ROLES.DEFI_EXECUTE_ROLE)
  const { data: hasTransferRole } = useHasRole(address, ALL_ROLES.DEFI_TRANSFER_ROLE)
  // In claim-only mode, hasClaimRole is same as hasExecuteRole (same ID)
  const hasClaimRole = hasExecuteRole

  if (!isConnected) {
    return (
      <Card variant="glass">
        <CardHeader>
          <CardTitle>My Permissions</CardTitle>
          <CardDescription>Connect wallet to view your permissions</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const hasAnyRole = IS_CLAIM_ONLY_MODE ? hasClaimRole : hasExecuteRole || hasTransferRole

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>My Permissions</CardTitle>
          <CardDescription>Your current roles and capabilities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {/* Active Roles */}
            <div>
              <p className="mb-3 text-caption text-tertiary uppercase tracking-wider">
                Active Roles
              </p>
              {hasAnyRole ? (
                <div className="flex flex-wrap gap-2">
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
              ) : (
                <Badge variant="outline">No Roles</Badge>
              )}
            </div>

            {hasAnyRole && (
              <div className="space-y-4">
                <p className="text-caption text-tertiary uppercase tracking-wider">Capabilities</p>

                {IS_CLAIM_ONLY_MODE ? (
                  hasClaimRole && (
                    <div className="bg-info-muted p-4 border border-info/20 rounded-xl">
                      <div className="flex items-start gap-3">
                        <div className="flex flex-shrink-0 justify-center items-center bg-info/20 rounded-lg w-8 h-8">
                          <span className="text-info">🎁</span>
                        </div>
                        <div>
                          <p className="font-medium text-primary text-small">
                            {ROLE_NAMES[ALL_ROLES.CLAIM_ROLE]}
                          </p>
                          <p className="mt-1 text-caption text-tertiary">
                            {ROLE_DESCRIPTIONS[ALL_ROLES.CLAIM_ROLE]}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  <>
                    {hasExecuteRole && (
                      <div className="bg-info-muted p-4 border border-info/20 rounded-xl">
                        <div className="flex items-start gap-3">
                          <div className="flex flex-shrink-0 justify-center items-center bg-info/20 rounded-lg w-8 h-8">
                            <span className="text-info">⚡</span>
                          </div>
                          <div>
                            <p className="font-medium text-primary text-small">
                              {ROLE_NAMES[ALL_ROLES.DEFI_EXECUTE_ROLE]}
                            </p>
                            <p className="mt-1 text-caption text-tertiary">
                              {ROLE_DESCRIPTIONS[ALL_ROLES.DEFI_EXECUTE_ROLE]}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {hasTransferRole && (
                      <div className="bg-success-muted p-4 border border-success/20 rounded-xl">
                        <div className="flex items-start gap-3">
                          <div className="flex flex-shrink-0 justify-center items-center bg-success/20 rounded-lg w-8 h-8">
                            <span className="text-success">💸</span>
                          </div>
                          <div>
                            <p className="font-medium text-primary text-small">
                              {ROLE_NAMES[ALL_ROLES.DEFI_TRANSFER_ROLE]}
                            </p>
                            <p className="mt-1 text-caption text-tertiary">
                              {ROLE_DESCRIPTIONS[ALL_ROLES.DEFI_TRANSFER_ROLE]}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowProtocols(!showProtocols)}
                    className="w-full"
                  >
                    {showProtocols ? 'Hide' : 'Show'} Allowed Protocols
                  </Button>

                  {showProtocols && address && (
                    <div className="space-y-3 mt-4">
                      {PROTOCOLS.map((protocol, index) => (
                        <ProtocolAccess
                          key={protocol.id}
                          protocol={protocol}
                          subAccount={address}
                          index={index}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {!hasAnyRole && (
              <div className="bg-elevated-2 p-4 border border-subtle rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="flex flex-shrink-0 justify-center items-center bg-warning-muted rounded-lg w-8 h-8">
                    <span className="text-warning">⚠️</span>
                  </div>
                  <div>
                    <p className="font-medium text-primary text-small">No Permissions</p>
                    <p className="mt-1 text-caption text-tertiary">
                      You don't have any roles yet. A Safe owner needs to grant you permissions
                      before you can execute DeFi operations.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!IS_CLAIM_ONLY_MODE && hasAnyRole && <SubAccountDashboard />}

      {/* Spending cards only in full mode */}
      {!IS_CLAIM_ONLY_MODE && hasExecuteRole && address && (
        <>
          <SpendingAllowanceCard address={address} />
          <AcquiredBalancesCard address={address} />
        </>
      )}
    </div>
  )
}

interface ProtocolAccessProps {
  protocol: Protocol
  subAccount: `0x${string}`
  index: number
}

function ProtocolAccess({ protocol, subAccount, index }: ProtocolAccessProps) {
  const [isExpanded, setIsExpanded] = useState(false)

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
      className="border border-subtle rounded-xl animate-fade-in-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div
        className="flex justify-between items-center bg-elevated hover:bg-elevated-2 p-3 rounded-t-xl transition-colors cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <Tooltip
            content={`Contracts:\n${protocol.contracts.map(c => `• ${c.name} (${c.address.slice(0, 6)}...${c.address.slice(-4)})`).join('\n')}`}
            className="whitespace-pre-line text-left"
          >
            <Badge variant="info" className="cursor-help">{protocol.name}</Badge>
          </Tooltip>
          {allowedContracts > 0 && (
            <span className="text-caption text-tertiary">
              {allowedContracts} contract{allowedContracts !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-tertiary" /> : <ChevronDown className="w-4 h-4 text-tertiary" />}
      </div>

      {isExpanded && (
        <div className="space-y-2 bg-elevated-2 p-3 border-subtle border-t rounded-b-xl">
          {contractChecks.map(({ contract, isAllowed }) =>
            isAllowed ? (
              <div
                key={contract.id}
                className="flex justify-between items-center bg-elevated p-2 rounded-lg"
              >
                <span className="text-primary text-small">{contract.name}</span>
                <span className="font-mono text-caption text-tertiary">
                  {contract.address.slice(0, 6)}...{contract.address.slice(-4)}
                </span>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  )
}
