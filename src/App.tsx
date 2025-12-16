import { useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { SubAccountManager } from '@/components/SubAccountManager'
import { EmergencyControls } from '@/components/EmergencyControls'
import { MyPermissionsCard } from '@/components/MyPermissionsCard'
import { ContractSetup } from '@/components/ContractSetup'
import { ThemeToggle } from '@/components/ThemeToggle'
import { WelcomeHero } from '@/components/WelcomeHero'
import { StatsBar } from '@/components/StatsBar'
import { SubAccountDashboard } from '@/components/SubAccountDashboard'
import { SpendingAllowanceCard } from '@/components/SpendingAllowanceCard'
import { AcquiredBalancesCard } from '@/components/AcquiredBalancesCard'
import { DisconnectedDashboard } from '@/components/DisconnectedDashboard'
import { useContractAddresses } from '@/contexts/ContractAddressContext'
import { useViewMode } from '@/contexts/ViewModeContext'
import { useUserRoles } from '@/hooks/useUserRoles'
import { useAccount } from 'wagmi'

function App() {
  const { isConfigured } = useContractAddresses()
  const { viewMode } = useViewMode()
  const { isSafeOwner, isDualRole } = useUserRoles()
  const { isConnected, address } = useAccount()
  const [showWelcome, setShowWelcome] = useState(false)

  return (
    <div className="min-h-screen app-background">
      {/* Header */}
      <header className="top-0 z-50 sticky border-subtle border-b glass">
        <div className="flex justify-between items-center mx-auto px-3 md:px-6 h-14 md:h-16 container">
          {/* Logo */}
          <div
            onClick={() => setShowWelcome(true)}
            className="flex items-center gap-2 md:gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          >
            <img
              src="/logo.png"
              alt="MultiSub"
              className="w-8 h-8 md:w-9 md:h-9 object-contain"
            />
            <div>
              <h1 className="font-semibold text-primary text-base md:text-lg leading-tight">MultiSub</h1>
              <p className="-mt-0.5 text-caption text-tertiary hidden md:block">
                {!isConnected
                  ? 'DeFi, Delegated.'
                  : isDualRole
                    ? 'Owner + Sub-Account'
                    : isSafeOwner
                      ? 'Safe Owner'
                      : 'DeFi Delegated'}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 md:gap-3">
            <ThemeToggle />
            {isConnected ? (
              <ConnectButton
                accountStatus="address"
                chainStatus="icon"
                showBalance={false}
              />
            ) : (
              <ConnectButton.Custom>
                {({ openConnectModal, mounted }) => {
                  const ready = mounted
                  if (!ready) return null

                  return (
                    <button
                      onClick={openConnectModal}
                      className="group inline-flex relative justify-center items-center bg-gradient-to-r shadow-glow hover:shadow-xl px-3 md:px-6 rounded-md h-9 md:h-10 overflow-hidden font-semibold text-black text-sm md:text-base hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 from-accent-primary to-accent-secondary"
                    >
                      <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform -translate-x-full group-hover:translate-x-full duration-700" />
                      <span className="z-10 relative">Connect</span>
                    </button>
                  )
                }}
              </ConnectButton.Custom>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto px-6 py-8 min-h-[calc(100dvh-130px)] container">
        {!isConfigured || showWelcome ? (
          /* Welcome Screen with DeFi Interactor Input */
          <WelcomeHero onNavigateAway={() => setShowWelcome(false)} />
        ) : !isConnected ? (
          /* Disconnected State */
          <DisconnectedDashboard />
        ) : viewMode === 'owner' ? (
          /* Safe Owner View - Content First Layout */
          <div className="animate-fade-in space-y-6">
            {/* Stats Bar */}
            <StatsBar />

            {/* PRIMARY: SubAccountManager en premier */}
            <SubAccountManager />

            {/* SECONDARY: Emergency + Config en bas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <EmergencyControls />
              </div>
              <ContractSetup />
            </div>
          </div>
        ) : (
          /* Sub-Account View - Cards Masonry Layout */
          <div className="animate-fade-in space-y-6">
            {/* Stats Bar */}
            <StatsBar />

            {/* ROW 1: 3 colonnes - Permissions | Spending | Config */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <MyPermissionsCard />
              <SpendingAllowanceCard address={address} />
              <ContractSetup />
            </div>

            {/* ROW 2: 2 colonnes - Dashboard | Balances */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SubAccountDashboard />
              <AcquiredBalancesCard address={address} />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-subtle border-t">
        <div className="mx-auto px-6 py-6 text-center container">
          <p className="text-caption text-tertiary">Secured by Safe • Built for DeFi</p>
        </div>
      </footer>
    </div>
  )
}

export default App
