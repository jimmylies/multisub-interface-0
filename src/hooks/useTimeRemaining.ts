import { useState, useEffect } from 'react'

const FREE_PERIOD_SECONDS = 24 * 60 * 60 // 24 heures

export interface TimeRemaining {
  seconds: number
  isExpired: boolean
  formatted: string // e.g., "21h 35m" or "35m" or "Expired"
}

/**
 * Hook to calculate and auto-refresh time remaining before free period expires
 * @param acquisitionTimestamp Unix timestamp in seconds when token was acquired
 * @returns TimeRemaining object with auto-updating countdown
 */
export function useTimeRemaining(acquisitionTimestamp: number): TimeRemaining {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  // Refresh every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000))
    }, 60000) // 60 seconds

    return () => clearInterval(interval)
  }, [])

  // Calculate time remaining
  const elapsed = now - acquisitionTimestamp
  const remaining = FREE_PERIOD_SECONDS - elapsed
  const isExpired = remaining <= 0

  // Format the time remaining
  let formatted: string
  if (isExpired) {
    formatted = 'Expired'
  } else {
    const hours = Math.floor(remaining / 3600)
    const minutes = Math.floor((remaining % 3600) / 60)

    if (hours > 0) {
      formatted = `${hours}h ${minutes}m`
    } else {
      formatted = `${minutes}m`
    }
  }

  return {
    seconds: Math.max(0, remaining),
    isExpired,
    formatted,
  }
}
