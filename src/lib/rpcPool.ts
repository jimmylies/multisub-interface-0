import { createTransport, http, type Transport } from 'viem'

// JSON-RPC methods that must pin to the primary (Alchemy) endpoint.
// - Writes: a public RPC retry can silently double-submit a tx.
// - Fee / nonce reads: must observe the same mempool state as the node we
//   submit to, else the wallet builds a tx against stale gas / nonce.
const ALCHEMY_ONLY_METHODS = new Set([
  'eth_sendRawTransaction',
  'eth_sendTransaction',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_getTransactionCount',
  'eth_feeHistory',
])

const STALENESS_THRESHOLD_BLOCKS = 4n
const HEALTH_CHECK_INTERVAL_MS = 15_000
const HEALTH_CHECK_TIMEOUT_MS = 3_000
const HTTP_BATCH_WAIT_MS = 16

// Curated public Base mainnet pool. Chosen for sub-second latency and write
// rejection tolerance (we only fan out reads). Confirm liveness at
// https://chainlist.org/chain/8453 if endpoints start failing.
const DEFAULT_BASE_PUBLIC_POOL = [
  'https://base.llamarpc.com',
  'https://base-rpc.publicnode.com',
  'https://base.rpc.blxrbdn.com',
  'https://developer-access-mainnet.base.org',
  'https://base.public.blockpi.network/v1/rpc/public',
  'https://base-mainnet.public.blastapi.io',
]

const DEFAULT_BASE_SEPOLIA_PUBLIC_POOL = [
  'https://sepolia.base.org',
  'https://base-sepolia-rpc.publicnode.com',
  'https://base-sepolia.public.blastapi.io',
]

export type PoolEndpointStatus = {
  url: string
  isPrimary: boolean
  healthy: boolean
  lastHeight: bigint | null
  lastLatencyMs: number | null
  lastError: string | null
  consecutiveFailures: number
}

type EndpointEntry = {
  url: string
  isPrimary: boolean
  client: ReturnType<Transport>
  status: PoolEndpointStatus
}

type BuildPoolOptions = {
  primaryUrl?: string
  publicUrls?: string[]
  extraFallbacks?: string[]
  poolKey: string
}

function parseExtraFallbacks(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split('|')
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

function dedupe(urls: string[]): string[] {
  return Array.from(new Set(urls))
}

function buildPool({
  primaryUrl,
  publicUrls,
  extraFallbacks,
  poolKey,
}: BuildPoolOptions): Transport {
  return ({ chain, retryCount, timeout }) => {
    const entries: EndpointEntry[] = []

    const addEntry = (url: string, isPrimary: boolean) => {
      const transport = http(url, {
        batch: { wait: HTTP_BATCH_WAIT_MS },
        retryCount: 0, // pool handles retry across endpoints
        timeout,
      })
      const client = transport({ chain, retryCount: 0, timeout })
      entries.push({
        url,
        isPrimary,
        client,
        status: {
          url,
          isPrimary,
          healthy: isPrimary, // primary is trusted until proven otherwise
          lastHeight: null,
          lastLatencyMs: null,
          lastError: null,
          consecutiveFailures: 0,
        },
      })
    }

    if (primaryUrl) addEntry(primaryUrl, true)
    for (const url of dedupe([...(publicUrls ?? []), ...(extraFallbacks ?? [])])) {
      if (url === primaryUrl) continue
      addEntry(url, false)
    }

    if (entries.length === 0) {
      throw new Error(`[rpcPool:${poolKey}] no endpoints configured`)
    }

    // Round-robin index, shared across requests. Each read picks the next
    // healthy endpoint; failures cascade to subsequent endpoints in order.
    let rrIndex = 0

    // Periodic block-height health check. Drops endpoints that are >4 blocks
    // behind the leader so the spending bar never reads visibly stale state.
    const runHealthCheck = async () => {
      const results = await Promise.all(
        entries.map(async entry => {
          const start = performance.now()
          try {
            const heightHex = await Promise.race([
              entry.client.request({ method: 'eth_blockNumber' } as never),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('health check timeout')), HEALTH_CHECK_TIMEOUT_MS)
              ),
            ])
            const height = BigInt(heightHex as string)
            entry.status.lastHeight = height
            entry.status.lastLatencyMs = Math.round(performance.now() - start)
            entry.status.lastError = null
            entry.status.consecutiveFailures = 0
            return height
          } catch (err) {
            entry.status.lastError = err instanceof Error ? err.message : String(err)
            entry.status.consecutiveFailures += 1
            return null
          }
        })
      )

      const seen = results.filter((h): h is bigint => h !== null)
      if (seen.length === 0) return
      const max = seen.reduce((a, b) => (a > b ? a : b), 0n)
      for (const entry of entries) {
        if (entry.status.lastHeight === null) {
          entry.status.healthy = entry.status.consecutiveFailures < 3
          continue
        }
        const lag = max - entry.status.lastHeight
        entry.status.healthy = lag <= STALENESS_THRESHOLD_BLOCKS
      }
    }

    // Run immediately so the first request has fresh data, then on interval.
    // Errors here are swallowed — degraded health is reflected in status.
    void runHealthCheck()
    if (typeof window !== 'undefined') {
      setInterval(() => {
        void runHealthCheck()
      }, HEALTH_CHECK_INTERVAL_MS)
    }

    const getReadPool = (): EndpointEntry[] => {
      const healthy = entries.filter(e => e.status.healthy)
      // If everything is unhealthy, fall back to the full list rather than
      // 503'ing the UI. A degraded read beats no read.
      return healthy.length > 0 ? healthy : entries
    }

    const primaryEntry = entries.find(e => e.isPrimary) ?? entries[0]

    // Expose pool status as a global debug hook for in-browser inspection:
    //   window.__rpcPoolStatus()
    if (typeof globalThis !== 'undefined') {
      const g = globalThis as unknown as Record<string, unknown>
      const existing = g.__rpcPoolStatus as
        | ((key?: string) => Record<string, PoolEndpointStatus[]>)
        | undefined
      const registry: Record<string, () => PoolEndpointStatus[]> =
        (g.__rpcPoolRegistry as Record<string, () => PoolEndpointStatus[]>) ?? {}
      registry[poolKey] = () => entries.map(e => ({ ...e.status }))
      g.__rpcPoolRegistry = registry
      if (!existing) {
        g.__rpcPoolStatus = (key?: string) => {
          const reg = g.__rpcPoolRegistry as Record<string, () => PoolEndpointStatus[]>
          if (key) return { [key]: reg[key]?.() ?? [] }
          return Object.fromEntries(Object.entries(reg).map(([k, fn]) => [k, fn()]))
        }
      }
    }

    const request = async ({ method, params }: { method: string; params?: unknown }) => {
      if (ALCHEMY_ONLY_METHODS.has(method)) {
        return primaryEntry.client.request({ method, params } as never)
      }

      const pool = getReadPool()
      const startIdx = rrIndex++ % pool.length
      const maxAttempts = Math.min(pool.length, 3)
      let lastErr: unknown = null
      for (let i = 0; i < maxAttempts; i++) {
        const entry = pool[(startIdx + i) % pool.length]
        try {
          return await entry.client.request({ method, params } as never)
        } catch (err) {
          lastErr = err
          entry.status.lastError = err instanceof Error ? err.message : String(err)
          entry.status.consecutiveFailures += 1
        }
      }
      throw lastErr ?? new Error(`[rpcPool:${poolKey}] all endpoints failed for ${method}`)
    }

    return createTransport({
      key: `multiclaw-pool-${poolKey}`,
      name: `MultiClaw RPC pool (${poolKey})`,
      type: 'multiclawPool',
      request: request as never,
      retryCount,
      timeout,
    })
  }
}

export function buildBaseTransport(): Transport {
  const primary = import.meta.env.VITE_RPC_URL_BASE_PRIMARY as string | undefined
  return buildPool({
    primaryUrl: primary,
    publicUrls: DEFAULT_BASE_PUBLIC_POOL,
    extraFallbacks: parseExtraFallbacks(
      import.meta.env.VITE_RPC_URL_BASE_FALLBACKS as string | undefined
    ),
    poolKey: 'base',
  })
}

export function buildBaseSepoliaTransport(): Transport {
  const primary = import.meta.env.VITE_RPC_URL_BASE_SEPOLIA_PRIMARY as string | undefined
  return buildPool({
    primaryUrl: primary,
    publicUrls: DEFAULT_BASE_SEPOLIA_PUBLIC_POOL,
    extraFallbacks: parseExtraFallbacks(
      import.meta.env.VITE_RPC_URL_BASE_SEPOLIA_FALLBACKS as string | undefined
    ),
    poolKey: 'base-sepolia',
  })
}

// Exported for unit tests — lets the spec inject mock URLs / Transport factories.
export const __testing = {
  buildPool,
  ALCHEMY_ONLY_METHODS,
  STALENESS_THRESHOLD_BLOCKS,
  DEFAULT_BASE_PUBLIC_POOL,
  DEFAULT_BASE_SEPOLIA_PUBLIC_POOL,
}
