import { useAccount } from 'wagmi'
import { Navigate } from 'react-router-dom'
import { SubAccountManager } from '@/components/SubAccountManager'
import { StatsBar } from '@/components/StatsBar'
import { useContractAddresses } from '@/contexts/ContractAddressContext'
import { useUserRoles } from '@/hooks/useUserRoles'
import { ROUTES } from '@/router/routes'
import { FadeInUp } from '@/components/ui/motion'

export function AccountsPage() {
  const { isConfigured } = useContractAddresses()
  const { isConnected } = useAccount()
  const { isSafeOwner } = useUserRoles()

  // Redirect to home if not configured
  if (!isConfigured) {
    return <Navigate to={ROUTES.HOME} replace />
  }

  // Redirect to dashboard if not connected or not owner
  if (!isConnected || !isSafeOwner) {
    return <Navigate to={ROUTES.DASHBOARD} replace />
  }

  return (
    <FadeInUp className="space-y-6">
      <StatsBar />
      <SubAccountManager />
    </FadeInUp>
  )
}
