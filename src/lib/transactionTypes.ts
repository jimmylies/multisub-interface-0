export const TRANSACTION_TYPES = {
  // Role management
  GRANT_ROLE: 'grantRole',
  REVOKE_ROLE: 'revokeRole',

  // Sub-account configuration
  SET_SUB_ACCOUNT_LIMITS: 'setSubAccountLimits',
  SET_ALLOWED_ADDRESSES: 'setAllowedAddresses',

  // Emergency controls
  PAUSE: 'pause',
  UNPAUSE: 'unpause',

  // Safe module management
  ENABLE_MODULE: 'enableModule',
} as const

export type TransactionType = (typeof TRANSACTION_TYPES)[keyof typeof TRANSACTION_TYPES]
