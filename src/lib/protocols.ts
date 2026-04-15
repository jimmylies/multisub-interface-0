// DeFi Protocol configurations for sub-account permissions

import type { NetworkName } from '@/lib/chains'

export interface ProtocolContract {
  id: string
  name: string
  address: `0x${string}`
  description: string
  additionalAddresses?: `0x${string}`[]
}

export interface Protocol {
  id: string
  name: string
  icon?: string
  description: string
  contracts: ProtocolContract[]
}

const currentNetwork = ((import.meta.env.VITE_NETWORK as NetworkName | undefined) ||
  'base') as NetworkName

const BASE_PROTOCOLS: Protocol[] = [
  {
    id: 'uniswap',
    name: 'Uniswap',
    description: 'Decentralized exchange protocol',
    contracts: [
      {
        id: 'uniswap-swap-router-v3',
        name: 'SwapRouter02 (V3)',
        address: '0x2626664c2603336E57B271c5C0b26F421741e481',
        description: 'Uniswap V3 swap router for token swaps',
      },
      {
        id: 'uniswap-position-manager-v3',
        name: 'NonfungiblePositionManager (V3)',
        address: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
        description: 'Manage Uniswap V3 liquidity positions',
      },
      {
        id: 'uniswap-universal-router',
        name: 'Universal Router',
        address: '0x6fF5693b99212Da76ad316178A184AB56D299b43',
        description: 'Universal router for swaps and liquidity',
      },
      {
        id: 'uniswap-position-manager-v4',
        name: 'PositionManager (V4)',
        address: '0x7C5f5A4bBd8fD63184577525326123B519429bDc',
        description: 'Manage Uniswap V4 liquidity positions',
      },
    ],
  },
  {
    id: 'aave',
    name: 'Aave V3',
    description: 'Decentralized lending and borrowing protocol',
    contracts: [
      {
        id: 'aave-pool',
        name: 'Pool',
        address: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
        description: 'Main Aave V3 lending pool',
      },
      {
        id: 'aave-rewards-controller',
        name: 'RewardsController',
        address: '0xf9cc4F0D883F1a1eb2c253bdb46c254Ca51E1F44',
        description: 'Claim Aave protocol rewards',
      },
    ],
  },
  {
    id: 'morpho',
    name: 'Morpho Blue',
    icon: '🦋',
    description: 'Morpho Blue isolated lending market actions',
    contracts: [
      {
        id: 'morpho-blue',
        name: 'Morpho Blue',
        address: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
        description: 'Core lending and borrowing market',
      },
      {
        id: 'morpho-bundler3',
        name: 'Bundler3',
        address: '0x6566194141eefa99Af43Bb5Aa71460Ca2Dc90245',
        description: 'Morpho Blue bundler for batched market actions',
      },
    ],
  },
  {
    id: 'merkl',
    name: 'Merkl',
    description: 'Merkl reward distribution protocol',
    contracts: [
      {
        id: 'merkl-distributor',
        name: 'Distributor',
        address: '0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae',
        description: 'Claim Merkl protocol rewards',
      },
    ],
  },
]

const BASE_SEPOLIA_PROTOCOLS: Protocol[] = [
  {
    id: 'uniswap',
    name: 'Uniswap',
    description: 'Decentralized exchange protocol',
    contracts: [
      {
        id: 'uniswap-swap-router-v3',
        name: 'SwapRouter02 (V3)',
        address: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',
        description: 'Uniswap V3 swap router for token swaps',
      },
      {
        id: 'uniswap-position-manager-v3',
        name: 'NonfungiblePositionManager (V3)',
        address: '0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2',
        description: 'Manage Uniswap V3 liquidity positions',
      },
      {
        id: 'uniswap-universal-router',
        name: 'Universal Router',
        address: '0x492E6456D9528771018DeB9E87ef7750EF184104',
        description: 'Universal router for swaps and liquidity',
      },
      {
        id: 'uniswap-position-manager-v4',
        name: 'PositionManager (V4)',
        address: '0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80',
        description: 'Manage Uniswap V4 liquidity positions',
      },
    ],
  },
  {
    id: 'aave',
    name: 'Aave V3',
    description: 'Decentralized lending and borrowing protocol',
    contracts: [
      {
        id: 'aave-pool',
        name: 'Pool',
        address: '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
        description: 'Main Aave V3 lending pool',
      },
      {
        id: 'aave-rewards-controller',
        name: 'RewardsController',
        address: '0x71B448405c803A3982aBa448133133D2DEAFBE5F',
        description: 'Claim Aave protocol rewards',
      },
    ],
  },
  {
    id: 'morpho',
    name: 'Morpho Blue',
    icon: '🦋',
    description: 'Morpho Blue isolated lending market actions',
    contracts: [
      {
        id: 'morpho-blue',
        name: 'Morpho Blue',
        address: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
        description: 'Core lending and borrowing market',
      },
      {
        id: 'morpho-bundler3',
        name: 'Bundler3',
        address: '0x6566194141eefa99Af43Bb5Aa71460Ca2Dc90245',
        description: 'Morpho Blue bundler for batched market actions',
      },
    ],
  },
  {
    id: 'merkl',
    name: 'Merkl',
    description: 'Merkl reward distribution protocol',
    contracts: [
      {
        id: 'merkl-distributor',
        name: 'Distributor',
        address: '0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae',
        description: 'Claim Merkl protocol rewards',
      },
    ],
  },
]

const PROTOCOLS_BY_NETWORK: Record<NetworkName, Protocol[]> = {
  sepolia: BASE_SEPOLIA_PROTOCOLS,
  mainnet: BASE_PROTOCOLS,
  base: BASE_PROTOCOLS,
  'base-sepolia': BASE_SEPOLIA_PROTOCOLS,
}

// All available protocols
export const PROTOCOLS = PROTOCOLS_BY_NETWORK[currentNetwork] ?? BASE_PROTOCOLS

// Helper to get protocol by ID
export function getProtocolById(id: string): Protocol | undefined {
  return PROTOCOLS.find(p => p.id === id)
}

// Helper to get all addresses for a contract (including additional addresses)
export function getContractAddresses(contract: ProtocolContract): `0x${string}`[] {
  return [contract.address, ...(contract.additionalAddresses || [])]
}

// Helper to get all contract addresses for a protocol
export function getProtocolContractAddresses(protocolId: string): `0x${string}`[] {
  const protocol = getProtocolById(protocolId)
  return protocol ? protocol.contracts.flatMap(getContractAddresses) : []
}

// Helper to check if an address is a valid protocol contract
export function isValidProtocolContract(address: `0x${string}`): boolean {
  const lowerAddr = address.toLowerCase()
  return PROTOCOLS.some(protocol =>
    protocol.contracts.some(contract =>
      getContractAddresses(contract).some(a => a.toLowerCase() === lowerAddr)
    )
  )
}
