// DeFi Protocol configurations for sub-account permissions

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
  description: string
  contracts: ProtocolContract[]
}

// Uniswap Protocol Configuration (Base)
export const UNISWAP_PROTOCOL: Protocol = {
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
}

// Aave Protocol Configuration (Base)
export const AAVE_PROTOCOL: Protocol = {
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
}

// Merkl Protocol Configuration (Base)
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
