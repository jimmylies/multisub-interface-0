import type { Address } from 'viem'

/**
 * Chainlink price-feed registry per chain. Used by the Wizard to seed the
 * Guardian module's tokenPriceFeeds mapping at deploy time so the oracle can
 * value common tokens.
 *
 * Feed addresses are Chainlink USD aggregators. address(0) is native ETH and
 * is accepted by `setTokenPriceFeeds` (the plural setter) — do not filter it
 * out at deploy time or Uniswap swap paths through native ETH will break.
 */
export interface PriceFeedEntry {
  token: Address
  feed: Address
}

const BASE_SEPOLIA: PriceFeedEntry[] = [
  // Native ETH (address(0)) → ETH/USD
  {
    token: '0x0000000000000000000000000000000000000000',
    feed: '0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1',
  },
  // WETH → ETH/USD
  {
    token: '0x4200000000000000000000000000000000000006',
    feed: '0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1',
  },
  // USDC (Circle) → USDC/USD
  {
    token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    feed: '0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165',
  },
  // USDC (Aave) → USDC/USD
  {
    token: '0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f',
    feed: '0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165',
  },
  // USDT → USDT/USD
  {
    token: '0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a',
    feed: '0x3ec8593F930EA45ea58c968260e6e9FF53FC934f',
  },
  // WBTC → BTC/USD
  {
    token: '0x54114591963CF60EF3aA63bEfD6eC263D98145a4',
    feed: '0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298',
  },
  // LINK → LINK/USD
  {
    token: '0x810D46F9a9027E28F9B01F75E2bdde839dA61115',
    feed: '0xb113F5A928BCfF189C998ab20d753a47F9dE5A61',
  },
  // cbETH → ETH/USD (pegged)
  {
    token: '0xD171b9694f7A2597Ed006D41f7509aaD4B485c4B',
    feed: '0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1',
  },
  // EURC → USDC/USD (proxy: no native EUR/USD feed on Base Sepolia testnet)
  {
    token: '0x808456652fdb597867f38412077A9182bf77359F',
    feed: '0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165',
  },
  // Aave V3 aTokens (1:1 with underlying)
  // aWETH → ETH/USD
  {
    token: '0x73a5bB60b0B0fc35710DDc0ea9c407031E31Bdbb',
    feed: '0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1',
  },
  // aUSDC → USDC/USD
  {
    token: '0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC',
    feed: '0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165',
  },
  // aUSDT → USDT/USD
  {
    token: '0xcE3CAae5Ed17A7AafCEEbc897DE843fA6CC0c018',
    feed: '0x3ec8593F930EA45ea58c968260e6e9FF53FC934f',
  },
  // aWBTC → BTC/USD
  {
    token: '0x47Db195BAf46898302C06c31bCF46c01C64ACcF9',
    feed: '0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298',
  },
  // aLINK → LINK/USD
  {
    token: '0x0aD46dE765522399d7b25B438b230A894d72272B',
    feed: '0xb113F5A928BCfF189C998ab20d753a47F9dE5A61',
  },
  // acbETH → ETH/USD
  {
    token: '0x9Fd6d1DBAd7c052e0c43f46df36eEc6a68814B63',
    feed: '0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1',
  },
]

// Per-chain registry. Add new chains here as feeds are catalogued.
// 84532 = Base Sepolia; 8453 = Base mainnet (no entries yet).
const PRICE_FEEDS_BY_CHAIN: Record<number, PriceFeedEntry[]> = {
  84532: BASE_SEPOLIA,
  8453: [],
}

/**
 * Returns the price-feed registry for a chain, or `undefined` if no registry
 * is configured. Callers should treat `undefined` as "skip seeding feeds at
 * deploy time" — the Guardian can still be deployed; price-dependent paths
 * (swaps, USD-mode spending) will fail until feeds are added by the Safe
 * owner via the Dashboard.
 */
export function getPriceFeedsForChain(chainId: number): PriceFeedEntry[] | undefined {
  return PRICE_FEEDS_BY_CHAIN[chainId]
}

/**
 * Convenience: arrays in the shape `setTokenPriceFeeds` and `deployVault`
 * expect. Returns parallel arrays of `tokens[]` and `feeds[]`.
 */
export function getPriceFeedArrays(chainId: number): {
  tokens: Address[]
  feeds: Address[]
} {
  const entries = PRICE_FEEDS_BY_CHAIN[chainId] ?? []
  return {
    tokens: entries.map(e => e.token),
    feeds: entries.map(e => e.feed),
  }
}
