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
import { useIsSafeOwner, useManagedAccounts } from '@/hooks/useSafe'

export function DashboardPage() {
  const { isConfigured } = useContractAddresses()
  const { viewMode } = useViewMode()
  const { isConnected, address } = useAccount()
  const { isSafeOwner } = useIsSafeOwner()
  const { data: managedAccounts } = useManagedAccounts()

  const managedSubAccounts = managedAccounts?.map(account => account.address as `0x${string}`) ?? []
  const shouldShowVaultHistory = isSafeOwner && managedSubAccounts.length > 0

  if (!isConfigured) {
    return (
      <FadeInUp className="space-y-6">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold text-primary">Dashboard</h1>
          <p className="text-secondary mt-1">
            Enter your Safe address to load the associated Guardian and access controls.
          </p>
        </div>
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
          <TransactionHistory key="multi" subAccounts={managedSubAccounts} />
        ) : (
          <TransactionHistory key="single" subAccount={address as `0x${string}` | undefined} />
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
