import { z } from 'zod'

// ============ Base Schemas ============

/**
 * Ethereum address validation (0x + 40 hex chars)
 */
export const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address')
  .transform((val) => val.toLowerCase() as `0x${string}`)

/**
 * Transaction hash validation (0x + 64 hex chars)
 */
export const txHashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash')

/**
 * Bytes4 selector (0x + 8 hex chars)
 */
export const bytes4Schema = z.string().regex(/^0x[a-fA-F0-9]{8}$/, 'Invalid bytes4')

/**
 * Percentage validation (0-100)
 */
export const percentageSchema = z.number().min(0).max(100)

/**
 * Basis points validation (0-10000 = 0-100%)
 */
export const bpsSchema = z.number().int().min(0).max(10000)

/**
 * Bigint from string (for form inputs)
 */
export const bigintSchema = z
  .string()
  .regex(/^\d+$/, 'Must be a positive integer')
  .transform((val) => BigInt(val))

/**
 * Positive bigint (greater than 0)
 */
export const positiveBigintSchema = bigintSchema.refine((val) => val > 0n, {
  message: 'Must be greater than 0',
})

/**
 * Token amount with decimals (e.g., "1.5" with 18 decimals -> bigint)
 */
export function tokenAmountSchema(decimals: number = 18) {
  return z
    .string()
    .regex(/^\d+\.?\d*$/, 'Invalid amount')
    .transform((val) => {
      const [whole, fraction = ''] = val.split('.')
      const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals)
      return BigInt(whole + paddedFraction)
    })
}

// ============ Contract Setup Schemas ============

/**
 * Guardian address input
 */
export const guardianInputSchema = z.object({
  address: addressSchema,
})

/**
 * Safe address input
 */
export const safeAddressInputSchema = z.object({
  safeAddress: addressSchema,
})

// ============ Sub-Account Schemas ============

/**
 * Sub-account creation/edit form
 */
export const subAccountFormSchema = z.object({
  address: addressSchema,
  maxSpendingBps: bpsSchema,
  windowDuration: z.number().int().min(3600).max(86400 * 30), // 1 hour to 30 days
  hasExecuteRole: z.boolean(),
  hasTransferRole: z.boolean(),
  allowedAddresses: z.array(addressSchema).optional(),
})

/**
 * Sub-account limits configuration
 */
export const subAccountLimitsSchema = z.object({
  maxSpendingBps: bpsSchema,
  windowDuration: z.number().int().positive(),
})

// ============ Transaction Schemas ============

/**
 * Token transfer form
 */
export const transferFormSchema = z.object({
  token: addressSchema,
  recipient: addressSchema,
  amount: z.string().min(1, 'Amount is required'),
})

/**
 * Protocol execution form
 */
export const executeFormSchema = z.object({
  target: addressSchema,
  data: z.string().regex(/^0x[a-fA-F0-9]*$/, 'Invalid calldata'),
})

// ============ Subgraph Response Schemas ============

/**
 * Protocol execution from subgraph
 */
export const protocolExecutionSchema = z.object({
  id: z.string(),
  blockNumber: z.string(),
  blockTimestamp: z.string(),
  transactionHash: txHashSchema,
  subAccount: addressSchema,
  target: addressSchema,
  opType: z.string(),
  tokensIn: z.array(addressSchema),
  amountsIn: z.array(z.string()),
  tokensOut: z.array(addressSchema),
  amountsOut: z.array(z.string()),
  spendingCost: z.string(),
})

/**
 * Transfer executed from subgraph
 */
export const transferExecutedSchema = z.object({
  id: z.string(),
  blockNumber: z.string(),
  blockTimestamp: z.string(),
  transactionHash: txHashSchema,
  subAccount: addressSchema,
  token: addressSchema,
  recipient: addressSchema,
  amount: z.string(),
  spendingCost: z.string(),
})

// ============ Type Exports ============

export type Address = z.infer<typeof addressSchema>
export type SubAccountForm = z.infer<typeof subAccountFormSchema>
export type SubAccountLimits = z.infer<typeof subAccountLimitsSchema>
export type TransferForm = z.infer<typeof transferFormSchema>
export type ExecuteForm = z.infer<typeof executeFormSchema>
export type ProtocolExecution = z.infer<typeof protocolExecutionSchema>
export type TransferExecuted = z.infer<typeof transferExecutedSchema>

// ============ Validation Helpers ============

/**
 * Validate and parse an Ethereum address
 */
export function parseAddress(input: string): `0x${string}` | null {
  const result = addressSchema.safeParse(input)
  return result.success ? result.data : null
}

/**
 * Check if a string is a valid Ethereum address
 */
export function isValidAddress(input: string): boolean {
  return addressSchema.safeParse(input).success
}

/**
 * Check if a string is a valid transaction hash
 */
export function isValidTxHash(input: string): boolean {
  return txHashSchema.safeParse(input).success
}
