import { useReadContract } from 'wagmi'
import { zeroAddress, type Address } from 'viem'
import { AGENT_VAULT_FACTORY_ABI, MODULE_REGISTRY_ABI } from '@/lib/contracts'
import { selectedChain } from '@/lib/chains'
import { getDeployment } from '@/lib/deployments'

const FACTORY_ADDRESS = getDeployment(selectedChain.id).agentVaultFactory

/**
 * Resolves a Safe address to its registered Guardian module address
 * via Factory → Registry → getModuleForSafe.
 */
export function useGuardianForSafe(safeAddress: `0x${string}` | undefined) {
  const { data: registryAddress } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: AGENT_VAULT_FACTORY_ABI,
    functionName: 'registry',
    query: {
      enabled: Boolean(FACTORY_ADDRESS),
      staleTime: 5 * 60 * 1000,
    },
  })

  const {
    data: moduleAddress,
    isLoading,
    isError,
  } = useReadContract({
    address: registryAddress as Address | undefined,
    abi: MODULE_REGISTRY_ABI,
    functionName: 'getModuleForSafe',
    args: safeAddress ? [safeAddress] : undefined,
    query: {
      enabled: Boolean(registryAddress) && Boolean(safeAddress),
    },
  })

  const guardian =
    moduleAddress && moduleAddress !== zeroAddress ? (moduleAddress as `0x${string}`) : undefined

  return { guardian, isLoading, isError }
}
