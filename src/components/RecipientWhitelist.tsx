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
import {
  createSubgraphClient,
  ALLOWED_RECIPIENTS_HISTORY_QUERY,
  type AllowedRecipientsSetEvent,
} from '@/lib/subgraph'

const GUARDIAN_ABI = GUARDIAN_ABI_CONST as unknown as any[]

const ALLOWED_RECIPIENTS_SET_EVENT = parseAbiItem(
  'event AllowedRecipientsSet(address indexed subAccount, address[] recipients, bool allowed)'
)

interface RecipientWhitelistProps {
  subAccountAddress: Address
}

// Reconstructs the current set of allowed recipients for an agent. The on-chain
// mapping has no enumeration getter, so we need an off-chain index of touched
// addresses. Strategy (matches useModulesForEOA):
//   1. Primary: TheGraph subgraph — one GraphQL call returns the full history.
//   2. Fallback: chunked eth_getLogs over a recent window. Base Sepolia's
//      public RPC caps eth_getLogs at 2000 blocks per call (not 10k as some
//      providers advertise) — we chunk in 1900-block windows to stay safely
//      under the limit on every supported network.
// Either way, we then re-check the live `allowedRecipients(agent, recipient)`
// mapping per candidate so the rendered list reflects authoritative on-chain
// state (handles re-orgs and removals not yet indexed).
const LOG_CHUNK_BLOCKS = 1_900n
// ~5.5 days at Base Sepolia's ~2s block time. Only used by the RPC fallback;
// the subgraph path returns the full history regardless of age. At 1900-block
// chunks this is ~132 RPC calls per panel render in the worst case (subgraph
// down + agent has no events) — acceptable because the panel is only mounted
// when the user expands a row.
const MAX_LOOKBACK_BLOCKS = 250_000n

function useAllowedRecipientsList(subAccountAddress: Address) {
  const { addresses } = useContractAddresses()
  const publicClient = usePublicClient()

  return useQuery({
    queryKey: ['allowedRecipients', addresses.guardian, subAccountAddress],
    queryFn: async (): Promise<Address[]> => {
      if (!publicClient || !addresses.guardian) return []

      const everTouched = new Set<Address>()

      // Primary: subgraph
      let subgraphOk = false
      try {
        const client = createSubgraphClient()
        const data = await client.request<{
          allowedRecipientsSets: AllowedRecipientsSetEvent[]
        }>(ALLOWED_RECIPIENTS_HISTORY_QUERY, {
          subAccount: subAccountAddress.toLowerCase(),
        })
        for (const ev of data.allowedRecipientsSets) {
          for (const r of ev.recipients) {
            everTouched.add(r.toLowerCase() as Address)
          }
        }
        subgraphOk = true
      } catch {
        // Subgraph unavailable, entity not indexed, or auth failure — fall
        // through to the RPC path. A failed subgraph call should never block
        // the panel from rendering.
      }

      // Fallback: chunked eth_getLogs over a recent window. Only used when
      // the subgraph errored — if it returned an empty list cleanly that's
      // the source of truth (the previous "also try RPC on empty" path fired
      // ~14 wasted RPC calls per panel render for agents with no whitelist).
      if (!subgraphOk) {
        try {
          const latest = await publicClient.getBlockNumber()
          const floor = latest > MAX_LOOKBACK_BLOCKS ? latest - MAX_LOOKBACK_BLOCKS : 0n

          let toBlock = latest
          while (toBlock >= floor) {
            const fromBlock =
              toBlock > floor + LOG_CHUNK_BLOCKS ? toBlock - LOG_CHUNK_BLOCKS : floor
            try {
              const logs = (await publicClient.getLogs({
                address: addresses.guardian,
                event: ALLOWED_RECIPIENTS_SET_EVENT,
                args: { subAccount: subAccountAddress },
                fromBlock,
                toBlock,
              })) as Log[]
              for (const log of logs) {
                const args = (log as unknown as { args: { recipients?: readonly Address[] } }).args
                for (const r of args.recipients ?? []) {
                  everTouched.add(r.toLowerCase() as Address)
                }
              }
            } catch (err) {
              // One window failing shouldn't kill the whole walk.
              console.warn('getLogs window failed', { fromBlock, toBlock, err })
            }
            if (fromBlock === floor) break
            toBlock = fromBlock - 1n
          }
        } catch (err) {
          console.warn('Failed to enumerate AllowedRecipientsSet events', err)
          // Don't return early — if the subgraph already populated everTouched,
          // we still want to verify those entries via the mapping read below.
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

  const {
    data: enabled,
    refetch: refetchEnabled,
    isLoading: isLoadingEnabled,
    isError: isEnabledError,
  } = useReadContract({
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
    // If we don't yet know the on-chain state (read still loading or RPC error),
    // default the action to "enable" so a fresh agent isn't stuck behind an
    // unclickable button. The contract no-ops if the value is already what we set.
    const next = enabled === undefined ? true : !enabled
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
              {enabled === undefined
                ? !addresses.guardian
                  ? 'Waiting for Guardian context...'
                  : isLoadingEnabled
                    ? 'Loading current state...'
                    : isEnabledError
                      ? 'Could not read on-chain state. You can still toggle the whitelist.'
                      : 'Loading current state...'
                : enabled
                  ? 'ON — this agent can only transfer to addresses listed below.'
                  : 'OFF — this agent can transfer to any recipient (still bounded by spending limits).'}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleToggle}
          disabled={isPending}
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
