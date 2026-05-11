import { useEffect, useState } from 'react'
import { isAddress, type Address } from 'viem'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { ChevronDown, ChevronRight, Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import Safe from '@safe-global/protocol-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CopyButton } from '@/components/ui/copy-button'
import { createEip1193Provider } from '@/lib/viemToEip1193'
import { useToast } from '@/contexts/ToastContext'

interface DeploySafeInlineProps {
  // Bubble the deployed Safe address up to the parent (e.g. WizardPage)
  // so it can auto-fill its Safe Address input.
  onDeployed: (safeAddress: Address) => void
}

/**
 * Inline Safe v1.4.1 deployer. Lets a user who has no Safe yet deploy one
 * directly from the Wizard's Configure step without leaving the app.
 *
 * Defaults to single-owner (the connected wallet) with threshold 1, since
 * that covers the common "I'm a single dev controlling my AI agent" case.
 * "+ Add owner" exposes multi-owner / threshold tuning for users who want it.
 *
 * The Safe protocol-kit computes the predicted CREATE2 address so the user
 * sees what they're getting before they sign. After confirmation the predicted
 * address is the deployed address (Safe deployment is deterministic).
 */
// Safe v1.4.1 proxy addresses are CREATE2-derived from (factory, singleton,
// init code hash from owners/threshold/setup, saltNonce). With the same owners
// and the default saltNonce of 0, every prediction collides — the second
// deployment would revert because code already exists at that address. We
// generate a fresh random uint256 saltNonce per panel session, and rotate it
// after a successful deploy, so each Safe gets a unique address.
function randomSaltNonce(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return BigInt('0x' + hex).toString()
}

export function DeploySafeInline({ onDeployed }: DeploySafeInlineProps) {
  const { address: connectedAddress } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { toast } = useToast()

  const [isExpanded, setIsExpanded] = useState(false)
  const [owners, setOwners] = useState<string[]>([''])
  const [threshold, setThreshold] = useState(1)
  const [saltNonce, setSaltNonce] = useState<string>(() => randomSaltNonce())
  const [predictedAddress, setPredictedAddress] = useState<Address | null>(null)
  const [isPredicting, setIsPredicting] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)

  // Seed the first owner row with the connected wallet once it's available.
  useEffect(() => {
    if (connectedAddress && owners.length === 1 && owners[0] === '') {
      setOwners([connectedAddress])
    }
  }, [connectedAddress, owners])

  const validOwners = owners.map(o => o.trim()).filter(o => isAddress(o)) as Address[]
  const dedupedOwners = Array.from(new Set(validOwners.map(o => o.toLowerCase()))) as Address[]
  const hasDuplicateOwners = dedupedOwners.length !== validOwners.length
  const ownersComplete =
    validOwners.length === owners.length &&
    owners.every(o => o.trim().length > 0) &&
    !hasDuplicateOwners
  const thresholdValid = threshold >= 1 && threshold <= validOwners.length
  const canPredict = Boolean(publicClient && ownersComplete && thresholdValid)

  // Recompute the predicted address whenever owners / threshold change so the
  // user sees a live preview. Debounce-by-effect-deps is fine here.
  useEffect(() => {
    if (!canPredict || !publicClient) {
      setPredictedAddress(null)
      return
    }
    let cancelled = false
    setIsPredicting(true)
    const provider = createEip1193Provider(publicClient, walletClient)
    Safe.init({
      provider: provider as unknown as Parameters<typeof Safe.init>[0]['provider'],
      predictedSafe: {
        safeAccountConfig: { owners: validOwners, threshold },
        safeDeploymentConfig: { saltNonce },
      },
    })
      .then(safe => safe.getAddress())
      .then(addr => {
        if (!cancelled) setPredictedAddress(addr as Address)
      })
      .catch(err => {
        console.warn('Failed to predict Safe address', err)
        if (!cancelled) setPredictedAddress(null)
      })
      .finally(() => {
        if (!cancelled) setIsPredicting(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPredict, owners.join(','), threshold, saltNonce, publicClient?.chain?.id])

  const handleDeploy = async () => {
    if (!publicClient || !walletClient || !connectedAddress) {
      toast.warning('Connect your wallet first')
      return
    }
    if (!ownersComplete || !thresholdValid) {
      toast.warning('Fix the owners / threshold before deploying')
      return
    }

    setIsDeploying(true)
    try {
      const provider = createEip1193Provider(publicClient, walletClient)
      const safe = await Safe.init({
        provider: provider as unknown as Parameters<typeof Safe.init>[0]['provider'],
        signer: connectedAddress,
        predictedSafe: {
          safeAccountConfig: { owners: validOwners, threshold },
          safeDeploymentConfig: { saltNonce },
        },
      })

      const predicted = (await safe.getAddress()) as Address
      const deploymentTx = await safe.createSafeDeploymentTransaction()

      const txHash = await walletClient.sendTransaction({
        account: connectedAddress,
        to: deploymentTx.to as Address,
        data: deploymentTx.data as `0x${string}`,
        value: BigInt(deploymentTx.value ?? '0'),
        chain: walletClient.chain,
      })

      await publicClient.waitForTransactionReceipt({ hash: txHash })

      toast.success('Safe deployed')
      onDeployed(predicted)
      setIsExpanded(false)
      // Rotate the salt so if the user comes back to deploy a second Safe with
      // the same owners, they get a fresh CREATE2 address instead of hitting
      // the already-deployed one.
      setSaltNonce(randomSaltNonce())
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to deploy Safe'
      if (
        msg.toLowerCase().includes('user rejected') ||
        msg.toLowerCase().includes('user denied')
      ) {
        // Quiet — user closed the wallet prompt.
        return
      }
      console.error('Safe deploy failed', error)
      toast.error(msg)
    } finally {
      setIsDeploying(false)
    }
  }

  return (
    <div className="bg-elevated-2 border border-subtle rounded-xl">
      <button
        type="button"
        onClick={() => setIsExpanded(prev => !prev)}
        className="flex justify-between items-center gap-2 px-3 py-2.5 w-full text-left"
      >
        <span className="flex items-center gap-2 text-secondary text-sm">
          <ShieldCheck className="w-4 h-4 text-accent-primary" />
          Don't have a Safe? Deploy one in one click.
        </span>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-tertiary" />
        ) : (
          <ChevronRight className="w-4 h-4 text-tertiary" />
        )}
      </button>

      {isExpanded && (
        <div className="space-y-4 px-3 pb-4 border-subtle border-t">
          <div className="space-y-2 mt-3">
            <label className="block font-medium text-primary text-sm">Owners</label>
            <p className="text-tertiary text-xs">
              Owners co-sign Safe transactions. For a single-user setup, leave this as your
              connected wallet.
            </p>
            {owners.map((owner, i) => {
              const trimmed = owner.trim()
              const isInvalid = trimmed.length > 0 && !isAddress(trimmed)
              const isDuplicate =
                trimmed.length > 0 &&
                isAddress(trimmed) &&
                owners.filter((o, j) => j !== i && o.trim().toLowerCase() === trimmed.toLowerCase())
                  .length > 0
              return (
                <div
                  key={i}
                  className="flex items-start gap-2"
                >
                  <div className="flex-1">
                    <Input
                      value={owner}
                      onChange={e => {
                        const next = [...owners]
                        next[i] = e.target.value
                        setOwners(next)
                      }}
                      placeholder="0x..."
                    />
                    {isInvalid && <p className="mt-1 text-red-400 text-xs">Invalid address</p>}
                    {isDuplicate && <p className="mt-1 text-red-400 text-xs">Duplicate owner</p>}
                  </div>
                  {owners.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const next = owners.filter((_, j) => j !== i)
                        setOwners(next)
                        // Clamp threshold to new owner count.
                        const newValidCount = next
                          .map(o => o.trim())
                          .filter(o => isAddress(o)).length
                        if (newValidCount > 0 && threshold > newValidCount) {
                          setThreshold(newValidCount)
                        }
                      }}
                      title="Remove owner"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              )
            })}
            <Button
              type="button"
              variant="outline"
              onClick={() => setOwners([...owners, ''])}
            >
              + Add owner
            </Button>
          </div>

          <div className="space-y-2">
            <label className="block font-medium text-primary text-sm">
              Threshold
              <span className="ml-2 text-tertiary text-xs font-normal">
                signatures required per Safe tx
              </span>
            </label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={Math.max(1, validOwners.length)}
                value={threshold}
                onChange={e => {
                  const v = Number(e.target.value)
                  if (Number.isFinite(v)) setThreshold(Math.max(1, Math.floor(v)))
                }}
                className="w-24"
              />
              <span className="text-tertiary text-sm">
                of {validOwners.length || '—'} owner{validOwners.length === 1 ? '' : 's'}
              </span>
            </div>
            {validOwners.length > 0 && !thresholdValid && (
              <p className="text-red-400 text-xs">
                Threshold must be between 1 and {validOwners.length}.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="block font-medium text-primary text-sm">Predicted Safe Address</label>
            {isPredicting ? (
              <div className="flex items-center gap-2 text-tertiary text-xs">
                <Loader2 className="w-3 h-3 animate-spin" />
                Computing...
              </div>
            ) : predictedAddress ? (
              <div className="flex items-center gap-2 bg-elevated p-2 border border-subtle rounded-md">
                <span className="font-mono text-primary text-xs break-all">{predictedAddress}</span>
                <CopyButton value={predictedAddress} />
              </div>
            ) : (
              <p className="text-tertiary text-xs">
                Will appear once owners and threshold are valid.
              </p>
            )}
            <p className="text-tertiary text-xs">
              Deployment is deterministic (CREATE2): the deployed address will equal the predicted
              one.
            </p>
          </div>

          <Button
            type="button"
            onClick={handleDeploy}
            disabled={
              isDeploying ||
              !ownersComplete ||
              !thresholdValid ||
              !predictedAddress ||
              !walletClient
            }
            className="w-full text-black bg-accent-primary hover:bg-accent-primary/90"
          >
            {isDeploying ? (
              <>
                <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                Deploying Safe...
              </>
            ) : (
              'Deploy Safe'
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
