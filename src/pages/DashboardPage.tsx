import { useAccount } from 'wagmi'
import { Navigate } from 'react-router-dom'
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
import { ROUTES } from '@/router/routes'
import { FadeInUp } from '@/components/ui/motion'

export function DashboardPage() {
  const { isConfigured } = useContractAddresses()
  const { viewMode } = useViewMode()
  const { isConnected, address } = useAccount()

  // Redirect to home if not configured
  if (!isConfigured) {
    return (
      <Navigate
        to={ROUTES.HOME}
        replace
      />
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
        <TransactionHistory />
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
