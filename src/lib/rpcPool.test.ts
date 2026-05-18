import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Capture each `http(url, ...)` call so each mock endpoint gets an isolated
// request spy. We re-import rpcPool inside each test (after wiring per-URL
// mock responses) so module-level state never leaks across cases.
type MockEndpoint = {
  url: string
  height: bigint
  failOnce: boolean
  failAll: boolean
  requestSpy: ReturnType<typeof vi.fn>
}

const endpoints = new Map<string, MockEndpoint>()

function ensureEndpoint(url: string): MockEndpoint {
  let e = endpoints.get(url)
  if (!e) {
    e = {
      url,
      height: 100n,
      failOnce: false,
      failAll: false,
      requestSpy: vi.fn(),
    }
    e.requestSpy.mockImplementation(async ({ method }: { method: string }) => {
      if (e!.failAll) throw new Error(`${url} failing all`)
      if (e!.failOnce) {
        e!.failOnce = false
        throw new Error(`${url} failing once`)
      }
      if (method === 'eth_blockNumber') {
        return `0x${e!.height.toString(16)}`
      }
      // Echo a per-endpoint marker so tests can verify routing.
      return `result-from-${url}:${method}`
    })
    endpoints.set(url, e)
  }
  return e
}

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem')
  return {
    ...actual,
    http: (url?: string) => {
      const u = url ?? 'http://default'
      ensureEndpoint(u)
      return () => ({
        config: { key: 'mock-http', name: 'mock-http', type: 'http' as const, request: vi.fn() },
        request: endpoints.get(u)!.requestSpy,
      })
    },
  }
})

beforeEach(() => {
  endpoints.clear()
  vi.resetModules()
  // Stub Vite's import.meta.env so rpcPool reads the URLs we expect.
  vi.stubGlobal('import.meta.env', {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function loadPool() {
  return await import('./rpcPool')
}

function callRequest(transportReturn: unknown, method: string) {
  return (transportReturn as any).request({ method, params: [] })
}

describe('rpcPool — buildPool', () => {
  it('round-robins read requests across healthy endpoints', async () => {
    const { __testing } = await loadPool()
    const transport = __testing.buildPool({
      poolKey: 'test',
      publicUrls: ['https://a.test', 'https://b.test', 'https://c.test'],
    })
    const inst = transport({} as any)

    // Issue 9 reads — with 3 healthy endpoints, each should serve 3.
    for (let i = 0; i < 9; i++) {
      await callRequest(inst, 'eth_call')
    }

    const calls = (url: string) =>
      ensureEndpoint(url).requestSpy.mock.calls.filter(c => c[0].method === 'eth_call').length

    expect(calls('https://a.test')).toBe(3)
    expect(calls('https://b.test')).toBe(3)
    expect(calls('https://c.test')).toBe(3)
  })

  it('filters endpoints more than 4 blocks behind the leader', async () => {
    const { __testing } = await loadPool()

    ensureEndpoint('https://lead.test').height = 1000n
    ensureEndpoint('https://near.test').height = 998n // 2 behind, kept
    ensureEndpoint('https://stale.test').height = 994n // 6 behind, dropped

    const transport = __testing.buildPool({
      poolKey: 'test',
      publicUrls: ['https://lead.test', 'https://near.test', 'https://stale.test'],
    })
    const inst = transport({} as any)

    // Give the initial health check (synchronously kicked off in buildPool)
    // a microtask tick to settle.
    await new Promise(resolve => setTimeout(resolve, 0))

    for (let i = 0; i < 20; i++) {
      await callRequest(inst, 'eth_call')
    }

    const calls = (url: string) =>
      ensureEndpoint(url).requestSpy.mock.calls.filter(c => c[0].method === 'eth_call').length

    expect(calls('https://stale.test')).toBe(0)
    expect(calls('https://lead.test')).toBeGreaterThan(0)
    expect(calls('https://near.test')).toBeGreaterThan(0)
  })

  it('write methods pin to primary and never spill to the public pool', async () => {
    const { __testing } = await loadPool()
    const transport = __testing.buildPool({
      poolKey: 'test',
      primaryUrl: 'https://primary.test',
      publicUrls: ['https://pub1.test', 'https://pub2.test'],
    })
    const inst = transport({} as any)

    // Make the primary fail — the pool must surface the error, not retry on
    // a public RPC (those throttle/reject writes and risk double-submit).
    ensureEndpoint('https://primary.test').failAll = true

    await expect(callRequest(inst, 'eth_sendRawTransaction')).rejects.toThrow()

    expect(ensureEndpoint('https://pub1.test').requestSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'eth_sendRawTransaction' })
    )
    expect(ensureEndpoint('https://pub2.test').requestSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'eth_sendRawTransaction' })
    )
  })

  it('retries a failed read on the next endpoint in the pool', async () => {
    const { __testing } = await loadPool()
    const transport = __testing.buildPool({
      poolKey: 'test',
      publicUrls: ['https://a.test', 'https://b.test'],
    })
    const inst = transport({} as any)

    ensureEndpoint('https://a.test').failOnce = true

    const result = await callRequest(inst, 'eth_call')
    // Either endpoint may serve the retry, but the request must succeed.
    expect(result).toMatch(/^result-from-https:\/\/[ab]\.test:eth_call$/)
  })
})
