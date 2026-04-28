import { TransactionType, TRANSACTION_TYPES } from './transactionTypes'

// Query key prefixes for React Query useQuery hooks
export const QUERY_KEYS = {
  MANAGED_ACCOUNTS: 'managedAccounts',
  ALLOWED_ADDRESSES: 'allowedAddresses',
  ACQUIRED_BALANCES: 'acquiredBalances',
} as const

// Wagmi useReadContract function names
export const WAGMI_READ_FUNCTIONS = {
  HAS_ROLE: 'hasRole',
  GET_SUB_ACCOUNT_LIMITS: 'getSubAccountLimits',
  GET_SPENDING_ALLOWANCE: 'getSpendingAllowance',
  PAUSED: 'paused',
  ALLOWED_ADDRESSES: 'allowedAddresses',
} as const

// Map transaction types to query keys that need invalidation
export const INVALIDATION_MAP: Record<
  TransactionType,
  {
    reactQueryKeys: string[]
    wagmiFunctions: string[]
  }
> = {
  [TRANSACTION_TYPES.GRANT_ROLE]: {
    reactQueryKeys: [QUERY_KEYS.MANAGED_ACCOUNTS],
    wagmiFunctions: [WAGMI_READ_FUNCTIONS.HAS_ROLE],
  },
  [TRANSACTION_TYPES.REVOKE_ROLE]: {
    reactQueryKeys: [QUERY_KEYS.MANAGED_ACCOUNTS],
    wagmiFunctions: [WAGMI_READ_FUNCTIONS.HAS_ROLE],
  },
  [TRANSACTION_TYPES.SET_SUB_ACCOUNT_LIMITS]: {
    reactQueryKeys: [],
    wagmiFunctions: [
      WAGMI_READ_FUNCTIONS.GET_SUB_ACCOUNT_LIMITS,
      WAGMI_READ_FUNCTIONS.GET_SPENDING_ALLOWANCE,
    ],
  },
  [TRANSACTION_TYPES.SET_ALLOWED_ADDRESSES]: {
    reactQueryKeys: [QUERY_KEYS.ALLOWED_ADDRESSES],
    wagmiFunctions: [WAGMI_READ_FUNCTIONS.ALLOWED_ADDRESSES],
  },
  [TRANSACTION_TYPES.PAUSE]: {
    reactQueryKeys: [],
    wagmiFunctions: [WAGMI_READ_FUNCTIONS.PAUSED],
  },
  [TRANSACTION_TYPES.UNPAUSE]: {
    reactQueryKeys: [],
    wagmiFunctions: [WAGMI_READ_FUNCTIONS.PAUSED],
  },
  // enableModule changes the Safe's module list, which the dashboard banner
  // reads via Safe.isModuleEnabled. The banner already uses its own refetch()
  // on success, so nothing extra needs invalidating here.
  [TRANSACTION_TYPES.ENABLE_MODULE]: {
    reactQueryKeys: [],
    wagmiFunctions: [],
  },
}
