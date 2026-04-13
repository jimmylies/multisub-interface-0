import { useAccount, usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { parseAbiItem, type Address } from 'viem'
import {
  createSubgraphClient,
  AGENT_VAULT_CREATED_QUERY,
  type AgentVaultCreatedEvent,
} from '@/lib/subgraph'
import { AGENT_VAULT_FACTORY_ABI, DEFI_INTERACTOR_ABI, MODULE_REGISTRY_ABI, SAFE_ABI } from '@/lib/contracts'

const FACTORY_ADDRESS = import.meta.env.VITE_AGENT_VAULT_FACTORY_ADDRESS as Address | undefined

export interface DeployedModule {
  module: Address
  safe: Address
  presetId: bigint
}

/**
 * Fetches all modules associated with the connected EOA by querying
 * AgentVaultCreated events (primary: TheGraph, fallback: getLogs).
 */
export function useModulesForEOA() {
  const { address } = useAccount()
  const publicClient = usePublicClient()

  return useQuery({
    queryKey: ['modulesForEOA', address, publicClient?.chain?.id],
    queryFn: async (): Promise<DeployedModule[]> => {
      if (!address) return []
      const discovered = new Map<string, DeployedModule>()

      const addModules = (modules: DeployedModule[]) => {
        modules.forEach(module => {
          discovered.set(module.module.toLowerCase(), module)
        })
      }

      // Primary: TheGraph
      try {
        const client = createSubgraphClient()
        const data = await client.request<{ agentVaultCreateds: AgentVaultCreatedEvent[] }>(
          AGENT_VAULT_CREATED_QUERY,
          { agentAddress: address.toLowerCase() }
        )
        if (data.agentVaultCreateds.length > 0) {
          addModules(data.agentVaultCreateds.map(e => ({
            module: e.module as Address,
            safe: e.safe as Address,
            presetId: BigInt(e.presetId),
          })))
        }
      } catch {
        // Subgraph unavailable or entity not indexed — fall through to getLogs
      }

      // Fallback: getLogs
      if (publicClient && FACTORY_ADDRESS) {
        const logs = await publicClient.getLogs({
          address: FACTORY_ADDRESS,
          event: parseAbiItem(
            'event AgentVaultCreated(address indexed safe, address indexed agentAddress, address module, uint256 presetId)'
          ),
          args: { agentAddress: address },
          fromBlock: 0n,
        })
        addModules(
          logs.map(log => ({
            module: log.args.module as Address,
            safe: log.args.safe as Address,
            presetId: log.args.presetId ?? 0n,
          }))
        )
      }

      // Also discover modules for Safes where the connected address is an owner/signer.
      if (publicClient && FACTORY_ADDRESS) {
        try {
          const registryAddress = await publicClient.readContract({
            address: FACTORY_ADDRESS,
            abi: AGENT_VAULT_FACTORY_ABI,
            functionName: 'registry',
          })

          const activeModules = await publicClient.readContract({
            address: registryAddress,
            abi: MODULE_REGISTRY_ABI,
            functionName: 'getActiveModules',
          })

          const ownerChecks = await Promise.all(
            (activeModules as Address[]).map(async module => {
              try {
                const safe = await publicClient.readContract({
                  address: module,
                  abi: DEFI_INTERACTOR_ABI,
                  functionName: 'avatar',
                })

                const owners = await publicClient.readContract({
                  address: safe,
                  abi: SAFE_ABI,
                  functionName: 'getOwners',
                })

                const isOwner = (owners as Address[]).some(
                  owner => owner.toLowerCase() === address.toLowerCase()
                )

                if (!isOwner) return null

                return {
                  module,
                  safe: safe as Address,
                  presetId: 0n,
                } satisfies DeployedModule
              } catch {
                return null
              }
            })
          )

          addModules(ownerChecks.filter((module): module is DeployedModule => module !== null))
        } catch {
          // Registry or Safe owner lookup unavailable — ignore and return whatever we already found
        }
      }

      return Array.from(discovered.values())
    },
    enabled: Boolean(address),
    staleTime: 30_000,
  })
}
