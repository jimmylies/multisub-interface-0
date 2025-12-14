import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useIsSafeOwner } from '@/hooks/useSafe'
import { useContractAddresses } from '@/contexts/ContractAddressContext'
import { useSafeProposal, encodeContractCall } from '@/hooks/useSafeProposal'
import { TRANSACTION_TYPES } from '@/lib/transactionTypes'
import { useReadContract } from 'wagmi'
import { DEFI_INTERACTOR_ABI } from '@/lib/contracts'
import { useToast } from '@/contexts/ToastContext'

export function EmergencyControls() {
  const { isSafeOwner } = useIsSafeOwner()
  const { addresses } = useContractAddresses()
  const { proposeTransaction, isPending } = useSafeProposal()
  const { toast } = useToast()

  // Read current pause status
  const { data: isPaused } = useReadContract({
    address: addresses.defiInteractor,
    abi: DEFI_INTERACTOR_ABI,
    functionName: 'paused',
    query: {
      enabled: Boolean(addresses.defiInteractor),
    },
  })

  const handlePause = async () => {
    if (!addresses.defiInteractor) {
      toast.warning('Contract not configured')
      return
    }

    try {
      const data = encodeContractCall(
        addresses.defiInteractor,
        DEFI_INTERACTOR_ABI as unknown as any[],
        'pause',
        []
      )

      const result = await proposeTransaction(
        { to: addresses.defiInteractor, data },
        { transactionType: TRANSACTION_TYPES.PAUSE }
      )

      if (result.success) {
        toast.success('Contract paused successfully')
      } else if ('cancelled' in result && result.cancelled) {
        // User cancelled - do nothing
        return
      } else {
        throw result.error || new Error('Transaction failed')
      }
    } catch (error) {
      console.error('Error proposing pause:', error)
      const errorMsg = error instanceof Error ? error.message : 'Failed to propose transaction'
      toast.error(`Pause failed: ${errorMsg}`)
    }
  }

  const handleUnpause = async () => {
    if (!addresses.defiInteractor) {
      toast.warning('Contract not configured')
      return
    }

    try {
      const data = encodeContractCall(
        addresses.defiInteractor,
        DEFI_INTERACTOR_ABI as unknown as any[],
        'unpause',
        []
      )

      const result = await proposeTransaction(
        { to: addresses.defiInteractor, data },
        { transactionType: TRANSACTION_TYPES.UNPAUSE }
      )

      if (result.success) {
        toast.success('Contract unpaused successfully')
      } else if ('cancelled' in result && result.cancelled) {
        // User cancelled - do nothing
        return
      } else {
        throw result.error || new Error('Transaction failed')
      }
    } catch (error) {
      console.error('Error proposing unpause:', error)
      const errorMsg = error instanceof Error ? error.message : 'Failed to propose transaction'
      toast.error(`Unpause failed: ${errorMsg}`)
    }
  }

  if (!isSafeOwner) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Emergency Controls</CardTitle>
          <CardDescription>Only Safe owners can access emergency controls</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-small text-tertiary">
            Connect with a Safe owner address to access emergency controls.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex justify-between items-center">
          <CardTitle>Emergency Controls</CardTitle>
          {isPaused ? (
            <Badge variant="error">⚠️ PAUSED</Badge>
          ) : (
            <Badge variant="success">✓ Active</Badge>
          )}
        </div>
        <CardDescription>Pause or unpause all sub-account operations</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Warning Message */}
        {isPaused ? (
          <div className="bg-error-muted p-4 border border-error/20 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="flex flex-shrink-0 justify-center items-center bg-error/20 rounded-lg w-8 h-8">
                <span>⚠️</span>
              </div>
              <div>
                <p className="font-medium text-primary text-small">
                  Contract is Currently Paused
                </p>
                <p className="mt-1 text-caption text-tertiary">
                  All sub-account operations are frozen. No transfers or protocol interactions can be executed.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-info-muted p-4 border border-info/20 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="flex flex-shrink-0 justify-center items-center bg-info/20 rounded-lg w-8 h-8">
                <span>✓</span>
              </div>
              <div>
                <p className="font-medium text-primary text-small">
                  Contract is Active
                </p>
                <p className="mt-1 text-caption text-tertiary">
                  All sub-accounts can execute transfers and protocol interactions normally.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Pause Button */}
        {!isPaused && (
          <div className="space-y-3">
            <div className="bg-warning-muted p-4 border border-warning/20 rounded-xl">
              <p className="font-medium text-primary text-small">
                Pausing will immediately freeze all sub-account operations:
              </p>
              <ul className="mt-2 ml-4 text-caption text-tertiary list-disc space-y-1">
                <li>Token transfers</li>
                <li>DeFi protocol interactions</li>
                <li>All sub-account transactions</li>
              </ul>
            </div>
            <Button
              onClick={handlePause}
              disabled={isPending}
              variant="destructive"
              className="w-full"
            >
              {isPending ? 'Proposing to Safe...' : '⚠️ Pause Contract'}
            </Button>
          </div>
        )}

        {/* Unpause Button */}
        {isPaused && (
          <div className="space-y-3">
            <div className="bg-success-muted p-4 border border-success/20 rounded-xl">
              <p className="text-small text-tertiary">
                Unpausing will restore normal operations for all sub-accounts.
              </p>
            </div>
            <Button
              onClick={handleUnpause}
              disabled={isPending}
              variant="default"
              className="w-full"
            >
              {isPending ? 'Proposing to Safe...' : '✓ Unpause Contract'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}