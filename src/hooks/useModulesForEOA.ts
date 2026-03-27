import { useAccount, usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { parseAbiItem, type Address } from 'viem'
import {
  createSubgraphClient,
  AGENT_VAULT_CREATED_QUERY,
  type AgentVaultCreatedEvent,
} from '@/lib/subgraph'

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

      // Primary: TheGraph
      try {
        const client = createSubgraphClient()
        const data = await client.request<{ agentVaultCreateds: AgentVaultCreatedEvent[] }>(
          AGENT_VAULT_CREATED_QUERY,
          { agentAddress: address.toLowerCase() }
        )
        if (data.agentVaultCreateds.length > 0) {
          return data.agentVaultCreateds.map(e => ({
            module: e.module as Address,
            safe: e.safe as Address,
            presetId: BigInt(e.presetId),
          }))
        }
      } catch {
        // Subgraph unavailable or entity not indexed — fall through to getLogs
      }

      // Fallback: getLogs
      if (!publicClient || !FACTORY_ADDRESS) return []
      const logs = await publicClient.getLogs({
        address: FACTORY_ADDRESS,
        event: parseAbiItem(
          'event AgentVaultCreated(address indexed safe, address indexed agentAddress, address module, uint256 presetId)'
        ),
        args: { agentAddress: address },
        fromBlock: 0n,
      })
      return logs.map(log => ({
        module: log.args.module as Address,
        safe: log.args.safe as Address,
        presetId: log.args.presetId ?? 0n,
      }))
    },
    enabled: Boolean(address),
    staleTime: 30_000,
  })
}
