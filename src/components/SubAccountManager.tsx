import { useState, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { CopyButton } from '@/components/ui/copy-button'
import { Tooltip, TooltipIcon } from '@/components/ui/tooltip'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { ChevronDown, Pencil, ShieldCheck } from 'lucide-react'
import {
  GUARDIAN_ABI as GUARDIAN_ABI_CONST,
  ROLES,
  ROLE_NAMES,
  ROLE_DESCRIPTIONS,
} from '@/lib/contracts'
const GUARDIAN_ABI = GUARDIAN_ABI_CONST as unknown as any[]
import { PROTOCOLS, getProtocolContractAddresses } from '@/lib/protocols'
import { useSubAccountNames } from '@/hooks/useSubAccountNames'
import { ProtocolPermissions } from '@/components/ProtocolPermissions'
import { SpendingLimits } from '@/components/SpendingLimits'
import { useContractAddresses } from '@/contexts/ContractAddressContext'
import {
  useIsSafeOwner,
  useHasRole,
  useIsOracleless,
  useManagedAccounts,
  useSpendingAllowance,
  useSafeValue,
  useSubAccountLimits,
  useCumulativeSpent,
  useWindowStart,
} from '@/hooks/useSafe'
import {
  useSubAccountFullState,
  mergeProtocolsWithChanges,
  mergeRolesWithChanges,
} from '@/hooks/useSubAccountFullState'
import { formatUSD, cn } from '@/lib/utils'
import { useSafeProposal, encodeContractCall } from '@/hooks/useSafeProposal'
import { TRANSACTION_TYPES } from '@/lib/transactionTypes'
import { isAddress, parseUnits } from 'viem'
import { useToast } from '@/contexts/ToastContext'
import { useTransactionPreviewContext } from '@/contexts/TransactionPreviewContext'
import type { SubAccount } from '@/types'
import type { TransactionPreviewData, RoleChange } from '@/types/transactionPreview'

const DASHBOARD_AGENT_PRESETS = [
  {
    id: 'manual',
    name: 'Custom',
    description: 'Define your own guardrails. Full control over protocols, limits, and roles.',
    execute: false,
    transfer: false,
    spendingLimit: '5',
    autoSetLimits: false,
    protocolIds: [] as string[],
  },
  {
    id: 'defi-trader',
    name: 'DeFi Trader',
    description: 'Swap tokens on Uniswap. Supply to Aave V3.',
    execute: true,
    transfer: false,
    spendingLimit: '5',
    autoSetLimits: true,
    protocolIds: ['uniswap', 'aave'],
  },
  {
    id: 'yield-farmer',
    name: 'Yield Farmer',
    description: 'Deposit into Morpho Blue and Aave V3. Maximize yield safely.',
    execute: true,
    transfer: false,
    spendingLimit: '10',
    autoSetLimits: true,
    protocolIds: ['aave', 'morpho'],
  },
  {
    id: 'payment-agent',
    name: 'Payment Agent',
    description: 'Transfer tokens to specified recipients. No DeFi interactions.',
    execute: false,
    transfer: true,
    spendingLimit: '1',
    autoSetLimits: true,
    protocolIds: [] as string[],
  },
] as const

export function SubAccountManager() {
  const { addresses } = useContractAddresses()
  const queryClient = useQueryClient()
  const { isSafeOwner } = useIsSafeOwner()
  const [selectedPreset, setSelectedPreset] =
    useState<(typeof DASHBOARD_AGENT_PRESETS)[number]['id']>('manual')
  const [newSubAccount, setNewSubAccount] = useState('')
  const [grantExecute, setGrantExecute] = useState(false)
  const [grantTransfer, setGrantTransfer] = useState(false)
  const [trustMode, setTrustMode] = useState<'oracle-managed' | 'oracleless'>('oracle-managed')
  const [setSpendingLimits, setSetSpendingLimits] = useState(false)
  const [spendingLimit, setSpendingLimit] = useState('5')
  const [spendingLimitUSD, setSpendingLimitUSD] = useState('5000')
  const { toast } = useToast()
  const { showPreview } = useTransactionPreviewContext()

  // Fetch managed accounts from contract
  const { data: managedAccounts = [], isLoading: isLoadingAccounts } = useManagedAccounts()

  // Read the module's actual oracleless flag — locks the trust-mode picker on oracleless modules.
  // Picking BPS on an oracleless module would revert with OraclelessRequiresUSDMode at submission.
  const { data: isModuleOracleless } = useIsOracleless()
  useEffect(() => {
    if (isModuleOracleless && trustMode !== 'oracleless') {
      setTrustMode('oracleless')
      setSetSpendingLimits(true)
    }
  }, [isModuleOracleless, trustMode])

  // Get Safe portfolio value for USD calculations
  const { data: safeValue } = useSafeValue()

  // Calculate USD amount based on user input (real-time)
  const inputAllowanceUSD =
    safeValue && setSpendingLimits && trustMode === 'oracle-managed'
      ? (safeValue[0] * BigInt(Math.floor(parseFloat(spendingLimit || '0') * 100))) / 10000n
      : null

  // Use Safe proposal hook
  const { proposeTransaction, isPending } = useSafeProposal()

  const applyPreset = (presetId: (typeof DASHBOARD_AGENT_PRESETS)[number]['id']) => {
    const preset = DASHBOARD_AGENT_PRESETS.find(option => option.id === presetId)
    if (!preset) return

    setSelectedPreset(preset.id)
    setGrantExecute(preset.execute)
    setGrantTransfer(preset.transfer)
    // Oracleless always requires spending limits — don't let a preset override that
    if (trustMode !== 'oracleless') {
      setSetSpendingLimits(preset.autoSetLimits)
    }
    setSpendingLimit(preset.spendingLimit)
  }

  const handleAddSubAccount = async () => {
    if (!isAddress(newSubAccount)) {
      toast.warning('Invalid Ethereum address')
      return
    }

    const activePreset = DASHBOARD_AGENT_PRESETS.find(p => p.id === selectedPreset)
    const presetProtocolIds: readonly string[] = activePreset?.protocolIds ?? []
    const allowedProtocolAddresses = presetProtocolIds.flatMap(
      id => getProtocolContractAddresses(id) as `0x${string}`[]
    )

    if (!grantExecute && !grantTransfer && allowedProtocolAddresses.length === 0) {
      toast.warning('Check at least one role (Execute or Transfer) in the Roles section')
      return
    }

    if (trustMode === 'oracleless') {
      if (!spendingLimitUSD || Number(spendingLimitUSD) <= 0) {
        toast.warning('Oracleless mode requires a USD spending limit')
        return
      }
    } else if (setSpendingLimits) {
      const spendingBps = Math.floor(parseFloat(spendingLimit) * 100)
      if (spendingBps < 0 || spendingBps > 10000) {
        toast.warning('Spending limit must be between 0-100%')
        return
      }
    }

    if (!addresses.guardian) {
      toast.warning('Contract not configured')
      return
    }

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

    if (rolesToGrant.length === 0 && allowedProtocolAddresses.length === 0 && !setSpendingLimits) {
      toast.info('This address already has the selected roles')
      return
    }

    // Build preview data
    const roles: RoleChange[] = [
      {
        roleId: ROLES.DEFI_EXECUTE_ROLE,
        roleName: ROLE_NAMES[ROLES.DEFI_EXECUTE_ROLE],
        description: ROLE_DESCRIPTIONS[ROLES.DEFI_EXECUTE_ROLE],
        action: rolesToGrant.includes(ROLES.DEFI_EXECUTE_ROLE)
          ? ('add' as const)
          : ('unchanged' as const),
      },
      {
        roleId: ROLES.DEFI_TRANSFER_ROLE,
        roleName: ROLE_NAMES[ROLES.DEFI_TRANSFER_ROLE],
        description: ROLE_DESCRIPTIONS[ROLES.DEFI_TRANSFER_ROLE],
        action: rolesToGrant.includes(ROLES.DEFI_TRANSFER_ROLE)
          ? ('add' as const)
          : ('unchanged' as const),
      },
    ].filter(r => r.action !== 'unchanged') as RoleChange[]

    // Build protocol changes for preview
    const protocolChanges =
      presetProtocolIds.length > 0
        ? PROTOCOLS.filter(p => presetProtocolIds.includes(p.id)).map(protocol => ({
            protocolId: protocol.id,
            protocolName: protocol.name,
            contracts: protocol.contracts.map(c => ({
              contractId: c.id,
              contractName: c.name,
              address: c.address,
              description: c.description,
              action: 'add' as const,
            })),
          }))
        : undefined

    const previewData: TransactionPreviewData = {
      type: 'add-subaccount',
      subAccountAddress: newSubAccount as `0x${string}`,
      roles,
      spendingLimits: setSpendingLimits
        ? {
            before: null,
            after: {
              maxSpendingBps:
                trustMode === 'oracle-managed' ? Math.floor(parseFloat(spendingLimit) * 100) : 0,
              maxSpendingUSD:
                trustMode === 'oracleless'
                  ? parseUnits(spendingLimitUSD || '0', 18).toString()
                  : '0',
              mode: trustMode === 'oracleless' ? 'usd' : 'bps',
              windowDuration: 24 * 3600,
            },
          }
        : undefined,
      protocols: protocolChanges,
    }

    // Show preview modal and execute on confirm
    showPreview(previewData, async () => {
      try {
        const transactions: any[] = []

        // Add grantRole transactions
        rolesToGrant.forEach(roleId => {
          transactions.push({
            to: addresses.guardian,
            data: encodeContractCall(addresses.guardian!, GUARDIAN_ABI, 'grantRole', [
              newSubAccount,
              roleId,
            ]),
          })
        })

        // Add setSubAccountLimits transaction if enabled
        if (setSpendingLimits) {
          const spendingBps =
            trustMode === 'oracle-managed' ? Math.floor(parseFloat(spendingLimit) * 100) : 0
          const spendingUSD =
            trustMode === 'oracleless' ? parseUnits(spendingLimitUSD || '0', 18) : 0n
          const windowSeconds = 24 * 3600 // 24 hours fixed

          transactions.push({
            to: addresses.guardian!,
            data: encodeContractCall(addresses.guardian!, GUARDIAN_ABI, 'setSubAccountLimits', [
              newSubAccount as `0x${string}`,
              BigInt(spendingBps),
              spendingUSD,
              BigInt(windowSeconds),
            ]),
          })
        }

        // Add setAllowedAddresses transaction for preset protocols
        if (allowedProtocolAddresses.length > 0) {
          transactions.push({
            to: addresses.guardian!,
            data: encodeContractCall(addresses.guardian!, GUARDIAN_ABI, 'setAllowedAddresses', [
              newSubAccount as `0x${string}`,
              allowedProtocolAddresses,
              true,
            ]),
          })
        }

        const result = await proposeTransaction(
          transactions.length === 1 ? transactions[0] : transactions,
          { transactionType: TRANSACTION_TYPES.GRANT_ROLE }
        )

        if (result.success) {
          // Optimistically add the new sub-account to the managed accounts cache
          // so the list updates immediately without waiting for the RPC refetch
          queryClient.setQueryData<SubAccount[]>(
            ['managedAccounts', addresses.guardian],
            (current = []) => {
              const alreadyExists = current.some(
                a => a.address.toLowerCase() === newSubAccount.toLowerCase()
              )
              if (alreadyExists) return current
              return [
                ...current,
                {
                  address: newSubAccount as `0x${string}`,
                  hasExecuteRole: grantExecute,
                  hasTransferRole: grantTransfer,
                },
              ]
            }
          )
          // Refetch after a delay to let the RPC index the new block,
          // avoiding overwriting the optimistic update with stale data.
          setTimeout(() => {
            queryClient.refetchQueries({
              predicate: query =>
                Array.isArray(query.queryKey) &&
                (query.queryKey[0] === 'managedAccounts' ||
                  query.queryKey[0] === 'allowedAddresses'),
            })
          }, 4000)
          setSelectedPreset('manual')
          setNewSubAccount('')
          setGrantExecute(false)
          setGrantTransfer(false)
          setTrustMode('oracle-managed')
          setSetSpendingLimits(false)
          setSpendingLimit('5')
          setSpendingLimitUSD('5000')
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
    })
  }

  if (!isSafeOwner) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Agent Management</CardTitle>
          <CardDescription>Only Safe owners can manage agents</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-small text-tertiary">
            Connect with a Safe owner address to create and manage agents.
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
            <CardTitle>Add Agent</CardTitle>
            <CardDescription>Grant DeFi permissions to an address</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-3">
                <label className="block font-medium text-primary text-small">Preset</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 auto-rows-fr items-stretch gap-2">
                  {DASHBOARD_AGENT_PRESETS.map(preset => {
                    const isComingSoon = preset.id === 'payment-agent'
                    const card = (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => !isComingSoon && applyPreset(preset.id)}
                        disabled={isComingSoon}
                        className={cn(
                          'h-full w-full rounded-xl border p-3 text-left transition-all',
                          isComingSoon
                            ? 'border-subtle bg-elevated-2 opacity-50 cursor-not-allowed'
                            : selectedPreset === preset.id
                              ? 'border-accent-primary bg-accent-primary/5'
                              : 'border-subtle bg-elevated-2 hover:border-accent-primary/30'
                        )}
                      >
                        <div className="flex h-full flex-col">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-primary text-small">
                              {preset.name}
                            </span>
                            {!isComingSoon && selectedPreset === preset.id && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] uppercase"
                              >
                                Selected
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 text-caption text-tertiary">{preset.description}</p>
                        </div>
                      </button>
                    )
                    return isComingSoon ? (
                      <Tooltip
                        key={preset.id}
                        content="Coming soon"
                        wrapperClassName="block h-full"
                      >
                        {card}
                      </Tooltip>
                    ) : (
                      card
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block mb-2 font-medium text-primary text-small">
                  Agent Address
                </label>
                <Input
                  type="text"
                  placeholder="0x..."
                  value={newSubAccount}
                  onChange={e => setNewSubAccount(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <label className="block font-medium text-primary text-small">Trust Mode</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (isModuleOracleless) return
                      setTrustMode('oracle-managed')
                    }}
                    disabled={Boolean(isModuleOracleless)}
                    title={
                      isModuleOracleless
                        ? 'This module is configured oracleless; only USD limits are accepted on-chain.'
                        : undefined
                    }
                    className={cn(
                      'rounded-xl border p-3 text-left transition-all',
                      trustMode === 'oracle-managed'
                        ? 'border-accent-primary bg-accent-primary/5'
                        : 'border-subtle bg-elevated-2 hover:border-accent-primary/30',
                      isModuleOracleless && 'opacity-50 cursor-not-allowed hover:border-subtle'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldCheck className="w-4 h-4 text-accent-primary" />
                      <span className="font-medium text-primary text-small">Oracle-managed</span>
                    </div>
                    <p className="text-caption text-tertiary">
                      Percentage-based daily limit tracked with oracle-backed portfolio value.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTrustMode('oracleless')
                      setSetSpendingLimits(true)
                      setSpendingLimitUSD('')
                    }}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-all',
                      trustMode === 'oracleless'
                        ? 'border-accent-primary bg-accent-primary/5'
                        : 'border-subtle bg-elevated-2 hover:border-accent-primary/30'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldCheck className="w-4 h-4 text-accent-primary" />
                      <span className="font-medium text-primary text-small">Oracleless</span>
                    </div>
                    <p className="text-caption text-tertiary">
                      Fixed USD daily limit enforced through on-chain cumulative spending.
                    </p>
                  </button>
                </div>
                {isModuleOracleless && (
                  <p className="text-caption text-tertiary">
                    This module is oracleless — sub-accounts must use USD spending limits.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <label className="block font-medium text-primary text-small">Roles</label>
                <div className="space-y-3 bg-elevated-2 p-3 border border-subtle rounded-xl">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="execute-role"
                      checked={grantExecute}
                      onChange={e => {
                        const checked = (e.target as HTMLInputElement).checked
                        setGrantExecute(checked)
                        if (!checked) {
                          const preset = DASHBOARD_AGENT_PRESETS.find(p => p.id === selectedPreset)
                          if (preset?.execute) setSelectedPreset('manual')
                        }
                      }}
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
                      onChange={e => {
                        const checked = (e.target as HTMLInputElement).checked
                        setGrantTransfer(checked)
                        if (!checked) {
                          const preset = DASHBOARD_AGENT_PRESETS.find(p => p.id === selectedPreset)
                          if (preset?.transfer) setSelectedPreset('manual')
                        }
                      }}
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
                  Spending Limits {trustMode === 'oracleless' ? '(Required)' : '(Optional)'}
                </label>
                <div className="bg-elevated-2 p-3 border border-subtle rounded-xl">
                  <div className="relative flex items-start gap-3 group">
                    <Checkbox
                      id="set-limits"
                      checked={setSpendingLimits}
                      onChange={e => {
                        if (trustMode !== 'oracleless') {
                          setSetSpendingLimits((e.target as HTMLInputElement).checked)
                        }
                      }}
                    />
                    <div className="flex-1">
                      <label
                        htmlFor="set-limits"
                        className="font-medium text-primary text-small cursor-pointer"
                      >
                        Set spending limits now
                      </label>
                      <p className="mt-0.5 text-caption text-tertiary">
                        {trustMode === 'oracleless'
                          ? 'Required in oracleless mode.'
                          : 'Configure spending restrictions for this agent (can be set later, default 5%)'}
                      </p>
                    </div>
                    {trustMode === 'oracleless' && (
                      <div className="absolute -top-9 left-0 hidden group-hover:block bg-slate-900 text-white text-xs px-3 py-2 rounded-md shadow-lg w-max max-w-xs z-50 pointer-events-none">
                        A USD spending limit is required in oracleless mode.
                      </div>
                    )}
                  </div>

                  {setSpendingLimits && (
                    <div className="mt-4 pl-8">
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 font-medium text-small">
                          {trustMode === 'oracleless' ? 'USD Spending Limit' : 'Spending Limit'}
                          <TooltipIcon content="Maximum spending as percentage of portfolio value per 24-hour window" />
                        </label>
                        {trustMode === 'oracleless' ? (
                          <div className="flex items-center gap-3">
                            <span className="text-small text-tertiary">$</span>
                            <Input
                              type="number"
                              min="1"
                              step="100"
                              value={spendingLimitUSD}
                              onChange={e => {
                                setSpendingLimitUSD(e.target.value)
                              }}
                              placeholder="5000"
                              className="flex-1"
                            />
                            <span className="font-medium text-small text-tertiary">USD</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={spendingLimit}
                              onChange={e => {
                                setSpendingLimit(e.target.value)
                              }}
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
                        )}
                        <p className="text-caption text-tertiary">
                          {trustMode === 'oracleless'
                            ? 'Set a fixed USD cap for each 24-hour window.'
                            : 'Set a percentage cap of portfolio value for each 24-hour window.'}
                          <br />
                          The time window can be updated later.
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
                {'Add Agent'}
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
                <CardTitle>Managed Agents</CardTitle>
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
                <p className="text-small text-tertiary">No agents yet. Add one to get started.</p>
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
  const queryClient = useQueryClient()

  const { data: hasExecuteRole } = useHasRole(account, ROLES.DEFI_EXECUTE_ROLE)
  const { data: hasTransferRole } = useHasRole(account, ROLES.DEFI_TRANSFER_ROLE)
  const { isSafeOwner } = useIsSafeOwner()

  // Get full sub-account state for preview context
  const { fullState: currentFullState, allowedAddresses: currentAllowedAddresses } =
    useSubAccountFullState(account)
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
  const { data: cumulativeSpent } = useCumulativeSpent(account)
  const { data: windowStart } = useWindowStart(account)

  // Calculate spending progress
  const isAccountOracleless = limits ? limits[0] === 0n && limits[1] > 0n : false
  const maxAllowance = isAccountOracleless
    ? (limits?.[1] ?? null)
    : safeValue && limits
      ? (safeValue[0] * BigInt(limits[0])) / 10000n
      : null
  const windowDuration = limits?.[2] ?? 0n
  const nowSec = BigInt(Math.floor(Date.now() / 1000))
  const isWindowExpired =
    windowStart !== undefined &&
    windowStart !== 0n &&
    windowDuration > 0n &&
    nowSec > windowStart + windowDuration
  const effectiveSpent = isWindowExpired ? 0n : (cumulativeSpent ?? 0n)
  const remainingBySpent =
    maxAllowance !== null && maxAllowance > effectiveSpent ? maxAllowance - effectiveSpent : 0n
  // For oracleless mode, skip oracle's spendingAllowance (it may be 0/irrelevant).
  // Also skip oracle's value when no spending has occurred yet (windowStart === 0 &&
  // cumulativeSpent === 0) — the oracle may hold a stale allowance from a prior config.
  const noSpendingYet = (windowStart === undefined || windowStart === 0n) && effectiveSpent === 0n
  const effectiveRemainingAllowance = isAccountOracleless || noSpendingYet
    ? remainingBySpent
    : spendingAllowance !== undefined && spendingAllowance < remainingBySpent
      ? spendingAllowance
      : remainingBySpent
  const isOracleAllowanceLagging =
    !isAccountOracleless &&
    !noSpendingYet &&
    spendingAllowance !== undefined &&
    spendingAllowance < remainingBySpent &&
    maxAllowance !== null &&
    effectiveSpent < maxAllowance
  const isPriorSessionConstraint =
    !isAccountOracleless &&
    !isWindowExpired &&
    effectiveSpent > 0n &&
    spendingAllowance !== undefined &&
    effectiveRemainingAllowance < spendingAllowance
  // When the oracle's spendingAllowance is the binding constraint, derive
  // percentUsed from it so the bar stays consistent with the "remaining" figure.
  const effectiveSpentForBar =
    !isAccountOracleless &&
    !noSpendingYet &&
    spendingAllowance !== undefined &&
    spendingAllowance < remainingBySpent &&
    maxAllowance !== null
      ? maxAllowance - spendingAllowance
      : effectiveSpent
  const percentUsed =
    maxAllowance && maxAllowance > 0n
      ? Number(
          ((effectiveSpentForBar > maxAllowance ? maxAllowance : effectiveSpentForBar) * 10000n) /
            maxAllowance
        ) / 100
      : 0

  // Get necessary dependencies for handlers
  const { addresses } = useContractAddresses()
  const { toast } = useToast()
  const { proposeTransaction, isPending: isUpdating } = useSafeProposal()
  const { showPreview } = useTransactionPreviewContext()

  const updateManagedAccountsCache = (updater: (accounts: SubAccount[]) => SubAccount[]) => {
    queryClient.setQueryData<SubAccount[]>(['managedAccounts', addresses.guardian], current =>
      updater(current ?? [])
    )
  }

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
    if (!addresses.guardian) {
      toast.warning('Contract not configured')
      return
    }

    // Build role changes for preview
    const roles: RoleChange[] = []

    if (hasExecuteRole !== undefined && localExecuteRole !== hasExecuteRole) {
      roles.push({
        roleId: ROLES.DEFI_EXECUTE_ROLE,
        roleName: ROLE_NAMES[ROLES.DEFI_EXECUTE_ROLE],
        description: ROLE_DESCRIPTIONS[ROLES.DEFI_EXECUTE_ROLE],
        action: localExecuteRole ? 'add' : 'remove',
      })
    }

    if (hasTransferRole !== undefined && localTransferRole !== hasTransferRole) {
      roles.push({
        roleId: ROLES.DEFI_TRANSFER_ROLE,
        roleName: ROLE_NAMES[ROLES.DEFI_TRANSFER_ROLE],
        description: ROLE_DESCRIPTIONS[ROLES.DEFI_TRANSFER_ROLE],
        action: localTransferRole ? 'add' : 'remove',
      })
    }

    if (roles.length === 0) {
      toast.warning('No changes to apply')
      return
    }

    const shouldClearProtocols =
      hasExecuteRole !== undefined &&
      hasExecuteRole &&
      !localExecuteRole &&
      currentAllowedAddresses.size > 0

    const protocolRemovalChanges = shouldClearProtocols
      ? currentFullState.protocols
          .map(protocol => {
            const contracts = protocol.contracts
              .filter(contract => contract.isActive)
              .map(contract => ({
                ...contract,
                action: 'remove' as const,
              }))

            return contracts.length > 0
              ? {
                  protocolId: protocol.protocolId,
                  protocolName: protocol.protocolName,
                  contracts,
                }
              : null
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
      : []

    // Build full state with role changes applied
    const fullStateWithChanges = {
      roles: mergeRolesWithChanges(currentFullState.roles, roles),
      spendingLimits: currentFullState.spendingLimits, // Unchanged
      protocols:
        protocolRemovalChanges.length > 0
          ? mergeProtocolsWithChanges(currentFullState.protocols, protocolRemovalChanges)
          : currentFullState.protocols,
    }

    const previewData: TransactionPreviewData = {
      type: 'update-roles',
      subAccountAddress: account,
      roles,
      fullState: fullStateWithChanges,
    }

    showPreview(previewData, async () => {
      const transactions: Array<{ to: `0x${string}`; data: `0x${string}` }> = []

      // Build transactions for Execute role if changed
      if (hasExecuteRole !== undefined && localExecuteRole !== hasExecuteRole) {
        const functionName = localExecuteRole ? 'grantRole' : 'revokeRole'
        transactions.push({
          to: addresses.guardian!,
          data: encodeContractCall(addresses.guardian!, GUARDIAN_ABI, functionName, [
            account,
            ROLES.DEFI_EXECUTE_ROLE,
          ]),
        })
      }

      if (shouldClearProtocols) {
        transactions.push({
          to: addresses.guardian!,
          data: encodeContractCall(addresses.guardian!, GUARDIAN_ABI, 'setAllowedAddresses', [
            account,
            Array.from(currentAllowedAddresses),
            false,
          ]),
        })
      }

      // Build transactions for Transfer role if changed
      if (hasTransferRole !== undefined && localTransferRole !== hasTransferRole) {
        const functionName = localTransferRole ? 'grantRole' : 'revokeRole'
        transactions.push({
          to: addresses.guardian!,
          data: encodeContractCall(addresses.guardian!, GUARDIAN_ABI, functionName, [
            account,
            ROLES.DEFI_TRANSFER_ROLE,
          ]),
        })
      }

      try {
        const result = await proposeTransaction(
          transactions.length === 1 ? transactions[0] : transactions,
          { transactionType: TRANSACTION_TYPES.GRANT_ROLE }
        )

        if (result.success) {
          updateManagedAccountsCache(accounts =>
            accounts.map(existing =>
              existing.address.toLowerCase() === account.toLowerCase()
                ? {
                    ...existing,
                    hasExecuteRole: localExecuteRole,
                    hasTransferRole: localTransferRole,
                  }
                : existing
            )
          )
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
    })
  }

  const handleCancel = () => {
    setLocalExecuteRole(hasExecuteRole || false)
    setLocalTransferRole(hasTransferRole || false)
  }

  const handleDeleteSubAccount = async () => {
    if (!addresses.guardian) {
      toast.warning('Contract not configured')
      return
    }

    const roles: RoleChange[] = []
    const transactions: Array<{ to: `0x${string}`; data: `0x${string}` }> = []
    const protocolRemovalChanges = currentFullState.protocols
      .map(protocol => {
        const contracts = protocol.contracts
          .filter(contract => contract.isActive)
          .map(contract => ({
            ...contract,
            action: 'remove' as const,
          }))

        return contracts.length > 0
          ? {
              protocolId: protocol.protocolId,
              protocolName: protocol.protocolName,
              contracts,
            }
          : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    if (hasExecuteRole) {
      roles.push({
        roleId: ROLES.DEFI_EXECUTE_ROLE,
        roleName: ROLE_NAMES[ROLES.DEFI_EXECUTE_ROLE],
        description: ROLE_DESCRIPTIONS[ROLES.DEFI_EXECUTE_ROLE],
        action: 'remove',
      })
      transactions.push({
        to: addresses.guardian,
        data: encodeContractCall(addresses.guardian, GUARDIAN_ABI, 'revokeRole', [
          account,
          ROLES.DEFI_EXECUTE_ROLE,
        ]),
      })
    }

    if (hasTransferRole) {
      roles.push({
        roleId: ROLES.DEFI_TRANSFER_ROLE,
        roleName: ROLE_NAMES[ROLES.DEFI_TRANSFER_ROLE],
        description: ROLE_DESCRIPTIONS[ROLES.DEFI_TRANSFER_ROLE],
        action: 'remove',
      })
      transactions.push({
        to: addresses.guardian!,
        data: encodeContractCall(addresses.guardian!, GUARDIAN_ABI, 'revokeRole', [
          account,
          ROLES.DEFI_TRANSFER_ROLE,
        ]),
      })
    }

    if (currentAllowedAddresses.size > 0) {
      transactions.push({
        to: addresses.guardian!,
        data: encodeContractCall(addresses.guardian!, GUARDIAN_ABI, 'setAllowedAddresses', [
          account,
          Array.from(currentAllowedAddresses),
          false,
        ]),
      })
    }

    if (transactions.length === 0) {
      toast.info('This sub-account is already inactive')
      return
    }

    const previewData: TransactionPreviewData = {
      type: 'update-roles',
      subAccountAddress: account,
      roles,
      fullState: {
        roles: mergeRolesWithChanges(currentFullState.roles, roles),
        spendingLimits: currentFullState.spendingLimits,
        protocols:
          protocolRemovalChanges.length > 0
            ? mergeProtocolsWithChanges(currentFullState.protocols, protocolRemovalChanges)
            : currentFullState.protocols,
      },
    }

    showPreview(previewData, async () => {
      try {
        const result = await proposeTransaction(
          transactions.length === 1 ? transactions[0] : transactions,
          { transactionType: TRANSACTION_TYPES.REVOKE_ROLE }
        )

        if (result.success) {
          const deletedAddress = account.toLowerCase()
          updateManagedAccountsCache(accounts =>
            accounts.filter(existing => existing.address.toLowerCase() !== deletedAddress)
          )
          toast.success('Agent deleted successfully')
          setIsRolesPopoverOpen(false)
          setLocalExecuteRole(false)
          setLocalTransferRole(false)

          // The query invalidation in useSafeProposal fires ~4s after confirmation
          // and may restore the account if the RPC node hasn't indexed the block yet.
          // Poll until the on-chain data confirms deletion, re-applying the optimistic
          // removal each time a stale refetch sneaks through.
          for (let i = 0; i < 6; i++) {
            await new Promise(res => setTimeout(res, 3000))
            await queryClient.refetchQueries({
              queryKey: ['managedAccounts', addresses.guardian],
            })
            const fresh = queryClient.getQueryData<SubAccount[]>([
              'managedAccounts',
              addresses.guardian,
            ])
            if (!fresh?.some(a => a.address.toLowerCase() === deletedAddress)) break
            // RPC still returning stale data — re-apply optimistic removal
            updateManagedAccountsCache(accounts =>
              accounts.filter(a => a.address.toLowerCase() !== deletedAddress)
            )
          }
        } else if ('cancelled' in result && result.cancelled) {
          return
        } else {
          throw result.error || new Error('Transaction failed')
        }
      } catch (error) {
        console.error('Error deleting agent:', error)
        const errorMsg = error instanceof Error ? error.message : 'Failed to delete agent'
        toast.error(`Transaction failed: ${errorMsg}`)
      }
    })
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

  const nameEditPopover = isSafeOwner && (
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
            <label className="block mb-2 font-medium text-sm">Agent Name</label>
            <Input
              type="text"
              placeholder="Enter name..."
              value={nameInputValue}
              onChange={e => setNameInputValue(e.target.value)}
              maxLength={32}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveName()
                else if (e.key === 'Escape') setIsNamePopoverOpen(false)
              }}
            />
            <p className="mt-1 text-muted-foreground text-xs">{nameInputValue.length}/32</p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={handleSaveName}
              className="flex-1"
              disabled={!!accountName && nameInputValue === accountName}
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
  )

  return (
    <div
      className="border border-subtle rounded-xl overflow-hidden animate-fade-in-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div
        className={cn(
          'flex sm:flex-row flex-col sm:justify-between sm:items-center gap-3 p-3 sm:p-4 transition-all',
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
                  {nameEditPopover}
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
                {nameEditPopover}
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
                <span className="flex items-center gap-1">
                  Used: {percentUsed.toFixed(1)}%
                  <TooltipIcon content="Prior spending in this window persists even if the agent was deleted and re-added." />
                </span>
                <span>${formatUSD(effectiveRemainingAllowance)} remaining</span>
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

          {(hasExecuteRole || hasTransferRole) && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleDeleteSubAccount}
              disabled={isRevoking || isUpdating}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              {isUpdating ? 'Deleting...' : 'Delete'}
            </Button>
          )}

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
                        ? 'Remove agent'
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
