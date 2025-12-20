import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { CopyButton } from '@/components/ui/copy-button'
import { TooltipIcon } from '@/components/ui/tooltip'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { ChevronDown, Pencil } from 'lucide-react'
import { DEFI_INTERACTOR_ABI, ROLES, ROLE_NAMES, ROLE_DESCRIPTIONS } from '@/lib/contracts'
import { useSubAccountNames } from '@/hooks/useSubAccountNames'
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
import { formatUSD, cn } from '@/lib/utils'
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
  const [setSpendingLimits, setSetSpendingLimits] = useState(false)
  const [spendingLimit, setSpendingLimit] = useState('5')
  const { toast } = useToast()

  // Fetch managed accounts from contract
  const { data: managedAccounts = [], isLoading: isLoadingAccounts } = useManagedAccounts()

  // Get Safe portfolio value for USD calculations
  const { data: safeValue } = useSafeValue()

  // Calculate USD amount based on user input (real-time)
  const inputAllowanceUSD =
    safeValue && setSpendingLimits
      ? (safeValue[0] * BigInt(Math.floor(parseFloat(spendingLimit || '0') * 100))) / 10000n
      : null

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

    if (setSpendingLimits) {
      const spendingBps = Math.floor(parseFloat(spendingLimit) * 100)

      if (spendingBps < 0 || spendingBps > 10000) {
        toast.warning('Spending limit must be between 0-100%')
        return
      }
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

      const transactions: any[] = []

      // Add grantRole transactions
      rolesToGrant.forEach(roleId => {
        transactions.push({
          to: addresses.defiInteractor,
          data: encodeContractCall(addresses.defiInteractor, DEFI_INTERACTOR_ABI, 'grantRole', [
            newSubAccount,
            roleId,
          ]),
        })
      })

      // Add setSubAccountLimits transaction if enabled
      if (setSpendingLimits) {
        const spendingBps = Math.floor(parseFloat(spendingLimit) * 100)
        const windowSeconds = 24 * 3600 // 24 hours fixed

        transactions.push({
          to: addresses.defiInteractor,
          data: encodeContractCall(
            addresses.defiInteractor,
            DEFI_INTERACTOR_ABI as unknown as any[],
            'setSubAccountLimits',
            [newSubAccount as `0x${string}`, BigInt(spendingBps), BigInt(windowSeconds)]
          ),
        })
      }

      const result = await proposeTransaction(
        transactions.length === 1 ? transactions[0] : transactions,
        { transactionType: TRANSACTION_TYPES.GRANT_ROLE }
      )

      if (result.success) {
        setNewSubAccount('')
        setGrantExecute(false)
        setGrantTransfer(false)
        setSetSpendingLimits(false)
        setSpendingLimit('5')
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

              <div className="space-y-3">
                <label className="block font-medium text-primary text-small">
                  Spending Limits (Optional)
                </label>
                <div className="bg-elevated-2 p-3 border border-subtle rounded-xl">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="set-limits"
                      checked={setSpendingLimits}
                      onChange={e => setSetSpendingLimits((e.target as HTMLInputElement).checked)}
                    />
                    <div className="flex-1">
                      <label
                        htmlFor="set-limits"
                        className="font-medium text-primary text-small cursor-pointer"
                      >
                        Set spending limits now
                      </label>
                      <p className="mt-0.5 text-caption text-tertiary">
                        Configure spending restrictions for this sub-account (can be set later,
                        default 5%)
                      </p>
                    </div>
                  </div>

                  {setSpendingLimits && (
                    <div className="mt-4 pl-8">
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 font-medium text-small">
                          Spending Limit
                          <TooltipIcon content="Maximum spending as percentage of portfolio value per 24-hour window" />
                        </label>
                        <div className="flex items-center gap-3">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={spendingLimit}
                            onChange={e => setSpendingLimit(e.target.value)}
                            placeholder="5"
                            className="flex-1"
                          />
                          <span className="min-w-[30px] font-medium text-small text-tertiary">
                            %
                          </span>
                          {inputAllowanceUSD !== null && (
                            <span className="text-muted-foreground text-sm">
                              ≈ ${formatUSD(inputAllowanceUSD)}
                            </span>
                          )}
                        </div>
                        <p className="text-caption text-tertiary">
                          Limit updates may take up to 2 minutes to apply.
                          <br />
                          Time window fixed at 24 hours.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <Button
                onClick={handleAddSubAccount}
                disabled={isPending || !newSubAccount}
                className="w-full"
              >
                {'Add Sub-Account'}
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
  isRevoking: boolean
  index: number
}

function SubAccountRow({ account, isRevoking, index }: SubAccountRowProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<'spending' | 'protocols'>('spending')
  const [isRolesPopoverOpen, setIsRolesPopoverOpen] = useState(false)
  const [isNamePopoverOpen, setIsNamePopoverOpen] = useState(false)
  const [nameInputValue, setNameInputValue] = useState('')

  const { data: hasExecuteRole } = useHasRole(account, ROLES.DEFI_EXECUTE_ROLE)
  const { data: hasTransferRole } = useHasRole(account, ROLES.DEFI_TRANSFER_ROLE)
  const { isSafeOwner } = useIsSafeOwner()
  const { getAccountName, setAccountName, removeAccountName } = useSubAccountNames()
  const accountName = getAccountName(account)

  // Local editing state - tracks checkbox values during modification
  const [localExecuteRole, setLocalExecuteRole] = useState<boolean>(false)
  const [localTransferRole, setLocalTransferRole] = useState<boolean>(false)

  // Sync local state with contract state when it updates
  useEffect(() => {
    if (hasExecuteRole !== undefined) {
      setLocalExecuteRole(hasExecuteRole)
    }
    if (hasTransferRole !== undefined) {
      setLocalTransferRole(hasTransferRole)
    }
  }, [hasExecuteRole, hasTransferRole])

  // Sync name input value when popover opens
  useEffect(() => {
    if (isNamePopoverOpen) {
      setNameInputValue(accountName || '')
    }
  }, [isNamePopoverOpen, accountName])

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

  // Get necessary dependencies for handlers
  const { addresses } = useContractAddresses()
  const { toast } = useToast()
  const { proposeTransaction, isPending: isUpdating } = useSafeProposal()

  // Compute if there are changes to show Update/Cancel buttons
  const hasChanges = useMemo(() => {
    // Return false if contract state is still loading
    if (hasExecuteRole === undefined || hasTransferRole === undefined) {
      return false
    }

    // Compare local state with contract state
    return localExecuteRole !== hasExecuteRole || localTransferRole !== hasTransferRole
  }, [localExecuteRole, localTransferRole, hasExecuteRole, hasTransferRole])

  // Event handlers
  const handleExecuteChange = (checked: boolean) => {
    setLocalExecuteRole(checked)
  }

  const handleTransferChange = (checked: boolean) => {
    setLocalTransferRole(checked)
  }

  const handleUpdatePermissions = async () => {
    const transactions: Array<{ to: `0x${string}`; data: `0x${string}` }> = []

    if (!addresses.defiInteractor) {
      toast.warning('Contract not configured')
      return
    }

    // Build transactions for Execute role if changed
    if (hasExecuteRole !== undefined && localExecuteRole !== hasExecuteRole) {
      const functionName = localExecuteRole ? 'grantRole' : 'revokeRole'
      transactions.push({
        to: addresses.defiInteractor,
        data: encodeContractCall(addresses.defiInteractor, DEFI_INTERACTOR_ABI, functionName, [
          account,
          ROLES.DEFI_EXECUTE_ROLE,
        ]),
      })
    }

    // Build transactions for Transfer role if changed
    if (hasTransferRole !== undefined && localTransferRole !== hasTransferRole) {
      const functionName = localTransferRole ? 'grantRole' : 'revokeRole'
      transactions.push({
        to: addresses.defiInteractor,
        data: encodeContractCall(addresses.defiInteractor, DEFI_INTERACTOR_ABI, functionName, [
          account,
          ROLES.DEFI_TRANSFER_ROLE,
        ]),
      })
    }

    if (transactions.length === 0) {
      toast.warning('No changes to apply')
      return
    }

    try {
      const result = await proposeTransaction(
        transactions.length === 1 ? transactions[0] : transactions,
        { transactionType: TRANSACTION_TYPES.GRANT_ROLE }
      )

      if (result.success) {
        toast.success('Permissions updated successfully')
        setIsRolesPopoverOpen(false)
      } else if ('cancelled' in result && result.cancelled) {
        return
      } else {
        throw result.error || new Error('Transaction failed')
      }
    } catch (error) {
      console.error('Error updating permissions:', error)
      const errorMsg = error instanceof Error ? error.message : 'Failed to update permissions'
      toast.error(`Transaction failed: ${errorMsg}`)
    }
  }

  const handleCancel = () => {
    setLocalExecuteRole(hasExecuteRole || false)
    setLocalTransferRole(hasTransferRole || false)
  }

  const handleSaveName = () => {
    const trimmed = nameInputValue.trim()
    if (trimmed) {
      setAccountName(account, trimmed)
    } else {
      removeAccountName(account)
    }
    setIsNamePopoverOpen(false)
    setNameInputValue('')
  }

  return (
    <div
      className="border border-subtle rounded-xl animate-fade-in-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div
        className={cn(
          'flex sm:flex-row flex-col sm:justify-between sm:items-center gap-3 p-3 sm:p-4 rounded-xl transition-all',
          'bg-elevated hover:bg-elevated-2'
        )}
      >
        <div className="flex-1 w-full sm:w-auto min-w-0">
          {accountName ? (
            <div className="flex flex-col gap-0.5">
              <p className="font-medium text-primary text-small truncate">{accountName}</p>
              <div className="flex items-center gap-1">
                <p className="font-mono font-medium text-muted-foreground text-xs truncate">
                  {account.slice(0, 6)}...{account.slice(-4)}
                </p>
                <div className="flex items-center">
                  <CopyButton value={account} />
                  {isSafeOwner && (
                    <Popover
                      open={isNamePopoverOpen}
                      onOpenChange={setIsNamePopoverOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-5 h-6"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="p-3 w-64"
                        align="start"
                      >
                        <div className="space-y-3">
                          <div>
                            <label className="block mb-2 font-medium text-sm">
                              Sub-Account Name
                            </label>
                            <Input
                              type="text"
                              placeholder="Enter name..."
                              value={nameInputValue}
                              onChange={e => setNameInputValue(e.target.value)}
                              maxLength={32}
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  handleSaveName()
                                } else if (e.key === 'Escape') {
                                  setIsNamePopoverOpen(false)
                                }
                              }}
                            />
                            <p className="mt-1 text-muted-foreground text-xs">
                              {nameInputValue.length}/32
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={handleSaveName}
                              className="flex-1"
                              disabled={nameInputValue === accountName}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setIsNamePopoverOpen(false)}
                              className="flex-1"
                            >
                              Cancel
                            </Button>
                          </div>
                          {accountName && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                removeAccountName(account)
                                setIsNamePopoverOpen(false)
                                setNameInputValue('')
                              }}
                              className="w-full text-destructive hover:text-destructive"
                            >
                              Remove Name
                            </Button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <p className="font-mono font-medium text-primary text-small truncate">
                {account.slice(0, 6)}...{account.slice(-4)}
              </p>
              <div className="flex items-center">
                <CopyButton value={account} />
                {isSafeOwner && (
                  <Popover
                    open={isNamePopoverOpen}
                    onOpenChange={setIsNamePopoverOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-5 h-6"
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="p-3 w-64"
                      align="start"
                    >
                      <div className="space-y-3">
                        <div>
                          <label className="block mb-2 font-medium text-sm">Sub-Account Name</label>
                          <Input
                            type="text"
                            placeholder="Enter name..."
                            value={nameInputValue}
                            onChange={e => setNameInputValue(e.target.value)}
                            maxLength={32}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                handleSaveName()
                              } else if (e.key === 'Escape') {
                                setIsNamePopoverOpen(false)
                              }
                            }}
                          />
                          <p className="mt-1 text-muted-foreground text-xs">
                            {nameInputValue.length}/32
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={handleSaveName}
                            className="flex-1"
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setIsNamePopoverOpen(false)}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                        </div>
                        {accountName && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              removeAccountName(account)
                              setIsNamePopoverOpen(false)
                              setNameInputValue('')
                            }}
                            className="w-full text-destructive hover:text-destructive"
                          >
                            Remove Name
                          </Button>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          )}
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
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Configure Button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Hide' : 'Configure'}
          </Button>

          {/* Update Roles Popover */}
          <Popover
            open={isRolesPopoverOpen}
            onOpenChange={setIsRolesPopoverOpen}
          >
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant={hasChanges ? 'default' : 'outline'}
                className={cn(hasChanges && 'ring-2 ring-green-500/50')}
                disabled={isRevoking}
              >
                <div className="flex items-center whitespace-nowrap">
                  Update Roles
                  <ChevronDown className="ml-1 w-3 h-3" />
                </div>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="p-3 w-56"
              align="end"
            >
              <div className="space-y-3">
                <p className="font-medium text-muted-foreground text-sm">Edit Roles</p>

                {/* Checkboxes */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`execute-${account}`}
                      checked={localExecuteRole}
                      onChange={e => handleExecuteChange((e.target as HTMLInputElement).checked)}
                      disabled={isRevoking}
                    />
                    <label
                      htmlFor={`execute-${account}`}
                      className="text-sm cursor-pointer"
                    >
                      Execute
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`transfer-${account}`}
                      checked={localTransferRole}
                      onChange={e => handleTransferChange((e.target as HTMLInputElement).checked)}
                      disabled={isRevoking}
                    />
                    <label
                      htmlFor={`transfer-${account}`}
                      className="text-sm cursor-pointer"
                    >
                      Transfer
                    </label>
                  </div>
                </div>

                {/* Actions */}
                {hasChanges && (
                  <div
                    className={`flex gap-2 pt-2 border-t ${!localExecuteRole && !localTransferRole ? 'flex-col' : ''}`}
                  >
                    <Button
                      size="sm"
                      variant={!localExecuteRole && !localTransferRole ? 'destructive' : 'default'}
                      onClick={handleUpdatePermissions}
                      className="flex-1 min-h-10"
                      disabled={isRevoking || isUpdating}
                    >
                      {!localExecuteRole && !localTransferRole
                        ? 'Remove sub-account'
                        : isUpdating
                          ? 'Updating...'
                          : 'Update'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancel}
                      className="flex-1 min-h-10"
                      disabled={isRevoking || isUpdating}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
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
