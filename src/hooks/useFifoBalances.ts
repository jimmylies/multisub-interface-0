import { useQuery } from '@tanstack/react-query'
import {
  createSubgraphClient,
  PROTOCOL_EXECUTION_QUERY,
  ProtocolExecution,
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

export function useFifoBalances(subAccountAddress?: `0x${string}`) {
  return useQuery({
    queryKey: ['fifoBalances', subAccountAddress],
    queryFn: async (): Promise<Map<string, TokenWithOldestTimestamp>> => {
      if (!subAccountAddress) return new Map()

      const client = createSubgraphClient()
      const currentTimestamp = Math.floor(Date.now() / 1000)
      // Extend 7 days for history to ensure we capture all events
      const fromTimestamp = currentTimestamp - WINDOW_DURATION - 7 * 24 * 60 * 60

      const data = await client.request<{ protocolExecutions: ProtocolExecution[] }>(
        PROTOCOL_EXECUTION_QUERY,
        {
          subAccount: subAccountAddress.toLowerCase(),
          fromTimestamp: fromTimestamp.toString(),
        }
      )

      // FIFO queues per token
      const queues = new Map<string, AcquiredBalanceQueue>()

      // Helper to get or create queue
      const getQueue = (token: string): AcquiredBalanceQueue => {
        const lower = token.toLowerCase()
        if (!queues.has(lower)) {
          queues.set(lower, [])
        }
        return queues.get(lower)!
      }

      // Process events chronologically (already sorted asc by blockTimestamp)
      for (const event of data.protocolExecutions) {
        const eventTimestamp = parseInt(event.blockTimestamp)
        const opType = event.opType

        // SWAP or DEPOSIT: Consume inputs, add outputs
        if (opType === OperationType.SWAP || opType === OperationType.DEPOSIT) {
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
              inheritedTimestamp = Math.min(...consumedEntries.map((e) => e.originalTimestamp))
            }

            addToQueue(queue, amountOut, inheritedTimestamp)
          }
        }

        // WITHDRAW/CLAIM: Add outputs as acquired (simplified - assumes all matched)
        // TODO: Implement deposit matching for accuracy
        if (opType === OperationType.WITHDRAW || opType === OperationType.CLAIM) {
          for (let i = 0; i < event.tokensOut.length; i++) {
            const tokenOut = event.tokensOut[i].toLowerCase()
            const amountOut = BigInt(event.amountsOut[i])
            if (amountOut <= 0n) continue

            const queue = getQueue(tokenOut)
            // For now, use event timestamp (should match to deposit for accuracy)
            addToQueue(queue, amountOut, eventTimestamp)
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
