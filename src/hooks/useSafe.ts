import React from 'react'
import { useAccount, useReadContract, usePublicClient } from 'wagmi'
import { useContractAddresses } from '@/contexts/ContractAddressContext'
import { DEFI_INTERACTOR_ABI, SAFE_ABI, ROLES } from '@/lib/contracts'
import { useQuery } from '@tanstack/react-query'
import type { SubAccount } from '@/types'
import { AcquiredTokenWithTimestamp } from '@/lib/subgraph'
import { useFifoBalances } from './useFifoBalances'

/**
 * Hook to read the target Safe address from the DeFi Interactor contract
 */
export function useSafeAddress() {
  const { chainId } = useAccount()
  const { addresses } = useContractAddresses()

  return useReadContract({
    address: addresses.defiInteractor,
    abi: DEFI_INTERACTOR_ABI,
    functionName: 'avatar',
    chainId,
    query: {
      staleTime: 5 * 60 * 1000, // 5 minutes — avatar rarely changes
      gcTime: 10 * 60 * 1000,
    },
  })
}

/**
 * Hook to fetch the list of Safe owners
 */
export function useSafeOwners() {
  const { chainId } = useAccount()
  const { data: safeAddress } = useSafeAddress()

  return useReadContract({
    address: safeAddress,
    abi: SAFE_ABI,
    functionName: 'getOwners',
    query: {
      enabled: Boolean(safeAddress),
      staleTime: 5 * 60 * 1000, // 5 minutes — owners rarely change
      gcTime: 10 * 60 * 1000,
    },
    chainId,
  })
}

/**
 * Hook to read the on-chain cumulative USD spent by a sub-account in the current window.
 * Used in oracleless mode where spending is governed solely by this counter against maxSpendingUSD.
 */
export function useCumulativeSpent(subAccountAddress?: `0x${string}`) {
  const { addresses } = useContractAddresses()
  const { chainId } = useAccount()

  return useReadContract({
    address: addresses.defiInteractor,
    abi: DEFI_INTERACTOR_ABI,
    functionName: 'cumulativeSpent',
    args: subAccountAddress ? [subAccountAddress] : undefined,
    chainId,
    query: {
      enabled: Boolean(subAccountAddress && addresses.defiInteractor),
      staleTime: 30 * 1000, // 30s — changes after each spending op
      gcTime: 2 * 60 * 1000,
    },
  })
}

/**
 * Hook to read the start timestamp of a sub-account's current spending window.
 * Used to detect window expiry (when block.timestamp > windowStart + windowDuration).
 */
export function useWindowStart(subAccountAddress?: `0x${string}`) {
  const { addresses } = useContractAddresses()
  const { chainId } = useAccount()

  return useReadContract({
    address: addresses.defiInteractor,
    abi: DEFI_INTERACTOR_ABI,
    functionName: 'windowStart',
    args: subAccountAddress ? [subAccountAddress] : undefined,
    chainId,
    query: {
      enabled: Boolean(subAccountAddress && addresses.defiInteractor),
      staleTime: 30 * 1000,
      gcTime: 2 * 60 * 1000,
    },
  })
}

/**
 * Hook to check if the module is in oracleless mode (authorizedOracle == address(0)).
 * In oracleless mode: no oracle freshness checks, USD-only spending limits,
 * spending governed solely by on-chain cumulativeSpent.
 */
export function useIsOracleless() {
  const { chainId } = useAccount()
  const { addresses } = useContractAddresses()

  return useReadContract({
    address: addresses.defiInteractor,
    abi: DEFI_INTERACTOR_ABI,
    functionName: 'isOracleless',
    chainId,
    query: {
      enabled: Boolean(addresses.defiInteractor),
      staleTime: 5 * 60 * 1000, // 5 minutes — mode changes are rare admin actions
      gcTime: 10 * 60 * 1000,
    },
  })
}

/**
 * Hook to check if the contract is paused (emergency stop)
 */
export function useIsPaused() {
  const { chainId } = useAccount()
  const { addresses } = useContractAddresses()

  return useReadContract({
    address: addresses.defiInteractor,
    abi: DEFI_INTERACTOR_ABI,
    functionName: 'paused',
    chainId,
    query: {
      enabled: Boolean(addresses.defiInteractor),
      staleTime: 60 * 1000, // 1 minute — check pause status periodically
      gcTime: 5 * 60 * 1000,
    },
  })
}

/**
 * Hook to check if the connected address is a Safe owner (signer)
 */
export function useIsSafeOwner() {
  const { address: connectedAddress } = useAccount()
  const { data: safeAddress } = useSafeAddress()
  const { data: owners, isLoading } = useSafeOwners()

  const isSafeOwner =
    connectedAddress &&
    owners &&
    owners.some(owner => owner.toLowerCase() === connectedAddress.toLowerCase())

  return {
    isSafeOwner: Boolean(isSafeOwner),
    isLoading,
    safeAddress,
    connectedAddress,
    owners,
  }
}

/**
 * Hook to read sub-account limits for a given address
 */
export function useSubAccountLimits(subAccountAddress?: `0x${string}`) {
  const { addresses } = useContractAddresses()
  const { chainId } = useAccount()

  return useReadContract({
    address: addresses.defiInteractor,
    abi: DEFI_INTERACTOR_ABI,
    functionName: 'getSubAccountLimits',
    args: subAccountAddress ? [subAccountAddress] : undefined,
    chainId,
  })
}

/**
 * Hook to check if an address has a specific role
 */
export function useHasRole(member?: `0x${string}`, roleId?: number) {
  const { addresses } = useContractAddresses()
  const { chainId } = useAccount()

  return useReadContract({
    address: addresses.defiInteractor,
    abi: DEFI_INTERACTOR_ABI,
    functionName: 'hasRole',
    args: member && roleId !== undefined ? [member, roleId] : undefined,
    chainId,
  })
}

/**
 * Hook to check if a target address is allowed for a sub-account
 */
export function useIsAddressAllowed(subAccount?: `0x${string}`, target?: `0x${string}`) {
  const { addresses } = useContractAddresses()
  const { chainId } = useAccount()

  return useReadContract({
    address: addresses.defiInteractor,
    abi: DEFI_INTERACTOR_ABI,
    functionName: 'allowedAddresses',
    args: subAccount && target ? [subAccount, target] : undefined,
    chainId,
  })
}

/**
 * Hook to fetch all managed accounts from the contract using view functions
 * Returns a list of all addresses that have been granted roles
 */
export function useManagedAccounts() {
  const { addresses } = useContractAddresses()
  const publicClient = usePublicClient()
  const { chainId } = useAccount()

  return useQuery({
    queryKey: ['managedAccounts', addresses.defiInteractor],
    queryFn: async (): Promise<SubAccount[]> => {
      if (!publicClient || !addresses.defiInteractor) {
        return []
      }

      // Fetch accounts for each role using the contract's getter functions
      const [executeAccounts, transferAccounts] = await Promise.all([
        publicClient.readContract({
          address: addresses.defiInteractor,
          abi: DEFI_INTERACTOR_ABI,
          functionName: 'getSubaccountsByRole',
          args: [ROLES.DEFI_EXECUTE_ROLE],
        }) as Promise<`0x${string}`[]>,
        publicClient.readContract({
          address: addresses.defiInteractor,
          abi: DEFI_INTERACTOR_ABI,
          functionName: 'getSubaccountsByRole',
          args: [ROLES.DEFI_TRANSFER_ROLE],
        }) as Promise<`0x${string}`[]>,
      ])

      // Build a map of addresses and their roles
      const accountMap = new Map<`0x${string}`, { executeRole: boolean; transferRole: boolean }>()

      // Add execute role accounts
      for (const address of executeAccounts) {
        accountMap.set(address, {
          executeRole: true,
          transferRole: false,
        })
      }

      // Add transfer role accounts
      for (const address of transferAccounts) {
        const existing = accountMap.get(address)
        if (existing) {
          existing.transferRole = true
        } else {
          accountMap.set(address, {
            executeRole: false,
            transferRole: true,
          })
        }
      }

      // Convert map to array
      const accountList: SubAccount[] = Array.from(accountMap.entries()).map(
        ([address, roles]) => ({
          address,
          hasExecuteRole: roles.executeRole,
          hasTransferRole: roles.transferRole,
        })
      )

      return accountList
    },
    enabled: Boolean(addresses.defiInteractor && publicClient),
  })
}

/**
 * Hook to check multiple addresses against the allowedAddresses mapping
 * Takes a list of addresses to check and returns which ones are allowed
 */
export function useAllowedAddresses(
  subAccountAddress?: `0x${string}`,
  addressesToCheck?: `0x${string}`[]
) {
  const { addresses } = useContractAddresses()
  const publicClient = usePublicClient()

  return useQuery({
    queryKey: ['allowedAddresses', addresses.defiInteractor, subAccountAddress, addressesToCheck],
    queryFn: async (): Promise<Set<`0x${string}`>> => {
      if (!publicClient || !subAccountAddress || !addressesToCheck) {
        return new Set()
      }

      // Query the allowedAddresses mapping for each address
      const results = await Promise.all(
        addressesToCheck.map(async targetAddress => {
          try {
            const isAllowed = (await publicClient.readContract({
              address: addresses.defiInteractor,
              abi: DEFI_INTERACTOR_ABI as any,
              functionName: 'allowedAddresses',
              args: [subAccountAddress, targetAddress],
            } as any)) as boolean
            return { address: targetAddress, isAllowed }
          } catch {
            return { address: targetAddress, isAllowed: false }
          }
        })
      )

      // Build set of allowed addresses
      const allowed = new Set<`0x${string}`>()
      results.forEach(({ address, isAllowed }) => {
        if (isAllowed) {
          allowed.add(address)
        }
      })

      return allowed
    },
    enabled: Boolean(
      addresses.defiInteractor && publicClient && subAccountAddress && addressesToCheck
    ),
  })
}

/**
 * Hook to get the spending allowance for a sub-account (oracle-managed)
 * Returns remaining USD allowance (18 decimals)
 */
export function useSpendingAllowance(subAccountAddress?: `0x${string}`) {
  const { addresses } = useContractAddresses()
  const { chainId } = useAccount()

  return useReadContract({
    address: addresses.defiInteractor,
    abi: DEFI_INTERACTOR_ABI,
    functionName: 'getSpendingAllowance',
    args: subAccountAddress ? [subAccountAddress] : undefined,
    query: {
      enabled: Boolean(subAccountAddress && addresses.defiInteractor),
      staleTime: 30 * 1000, // 30s — changes after each spending op
      gcTime: 2 * 60 * 1000,
    },
    chainId,
  })
}

/**
 * Hook to get the acquired balance for a specific token and sub-account
 * Acquired tokens are FREE to use (don't cost spending allowance)
 */
export function useAcquiredBalance(
  subAccountAddress?: `0x${string}`,
  tokenAddress?: `0x${string}`
) {
  const { addresses } = useContractAddresses()
  const { chainId } = useAccount()

  return useReadContract({
    address: addresses.defiInteractor,
    abi: DEFI_INTERACTOR_ABI,
    functionName: 'getAcquiredBalance',
    args: subAccountAddress && tokenAddress ? [subAccountAddress, tokenAddress] : undefined,
    query: {
      enabled: Boolean(subAccountAddress && tokenAddress && addresses.defiInteractor),
    },
    chainId,
  })
}

/**
 * Hook to get Safe portfolio value and oracle status
 * Returns: [totalValueUSD, lastUpdated, updateCount]
 */
export function useSafeValue() {
  const { addresses } = useContractAddresses()
  const { chainId } = useAccount()

  return useReadContract({
    address: addresses.defiInteractor,
    abi: DEFI_INTERACTOR_ABI,
    functionName: 'getSafeValue',
    query: {
      enabled: Boolean(addresses.defiInteractor),
      staleTime: 30 * 1000, // 30s — oracle updates portfolio value periodically
      gcTime: 5 * 60 * 1000,
    },
    chainId,
  })
}

/**
 * Hook to check if the Safe value data is stale (oracle hasn't updated recently).
 * Computes staleness client-side from getSafeValue() lastUpdated timestamp.
 * @param maxAge Maximum age in seconds (default: 3600 = 1 hour)
 */
export function useIsValueStale(maxAge: number = 3600) {
  const { data: safeValue } = useSafeValue()

  const isStale = React.useMemo(() => {
    if (!safeValue) return undefined
    const [, lastUpdated] = safeValue
    if (lastUpdated === 0n) return true
    const now = BigInt(Math.floor(Date.now() / 1000))
    return now - lastUpdated > BigInt(maxAge)
  }, [safeValue, maxAge])

  return { data: isStale, isLoading: !safeValue }
}

/**
 * Hook to fetch acquired balances for multiple tokens
 * Returns a map of token address -> balance
 */
function useAcquiredBalancesFromContract(
  subAccountAddress?: `0x${string}`,
  tokenAddresses?: `0x${string}`[],
  options?: { enabled?: boolean }
) {
  const { addresses } = useContractAddresses()
  const publicClient = usePublicClient()

  return useQuery({
    queryKey: ['acquiredBalances', addresses.defiInteractor, subAccountAddress, tokenAddresses],
    queryFn: async (): Promise<Map<string, AcquiredTokenWithTimestamp>> => {
      if (!publicClient || !subAccountAddress || !tokenAddresses || tokenAddresses.length === 0) {
        return new Map()
      }

      // Fetch balance for each token
      const results = await Promise.all(
        tokenAddresses.map(async tokenAddress => {
          try {
            const balance = await publicClient.readContract({
              address: addresses.defiInteractor,
              abi: DEFI_INTERACTOR_ABI,
              functionName: 'getAcquiredBalance',
              args: [subAccountAddress, tokenAddress],
              code: '0x',
            })
            return { address: tokenAddress.toLowerCase(), balance }
          } catch {
            return { address: tokenAddress.toLowerCase(), balance: 0n }
          }
        })
      )

      // Build map of token -> AcquiredTokenWithTimestamp
      const balanceMap = new Map<string, AcquiredTokenWithTimestamp>()
      results.forEach(({ address, balance }) => {
        balanceMap.set(address, {
          token: address,
          balance,
          timestamp: 0, // No timestamp from contract
          lastBalance: balance, // Same as current balance for contract fallback
        })
      })

      return balanceMap
    },
    enabled:
      options?.enabled !== false &&
      Boolean(
        addresses.defiInteractor &&
        publicClient &&
        subAccountAddress &&
        tokenAddresses &&
        tokenAddresses.length > 0
      ),
  })
}

export function useAcquiredBalances(
  subAccountAddress?: `0x${string}`,
  tokenAddresses?: `0x${string}`[]
) {
  // Try FIFO reconstruction first
  const {
    data: fifoData,
    isLoading: fifoLoading,
    error: fifoError,
  } = useFifoBalances(subAccountAddress)

  // Fallback to contract if FIFO fails or empty
  const shouldUseContract =
    Boolean(fifoError) || (!fifoLoading && (!fifoData || fifoData.size === 0))

  const { data: contractData, isLoading: contractLoading } = useAcquiredBalancesFromContract(
    subAccountAddress,
    tokenAddresses || [],
    {
      enabled: shouldUseContract,
    }
  )

  // Convert FIFO data to expected format
  const convertedFifoData = React.useMemo(() => {
    if (!fifoData) return new Map()

    const converted = new Map()
    for (const [token, data] of fifoData.entries()) {
      converted.set(token, {
        token,
        balance: data.balance,
        timestamp: data.oldestTimestamp || 0,
        lastBalance: data.balance, // Not used anymore but keep for compatibility
      })
    }
    return converted
  }, [fifoData])

  // Return FIFO data if available, otherwise contract data
  if (fifoData && fifoData.size > 0) {
    return {
      data: convertedFifoData,
      isLoading: fifoLoading,
      dataSource: 'fifo' as const,
    }
  }

  return {
    data: contractData || new Map(),
    isLoading: contractLoading,
    dataSource: 'contract' as const,
  }
}
