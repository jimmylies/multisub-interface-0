// Per-chain deployment registry. Resolves factory / oracle / subgraph
// configuration by chainId so a single Vercel build can target either Base
// Sepolia or Base mainnet - or both, if all per-chain env vars are present.
//
// Resolution order for each field:
//   1. Per-chain env var, e.g. VITE_AGENT_VAULT_FACTORY_ADDRESS_BASE
//   2. Legacy single-chain env var (VITE_AGENT_VAULT_FACTORY_ADDRESS)
//   3. Baked-in default in this file (currently empty for all chains)
//
// Step (2) keeps the existing single-chain Vercel deploy working without any
// env var changes. Step (1) is what you set when running one deployment that
// serves both networks.

import type { Address } from 'viem'

export interface Deployment {
  agentVaultFactory?: Address
  oracle?: Address
  subgraphUrl?: string
}

function env(key: string): string | undefined {
  const value = (import.meta.env as Record<string, string | undefined>)[key]
  return value && value.trim() !== '' ? value : undefined
}

// Env var suffix per supported chain. Names match the NETWORK_MAP keys in
// lib/chains.ts upper-cased with '-' → '_'.
const CHAIN_SUFFIX: Record<number, string> = {
  1: 'MAINNET',
  11155111: 'SEPOLIA',
  8453: 'BASE',
  84532: 'BASE_SEPOLIA',
}

// Baked-in defaults - kept empty so deployments stay env-var driven and the
// repo doesn't carry stale contract addresses. Fill in when you want addresses
// shipped with the code (e.g. a known canonical mainnet factory).
const BAKED_DEPLOYMENTS: Partial<Record<number, Deployment>> = {}

export function getDeployment(chainId: number): Deployment {
  const suffix = CHAIN_SUFFIX[chainId]
  const baked = BAKED_DEPLOYMENTS[chainId] ?? {}

  const factory =
    (suffix && env(`VITE_AGENT_VAULT_FACTORY_ADDRESS_${suffix}`)) ||
    env('VITE_AGENT_VAULT_FACTORY_ADDRESS') ||
    baked.agentVaultFactory

  const oracle =
    (suffix && env(`VITE_ORACLE_ADDRESS_${suffix}`)) || env('VITE_ORACLE_ADDRESS') || baked.oracle

  const subgraphUrl =
    (suffix && env(`VITE_SUBGRAPH_URL_${suffix}`)) || env('VITE_SUBGRAPH_URL') || baked.subgraphUrl

  return {
    agentVaultFactory: factory as Address | undefined,
    oracle: oracle as Address | undefined,
    subgraphUrl,
  }
}
