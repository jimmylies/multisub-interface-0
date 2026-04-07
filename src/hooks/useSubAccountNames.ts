import { useState, useEffect, useCallback } from 'react'
import { isAddress } from 'viem'

const STORAGE_KEY = 'multiclaw-account-names'
const MAX_NAME_LENGTH = 32

interface UseSubAccountNamesReturn {
  accountNames: Record<string, string>
  getAccountName: (address: `0x${string}`) => string | undefined
  setAccountName: (address: `0x${string}`, name: string) => void
  removeAccountName: (address: `0x${string}`) => void
}

export function useSubAccountNames(): UseSubAccountNamesReturn {
  const [accountNames, setAccountNames] = useState<Record<string, string>>({})

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, string>
        // Validate that keys are addresses and values are strings
        const validated: Record<string, string> = {}
        Object.entries(parsed).forEach(([address, name]) => {
          if (isAddress(address) && typeof name === 'string' && name.trim()) {
            validated[address.toLowerCase()] = name
          }
        })
        setAccountNames(validated)
      }
    } catch {
      // Ignore parse errors
    }
  }, [])

  // Save to localStorage whenever names change
  const saveToStorage = useCallback((names: Record<string, string>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(names))
    } catch (error) {
      console.error('Failed to save account names to localStorage:', error)
    }
  }, [])

  const getAccountName = useCallback(
    (address: `0x${string}`) => {
      return accountNames[address.toLowerCase()]
    },
    [accountNames]
  )

  const setAccountName = useCallback(
    (address: `0x${string}`, name: string) => {
      const trimmed = name.trim()

      // Validate name
      if (!trimmed) {
        // If empty, remove the name
        removeAccountName(address)
        return
      }

      // Truncate if too long
      const validName =
        trimmed.length > MAX_NAME_LENGTH ? trimmed.slice(0, MAX_NAME_LENGTH) : trimmed

      setAccountNames(prev => {
        const updated = {
          ...prev,
          [address.toLowerCase()]: validName,
        }
        saveToStorage(updated)
        return updated
      })
    },
    [saveToStorage]
  )

  const removeAccountName = useCallback(
    (address: `0x${string}`) => {
      setAccountNames(prev => {
        const updated = { ...prev }
        delete updated[address.toLowerCase()]
        saveToStorage(updated)
        return updated
      })
    },
    [saveToStorage]
  )

  return {
    accountNames,
    getAccountName,
    setAccountName,
    removeAccountName,
  }
}
