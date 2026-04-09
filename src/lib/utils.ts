import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format bigint USD value to readable string
 * @param value - The value in smallest units (e.g., with 18 decimals)
 * @param decimals - Number of decimals (default 18)
 * @returns Formatted USD string (e.g., "1,234.56")
 */
export function formatUSD(value: bigint, decimals: number = 18): string {
  const formatted = Number(value) / 10 ** decimals
  return formatted.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Format bigint token amount to readable string
 * @param value - The token amount in smallest units
 * @param decimals - Number of decimals (default 18)
 * @returns Formatted token amount (e.g., "1,234.567890")
 */
export function formatTokenAmount(value: bigint, decimals: number = 18): string {
  const formatted = Number(value) / 10 ** decimals
  return formatted.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  })
}

/**
 * Format basis points to percentage string
 * @param bps - Basis points (e.g., 500 = 5%)
 * @returns Formatted percentage (e.g., "5.00%")
 */
export function formatBps(bps: bigint | number): string {
  const numBps = typeof bps === 'bigint' ? Number(bps) : bps
  return (numBps / 100).toFixed(2) + '%'
}

/**
 * Calculate time ago from timestamp using dayjs
 * @param timestamp - Unix timestamp (in seconds as bigint)
 * @returns Human-readable time ago string (e.g., "5 minutes ago", "2 hours ago")
 */
export function formatTimeAgo(timestamp: bigint): string {
  if (timestamp === 0n) return 'Never updated'
  return dayjs.unix(Number(timestamp)).fromNow()
}

/**
 * Format duration in seconds to human-readable string
 * @param seconds - Duration in seconds
 * @returns Formatted duration (e.g., "24h", "7d 12h")
 */
export function formatDuration(seconds: bigint | number): string {
  const numSeconds = typeof seconds === 'bigint' ? Number(seconds) : seconds

  const days = Math.floor(numSeconds / 86400)
  const hours = Math.floor((numSeconds % 86400) / 3600)
  const mins = Math.floor((numSeconds % 3600) / 60)

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  }
  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  }
  return `${mins}m`
}
