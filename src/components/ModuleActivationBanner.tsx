import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { type Address } from 'viem'
import { Loader2, ShieldAlert, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useContractAddresses } from '@/contexts/ContractAddressContext'
import { useIsSafeOwner, useSafeAddress } from '@/hooks/useSafe'
import { encodeContractCall, useSafeProposal } from '@/hooks/useSafeProposal'
import { SAFE_ABI } from '@/lib/contracts'
import { TRANSACTION_TYPES } from '@/lib/transactionTypes'
import { getExplorerBase } from '@/lib/chains'

/**
 * Banner shown on the Dashboard when a Guardian module is configured but not yet
 * enabled on its Safe. The agent cannot operate until enableModule is called.
 * Only Safe owners can sign the activation transaction.
 */
export function ModuleActivationBanner() {
  const { addresses } = useContractAddresses()
  const { chainId } = useAccount()
  const { data: safeAddress } = useSafeAddress()
  const { isSafeOwner } = useIsSafeOwner()
  const { proposeTransaction } = useSafeProposal()
  const [isEnabling, setIsEnabling] = useState(false)
  const [enableError, setEnableError] = useState<string | null>(null)
  const [enableTxHash, setEnableTxHash] = useState<`0x${string}` | null>(null)

  const guardian = addresses.guardian as Address | undefined
  const safe = safeAddress as Address | undefined

  const { data: isEnabled, refetch } = useReadContract({
    address: safe,
    abi: SAFE_ABI,
    functionName: 'isModuleEnabled',
    args: guardian ? [guardian] : undefined,
    query: {
      enabled: Boolean(safe) && Boolean(guardian),
      // Re-check often enough that the banner disappears soon after activation
      staleTime: 30 * 1000,
    },
  })

  if (!guardian || !safe) return null
  if (isEnabled) return null

  async function handleEnable() {
    if (!safe || !guardian) return
    setEnableError(null)
    setIsEnabling(true)
    try {
      const result = await proposeTransaction(
        {
          to: safe,
          data: encodeContractCall(safe, SAFE_ABI as unknown as any[], 'enableModule', [guardian]),
        },
        {
          transactionType: TRANSACTION_TYPES.ENABLE_MODULE,
          safeAddressOverride: safe,
          moduleOwnerOverride: safe,
        }
      )
      if (result.success) {
        setEnableTxHash(result.transactionHash as `0x${string}`)
        await refetch()
      } else if ('cancelled' in result && result.cancelled) {
        return
      } else {
        throw result.error || new Error('Transaction failed')
      }
    } catch (err) {
      setEnableError(err instanceof Error ? err.message : 'Failed to enable module on Safe')
    } finally {
      setIsEnabling(false)
    }
  }

  return (
    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
      <div className="flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-yellow-300 mt-0.5 shrink-0" />
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium text-yellow-200">Guardian not enabled on this Safe</p>
          <p className="text-xs text-yellow-200/80">
            The Guardian module{' '}
            <code className="font-mono">
              {guardian.slice(0, 6)}…{guardian.slice(-4)}
            </code>{' '}
            is configured but not yet enabled on Safe{' '}
            <code className="font-mono">
              {safe.slice(0, 6)}…{safe.slice(-4)}
            </code>
            . The agent cannot execute any transaction until a Safe owner activates it.
          </p>
          {!isSafeOwner && (
            <p className="text-xs text-red-400">
              Connected wallet is not an owner of this Safe — switch to a signer to activate the
              Guardian.
            </p>
          )}
          {enableError && <p className="text-xs text-red-400 break-words">{enableError}</p>}
          {enableTxHash && chainId !== undefined && (
            <p className="text-xs text-yellow-200/80">
              Activation transaction sent.{' '}
              <a
                href={`${getExplorerBase(chainId)}/tx/${enableTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline inline-flex items-center gap-0.5"
              >
                View
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          )}
          <Button
            onClick={handleEnable}
            disabled={isEnabling || !isSafeOwner}
            className="bg-accent-primary text-black hover:bg-accent-primary/90 disabled:opacity-50"
          >
            {isEnabling ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enabling…
              </>
            ) : (
              'Enable Guardian on Safe'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
