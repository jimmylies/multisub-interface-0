import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ContractSetup } from '@/components/ContractSetup'

export function DisconnectedDashboard() {
  return (
    <div className="animate-fade-in space-y-6">
      {/* Main Card */}
      <Card className="mx-auto max-w-2xl">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-h2">MultiSub Dashboard</CardTitle>
          <p className="text-secondary">
            Connectez votre wallet pour acceder a vos fonctionnalites
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Features Grid */}
          <div className="gap-4 grid grid-cols-1 md:grid-cols-2">
            {/* Owner Features */}
            <div className="bg-elevated-2 p-4 border border-subtle rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">&#128100;</span>
                <h3 className="font-semibold text-primary">Safe Owner</h3>
              </div>
              <ul className="space-y-2 text-secondary text-small">
                <li className="flex items-center gap-2">
                  <span className="text-accent-primary">&#8226;</span>
                  Gerer les sub-accounts
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-accent-primary">&#8226;</span>
                  Configurer permissions et limites
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-accent-primary">&#8226;</span>
                  Controles d'urgence
                </li>
              </ul>
            </div>

            {/* Sub-Account Features */}
            <div className="bg-elevated-2 p-4 border border-subtle rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">&#128273;</span>
                <h3 className="font-semibold text-primary">Sub-Account</h3>
              </div>
              <ul className="space-y-2 text-secondary text-small">
                <li className="flex items-center gap-2">
                  <span className="text-accent-primary">&#8226;</span>
                  Voir vos permissions
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-accent-primary">&#8226;</span>
                  Consulter vos limites de depense
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-accent-primary">&#8226;</span>
                  Suivre vos balances acquises
                </li>
              </ul>
            </div>
          </div>

          {/* Connect Button */}
          <div className="flex justify-center pt-2">
            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) => {
                const ready = mounted
                if (!ready) return null

                return (
                  <button
                    onClick={openConnectModal}
                    className="group inline-flex relative justify-center items-center bg-gradient-to-r shadow-glow hover:shadow-xl px-8 py-3 rounded-lg overflow-hidden font-semibold text-black text-base hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 from-accent-primary to-accent-secondary"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform -translate-x-full group-hover:translate-x-full duration-700" />
                    <span className="z-10 relative">Connect Wallet</span>
                  </button>
                )
              }}
            </ConnectButton.Custom>
          </div>
        </CardContent>
      </Card>

      {/* Contract Setup */}
      <div className="mx-auto max-w-md">
        <ContractSetup />
      </div>
    </div>
  )
}
