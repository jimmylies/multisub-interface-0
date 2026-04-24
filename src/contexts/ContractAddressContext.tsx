import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { isAddress } from 'viem'

interface ContractAddresses {
  guardian: `0x${string}` | undefined
  safe: `0x${string}` | undefined
}

interface ContractAddressContextType {
  addresses: ContractAddresses
  setGuardian: (address: `0x${string}`) => void
  clearGuardian: () => void
  setSafe: (address: `0x${string}`) => void
  isConfigured: boolean
}

const ContractAddressContext = createContext<ContractAddressContextType | undefined>(undefined)

interface ContractAddressProviderProps {
  children: ReactNode
}

export function ContractAddressProvider({ children }: ContractAddressProviderProps) {
  const [addresses, setAddresses] = useState<ContractAddresses>({
    guardian: undefined,
    safe: undefined,
  })
  const { address: connectedAddress } = useAccount()
  const prevAddressRef = useRef(connectedAddress)

  // Parse URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const guardianParam = params.get('guardian')

    // Check localStorage for saved address
    const savedGuardian = localStorage.getItem('guardian')

    let guardian: `0x${string}` | undefined = undefined

    // Priority: URL params > localStorage
    if (guardianParam && isAddress(guardianParam)) {
      guardian = guardianParam
      localStorage.setItem('guardian', guardianParam)
    } else if (savedGuardian && isAddress(savedGuardian)) {
      guardian = savedGuardian
    }

    // Note: Safe is derived from Guardian via useSafeAddress() hook
    setAddresses({ guardian, safe: undefined })
  }, [])

  // Clear guardian when the connected wallet account changes so auto-discovery
  // can find the correct module for the new account.
  useEffect(() => {
    if (prevAddressRef.current && connectedAddress && prevAddressRef.current !== connectedAddress) {
      // Only clear if there's no explicit guardian in the URL
      const params = new URLSearchParams(window.location.search)
      if (!params.get('guardian')) {
        setAddresses({ guardian: undefined, safe: undefined })
        localStorage.removeItem('guardian')
      }
    }
    prevAddressRef.current = connectedAddress
  }, [connectedAddress])

  const setGuardian = (address: `0x${string}`) => {
    setAddresses(prev => ({ ...prev, guardian: address, safe: undefined }))
    localStorage.setItem('guardian', address)
    localStorage.removeItem('safe') // Clean up legacy storage

    // Update URL params (only guardian, remove safe if present)
    const params = new URLSearchParams(window.location.search)
    params.set('guardian', address)
    params.delete('safe') // Clean up legacy URL param
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`)
  }

  const clearGuardian = () => {
    setAddresses({ guardian: undefined, safe: undefined })
    localStorage.removeItem('guardian')
    localStorage.removeItem('safe')

    // Clear URL params
    const params = new URLSearchParams(window.location.search)
    params.delete('guardian')
    params.delete('safe')
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params}`
      : window.location.pathname
    window.history.replaceState({}, '', newUrl)
  }

  const setSafe = (address: `0x${string}`) => {
    // Safe is derived from Guardian - only update local state as cache
    setAddresses(prev => ({ ...prev, safe: address }))
  }

  const isConfigured = Boolean(addresses.guardian)

  return (
    <ContractAddressContext.Provider
      value={{
        addresses,
        setGuardian,
        clearGuardian,
        setSafe,
        isConfigured,
      }}
    >
      {children}
    </ContractAddressContext.Provider>
  )
}

export function useContractAddresses() {
  const context = useContext(ContractAddressContext)
  if (context === undefined) {
    throw new Error('useContractAddresses must be used within a ContractAddressProvider')
  }
  return context
}
