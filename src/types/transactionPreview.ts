// Transaction Preview Types

export type ChangeAction = 'add' | 'remove' | 'unchanged'

export interface RoleChange {
  roleId: number
  roleName: string
  description: string
  action: ChangeAction
  isActive?: boolean
}

export interface SpendingLimitChange {
  before: {
    maxSpendingBps: number
    maxSpendingUSD?: string
    mode?: 'bps' | 'usd'
    windowDuration: number
  } | null
  after: {
    maxSpendingBps: number
    maxSpendingUSD?: string
    mode?: 'bps' | 'usd'
    windowDuration: number
  }
}

export interface ContractChange {
  contractId: string
  contractName: string
  address: `0x${string}`
  description: string
  action: ChangeAction
  isActive?: boolean
}

export interface ProtocolChange {
  protocolId: string
  protocolName: string
  contracts: ContractChange[]
  isActive?: boolean
}

export type TransactionPreviewType =
  | 'add-subaccount'
  | 'update-roles'
  | 'update-limits'
  | 'update-protocols'

// Full state of a sub-account for complete visualization
export interface SubAccountFullState {
  roles: RoleChange[] // Always 2 roles (execute + transfer)
  spendingLimits: SpendingLimitChange | null
  protocols: ProtocolChange[] // All protocols with their current state
}

export interface TransactionPreviewData {
  type: TransactionPreviewType
  subAccountAddress: `0x${string}`
  roles?: RoleChange[]
  spendingLimits?: SpendingLimitChange
  protocols?: ProtocolChange[]
  // Complete sub-account state for contextual visualization
  fullState?: SubAccountFullState
}

export interface TransactionPreviewModalProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  previewData: TransactionPreviewData
  isPending?: boolean
}

export interface RadialNodePosition {
  id: string
  type: 'role' | 'spending' | 'protocol'
  angle: number
  radius: number
  size: number
}

// Color configuration for change states
export const CHANGE_COLORS = {
  add: {
    primary: 'var(--success)',
    bg: 'var(--success-muted)',
    border: 'rgba(18, 255, 128, 0.4)',
    glow: '0 0 20px rgba(18, 255, 128, 0.5)',
  },
  remove: {
    primary: 'var(--error)',
    bg: 'var(--error-muted)',
    border: 'rgba(255, 71, 87, 0.4)',
    glow: '0 0 20px rgba(255, 71, 87, 0.3)',
  },
  unchanged: {
    primary: 'var(--text-tertiary)',
    bg: 'var(--bg-elevated-2)',
    border: 'var(--border-subtle)',
    glow: 'none',
  },
} as const

// Layout configuration for radial schema
export const RADIAL_LAYOUT = {
  center: { x: 280, y: 200 },
  roles: {
    radius: 120,
    positions: [-60, 60], // degrees (top-right and bottom-right)
  },
  spending: {
    radius: 140,
    position: 15, // degrees (right, slightly below center)
  },
  protocols: {
    radius: 200,
    arc: [150, 210], // degrees (left arc, narrower)
  },
  containerSize: { width: 560, height: 420 },
} as const
