import { useAccount } from 'wagmi'
import { Navigate } from 'react-router-dom'
import { StatsBar } from '@/components/StatsBar'
import { TransactionHistory } from '@/components/TransactionHistory'
import { useContractAddresses } from '@/contexts/ContractAddressContext'
import { ROUTES } from '@/router/routes'
import { FadeInUp } from '@/components/ui/motion'

export function HistoryPage() {
  const { isConfigured } = useContractAddresses()
  const { isConnected, address } = useAccount()

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
      <TransactionHistory subAccount={address} />
    </FadeInUp>
  )
}
