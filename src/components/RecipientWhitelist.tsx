import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isAddress, parseAbiItem, type Address, type Log } from 'viem'
import { usePublicClient, useReadContract } from 'wagmi'
import { ShieldCheck, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GUARDIAN_ABI as GUARDIAN_ABI_CONST } from '@/lib/contracts'
import { useContractAddresses } from '@/contexts/ContractAddressContext'
import { encodeContractCall, useSafeProposal } from '@/hooks/useSafeProposal'
import { TRANSACTION_TYPES } from '@/lib/transactionTypes'
import { useToast } from '@/contexts/ToastContext'
import { cn } from '@/lib/utils'

const GUARDIAN_ABI = GUARDIAN_ABI_CONST as unknown as any[]

const ALLOWED_RECIPIENTS_SET_EVENT = parseAbiItem(
  'event AllowedRecipientsSet(address indexed subAccount, address[] recipients, bool allowed)'
)

interface RecipientWhitelistProps {
  subAccountAddress: Address
}

// Reconstructs the current set of allowed recipients for an agent by replaying
// AllowedRecipientsSet events (the on-chain mapping has no enumeration), then
// re-checking the live mapping for each unique recipient ever touched. This is
// fine for testnets; for mainnet a subgraph index would scale better.
function useAllowedRecipientsList(subAccountAddress: Address) {
  const { addresses } = useContractAddresses()
  const publicClient = usePublicClient()

  return useQuery({
    queryKey: ['allowedRecipients', addresses.guardian, subAccountAddress],
    queryFn: async (): Promise<Address[]> => {
      if (!publicClient || !addresses.guardian) return []

      const logs = (await publicClient.getLogs({
        address: addresses.guardian,
        event: ALLOWED_RECIPIENTS_SET_EVENT,
        args: { subAccount: subAccountAddress },
        fromBlock: 0n,
        toBlock: 'latest',
      })) as Log[]

      const everTouched = new Set<Address>()
      for (const log of logs) {
        const args = (log as unknown as { args: { recipients?: readonly Address[] } }).args
        for (const r of args.recipients ?? []) {
          everTouched.add(r.toLowerCase() as Address)
        }
      }

      if (everTouched.size === 0) return []

      const candidates = Array.from(everTouched)
      const results = await Promise.all(
        candidates.map(async recipient => {
          try {
            const isAllowed = (await publicClient.readContract({
              address: addresses.guardian!,
              abi: GUARDIAN_ABI,
              functionName: 'allowedRecipients',
              args: [subAccountAddress, recipient],
            })) as boolean
            return { recipient, isAllowed }
          } catch {
            return { recipient, isAllowed: false }
          }
        })
      )

      return results.filter(r => r.isAllowed).map(r => r.recipient)
    },
    enabled: Boolean(publicClient && addresses.guardian && subAccountAddress),
  })
}

export function RecipientWhitelist({ subAccountAddress }: RecipientWhitelistProps) {
  const { addresses } = useContractAddresses()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { proposeTransaction, isPending } = useSafeProposal()

  const { data: enabled, refetch: refetchEnabled } = useReadContract({
    address: addresses.guardian,
    abi: GUARDIAN_ABI,
    functionName: 'recipientWhitelistEnabled',
    args: [subAccountAddress],
    query: { enabled: Boolean(addresses.guardian) },
  })

  const {
    data: recipients = [],
    isLoading: isLoadingRecipients,
    refetch: refetchRecipients,
  } = useAllowedRecipientsList(subAccountAddress)

  const [newRecipient, setNewRecipient] = useState('')

  const trimmedNew = newRecipient.trim()
  const newIsValid = trimmedNew.length > 0 && isAddress(trimmedNew)
  const newAlreadyListed = useMemo(
    () => newIsValid && recipients.some(r => r.toLowerCase() === trimmedNew.toLowerCase()),
    [newIsValid, recipients, trimmedNew]
  )

  const refetchAll = () => {
    refetchEnabled()
    refetchRecipients()
    queryClient.invalidateQueries({
      queryKey: ['allowedRecipients', addresses.guardian, subAccountAddress],
    })
  }

  const handleToggle = async () => {
    if (!addresses.guardian) {
      toast.warning('Contract not configured')
      return
    }
    const next = !enabled
    try {
      const result = await proposeTransaction(
        {
          to: addresses.guardian,
          data: encodeContractCall(
            addresses.guardian,
            GUARDIAN_ABI,
            'setRecipientWhitelistEnabled',
            [subAccountAddress, next]
          ),
        },
        { transactionType: TRANSACTION_TYPES.SET_RECIPIENT_WHITELIST_ENABLED }
      )
      if (result.success) {
        toast.success(next ? 'Whitelist enabled' : 'Whitelist disabled')
        refetchAll()
      } else if (!('cancelled' in result && result.cancelled)) {
        throw result.error || new Error('Transaction failed')
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to update whitelist toggle'
      toast.error(msg)
    }
  }

  const handleAdd = async () => {
    if (!addresses.guardian) {
      toast.warning('Contract not configured')
      return
    }
    if (!newIsValid) {
      toast.warning('Invalid Ethereum address')
      return
    }
    if (newAlreadyListed) {
      toast.info('This recipient is already whitelisted')
      return
    }
    try {
      const result = await proposeTransaction(
        {
          to: addresses.guardian,
          data: encodeContractCall(addresses.guardian, GUARDIAN_ABI, 'setAllowedRecipients', [
            subAccountAddress,
            [trimmedNew as Address],
            true,
          ]),
        },
        { transactionType: TRANSACTION_TYPES.SET_ALLOWED_RECIPIENTS }
      )
      if (result.success) {
        toast.success('Recipient added')
        setNewRecipient('')
        refetchAll()
      } else if (!('cancelled' in result && result.cancelled)) {
        throw result.error || new Error('Transaction failed')
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to add recipient'
      toast.error(msg)
    }
  }

  const handleRemove = async (recipient: Address) => {
    if (!addresses.guardian) return
    try {
      const result = await proposeTransaction(
        {
          to: addresses.guardian,
          data: encodeContractCall(addresses.guardian, GUARDIAN_ABI, 'setAllowedRecipients', [
            subAccountAddress,
            [recipient],
            false,
          ]),
        },
        { transactionType: TRANSACTION_TYPES.SET_ALLOWED_RECIPIENTS }
      )
      if (result.success) {
        toast.success('Recipient removed')
        refetchAll()
      } else if (!('cancelled' in result && result.cancelled)) {
        throw result.error || new Error('Transaction failed')
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to remove recipient'
      toast.error(msg)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 bg-elevated p-3 border border-subtle rounded-xl">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 w-4 h-4 text-accent-primary" />
          <div>
            <p className="font-medium text-primary text-small">Recipient Whitelist</p>
            <p className="mt-0.5 text-caption text-tertiary">
              {enabled
                ? 'ON — this agent can only transfer to addresses listed below.'
                : 'OFF — this agent can transfer to any recipient (still bounded by spending limits).'}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleToggle}
          disabled={isPending || enabled === undefined}
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : enabled ? (
            'Disable'
          ) : (
            'Enable'
          )}
        </Button>
      </div>

      <div className="space-y-2">
        <p className="font-medium text-primary text-small">
          Allowed Recipients{recipients.length > 0 ? ` (${recipients.length})` : ''}
        </p>
        {isLoadingRecipients ? (
          <div className="flex items-center gap-2 bg-elevated p-3 border border-subtle rounded-xl">
            <Loader2 className="w-4 h-4 animate-spin text-tertiary" />
            <span className="text-caption text-tertiary">Loading recipients...</span>
          </div>
        ) : recipients.length === 0 ? (
          <div
            className={cn(
              'p-3 border rounded-xl',
              enabled ? 'border-yellow-500/20 bg-yellow-500/10' : 'border-subtle bg-elevated'
            )}
          >
            <p className={cn('text-caption', enabled ? 'text-yellow-400' : 'text-tertiary')}>
              {enabled
                ? 'No recipients whitelisted. With the whitelist ON, this agent cannot transfer to anyone until you add at least one address.'
                : 'No recipients whitelisted. (The whitelist is OFF, so this is not enforced.)'}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {recipients.map(recipient => (
              <div
                key={recipient}
                className="flex justify-between items-center gap-2 bg-elevated p-2.5 border border-subtle rounded-lg"
              >
                <span className="font-mono text-primary text-small break-all">{recipient}</span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleRemove(recipient)}
                  disabled={isPending}
                  title="Remove recipient"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="font-medium text-primary text-small">Add Recipient</p>
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <Input
              value={newRecipient}
              onChange={e => setNewRecipient((e.target as HTMLInputElement).value)}
              placeholder="0x..."
            />
            {trimmedNew.length > 0 && !newIsValid && (
              <p className="mt-1 text-caption text-red-400">Invalid address</p>
            )}
            {newAlreadyListed && (
              <p className="mt-1 text-caption text-yellow-400">
                This address is already whitelisted
              </p>
            )}
          </div>
          <Button
            type="button"
            onClick={handleAdd}
            disabled={isPending || !newIsValid || newAlreadyListed}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
          </Button>
        </div>
      </div>
    </div>
  )
}
