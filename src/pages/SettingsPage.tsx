import { useAccount } from 'wagmi'
import { Navigate } from 'react-router-dom'
import { ContractSetup } from '@/components/ContractSetup'
import { EmergencyControls } from '@/components/EmergencyControls'
import { StatsBar } from '@/components/StatsBar'
import { useContractAddresses } from '@/contexts/ContractAddressContext'
import { useUserRoles } from '@/hooks/useUserRoles'
import { ROUTES } from '@/router/routes'
import { FadeInUp } from '@/components/ui/motion'

export function SettingsPage() {
  const { isConfigured } = useContractAddresses()
  const { isConnected } = useAccount()
  const { isSafeOwner } = useUserRoles()

  // Redirect to home if not configured
  if (!isConfigured) {
    return <Navigate to={ROUTES.HOME} replace />
  }

  // Redirect to dashboard if not connected
  if (!isConnected) {
    return <Navigate to={ROUTES.DASHBOARD} replace />
  }

  return (
    <FadeInUp className="space-y-6">
      <StatsBar />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ContractSetup />
        {isSafeOwner && <EmergencyControls />}
      </div>
    </FadeInUp>
  )
}
