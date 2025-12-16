import { useQuery } from '@tanstack/react-query'
import {
  createSubgraphClient,
  PROTOCOL_EXECUTION_QUERY,
  TRANSFER_EXECUTED_QUERY,
  ProtocolExecution,
  TransferExecuted,
} from '@/lib/subgraph'
import {
  type AcquiredBalanceQueue,
  addToQueue,
  consumeFromQueue,
  getOldestActiveTimestamp,
  calculateTotalBalance,
} from '@/lib/fifo'

const WINDOW_DURATION = 24 * 60 * 60 // 24 hours in seconds

const OperationType = {
  UNKNOWN: 0,
  SWAP: 1,
  DEPOSIT: 2,
  WITHDRAW: 3,
  CLAIM: 4,
  APPROVE: 5,
}

export interface TokenWithOldestTimestamp {
  token: string
  balance: bigint
  oldestTimestamp: number | null // null = no active batches
}

// Deposit record for matching withdrawals
interface DepositRecord {
  target: string
  tokenIn: string
  amountIn: bigint
  remainingAmount: bigint
  tokenOut: string
  amountOut: bigint
  remainingOutputAmount: bigint
  timestamp: number
  originalAcquisitionTimestamp: number
}

// Unified event type for chronological processing
type UnifiedEvent =
  | { type: 'protocol'; event: ProtocolExecution; timestamp: number; blockNumber: number }
  | { type: 'transfer'; event: TransferExecuted; timestamp: number; blockNumber: number }

export function useFifoBalances(subAccountAddress?: `0x${string}`) {
  return useQuery({
    queryKey: ['fifoBalances', subAccountAddress],
    queryFn: async (): Promise<Map<string, TokenWithOldestTimestamp>> => {
      if (!subAccountAddress) return new Map()

      const client = createSubgraphClient()
      const currentTimestamp = Math.floor(Date.now() / 1000)
      // Extend 7 days for history to ensure we capture all events
      const fromTimestamp = currentTimestamp - WINDOW_DURATION - 7 * 24 * 60 * 60

      // Query both event types in parallel
      const [protocolData, transferData] = await Promise.all([
        client.request<{ protocolExecutions: ProtocolExecution[] }>(PROTOCOL_EXECUTION_QUERY, {
          subAccount: subAccountAddress.toLowerCase(),
          fromTimestamp: fromTimestamp.toString(),
        }),
        client.request<{ transferExecuteds: TransferExecuted[] }>(TRANSFER_EXECUTED_QUERY, {
          subAccount: subAccountAddress.toLowerCase(),
          fromTimestamp: fromTimestamp.toString(),
        }),
      ])

      // FIFO queues per token
      const queues = new Map<string, AcquiredBalanceQueue>()

      // Deposit records for matching withdrawals
      const depositRecords: DepositRecord[] = []

      // Helper to get or create queue
      const getQueue = (token: string): AcquiredBalanceQueue => {
        const lower = token.toLowerCase()
        if (!queues.has(lower)) {
          queues.set(lower, [])
        }
        return queues.get(lower)!
      }

      // Merge into unified event list and sort chronologically
      const unifiedEvents: UnifiedEvent[] = [
        ...protocolData.protocolExecutions.map(e => ({
          type: 'protocol' as const,
          event: e,
          timestamp: parseInt(e.blockTimestamp),
          blockNumber: parseInt(e.blockNumber),
        })),
        ...transferData.transferExecuteds.map(e => ({
          type: 'transfer' as const,
          event: e,
          timestamp: parseInt(e.blockTimestamp),
          blockNumber: parseInt(e.blockNumber),
        })),
      ].sort((a, b) => {
        const timestampDiff = a.timestamp - b.timestamp
        if (timestampDiff !== 0) return timestampDiff
        // Same timestamp: sort by block number
        return a.blockNumber - b.blockNumber
      })

      // Process ALL events chronologically
      for (const unified of unifiedEvents) {
        if (unified.type === 'protocol') {
          const event = unified.event
          const eventTimestamp = unified.timestamp
          const opType = event.opType

          // SWAP: Consume inputs, add outputs with inherited timestamp
          if (opType === OperationType.SWAP) {
            const consumedEntries: { amount: bigint; originalTimestamp: number }[] = []

            // Consume input tokens (FIFO)
            for (let i = 0; i < event.tokensIn.length; i++) {
              const tokenIn = event.tokensIn[i].toLowerCase()
              const amountIn = BigInt(event.amountsIn[i])
              if (amountIn <= 0n) continue

              const queue = getQueue(tokenIn)
              const { consumed } = consumeFromQueue(queue, amountIn, eventTimestamp, WINDOW_DURATION)
              consumedEntries.push(...consumed)
            }

            // Add output tokens (acquired)
            for (let i = 0; i < event.tokensOut.length; i++) {
              const tokenOut = event.tokensOut[i].toLowerCase()
              const amountOut = BigInt(event.amountsOut[i])
              if (amountOut <= 0n) continue

              const queue = getQueue(tokenOut)

              // Inherit oldest timestamp from consumed inputs, or use event timestamp
              let inheritedTimestamp = eventTimestamp
              if (consumedEntries.length > 0) {
                inheritedTimestamp = Math.min(...consumedEntries.map(e => e.originalTimestamp))
              }

              addToQueue(queue, amountOut, inheritedTimestamp)
            }
          }

          // DEPOSIT: Consume inputs, track deposit record, add output tokens
          if (opType === OperationType.DEPOSIT) {
            const consumedEntries: { amount: bigint; originalTimestamp: number }[] = []

            // Consume input tokens (FIFO)
            for (let i = 0; i < event.tokensIn.length; i++) {
              const tokenIn = event.tokensIn[i].toLowerCase()
              const amountIn = BigInt(event.amountsIn[i])
              if (amountIn <= 0n) continue

              const queue = getQueue(tokenIn)
              const { consumed } = consumeFromQueue(queue, amountIn, eventTimestamp, WINDOW_DURATION)
              consumedEntries.push(...consumed)
            }

            // Find oldest original timestamp from consumed, or use event timestamp
            const originalAcquisitionTimestamp =
              consumedEntries.length > 0
                ? Math.min(...consumedEntries.map(e => e.originalTimestamp))
                : eventTimestamp

            // Add deposit record for each input/output pair
            for (let i = 0; i < event.tokensIn.length; i++) {
              const tokenIn = event.tokensIn[i].toLowerCase()
              const amountIn = BigInt(event.amountsIn[i])
              if (amountIn <= 0n) continue

              // Find corresponding output token (same index if available, otherwise first output)
              const tokenOut = (event.tokensOut[i] || event.tokensOut[0] || '').toLowerCase()
              const amountOut = BigInt(event.amountsOut[i] || event.amountsOut[0] || '0')

              depositRecords.push({
                target: event.target.toLowerCase(),
                tokenIn,
                amountIn,
                remainingAmount: amountIn,
                tokenOut,
                amountOut,
                remainingOutputAmount: amountOut,
                timestamp: eventTimestamp,
                originalAcquisitionTimestamp,
              })
            }

            // Add output tokens as acquired (inherit timestamp)
            for (let i = 0; i < event.tokensOut.length; i++) {
              const tokenOut = event.tokensOut[i].toLowerCase()
              const amountOut = BigInt(event.amountsOut[i])
              if (amountOut <= 0n) continue

              const queue = getQueue(tokenOut)
              addToQueue(queue, amountOut, originalAcquisitionTimestamp)
            }
          }

          // WITHDRAW: Match to deposits, inherit original timestamp
          if (opType === OperationType.WITHDRAW) {
            for (let i = 0; i < event.tokensOut.length; i++) {
              const tokenOut = event.tokensOut[i].toLowerCase()
              const amountOut = BigInt(event.amountsOut[i])
              if (amountOut <= 0n) continue

              let remainingToMatch = amountOut
              let matchedOriginalTimestamp: number | null = null
              const outputTokensToConsume: { token: string; amount: bigint }[] = []

              // Match to deposits (same target, same tokenIn)
              for (const deposit of depositRecords) {
                if (remainingToMatch <= 0n) break
                if (deposit.target !== event.target.toLowerCase()) continue
                if (deposit.tokenIn !== tokenOut) continue
                if (deposit.remainingAmount <= 0n) continue

                const consumeAmount =
                  remainingToMatch > deposit.remainingAmount
                    ? deposit.remainingAmount
                    : remainingToMatch

                deposit.remainingAmount -= consumeAmount
                remainingToMatch -= consumeAmount

                // Track output token to consume (aToken)
                if (deposit.tokenOut && deposit.remainingOutputAmount > 0n) {
                  const ratio = (consumeAmount * 10000n) / deposit.amountIn
                  const outputToConsume = (deposit.amountOut * ratio) / 10000n
                  const actualConsume =
                    outputToConsume > deposit.remainingOutputAmount
                      ? deposit.remainingOutputAmount
                      : outputToConsume

                  if (actualConsume > 0n) {
                    deposit.remainingOutputAmount -= actualConsume
                    outputTokensToConsume.push({ token: deposit.tokenOut, amount: actualConsume })
                  }
                }

                // Inherit original timestamp (not deposit timestamp!)
                if (
                  matchedOriginalTimestamp === null ||
                  deposit.originalAcquisitionTimestamp < matchedOriginalTimestamp
                ) {
                  matchedOriginalTimestamp = deposit.originalAcquisitionTimestamp
                }
              }

              // Consume deposit output tokens (aTokens) from queue
              for (const { token, amount } of outputTokensToConsume) {
                const queue = getQueue(token)
                consumeFromQueue(queue, amount, eventTimestamp, WINDOW_DURATION)
              }

              // Add matched amount with inherited timestamp
              const matchedAmount = amountOut - remainingToMatch
              if (matchedAmount > 0n && matchedOriginalTimestamp !== null) {
                const queue = getQueue(tokenOut)
                addToQueue(queue, matchedAmount, matchedOriginalTimestamp)
              }
              // Unmatched = NOT acquired (belongs to multisig)
            }
          }

          // CLAIM: Only acquired if subaccount has a deposit at this target
          if (opType === OperationType.CLAIM) {
            for (let i = 0; i < event.tokensOut.length; i++) {
              const tokenOut = event.tokensOut[i].toLowerCase()
              const amountOut = BigInt(event.amountsOut[i])
              if (amountOut <= 0n) continue

              // Only acquired if subaccount has a deposit at this target
              const hasMatchingDeposit = depositRecords.some(
                d => d.target === event.target.toLowerCase()
              )

              if (hasMatchingDeposit) {
                // Find oldest deposit timestamp for this target
                const oldestDepositTimestamp = depositRecords
                  .filter(d => d.target === event.target.toLowerCase())
                  .reduce(
                    (oldest, d) =>
                      d.originalAcquisitionTimestamp < oldest
                        ? d.originalAcquisitionTimestamp
                        : oldest,
                    eventTimestamp
                  )

                const queue = getQueue(tokenOut)
                addToQueue(queue, amountOut, oldestDepositTimestamp)
              }
              // No matching deposit = NOT acquired
            }
          }
        } else {
          // Transfer event - consumes tokens from queue
          const transfer = unified.event
          const tokenLower = transfer.token.toLowerCase()
          const amount = BigInt(transfer.amount)

          if (amount > 0n) {
            const queue = getQueue(tokenLower)
            consumeFromQueue(queue, amount, unified.timestamp, WINDOW_DURATION)
          }
        }
      }

      // Calculate results: oldest timestamp + current balance per token
      const results = new Map<string, TokenWithOldestTimestamp>()

      for (const [token, queue] of queues.entries()) {
        const balance = calculateTotalBalance(queue, currentTimestamp, WINDOW_DURATION)
        const oldestTimestamp = getOldestActiveTimestamp(queue, currentTimestamp, WINDOW_DURATION)

        if (balance > 0n) {
          results.set(token, {
            token,
            balance,
            oldestTimestamp,
          })
        }
      }

      return results
    },
    enabled: Boolean(subAccountAddress),
    refetchInterval: 30000, // 30s
    staleTime: 10000, // 10s
  })
}
