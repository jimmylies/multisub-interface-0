import { useState, useMemo, useEffect } from 'react'
import { parseUnits, formatUnits } from 'viem'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { TooltipIcon } from '@/components/ui/tooltip'
import { GUARDIAN_ABI } from '@/lib/contracts'
import { useContractAddresses } from '@/contexts/ContractAddressContext'
import { useIsOracleless, useSubAccountLimits, useSafeValue } from '@/hooks/useSafe'
import { useSubAccountFullState } from '@/hooks/useSubAccountFullState'
import { formatUSD } from '@/lib/utils'
import { useSafeProposal, encodeContractCall } from '@/hooks/useSafeProposal'
import { TRANSACTION_TYPES } from '@/lib/transactionTypes'
import { useToast } from '@/contexts/ToastContext'
import { useTransactionPreviewContext } from '@/contexts/TransactionPreviewContext'
import type { TransactionPreviewData } from '@/types/transactionPreview'

interface SpendingLimitsProps {
  subAccountAddress: `0x${string}`
}

export function SpendingLimits({ subAccountAddress }: SpendingLimitsProps) {
  const { addresses } = useContractAddresses()

  // Read current limits using hook: [maxSpendingBps, maxSpendingUSD, windowDuration]
  const { data: currentLimits } = useSubAccountLimits(subAccountAddress)

  // Get full sub-account state for preview context
  const { fullState: currentFullState } = useSubAccountFullState(subAccountAddress)

  // Get Safe portfolio value from oracle
  const { data: safeValue } = useSafeValue()

  // Read module mode — authoritative when true, since BPS limits would revert
  // with OraclelessRequiresUSDMode on an oracleless module. The per-sub-account
  // heuristic still kicks in for USD-mode sub-accounts on oracle modules.
  const { data: isModuleOracleless } = useIsOracleless()
  const isOracleless =
    Boolean(isModuleOracleless) ||
    (currentLimits ? currentLimits[0] === 0n && currentLimits[1] > 0n : false)

  // Oracle-managed: USD equivalent from BPS × portfolio
  const maxAllowanceUSD =
    !isOracleless && safeValue && currentLimits
      ? (safeValue[0] * BigInt(currentLimits[0])) / 10000n
      : null

  // Oracleless: direct USD value stored in currentLimits[1] (1e18 scale)
  const maxAllowanceUSDDirect = isOracleless && currentLimits ? currentLimits[1] : null

  const [spendingLimit, setSpendingLimit] = useState('10') // % for oracle-managed
  const [spendingLimitUSD, setSpendingLimitUSD] = useState('') // $ for oracleless

  // Calculate USD amount based on user input (real-time, oracle-managed only)
  const inputAllowanceUSD =
    !isOracleless && safeValue
      ? (safeValue[0] * BigInt(Math.floor(parseFloat(spendingLimit || '0') * 100))) / 10000n
      : null
  const [windowHours, setWindowHours] = useState('24')
  const { toast } = useToast()
  const { showPreview } = useTransactionPreviewContext()

  // Sync form values with contract data when available
  useEffect(() => {
    if (!currentLimits) return
    const currentWindowHours = Number(currentLimits[2]) / 3600
    setWindowHours((currentWindowHours > 0 ? currentWindowHours : 24).toString())
    if (currentLimits[0] === 0n && currentLimits[1] > 0n) {
      // Oracleless: display the USD value
      setSpendingLimitUSD(formatUnits(currentLimits[1], 18))
    } else {
      setSpendingLimit((Number(currentLimits[0]) / 100).toString())
    }
  }, [currentLimits])

  const { proposeTransaction, isPending } = useSafeProposal()

  const hasChanges = useMemo(() => {
    if (!currentLimits) return true
    const inputWindowSeconds = Math.floor(parseFloat(windowHours || '0') * 3600)
    if (isOracleless) {
      const inputUSD = parseUnits(spendingLimitUSD || '0', 18)
      return inputUSD !== currentLimits[1] || inputWindowSeconds !== Number(currentLimits[2])
    }
    const inputSpendingBps = Math.floor(parseFloat(spendingLimit || '0') * 100)
    return (
      inputSpendingBps !== Number(currentLimits[0]) ||
      inputWindowSeconds !== Number(currentLimits[2])
    )
  }, [currentLimits, spendingLimit, spendingLimitUSD, windowHours, isOracleless])

  // Increment/decrement handlers for custom spinners
  const incrementSpendingLimit = () => {
    if (isOracleless) {
      setSpendingLimitUSD(prev => (parseFloat(prev || '0') + 100).toString())
    } else {
      setSpendingLimit(prev => Math.min(100, parseFloat(prev || '0') + 0.5).toString())
    }
  }
  const decrementSpendingLimit = () => {
    if (isOracleless) {
      setSpendingLimitUSD(prev => Math.max(0, parseFloat(prev || '0') - 100).toString())
    } else {
      setSpendingLimit(prev => Math.max(0, parseFloat(prev || '0') - 0.5).toString())
    }
  }
  const incrementWindowHours = () => {
    setWindowHours(prev => Math.min(168, parseFloat(prev || '0') + 1).toString())
  }
  const decrementWindowHours = () => {
    setWindowHours(prev => Math.max(1, parseFloat(prev || '0') - 1).toString())
  }

  const handleSaveLimits = async () => {
    const parsedWindow = parseFloat(windowHours)
    if (Number.isNaN(parsedWindow)) {
      toast.warning('Invalid input values')
      return
    }

    const windowSeconds = Math.floor(parsedWindow * 3600)
    if (windowSeconds < 3600) {
      toast.warning('Minimum window: 1 hour')
      return
    }

    if (!addresses.guardian) {
      toast.warning('Contract not configured')
      return
    }

    let spendingBps = 0
    let spendingUSD = 0n

    if (isOracleless) {
      if (!spendingLimitUSD || Number(spendingLimitUSD) <= 0) {
        toast.warning('Enter a valid USD spending limit')
        return
      }
      spendingUSD = parseUnits(spendingLimitUSD, 18)
    } else {
      const parsedLimit = parseFloat(spendingLimit)
      if (Number.isNaN(parsedLimit)) {
        toast.warning('Invalid input values')
        return
      }
      spendingBps = Math.floor(parsedLimit * 100)
      if (spendingBps < 0 || spendingBps > 10000) {
        toast.warning('Limit must be 0-100%')
        return
      }
    }

    // Build spending limits change
    const spendingLimitsChange = {
      before: currentLimits
        ? {
            maxSpendingBps: Number(currentLimits[0]),
            windowDuration: Number(currentLimits[2]),
          }
        : null,
      after: {
        maxSpendingBps: spendingBps,
        windowDuration: windowSeconds,
      },
    }

    // Build full state with spending limits change applied
    const fullStateWithChanges = {
      roles: currentFullState.roles,
      spendingLimits: spendingLimitsChange,
      protocols: currentFullState.protocols,
    }

    // Build preview data
    const previewData: TransactionPreviewData = {
      type: 'update-limits',
      subAccountAddress,
      spendingLimits: spendingLimitsChange,
      fullState: fullStateWithChanges,
    }

    showPreview(previewData, async () => {
      try {
        const data = encodeContractCall(
          addresses.guardian!,
          GUARDIAN_ABI as unknown as any[],
          'setSubAccountLimits',
          [subAccountAddress, BigInt(spendingBps), spendingUSD, BigInt(windowSeconds)]
        )

        const result = await proposeTransaction(
          { to: addresses.guardian!, data },
          { transactionType: TRANSACTION_TYPES.SET_SUB_ACCOUNT_LIMITS }
        )

        if (result.success) {
          toast.success('Spending limits updated')
        } else if ('cancelled' in result && result.cancelled) {
          // User cancelled - do nothing
          return
        } else {
          throw result.error || new Error('Transaction failed')
        }
      } catch (error) {
        console.error('Error proposing limits:', error)
        const errorMsg = error instanceof Error ? error.message : 'Failed to propose transaction'
        toast.error(`Transaction failed: ${errorMsg}`)
      }
    })
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <CardTitle>Spending Limits</CardTitle>
        <CardDescription>Set strict limits to control sub-account spending</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {currentLimits && (
            <div className="bg-gradient-to-br from-info-muted to-success-muted p-4 border border-info/20 rounded-xl">
              <p className="flex items-center gap-2 mb-3 font-medium text-primary text-small">
                Current Configuration
                <Badge variant="success">Active</Badge>
              </p>
              <div className="gap-4 grid grid-cols-2">
                <div className="text-center">
                  {isOracleless ? (
                    <p className="font-bold text-primary text-2xl">
                      ${maxAllowanceUSDDirect !== null ? formatUSD(maxAllowanceUSDDirect) : '—'}
                    </p>
                  ) : (
                    <>
                      <p className="font-bold text-primary text-2xl">
                        {(Number(currentLimits[0]) / 100).toFixed(1)}%
                      </p>
                      {maxAllowanceUSD !== null && (
                        <p className="text-muted-foreground text-sm">
                          ${formatUSD(maxAllowanceUSD)}
                        </p>
                      )}
                    </>
                  )}
                  <p className="mt-1 text-muted-foreground text-xs">Spending Limit</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-primary text-2xl">
                    {(Number(currentLimits[2]) / 3600 || 24).toFixed(0)}h
                  </p>
                  <p className="mt-1 text-muted-foreground text-xs">Time Window</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 font-medium text-sm">
                {isOracleless ? 'USD Spending Limit' : 'Spending Limit'}
                <TooltipIcon
                  content={
                    isOracleless
                      ? 'Fixed USD cap enforced on-chain via cumulative spending counter.'
                      : 'Maximum spending (all operations) as a percentage of portfolio value. Oracle tracks actual spending across swaps, deposits, withdrawals, and transfers.'
                  }
                />
                <Badge
                  variant="destructive"
                  className="text-xs"
                >
                  Per Window
                </Badge>
              </label>
              <div className="flex items-center gap-3">
                {isOracleless && <span className="font-medium text-small text-tertiary">$</span>}
                <div className="relative flex-1">
                  <Input
                    type="number"
                    min="0"
                    max={isOracleless ? undefined : 100}
                    step={isOracleless ? 100 : 0.5}
                    value={isOracleless ? spendingLimitUSD : spendingLimit}
                    onChange={e => {
                      const value = e.target.value
                      if (isOracleless) {
                        if (value === '' || /^\d*\.?\d{0,2}$/.test(value))
                          setSpendingLimitUSD(value)
                      } else {
                        if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) setSpendingLimit(value)
                      }
                    }}
                    placeholder={isOracleless ? '1000' : '10'}
                    className="pr-8"
                  />
                  <div className="top-1/2 right-4 absolute flex flex-col gap-0.5 -translate-y-1/2">
                    <button
                      type="button"
                      onClick={incrementSpendingLimit}
                      className="text-tertiary hover:text-primary transition-colors cursor-pointer"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={decrementSpendingLimit}
                      className="text-tertiary hover:text-primary transition-colors cursor-pointer"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {!isOracleless && (
                  <>
                    <span className="min-w-[30px] font-medium text-small text-tertiary">%</span>
                    {inputAllowanceUSD !== null && (
                      <span className="text-muted-foreground text-sm">
                        ≈ ${formatUSD(inputAllowanceUSD)}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 font-medium text-primary text-small">
                Time Window
                <TooltipIcon content="Duration in hours for the spending window. Spending limits reset after this period." />
              </label>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Input
                    type="number"
                    min="1"
                    max="168"
                    step="1"
                    value={windowHours}
                    onChange={e => {
                      const value = e.target.value
                      if (value === '' || /^\d+$/.test(value)) {
                        setWindowHours(value)
                      }
                    }}
                    placeholder="24"
                    className="pr-8"
                  />
                  <div className="top-1/2 right-4 absolute flex flex-col gap-0.5 -translate-y-1/2">
                    <button
                      type="button"
                      onClick={incrementWindowHours}
                      className="text-tertiary hover:text-primary transition-colors cursor-pointer"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={decrementWindowHours}
                      className="text-tertiary hover:text-primary transition-colors cursor-pointer"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <span className="min-w-[50px] font-medium text-small text-tertiary">hours</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-subtle border-t">
            <div className="bg-info-muted p-4 border border-info/20 rounded-xl">
              <div className="flex items-start gap-2 mb-2">
                <div className="flex flex-shrink-0 justify-center items-center bg-info rounded-full w-5 h-5 font-bold text-black text-xs">
                  i
                </div>
                <p className="font-medium text-primary text-small">Summary</p>
              </div>
              <div className="space-y-1.5 ml-7 text-caption text-secondary">
                {isOracleless ? (
                  <p>
                    • All operations limited to <strong>${spendingLimitUSD || '0'}</strong> per{' '}
                    {windowHours}-hour window
                  </p>
                ) : (
                  <p>
                    • All operations limited to <strong>{spendingLimit}%</strong> of portfolio per{' '}
                    {windowHours}-hour window
                  </p>
                )}
                {isOracleless ? (
                  <p>• On-chain cumulative spending tracker — no oracle required</p>
                ) : (
                  <p>• Oracle tracks real-time spending across all transactions</p>
                )}
                <p>• Acquired tokens (from swaps/deposits) are FREE for 24 hours</p>
                <p>
                  • Limits automatically reset every{' '}
                  <strong className="text-primary">{windowHours} hours</strong>
                </p>
                <p>• Limit updates may take up to 2 minutes to apply</p>
              </div>
            </div>

            <Button
              onClick={handleSaveLimits}
              disabled={isPending || !hasChanges}
              className="w-full"
            >
              {isPending ? 'Proposing to Safe...' : 'Propose Spending Limits'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
