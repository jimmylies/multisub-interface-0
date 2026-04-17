import { useState, useEffect, useCallback } from 'react'
import { isAddress } from 'viem'

const STORAGE_KEY = 'recentGuardians'
const MAX_RECENT = 5

interface UseRecentAddressesReturn {
  recentAddresses: `0x${string}`[]
  addAddress: (address: `0x${string}`) => void
  removeAddress: (address: `0x${string}`) => void
  clearHistory: () => void
}

export function useRecentAddresses(): UseRecentAddressesReturn {
  const [recentAddresses, setRecentAddresses] = useState<`0x${string}`[]>([])

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as string[]
        // Validate addresses
        const validAddresses = parsed.filter(
          (addr): addr is `0x${string}` => isAddress(addr)
        )
        setRecentAddresses(validAddresses.slice(0, MAX_RECENT))
      }
    } catch {
      // Ignore parse errors
    }
  }, [])

  // Save to localStorage whenever addresses change
  const saveToStorage = useCallback((addresses: `0x${string}`[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses))
  }, [])

  const addAddress = useCallback(
    (address: `0x${string}`) => {
      setRecentAddresses((prev) => {
        // Remove if already exists (to move to front)
        const filtered = prev.filter(
          (addr) => addr.toLowerCase() !== address.toLowerCase()
        )
        // Add to front and limit
        const updated = [address, ...filtered].slice(0, MAX_RECENT)
        saveToStorage(updated)
        return updated
      })
    },
    [saveToStorage]
  )

  const removeAddress = useCallback(
    (address: `0x${string}`) => {
      setRecentAddresses((prev) => {
        const updated = prev.filter(
          (addr) => addr.toLowerCase() !== address.toLowerCase()
        )
        saveToStorage(updated)
        return updated
      })
    },
    [saveToStorage]
  )

  const clearHistory = useCallback(() => {
    setRecentAddresses([])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return {
    recentAddresses,
    addAddress,
    removeAddress,
    clearHistory,
  }
}
