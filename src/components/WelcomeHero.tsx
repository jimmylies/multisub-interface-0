import { useState, useEffect, useRef } from 'react'
import { DelegationConstellation } from './constellation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { useContractAddresses } from '@/contexts/ContractAddressContext'
import { useRecentAddresses } from '@/hooks/useRecentAddresses'
import { usePublicClient } from 'wagmi'
import { isAddress } from 'viem'
import { GUARDIAN_ABI } from '@/lib/contracts'
import { cn } from '@/lib/utils'

interface WelcomeHeroProps {
  onNavigateAway?: () => void
}

export function WelcomeHero({ onNavigateAway }: WelcomeHeroProps = {}) {
  const { addresses, setGuardian } = useContractAddresses()
  const { recentAddresses, addAddress, removeAddress } = useRecentAddresses()
  const publicClient = usePublicClient()

  const [addressInput, setAddressInput] = useState('')
  const [error, setError] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [showRecent, setShowRecent] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const validationTimeoutRef = useRef<NodeJS.Timeout>()

  // Pré-remplir si l'adresse existe dans le context
  useEffect(() => {
    if (addresses.guardian) {
      setAddressInput(addresses.guardian)
    }
  }, [addresses.guardian])

  const validateAndSubmit = async (address: string) => {
    // Clear any existing timeout
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current)
    }

    // Trim whitespace
    const trimmedAddress = address.trim()

    // Empty input - clear error
    if (!trimmedAddress) {
      setError('')
      return
    }

    // Basic format validation
    if (!isAddress(trimmedAddress)) {
      setError('Invalid Ethereum address')
      return
    }

    // Contract verification
    setIsValidating(true)
    setError('')

    try {
      // Verify it's a valid Guardian contract by calling avatar()
      await publicClient?.readContract({
        address: trimmedAddress as `0x${string}`,
        abi: GUARDIAN_ABI,
        functionName: 'avatar',
      })

      // Success - auto-submit
      setGuardian(trimmedAddress as `0x${string}`)
      addAddress(trimmedAddress as `0x${string}`)
      setError('')

      // Notify parent to navigate away
      if (onNavigateAway) {
        onNavigateAway()
      }
    } catch (err) {
      setError('Not a valid Guardian contract')
    } finally {
      setIsValidating(false)
    }
  }

  const handleInputChange = (value: string) => {
    setAddressInput(value)
    setError('')

    // Clear existing timeout
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current)
    }

    // Debounce validation (500ms)
    validationTimeoutRef.current = setTimeout(() => {
      validateAndSubmit(value)
    }, 500)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    // Get pasted text and trim whitespace
    const pastedText = e.clipboardData.getData('text').trim()
    e.preventDefault()
    setAddressInput(pastedText)
    handleInputChange(pastedText)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && addressInput) {
      validateAndSubmit(addressInput)
    }
  }

  const handleSelectRecent = (address: `0x${string}`) => {
    setAddressInput(address)
    setShowRecent(false)
    validateAndSubmit(address)
  }

  const handleRemoveRecent = (e: React.MouseEvent, address: `0x${string}`) => {
    e.stopPropagation()
    removeAddress(address)
  }

  return (
    <section className="flex flex-col items-center px-4 py-4">
      {/* Header Content */}
      <div className="text-center animate-fade-in-up">
        {/* Title with gradient and text shadow */}
        <h1
          className="bg-clip-text bg-gradient-to-r from-accent-primary via-accent-primary to-accent-secondary dark:from-white dark:via-white dark:to-white/60 mb-4 text-display text-transparent"
          style={{
            textShadow: '0 0 40px var(--accent-primary-glow, rgba(18, 255, 128, 0.3))'
          }}
        >
          DeFi, Delegated.
        </h1>

        {/* Subtitle */}
        <p className="mx-auto max-w-lg text-secondary text-xl leading-relaxed">
          Manage sub-accounts with granular DeFi permissions.
          <br />
          <span className="text-tertiary">Safe security. Full control.</span>
        </p>
      </div>

      {/* Guardian Input */}
      <div
        className="mx-auto mt-8 w-full max-w-md animate-fade-in-up"
        style={{ animationDelay: '0.4s' }}
      >
        <div className="space-y-4 bg-elevated/80 backdrop-blur-lg p-6 border border-subtle rounded-xl">
          {/* Address Input */}
          <div>
            <label className="block mb-2 font-medium text-primary text-small">
              Guardian Address
            </label>
            <div className="flex items-center gap-2">
              <Input
                ref={inputRef}
                type="text"
                placeholder="0x..."
                value={addressInput}
                onChange={e => handleInputChange(e.target.value)}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                className={cn(
                  'flex-1 h-14 font-mono text-base',
                  error && 'border-error focus:ring-error-muted',
                  isValidating && 'border-accent-primary'
                )}
                disabled={isValidating}
              />
              <Button
                onClick={() => validateAndSubmit(addressInput)}
                disabled={isValidating || !addressInput.trim()}
                size="sm"
                className="p-0 w-10 h-10"
              >
                {isValidating ? (
                  <div className="border-2 border-black border-t-transparent rounded-full w-5 h-5 animate-spin" />
                ) : (
                  '✓'
                )}
              </Button>
            </div>
            {error && <p className="mt-2 text-error text-small">{error}</p>}
          </div>

          {/* Recent Addresses Dropdown */}
          {recentAddresses.length > 0 && (
            <div>
              <button
                onClick={() => setShowRecent(!showRecent)}
                className="flex items-center gap-2 mb-2 text-caption text-tertiary hover:text-secondary transition-colors"
              >
                <span className={cn('transition-transform', showRecent && 'rotate-180')}>▼</span>
                <span>Recent ({recentAddresses.length})</span>
              </button>

              {showRecent && (
                <div className="space-y-2 max-h-48 overflow-y-auto animate-fade-in">
                  {recentAddresses.map(addr => (
                    <button
                      key={addr}
                      onClick={() => handleSelectRecent(addr)}
                      className={cn(
                        'bg-elevated-2 p-3 border border-subtle rounded-lg w-full',
                        'hover:bg-elevated-3 hover:border-default transition-all',
                        'text-left font-mono text-small text-secondary',
                        'flex items-center justify-between group'
                      )}
                    >
                      <span>
                        {addr.slice(0, 10)}...{addr.slice(-8)}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <CopyButton value={addr} />
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={e => handleRemoveRecent(e, addr)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              handleRemoveRecent(e as any, addr)
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
              )}
            </div>
          )}
        </div>
      </div>

      {/* Constellation - Contained Area */}
      <div className="relative flex justify-center my-6 w-full max-w-4xl h-[500px]">
        <DelegationConstellation className="w-full h-full" />
      </div>

      {/* Feature pills with glass effect */}
      <div
        className="flex flex-wrap justify-center gap-3 animate-fade-in-up"
        style={{ animationDelay: '0.2s' }}
      >
        <FeaturePill icon="🔒">Safe Multisig</FeaturePill>
        <FeaturePill icon="⚡">Delegated Access</FeaturePill>
        <FeaturePill icon="🛡️">Granular Permissions</FeaturePill>
      </div>
    </section>
  )
}

function FeaturePill({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 bg-elevated/80 shadow-lg backdrop-blur-md px-4 py-2.5 border border-subtle rounded-full text-secondary text-small">
      <span>{icon}</span>
      <span>{children}</span>
    </div>
  )
}
