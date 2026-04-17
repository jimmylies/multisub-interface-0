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
import { GUARDIAN_ABI } from '@/lib/contracts'
import { cn } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'

export function ContractSetup() {
  const { addresses, setGuardian, clearGuardian, isConfigured } = useContractAddresses()
  const { recentAddresses, addAddress, removeAddress } = useRecentAddresses()
  const { data: safeAddress } = useSafeAddress()
  const publicClient = usePublicClient()
  const { toast } = useToast()

  // Change modal state
  const [changeModalOpen, setChangeModalOpen] = useState(false)
  const [newAddressInput, setNewAddressInput] = useState('')
  const [changeError, setChangeError] = useState('')
  const [isChanging, setIsChanging] = useState(false)

  const handleChangeAddress = async () => {
    if (!isAddress(newAddressInput)) {
      setChangeError('Invalid Ethereum address')
      return
    }

    setIsChanging(true)
    setChangeError('')

    try {
      // Verify it's a valid Guardian contract by reading avatar
      await publicClient?.readContract({
        address: newAddressInput as `0x${string}`,
        abi: GUARDIAN_ABI,
        functionName: 'avatar',
      })

      // Update Guardian (Safe will be automatically fetched via useSafeAddress)
      setGuardian(newAddressInput as `0x${string}`)

      // Add to recent history
      addAddress(newAddressInput as `0x${string}`)

      // Close modal
      setChangeModalOpen(false)
      setNewAddressInput('')
    } catch {
      setChangeError('Failed to read contract. Is this a valid Guardian contract?')
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
    if (!addresses.guardian) return

    const params = new URLSearchParams()
    params.set('guardian', addresses.guardian)
    const url = `${window.location.origin}${window.location.pathname}?${params}`

    navigator.clipboard.writeText(url)
    toast.success('Link copied!')
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <div className="flex justify-between items-center">
            <CardTitle>Contract Config</CardTitle>
            <Badge variant={isConfigured ? 'success' : 'outline'}>
              {isConfigured ? 'Configured' : 'Not Configured'}
            </Badge>
          </div>
          {!isConfigured && (
            <CardDescription>
              Enter a deployed Guardian module address to open the Dashboard.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {!isConfigured || !addresses.guardian ? (
            <div className="space-y-4">
              <div>
                <label className="block mb-2 font-medium text-primary text-small">
                  Guardian Address
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

              <div className="bg-elevated-2 p-3 border border-subtle rounded-lg">
                <p className="text-xs text-tertiary">
                  The app will verify the address by reading `avatar()` before loading it.
                </p>
              </div>

              <Button
                onClick={handleChangeAddress}
                disabled={!newAddressInput || isChanging}
                className="w-full"
              >
                {isChanging ? 'Loading...' : 'Load Module'}
              </Button>

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
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-elevated-2 p-3 border border-subtle rounded-lg">
                <p className="mb-1 text-caption text-tertiary uppercase tracking-wider">
                  Guardian
                </p>
                <div className="flex items-center gap-1">
                  <p className="font-mono text-primary text-small break-all">
                    {addresses.guardian.slice(0, 10)}...{addresses.guardian.slice(-8)}
                  </p>
                  <CopyButton value={addresses.guardian} />
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
          )}
        </CardContent>
      </Card>

      <Dialog
        open={changeModalOpen}
        onOpenChange={setChangeModalOpen}
      >
        <DialogContent>
          <DialogClose onClose={() => setChangeModalOpen(false)} />
          <DialogHeader>
            <DialogTitle>Change Guardian</DialogTitle>
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
              variant="ghost"
              size="sm"
              onClick={() => {
                clearGuardian()
                setChangeModalOpen(false)
              }}
              className="mr-auto text-error hover:text-error"
            >
              Remove
            </Button>
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
