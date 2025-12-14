import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { CopyButton } from '@/components/ui/copy-button'
import { DEFI_INTERACTOR_ABI, ROLES, ROLE_NAMES, ROLE_DESCRIPTIONS } from '@/lib/contracts'
import { ProtocolPermissions } from '@/components/ProtocolPermissions'
import { SpendingLimits } from '@/components/SpendingLimits'
import { useContractAddresses } from '@/contexts/ContractAddressContext'
import {
  useIsSafeOwner,
  useHasRole,
  useManagedAccounts,
  useSpendingAllowance,
  useSafeValue,
  useSubAccountLimits,
} from '@/hooks/useSafe'
import { formatUSD } from '@/lib/utils'
import { useSafeProposal, encodeContractCall } from '@/hooks/useSafeProposal'
import { TRANSACTION_TYPES } from '@/lib/transactionTypes'
import { isAddress } from 'viem'
import { useToast } from '@/contexts/ToastContext'

export function SubAccountManager() {
  const { addresses } = useContractAddresses()
  const { isSafeOwner } = useIsSafeOwner()
  const [newSubAccount, setNewSubAccount] = useState('')
  const [grantExecute, setGrantExecute] = useState(false)
  const [grantTransfer, setGrantTransfer] = useState(false)
  const { toast } = useToast()

  // Fetch managed accounts from contract
  const { data: managedAccounts = [], isLoading: isLoadingAccounts } = useManagedAccounts()

  // Use Safe proposal hook
  const { proposeTransaction, isPending } = useSafeProposal()

  const handleAddSubAccount = async () => {
    if (!isAddress(newSubAccount)) {
      toast.warning('Invalid Ethereum address')
      return
    }

    if (!grantExecute && !grantTransfer) {
      toast.warning('Select at least one role')
      return
    }

    if (!addresses.defiInteractor) {
      toast.warning('Contract not configured')
      return
    }

    try {
      // Check if the subaccount already exists and filter roles already granted
      const existingAccount = managedAccounts.find(
        acc => acc.address.toLowerCase() === newSubAccount.toLowerCase()
      )

      const rolesToGrant: number[] = []
      if (grantExecute && !existingAccount?.hasExecuteRole) {
        rolesToGrant.push(ROLES.DEFI_EXECUTE_ROLE)
      }
      if (grantTransfer && !existingAccount?.hasTransferRole) {
        rolesToGrant.push(ROLES.DEFI_TRANSFER_ROLE)
      }

      if (rolesToGrant.length === 0) {
        toast.info('This address already has the selected roles')
        return
      }

      const transactions = rolesToGrant.map(roleId => ({
        to: addresses.defiInteractor,
        data: encodeContractCall(addresses.defiInteractor, DEFI_INTERACTOR_ABI, 'grantRole', [
          newSubAccount,
          roleId,
        ]),
      }))

      const result = await proposeTransaction(
        transactions.length === 1 ? transactions[0] : transactions,
        { transactionType: TRANSACTION_TYPES.GRANT_ROLE }
      )

      if (result.success) {
        setNewSubAccount('')
        setGrantExecute(false)
        setGrantTransfer(false)
        toast.success('Transaction submitted')
      } else if ('cancelled' in result && result.cancelled) {
        // User cancelled - do nothing
        return
      } else {
        throw result.error || new Error('Transaction failed')
      }
    } catch (error) {
      console.error('Error proposing role grant:', error)
      const errorMsg = error instanceof Error ? error.message : 'Failed to propose transaction'
      toast.error(`Transaction failed: ${errorMsg}`)
    }
  }

  const handleRevokeRole = async (account: `0x${string}`, roleId: number) => {
    if (!addresses.defiInteractor) return

    try {
      const data = encodeContractCall(addresses.defiInteractor, DEFI_INTERACTOR_ABI, 'revokeRole', [
        account,
        roleId,
      ])

      const result = await proposeTransaction(
        { to: addresses.defiInteractor, data },
        { transactionType: TRANSACTION_TYPES.REVOKE_ROLE }
      )

      if (result.success) {
        toast.success('Role revoked successfully')
      } else if ('cancelled' in result && result.cancelled) {
        // User cancelled - do nothing
        return
      } else {
        throw result.error || new Error('Transaction failed')
      }
    } catch (error) {
      console.error('Error proposing role revoke:', error)
      const errorMsg = error instanceof Error ? error.message : 'Failed to propose transaction'
      toast.error(`Transaction failed: ${errorMsg}`)
    }
  }

  const handleGrantRole = async (account: `0x${string}`, roleId: number) => {
    if (!addresses.defiInteractor) return

    try {
      const data = encodeContractCall(addresses.defiInteractor, DEFI_INTERACTOR_ABI, 'grantRole', [
        account,
        roleId,
      ])

      const result = await proposeTransaction(
        { to: addresses.defiInteractor, data },
        { transactionType: TRANSACTION_TYPES.GRANT_ROLE }
      )

      if (result.success) {
        toast.success('Role granted successfully')
      } else if ('cancelled' in result && result.cancelled) {
        // User cancelled - do nothing
        return
      } else {
        throw result.error || new Error('Transaction failed')
      }
    } catch (error) {
      console.error('Error proposing role grant:', error)
      const errorMsg = error instanceof Error ? error.message : 'Failed to propose transaction'
      toast.error(`Transaction failed: ${errorMsg}`)
    }
  }

  if (!isSafeOwner) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sub-Account Management</CardTitle>
          <CardDescription>Only Safe owners can manage sub-accounts</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-small text-tertiary">
            Connect with a Safe owner address to create and manage sub-accounts.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="gap-6 grid grid-cols-1 xl:grid-cols-5">
      {/* Add Sub-Account Form - 2 cols */}
      <div className="xl:col-span-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Add Sub-Account</CardTitle>
            <CardDescription>Grant DeFi permissions to an address</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="block mb-2 font-medium text-primary text-small">
                  Wallet Address
                </label>
                <Input
                  type="text"
                  placeholder="0x..."
                  value={newSubAccount}
                  onChange={e => setNewSubAccount(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <label className="block font-medium text-primary text-small">Roles</label>
                <div className="space-y-3 bg-elevated-2 p-3 border border-subtle rounded-xl">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="execute-role"
                      checked={grantExecute}
                      onChange={e => setGrantExecute((e.target as HTMLInputElement).checked)}
                    />
                    <div className="flex-1">
                      <label
                        htmlFor="execute-role"
                        className="font-medium text-primary text-small cursor-pointer"
                      >
                        {ROLE_NAMES[ROLES.DEFI_EXECUTE_ROLE]}
                      </label>
                      <p className="mt-0.5 text-caption text-tertiary">
                        {ROLE_DESCRIPTIONS[ROLES.DEFI_EXECUTE_ROLE]}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="transfer-role"
                      checked={grantTransfer}
                      onChange={e => setGrantTransfer((e.target as HTMLInputElement).checked)}
                    />
                    <div className="flex-1">
                      <label
                        htmlFor="transfer-role"
                        className="font-medium text-primary text-small cursor-pointer"
                      >
                        {ROLE_NAMES[ROLES.DEFI_TRANSFER_ROLE]}
                      </label>
                      <p className="mt-0.5 text-caption text-tertiary">
                        {ROLE_DESCRIPTIONS[ROLES.DEFI_TRANSFER_ROLE]}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleAddSubAccount}
                disabled={isPending || !newSubAccount}
                className="w-full"
              >
                {isPending ? 'Proposing...' : 'Add Sub-Account'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sub-Accounts List - 3 cols */}
      <div className="xl:col-span-3">
        <Card className="h-full">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Managed Sub-Accounts</CardTitle>
                <CardDescription>View and manage permissions</CardDescription>
              </div>
              <Badge variant="outline">{managedAccounts.length} accounts</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingAccounts ? (
              <div className="py-8 text-center">
                <div className="mx-auto mb-3 border-2 border-accent-primary border-t-transparent rounded-full w-8 h-8 animate-spin" />
                <p className="text-small text-tertiary">Loading accounts...</p>
              </div>
            ) : managedAccounts.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="flex justify-center items-center bg-elevated-2 mx-auto mb-3 rounded-full w-12 h-12">
                  <span className="text-2xl">👤</span>
                </div>
                <p className="text-small text-tertiary">
                  No sub-accounts yet. Add one to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {managedAccounts.map((account, index) => (
                  <SubAccountRow
                    key={account.address}
                    account={account.address}
                    onRevokeRole={handleRevokeRole}
                    onGrantRole={handleGrantRole}
                    isRevoking={isPending}
                    index={index}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface SubAccountRowProps {
  account: `0x${string}`
  onRevokeRole: (account: `0x${string}`, roleId: number) => Promise<void>
  onGrantRole: (account: `0x${string}`, roleId: number) => Promise<void>
  isRevoking: boolean
  index: number
}

function SubAccountRow({
  account,
  onRevokeRole,
  onGrantRole,
  isRevoking,
  index,
}: SubAccountRowProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<'spending' | 'protocols'>('spending')

  const { data: hasExecuteRole } = useHasRole(account, ROLES.DEFI_EXECUTE_ROLE)
  const { data: hasTransferRole } = useHasRole(account, ROLES.DEFI_TRANSFER_ROLE)

  // Spending allowance data for progress bar
  const { data: spendingAllowance } = useSpendingAllowance(account)
  const { data: safeValue } = useSafeValue()
  const { data: limits } = useSubAccountLimits(account)

  // Calculate spending progress
  const maxAllowance = safeValue && limits ? (safeValue[0] * BigInt(limits[0])) / 10000n : null
  const percentUsed =
    maxAllowance && spendingAllowance !== undefined && maxAllowance > 0n
      ? Number(((maxAllowance - spendingAllowance) * 10000n) / maxAllowance) / 100
      : 0

  return (
    <div
      className="border border-subtle rounded-xl overflow-hidden animate-fade-in-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex sm:flex-row flex-col sm:justify-between sm:items-center gap-3 bg-elevated hover:bg-elevated-2 p-3 sm:p-4 transition-colors">
        <div className="flex-1 w-full sm:w-auto min-w-0">
          <div className="flex items-center gap-1">
            <p className="font-mono font-medium text-primary text-small truncate">
              {account.slice(0, 6)}...{account.slice(-4)}
            </p>
            <CopyButton value={account} />
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {hasExecuteRole && <Badge variant="info">{ROLE_NAMES[ROLES.DEFI_EXECUTE_ROLE]}</Badge>}
            {hasTransferRole && (
              <Badge variant="success">{ROLE_NAMES[ROLES.DEFI_TRANSFER_ROLE]}</Badge>
            )}
            {!hasExecuteRole && !hasTransferRole && <Badge variant="outline">No Roles</Badge>}
          </div>
          {/* Spending Progress Bar */}
          {maxAllowance !== null && maxAllowance > 0n && (
            <div className="mt-2 sm:mt-3 w-full">
              <div className="flex justify-between mb-1 text-tertiary text-xs">
                <span>Used: {percentUsed.toFixed(1)}%</span>
                <span>${formatUSD(spendingAllowance ?? 0n)} remaining</span>
              </div>
              <div className="bg-elevated-3 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-info rounded-full h-full transition-all to-accent-primary"
                  style={{ width: `${Math.min(percentUsed, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
          <Button
            size="sm"
            variant="ghost"
            className="order-last sm:order-first w-full sm:w-auto sm:min-w-[100px]"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Hide' : 'Configure'}
          </Button>
          {hasExecuteRole ? (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => onRevokeRole(account, ROLES.DEFI_EXECUTE_ROLE)}
              disabled={isRevoking}
            >
              <span className="sm:hidden">- Exec</span>
              <span className="hidden sm:inline">Revoke Execute</span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="default"
              className="flex-1 sm:flex-none"
              onClick={() => onGrantRole(account, ROLES.DEFI_EXECUTE_ROLE)}
              disabled={isRevoking}
            >
              <span className="sm:hidden">+ Exec</span>
              <span className="hidden sm:inline">Grant Execute</span>
            </Button>
          )}
          {hasTransferRole ? (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => onRevokeRole(account, ROLES.DEFI_TRANSFER_ROLE)}
              disabled={isRevoking}
            >
              <span className="sm:hidden">- Transfer</span>
              <span className="hidden sm:inline">Revoke Transfer</span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="default"
              className="flex-1 sm:flex-none"
              onClick={() => onGrantRole(account, ROLES.DEFI_TRANSFER_ROLE)}
              disabled={isRevoking}
            >
              <span className="sm:hidden">+ Transfer</span>
              <span className="hidden sm:inline">Grant Transfer</span>
            </Button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="bg-elevated-2 p-3 sm:p-4 border-subtle border-t">
          {/* Tab Navigation */}
          <div className="flex gap-1 bg-elevated mb-4 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('spending')}
              className={`flex-1 px-3 py-2 text-small font-medium rounded-md transition-all ${
                activeTab === 'spending'
                  ? 'bg-elevated-2 text-primary shadow-sm'
                  : 'text-tertiary hover:text-secondary'
              }`}
            >
              Spending Limits
            </button>
            <button
              onClick={() => setActiveTab('protocols')}
              className={`flex-1 px-3 py-2 text-small font-medium rounded-md transition-all ${
                activeTab === 'protocols'
                  ? 'bg-elevated-2 text-primary shadow-sm'
                  : 'text-tertiary hover:text-secondary'
              }`}
            >
              Protocol Permissions
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'spending' && <SpendingLimits subAccountAddress={account} />}
          {activeTab === 'protocols' && <ProtocolPermissions subAccountAddress={account} />}
        </div>
      )}
    </div>
  )
}
