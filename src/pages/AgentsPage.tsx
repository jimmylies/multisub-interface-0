import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/router/routes'
import { useContractAddresses } from '@/contexts/ContractAddressContext'
import { useManagedAccounts, useSafeValue } from '@/hooks/useSafe'

/**
 * AgentsPage — Dashboard view of all agents (sub-accounts) for a vault.
 * Shows budget progress bars, status, last transaction.
 */
export function AgentsPage() {
  const navigate = useNavigate()
  const { isConnected } = useAccount()
  const { addresses } = useContractAddresses()
  const { data: managedAccounts, isLoading } = useManagedAccounts()
  const { data: safeValue } = useSafeValue()

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20">
        <h1 className="text-2xl font-semibold text-primary">Agent Dashboard</h1>
        <p className="text-secondary text-center max-w-md">
          Connect your wallet and set a module address to view your agents.
        </p>
        <ConnectButton />
      </div>
    )
  }

  if (!addresses.defiInteractor) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20">
        <h1 className="text-2xl font-semibold text-primary">Agent Dashboard</h1>
        <p className="text-secondary text-center max-w-md">
          No module address configured. Deploy a vault first or enter a module address.
        </p>
        <div className="flex gap-3">
          <Button
            onClick={() => navigate(ROUTES.WIZARD)}
            className="bg-accent-primary text-black"
          >
            Deploy New Vault
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(ROUTES.HOME)}
          >
            Enter Module Address
          </Button>
        </div>
      </div>
    )
  }

  const safeValueUSD = safeValue ? Number(safeValue.totalValueUSD) / 1e18 : 0

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Agent Dashboard</h1>
          <p className="text-secondary mt-1">
            {managedAccounts?.length ?? 0} active agents | Safe value: $
            {safeValueUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <Button
          onClick={() => navigate(ROUTES.WIZARD)}
          className="bg-accent-primary text-black"
        >
          + Deploy Agent
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="h-24 rounded-xl bg-elevated-1 animate-pulse"
            />
          ))}
        </div>
      ) : !managedAccounts?.length ? (
        <div className="text-center py-16 bg-elevated-1 rounded-xl border border-subtle">
          <p className="text-secondary text-lg">No agents configured yet</p>
          <p className="text-tertiary mt-2">Deploy a vault to get started</p>
          <Button
            onClick={() => navigate(ROUTES.WIZARD)}
            className="mt-6 bg-accent-primary text-black"
          >
            Deploy Your First Vault
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {managedAccounts.map(account => (
            <AgentCard
              key={account.address}
              address={account.address}
              roles={account.roles}
              spendingAllowance={account.spendingAllowance}
              maxSpendingBps={account.limits?.maxSpendingBps}
              safeValueUSD={safeValueUSD}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface AgentCardProps {
  address: string
  roles: string[]
  spendingAllowance?: bigint | number
  maxSpendingBps?: number
  safeValueUSD: number
}

function AgentCard({
  address,
  roles,
  spendingAllowance,
  maxSpendingBps,
  safeValueUSD,
}: AgentCardProps) {
  const allowance =
    typeof spendingAllowance === 'bigint'
      ? Number(spendingAllowance) / 1e18
      : (spendingAllowance ?? 0)
  const bps = maxSpendingBps ?? 500
  const maxAllowance = (safeValueUSD * bps) / 10000
  const usedPct =
    maxAllowance > 0 ? Math.min(100, ((maxAllowance - allowance) / maxAllowance) * 100) : 0
  const isActive = roles.length > 0

  return (
    <div className="bg-elevated-1 rounded-xl border border-subtle p-5 hover:border-accent-primary/20 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="font-mono text-sm text-primary">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
          <div className="flex gap-1.5">
            {roles.map(role => (
              <span
                key={role}
                className="text-xs px-2 py-0.5 rounded-full bg-accent-primary/10 text-accent-primary"
              >
                {role}
              </span>
            ))}
          </div>
        </div>
        <span className={`text-xs font-medium ${isActive ? 'text-green-400' : 'text-red-400'}`}>
          {isActive ? 'Active' : 'Revoked'}
        </span>
      </div>

      {/* Budget bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-tertiary">Budget used</span>
          <span className="text-secondary">
            ${allowance.toLocaleString(undefined, { maximumFractionDigits: 0 })} / $
            {maxAllowance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className="h-2 rounded-full bg-elevated-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              usedPct > 80 ? 'bg-red-400' : usedPct > 50 ? 'bg-yellow-400' : 'bg-accent-primary'
            }`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-tertiary">
          <span>{bps / 100}% of Safe per 24h</span>
          <span>{usedPct.toFixed(1)}% used</span>
        </div>
      </div>
    </div>
  )
}
