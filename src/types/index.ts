export interface SubAccount {
  address: `0x${string}`
  hasExecuteRole: boolean
  hasTransferRole: boolean
  hasRepayRole?: boolean
  addedAt?: number
}

export interface RoleEvent {
  member: `0x${string}`
  roleId: number
  timestamp: bigint
  txHash: string
  type: 'assigned' | 'revoked'
}

export interface PauseEvent {
  by: `0x${string}`
  timestamp: bigint
  txHash: string
  type: 'paused' | 'unpaused'
}

export interface AcquiredBalance {
  token: `0x${string}`
  tokenSymbol: string
  balance: bigint
}

export interface SpendingStatus {
  allowance: bigint // Remaining allowance in USD (18 decimals)
  maxAllowance: bigint // Maximum based on limit percentage
  percentUsed: number // Percentage used (0-100)
  lastUpdated: bigint
}

export interface OracleStatus {
  totalValueUSD: bigint // Total portfolio value in USD (18 decimals)
  lastUpdated: bigint // Unix timestamp of last update
  updateCount: bigint // Number of updates received
  isStale: boolean // Whether data is too old
}

export type OperationType = 'UNKNOWN' | 'SWAP' | 'DEPOSIT' | 'WITHDRAW' | 'CLAIM' | 'APPROVE'
