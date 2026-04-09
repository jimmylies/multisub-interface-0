import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount, usePublicClient } from 'wagmi'
import { isAddress } from 'viem'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ROUTES } from '@/router/routes'
import { useContractAddresses } from '@/contexts/ContractAddressContext'
import { useIsSafeOwner, useManagedAccounts, useSafeValue } from '@/hooks/useSafe'
import { useModulesForEOA } from '@/hooks/useModulesForEOA'
import { DEFI_INTERACTOR_ABI, ROLE_DESCRIPTIONS, ROLE_NAMES, ROLES } from '@/lib/contracts'
import { TransactionHistory } from '@/components/TransactionHistory'
import { useSafeProposal, encodeContractCall } from '@/hooks/useSafeProposal'
import { TRANSACTION_TYPES } from '@/lib/transactionTypes'
import { useToast } from '@/contexts/ToastContext'
import { useTransactionPreviewContext } from '@/contexts/TransactionPreviewContext'
import type { RoleChange, TransactionPreviewData } from '@/types/transactionPreview'
import { mergeRolesWithChanges, useSubAccountFullState } from '@/hooks/useSubAccountFullState'

/**
 * AgentsPage — Dashboard view of all agents (sub-accounts) for a vault.
 * Shows budget progress bars, status, last transaction.
 */
export function AgentsPage() {
  const navigate = useNavigate()
  const { isConnected } = useAccount()
  const { addresses, setDefiInteractor } = useContractAddresses()
  const { data: managedAccounts, isLoading } = useManagedAccounts()
  const { data: safeValue } = useSafeValue()
  const { data: discoveredModules, isLoading: isDiscovering } = useModulesForEOA()
  const publicClient = usePublicClient()
  const [manualAddress, setManualAddress] = useState('')
  const [manualError, setManualError] = useState('')
  const [isLoadingManual, setIsLoadingManual] = useState(false)

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

  const handleManualLoad = async () => {
    if (!isAddress(manualAddress)) {
      setManualError('Invalid address')
      return
    }
    setIsLoadingManual(true)
    setManualError('')
    try {
      await publicClient?.readContract({
        address: manualAddress as `0x${string}`,
        abi: DEFI_INTERACTOR_ABI,
        functionName: 'avatar',
      })
      setDefiInteractor(manualAddress as `0x${string}`)
    } catch {
      setManualError('Not a valid DeFi Interactor module address')
    } finally {
      setIsLoadingManual(false)
    }
  }

  if (!addresses.defiInteractor) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-primary">Agent Dashboard</h1>
          <p className="text-secondary mt-1">No module selected.</p>
        </div>

        {isDiscovering ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div
                key={i}
                className="h-16 rounded-xl bg-elevated-1 animate-pulse"
              />
            ))}
          </div>
        ) : discoveredModules && discoveredModules.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-secondary">
              Found {discoveredModules.length} vault{discoveredModules.length > 1 ? 's' : ''}{' '}
              associated with your address:
            </p>
            {discoveredModules.map(({ module, safe }) => (
              <div
                key={module}
                className="flex items-center justify-between bg-elevated-1 rounded-xl border border-subtle p-4 hover:border-accent-primary/20 transition-colors"
              >
                <div className="space-y-0.5">
                  <div className="text-xs text-tertiary">Module</div>
                  <div className="font-mono text-sm text-primary">{module}</div>
                  <div className="text-xs text-tertiary mt-1">
                    Safe:{' '}
                    <span className="font-mono">
                      {safe.slice(0, 8)}...{safe.slice(-6)}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="bg-accent-primary text-black ml-4 shrink-0"
                  onClick={() => setDefiInteractor(module)}
                >
                  Load
                </Button>
              </div>
            ))}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => navigate(ROUTES.WIZARD)}
                className="bg-accent-primary text-black"
              >
                + Deploy New Vault
              </Button>
            </div>
            <ManualAddressInput
              value={manualAddress}
              onChange={(v: string) => {
                setManualAddress(v)
                setManualError('')
              }}
              onLoad={handleManualLoad}
              isLoading={isLoadingManual}
              error={manualError}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-6 py-8 bg-elevated-1 rounded-xl border border-subtle px-6">
            <p className="text-secondary text-center">
              No vaults found for your address. Deploy one or enter a module address manually.
            </p>
            <div className="flex justify-center">
              <Button
                onClick={() => navigate(ROUTES.WIZARD)}
                className="bg-accent-primary text-black"
              >
                Deploy New Vault
              </Button>
            </div>
            <ManualAddressInput
              value={manualAddress}
              onChange={(v: string) => {
                setManualAddress(v)
                setManualError('')
              }}
              onLoad={handleManualLoad}
              isLoading={isLoadingManual}
              error={manualError}
            />
          </div>
        )}
      </div>
    )
  }

  const safeValueUSD = safeValue ? Number(safeValue[0]) / 1e18 : 0

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
        <>
          <div className="space-y-4">
            {managedAccounts.map(account => {
              return (
                <AgentCard
                  key={account.address}
                  address={account.address}
                  hasExecuteRole={account.hasExecuteRole}
                  hasTransferRole={account.hasTransferRole}
                  safeValueUSD={safeValueUSD}
                />
              )
            })}
          </div>

          {/* Global transaction history across all agents */}
          <div className="mt-10">
            <h2 className="text-lg font-semibold text-primary mb-4">All Vault Activity</h2>
            <TransactionHistory subAccounts={managedAccounts.map(a => a.address)} />
          </div>
        </>
      )}
    </div>
  )
}

interface AgentCardProps {
  address: string
  hasExecuteRole: boolean
  hasTransferRole: boolean
  safeValueUSD: number
}

interface ManualAddressInputProps {
  value: string
  onChange: (v: string) => void
  onLoad: () => void
  isLoading: boolean
  error: string
}

function ManualAddressInput({
  value,
  onChange,
  onLoad,
  isLoading,
  error,
}: ManualAddressInputProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-tertiary text-center">Or enter a module address manually</p>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="0x... module address"
          className="bg-elevated-2 border-subtle font-mono text-sm"
          onKeyDown={e => e.key === 'Enter' && onLoad()}
        />
        <Button
          onClick={onLoad}
          disabled={!value || isLoading}
          className="shrink-0 bg-accent-primary text-black disabled:opacity-50"
        >
          {isLoading ? 'Loading...' : 'Load'}
        </Button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

function AgentCard({ address, hasExecuteRole, hasTransferRole, safeValueUSD }: AgentCardProps) {
  const roles = [
    hasExecuteRole ? 'EXECUTE' : null,
    hasTransferRole ? 'TRANSFER' : null,
  ].filter(Boolean) as string[]
  const isActive = roles.length > 0
  const [showHistory, setShowHistory] = useState(false)
  const { addresses } = useContractAddresses()
  const { isSafeOwner } = useIsSafeOwner()
  const { toast } = useToast()
  const { proposeTransaction, isPending } = useSafeProposal()
  const { showPreview } = useTransactionPreviewContext()
  const { fullState: currentFullState } = useSubAccountFullState(address as `0x${string}`)

  const handleDeleteSubAccount = async () => {
    if (!addresses.defiInteractor) {
      toast.warning('Contract not configured')
      return
    }

    const rolesToRemove: RoleChange[] = []
    const transactions: Array<{ to: `0x${string}`; data: `0x${string}` }> = []

    if (hasExecuteRole) {
      rolesToRemove.push({
        roleId: ROLES.DEFI_EXECUTE_ROLE,
        roleName: ROLE_NAMES[ROLES.DEFI_EXECUTE_ROLE],
        description: ROLE_DESCRIPTIONS[ROLES.DEFI_EXECUTE_ROLE],
        action: 'remove',
      })
      transactions.push({
        to: addresses.defiInteractor,
        data: encodeContractCall(addresses.defiInteractor, DEFI_INTERACTOR_ABI, 'revokeRole', [
          address,
          ROLES.DEFI_EXECUTE_ROLE,
        ]),
      })
    }

    if (hasTransferRole) {
      rolesToRemove.push({
        roleId: ROLES.DEFI_TRANSFER_ROLE,
        roleName: ROLE_NAMES[ROLES.DEFI_TRANSFER_ROLE],
        description: ROLE_DESCRIPTIONS[ROLES.DEFI_TRANSFER_ROLE],
        action: 'remove',
      })
      transactions.push({
        to: addresses.defiInteractor,
        data: encodeContractCall(addresses.defiInteractor, DEFI_INTERACTOR_ABI, 'revokeRole', [
          address,
          ROLES.DEFI_TRANSFER_ROLE,
        ]),
      })
    }

    if (transactions.length === 0) {
      toast.info('This sub-account is already inactive')
      return
    }

    const previewData: TransactionPreviewData = {
      type: 'update-roles',
      subAccountAddress: address as `0x${string}`,
      roles: rolesToRemove,
      fullState: {
        roles: mergeRolesWithChanges(currentFullState.roles, rolesToRemove),
        spendingLimits: currentFullState.spendingLimits,
        protocols: currentFullState.protocols,
      },
    }

    showPreview(previewData, async () => {
      try {
        const result = await proposeTransaction(
          transactions.length === 1 ? transactions[0] : transactions,
          { transactionType: TRANSACTION_TYPES.REVOKE_ROLE }
        )

        if (result.success) {
          toast.success('Sub-account deleted successfully')
        } else if ('cancelled' in result && result.cancelled) {
          return
        } else {
          throw result.error || new Error('Transaction failed')
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to delete sub-account'
        toast.error(`Transaction failed: ${errorMsg}`)
      }
    })
  }

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
        <div className="flex flex-col items-end gap-1">
          <span className={`text-xs font-medium ${isActive ? 'text-green-400' : 'text-red-400'}`}>
            {isActive ? 'Active' : 'Revoked'}
          </span>
          {isSafeOwner && isActive && (
            <button
              onClick={handleDeleteSubAccount}
              disabled={isPending}
              className="text-[11px] text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Deleting...' : 'Delete sub-account'}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-tertiary">
        <span>
          Safe value: ${safeValueUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-1 text-accent-primary hover:underline"
        >
          {showHistory ? 'Hide' : 'View'} history
          {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {showHistory && (
        <div className="mt-4 pt-4 border-t border-subtle">
          <TransactionHistory subAccount={address as `0x${string}`} />
        </div>
      )}
    </div>
  )
}
