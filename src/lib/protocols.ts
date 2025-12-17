// DeFi Protocol configurations for sub-account permissions

export interface ProtocolContract {
  id: string
  name: string
  address: `0x${string}`
  description: string
}

export interface Protocol {
  id: string
  name: string
  description: string
  contracts: ProtocolContract[]
}

// Uniswap Protocol Configuration (Sepolia)
export const UNISWAP_PROTOCOL: Protocol = {
  id: 'uniswap',
  name: 'Uniswap',
  description: 'Decentralized exchange protocol',
  contracts: [
    {
      id: 'uniswap-swap-router-v3',
      name: 'SwapRouter02 (V3)',
      address: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
      description: 'Uniswap V3 swap router for token swaps',
    },
    {
      id: 'uniswap-position-manager-v3',
      name: 'NonfungiblePositionManager (V3)',
      address: '0x1238536071E1c677A632429e3655c799b22cDA52',
      description: 'Manage Uniswap V3 liquidity positions',
    },
    {
      id: 'uniswap-universal-router',
      name: 'Universal Router',
      address: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
      description: 'Universal router for swaps and liquidity',
    },
    {
      id: 'uniswap-position-manager-v4',
      name: 'PositionManager (V4)',
      address: '0x429ba70129df741b2ca2a85bc3a2a3328e5c09b4',
      description: 'Manage Uniswap V4 liquidity positions',
    },
    {
      id: 'uniswap-universal-router-2',
      name: 'Universal Router 2',
      address: '0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b',
      description: 'Universal router for swaps and liquidity',
    },
  ],
}

// Aave Protocol Configuration (Sepolia)
export const AAVE_PROTOCOL: Protocol = {
  id: 'aave',
  name: 'Aave V3',
  description: 'Decentralized lending and borrowing protocol',
  contracts: [
    {
      id: 'aave-pool',
      name: 'Pool',
      address: '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951',
      description: 'Main Aave V3 lending pool',
    },
    {
      id: 'aave-rewards-controller',
      name: 'RewardsController',
      address: '0x8164Cc65827dcFe994AB23944CBC90e0aa80bFcb',
      description: 'Claim Aave protocol rewards',
    },
  ],
}

// Merkl Protocol Configuration (Sepolia)
export const MERKL_PROTOCOL: Protocol = {
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
}

// All available protocols
export const PROTOCOLS = [UNISWAP_PROTOCOL, AAVE_PROTOCOL, MERKL_PROTOCOL] as const

// Helper to get protocol by ID
export function getProtocolById(id: string): Protocol | undefined {
  return PROTOCOLS.find(p => p.id === id)
}

// Helper to get all contract addresses for a protocol
export function getProtocolContractAddresses(protocolId: string): `0x${string}`[] {
  const protocol = getProtocolById(protocolId)
  return protocol ? protocol.contracts.map(c => c.address) : []
}

// Helper to check if an address is a valid protocol contract
export function isValidProtocolContract(address: `0x${string}`): boolean {
  return PROTOCOLS.some(protocol =>
    protocol.contracts.some(contract => contract.address.toLowerCase() === address.toLowerCase())
  )
}
