import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { SubAccountManager } from '@/components/SubAccountManager'
import { EmergencyControls } from '@/components/EmergencyControls'
import { MyPermissionsCard } from '@/components/MyPermissionsCard'
import { ContractSetup } from '@/components/ContractSetup'
import { TransactionHistory } from '@/components/TransactionHistory'
import { StatsBar } from '@/components/StatsBar'
import { SubAccountDashboard } from '@/components/SubAccountDashboard'
import { SpendingAllowanceCard } from '@/components/SpendingAllowanceCard'
import { AcquiredBalancesCard } from '@/components/AcquiredBalancesCard'
import { DisconnectedDashboard } from '@/components/DisconnectedDashboard'
import { useContractAddresses } from '@/contexts/ContractAddressContext'
import { useViewMode } from '@/contexts/ViewModeContext'
import { FadeInUp } from '@/components/ui/motion'
import { useModulesForEOA } from '@/hooks/useModulesForEOA'
import { Button } from '@/components/ui/button'
import { useIsSafeOwner, useManagedAccounts } from '@/hooks/useSafe'

export function DashboardPage() {
  const { isConfigured, setDefiInteractor } = useContractAddresses()
  const { viewMode } = useViewMode()
  const { isConnected, address } = useAccount()
  const { data: discoveredModules, isLoading: isDiscovering } = useModulesForEOA()
  const { isSafeOwner } = useIsSafeOwner()
  const { data: managedAccounts } = useManagedAccounts()

  const managedSubAccounts = managedAccounts?.map(account => account.address as `0x${string}`) ?? []
  const shouldShowVaultHistory = isSafeOwner && managedSubAccounts.length > 0

  useEffect(() => {
    if (!isConfigured && discoveredModules?.length === 1) {
      setDefiInteractor(discoveredModules[0].module)
    }
  }, [discoveredModules, isConfigured, setDefiInteractor])

  if (!isConfigured) {
    return (
      <FadeInUp className="space-y-6">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold text-primary">Advanced</h1>
          <p className="text-secondary mt-1">
            Load a deployed module address to access owner and sub-account controls.
          </p>
        </div>
        {isConnected && (
          <div className="max-w-2xl space-y-4">
            {isDiscovering ? (
              <div className="rounded-xl border border-subtle bg-elevated-1 p-4 text-secondary">
                Looking for vaults linked to {address?.slice(0, 6)}...{address?.slice(-4)}...
              </div>
            ) : discoveredModules && discoveredModules.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-secondary">
                  Found {discoveredModules.length} vault{discoveredModules.length > 1 ? 's' : ''}{' '}
                  for this wallet:
                </p>
                {discoveredModules.map(({ module, safe }) => (
                  <div
                    key={module}
                    className="flex items-center justify-between rounded-xl border border-subtle bg-elevated-1 p-4"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm text-primary truncate">{module}</p>
                      <p className="mt-1 text-xs text-tertiary">
                        Safe: {safe.slice(0, 8)}...{safe.slice(-6)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="ml-4 shrink-0 bg-accent-primary text-black"
                      onClick={() => setDefiInteractor(module)}
                    >
                      Open
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
        <div className="max-w-md">
          <ContractSetup />
        </div>
      </FadeInUp>
    )
  }

  // Show disconnected state
  if (!isConnected) {
    return <DisconnectedDashboard />
  }

  // Owner view
  if (viewMode === 'owner') {
    return (
      <FadeInUp className="space-y-6">
        <StatsBar />
        <SubAccountManager />
        <div className="gap-6 grid grid-cols-1 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <EmergencyControls />
          </div>
          <ContractSetup />
        </div>
        {shouldShowVaultHistory ? (
          <TransactionHistory subAccounts={managedSubAccounts} />
        ) : (
          <TransactionHistory subAccount={address as `0x${string}` | undefined} />
        )}
      </FadeInUp>
    )
  }

  // Sub-account view
  return (
    <FadeInUp className="space-y-6">
      <StatsBar />
      <div className="gap-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <MyPermissionsCard />
        <SpendingAllowanceCard address={address!} />
        <ContractSetup />
      </div>
      <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
        <SubAccountDashboard />
        <AcquiredBalancesCard address={address!} />
      </div>
      <TransactionHistory subAccount={address as `0x${string}` | undefined} />
    </FadeInUp>
  )
}
