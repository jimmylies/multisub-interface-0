import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CopyButton } from '@/components/ui/copy-button'
import { useContractAddresses } from '@/contexts/ContractAddressContext'
import { useRecentAddresses } from '@/hooks/useRecentAddresses'
import { useSafeAddress } from '@/hooks/useSafe'
import { usePublicClient } from 'wagmi'
import { isAddress } from 'viem'
import { DEFI_INTERACTOR_ABI } from '@/lib/contracts'
import { cn } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'

type OnboardingStep = 'welcome' | 'connect-wallet' | 'enter-contract'

export function ContractSetup() {
  const { addresses, setDefiInteractor, isConfigured } = useContractAddresses()
  const { recentAddresses, addAddress, removeAddress } = useRecentAddresses()
  const { data: safeAddress } = useSafeAddress()
  const publicClient = usePublicClient()
  const { toast } = useToast()

  const [defiInteractorInput, setDefiInteractorInput] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState<OnboardingStep>('welcome')

  // Change modal state
  const [changeModalOpen, setChangeModalOpen] = useState(false)
  const [newAddressInput, setNewAddressInput] = useState('')
  const [changeError, setChangeError] = useState('')
  const [isChanging, setIsChanging] = useState(false)

  const handleSubmit = () => {
    if (!isAddress(defiInteractorInput)) {
      setError('Invalid Ethereum address')
      return
    }

    setError('')
    setDefiInteractor(defiInteractorInput as `0x${string}`)
    addAddress(defiInteractorInput as `0x${string}`)
    setDefiInteractorInput('')
  }

  const handleChangeAddress = async () => {
    if (!isAddress(newAddressInput)) {
      setChangeError('Invalid Ethereum address')
      return
    }

    setIsChanging(true)
    setChangeError('')

    try {
      // Verify it's a valid DeFi Interactor by reading avatar
      await publicClient?.readContract({
        address: newAddressInput as `0x${string}`,
        abi: DEFI_INTERACTOR_ABI,
        functionName: 'avatar',
      })

      // Update DeFi Interactor (Safe will be automatically fetched via useSafeAddress)
      setDefiInteractor(newAddressInput as `0x${string}`)

      // Add to recent history
      addAddress(newAddressInput as `0x${string}`)

      // Close modal
      setChangeModalOpen(false)
      setNewAddressInput('')
    } catch {
      setChangeError('Failed to read contract. Is this a valid DeFi Interactor?')
    } finally {
      setIsChanging(false)
    }
  }

  const handleSelectRecent = (address: `0x${string}`) => {
    setNewAddressInput(address)
    setChangeError('')
  }

  const openChangeModal = () => {
    setNewAddressInput('')
    setChangeError('')
    setChangeModalOpen(true)
  }

  const copyShareableLink = () => {
    if (!addresses.defiInteractor) return

    const params = new URLSearchParams()
    params.set('defiInteractor', addresses.defiInteractor)
    const url = `${window.location.origin}${window.location.pathname}?${params}`

    navigator.clipboard.writeText(url)
    toast.success('Link copied!')
  }

  if (isConfigured && addresses.defiInteractor) {
    return (
      <>
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle>Contract Config</CardTitle>
              <Badge variant="success">Configured</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-elevated-2 p-3 border border-subtle rounded-lg">
                <p className="mb-1 text-caption text-tertiary uppercase tracking-wider">
                  DeFi Interactor
                </p>
                <div className="flex items-center gap-1">
                  <p className="font-mono text-primary text-small break-all">
                    {addresses.defiInteractor.slice(0, 10)}...{addresses.defiInteractor.slice(-8)}
                  </p>
                  <CopyButton value={addresses.defiInteractor} />
                </div>
              </div>

              {safeAddress && (
                <div className="bg-elevated-2 p-3 border border-subtle rounded-lg">
                  <p className="mb-1 text-caption text-tertiary uppercase tracking-wider">
                    Safe Address
                  </p>
                  <div className="flex items-center gap-1">
                    <p className="font-mono text-primary text-small break-all">
                      {safeAddress.slice(0, 10)}...{safeAddress.slice(-8)}
                    </p>
                    <CopyButton value={safeAddress} />
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={copyShareableLink}
                  className="flex-1"
                >
                  Share Link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openChangeModal}
                  className="flex-1"
                >
                  Change
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog
          open={changeModalOpen}
          onOpenChange={setChangeModalOpen}
        >
          <DialogContent>
            <DialogClose onClose={() => setChangeModalOpen(false)} />
            <DialogHeader>
              <DialogTitle>Change DeFi Interactor</DialogTitle>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <div>
                <label className="block mb-2 font-medium text-primary text-small">
                  New Address
                </label>
                <Input
                  type="text"
                  placeholder="0x..."
                  value={newAddressInput}
                  onChange={e => {
                    setNewAddressInput(e.target.value)
                    setChangeError('')
                  }}
                />
                {changeError && <p className="mt-2 text-error text-small">{changeError}</p>}
              </div>

              {recentAddresses.length > 0 && (
                <div>
                  <p className="mb-2 text-caption text-tertiary uppercase tracking-wider">
                    Recent Addresses
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {recentAddresses.map(addr => (
                      <button
                        key={addr}
                        onClick={() => handleSelectRecent(addr)}
                        className={cn(
                          'bg-elevated-2 p-3 border border-subtle rounded-lg w-full',
                          'hover:bg-elevated-3 hover:border-default transition-all',
                          'text-left font-mono text-small text-secondary',
                          'flex items-center justify-between',
                          newAddressInput.toLowerCase() === addr.toLowerCase() &&
                            'border-accent-primary bg-success-muted'
                        )}
                      >
                        <span>{addr.slice(0, 10)}...{addr.slice(-8)}</span>
                        <div className="flex items-center gap-1">
                          <CopyButton value={addr} />
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={e => {
                              e.stopPropagation()
                              removeAddress(addr)
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation()
                                removeAddress(addr)
                              }
                            }}
                            className="p-1 text-tertiary hover:text-error transition-colors cursor-pointer"
                            title="Remove from history"
                          >
                            ✕
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </DialogBody>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setChangeModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleChangeAddress}
                disabled={!newAddressInput || isChanging}
              >
                {isChanging ? 'Changing...' : 'Confirm'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <Card variant="featured">
      <CardHeader>
        <div className="flex justify-between items-center mb-2">
          <CardTitle>Getting Started</CardTitle>
          <div className="flex gap-2">
            {(['welcome', 'connect-wallet', 'enter-contract'] as const).map((s, idx) => (
              <div
                key={s}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                  s === step
                    ? 'bg-gradient-to-r from-accent-primary to-accent-secondary text-black'
                    : ['welcome', 'connect-wallet', 'enter-contract'].indexOf(step) > idx
                      ? 'bg-success text-black'
                      : 'bg-elevated-2 text-tertiary'
                }`}
              >
                {idx + 1}
              </div>
            ))}
          </div>
        </div>
        <CardDescription>
          {step === 'welcome' && 'Welcome to MultiSub'}
          {step === 'connect-wallet' && 'Step 1: Connect your wallet'}
          {step === 'enter-contract' && 'Step 2: Configure your contract'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {step === 'welcome' && (
            <>
              <div className="bg-gradient-to-br from-info-muted to-success-muted p-4 border border-info/20 rounded-xl">
                <h3 className="mb-2 text-h3 text-primary">Secure DeFi with Sub-Accounts</h3>
                <p className="text-secondary text-small">
                  MultiSub combines Safe multisig security with delegated permissions. Create
                  sub-accounts that can execute DeFi operations within strict limits while your Safe
                  retains full control.
                </p>
              </div>

              <div className="space-y-3">
                <FeatureItem
                  icon="🔒"
                  title="Enhanced Security"
                  description="Your Safe multisig remains in full control"
                />
                <FeatureItem
                  icon="⚡"
                  title="Delegated Permissions"
                  description="Grant limited DeFi access to sub-accounts"
                />
                <FeatureItem
                  icon="📊"
                  title="Spending Limits"
                  description="Set strict percentage-based limits and time windows"
                />
              </div>

              <Button
                onClick={() => setStep('connect-wallet')}
                className="w-full"
              >
                Get Started
              </Button>
            </>
          )}

          {step === 'connect-wallet' && (
            <>
              <div className="bg-info-muted p-4 border border-info/20 rounded-xl">
                <p className="mb-2 font-medium text-primary text-small">Connect Your Wallet</p>
                <p className="text-caption text-secondary">
                  Click the "Connect Wallet" button in the top right to connect your wallet. You'll
                  need to be a Safe owner to manage sub-accounts.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep('welcome')}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={() => setStep('enter-contract')}
                  className="flex-1"
                >
                  Next
                </Button>
              </div>
            </>
          )}

          {step === 'enter-contract' && (
            <>
              <div className="bg-info-muted p-4 border border-info/20 rounded-xl">
                <p className="mb-2 font-medium text-primary text-small">
                  Configure Contract Address
                </p>
                <p className="text-caption text-secondary">
                  Enter the DeFi Interactor contract address from your Safe deployment.
                </p>
              </div>

              <div>
                <label className="block mb-2 font-medium text-primary text-small">
                  DeFi Interactor Address
                </label>
                <Input
                  type="text"
                  placeholder="0x..."
                  value={defiInteractorInput}
                  onChange={e => {
                    setDefiInteractorInput(e.target.value)
                    setError('')
                  }}
                />
                {error && <p className="mt-2 text-error text-small">{error}</p>}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep('connect-wallet')}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!defiInteractorInput}
                  className="flex-1"
                >
                  Connect
                </Button>
              </div>

              <div className="pt-3 border-subtle border-t">
                <p className="text-caption text-tertiary">
                  You can also share a direct link:
                  <code className="bg-elevated-2 ml-1 px-1.5 py-0.5 rounded text-caption">
                    ?defiInteractor=0x...
                  </code>
                </p>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: string
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-shrink-0 justify-center items-center bg-success-muted rounded-lg w-8 h-8">
        <span>{icon}</span>
      </div>
      <div>
        <p className="font-medium text-primary text-small">{title}</p>
        <p className="text-caption text-tertiary">{description}</p>
      </div>
    </div>
  )
}
