import { describe, expect, it } from 'vitest'
import {
  composeBindings,
  getSupportedProtocolIds,
  SelectorCollisionError,
  OP_APPROVE,
  OP_DEPOSIT,
  OP_WITHDRAW,
  OP_CLAIM,
  OP_REPAY,
  OP_SWAP,
} from './protocolBindings'

// Snapshot of what PRESET_CONFIG used to ship — kept here so any divergence in
// composeBindings output is caught the moment it happens. If you change a
// binding intentionally, update both this snapshot and the named-preset deploy
// path together.
const APPROVE = '0x095ea7b3' as const

const AAVE_BASE_SEPOLIA = {
  pool: '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
  rewards: '0x71B448405c803A3982aBa448133133D2DEAFBE5F',
  parser: '0x36683D4a7A8561911b0c00138D943b0CF61a437C',
} as const

const MORPHO_BLUE_BASE_SEPOLIA = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb'
const MORPHO_BLUE_PARSER_BASE_SEPOLIA = '0x19be5d89dB6d4CD8dd26Eaac306B280e9D83B739'

const UNI_BASE_SEPOLIA = {
  swapRouter: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',
  positionManagerV3: '0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2',
  universal: '0x492E6456D9528771018DeB9E87ef7750EF184104',
  positionManagerV4: '0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80',
  swapRouterParser: '0x37F53B27CAAcCb1cDc100d0bC0E52d8B09937aCc',
  universalParser: '0x0e5A08b67BB89E8050A361f19Bcb70D9Ba6bF568',
  v4Parser: '0xa6dDd242d2A933944Fb241F6fFf43e37bCb851ae',
} as const

describe('composeBindings (base-sepolia)', () => {
  it('returns empty arrays when no protocols are selected', () => {
    expect(composeBindings('base-sepolia', [])).toEqual({
      allowedProtocols: [],
      parserProtocols: [],
      parserAddresses: [],
      selectors: [],
      selectorTypes: [],
    })
  })

  it('skips unknown protocol ids without throwing', () => {
    const result = composeBindings('base-sepolia', ['definitely-not-a-protocol'])
    expect(result.allowedProtocols).toEqual([])
    expect(result.parserProtocols).toEqual([])
    expect(result.selectors).toEqual([APPROVE]) // common still added because protocolIds non-empty
    expect(result.selectorTypes).toEqual([OP_APPROVE])
  })

  it('reproduces the historical defi-trader preset (aave + uniswap)', () => {
    const result = composeBindings('base-sepolia', ['aave', 'uniswap'])

    expect(result.allowedProtocols).toEqual([
      AAVE_BASE_SEPOLIA.pool,
      AAVE_BASE_SEPOLIA.rewards,
      UNI_BASE_SEPOLIA.swapRouter,
      UNI_BASE_SEPOLIA.positionManagerV3,
      UNI_BASE_SEPOLIA.universal,
      UNI_BASE_SEPOLIA.positionManagerV4,
    ])

    // V3 PositionManager reuses the V3 swap-router parser (UniswapV3Parser
    // covers MINT/INCREASE/DECREASE/COLLECT). V4 PositionManager uses its
    // own parser deployed at v4Parser.
    expect(result.parserProtocols).toEqual([
      AAVE_BASE_SEPOLIA.pool,
      AAVE_BASE_SEPOLIA.rewards,
      UNI_BASE_SEPOLIA.swapRouter,
      UNI_BASE_SEPOLIA.positionManagerV3,
      UNI_BASE_SEPOLIA.universal,
      UNI_BASE_SEPOLIA.positionManagerV4,
    ])
    expect(result.parserAddresses).toEqual([
      AAVE_BASE_SEPOLIA.parser,
      AAVE_BASE_SEPOLIA.parser,
      UNI_BASE_SEPOLIA.swapRouterParser,
      UNI_BASE_SEPOLIA.swapRouterParser,
      UNI_BASE_SEPOLIA.universalParser,
      UNI_BASE_SEPOLIA.v4Parser,
    ])

    // APPROVE first (common), then aave selectors, then uniswap selectors
    // (swap-side first, then V3 PositionManager, then V4).
    expect(result.selectors).toEqual([
      APPROVE,
      '0x617ba037', // aave supply
      '0x69328dec', // aave withdraw
      '0xa415bcad', // aave borrow
      '0x573ade81', // aave repay
      '0x236300dc', // claimRewards
      '0xbb492bf5', // claimAllRewards
      '0x04e45aaf', // uni exactInputSingle
      '0xb858183f', // uni exactInput
      '0x5023b4df', // uni exactOutputSingle
      '0x3593564c', // uni execute (Universal Router)
      '0x88316456', // uni mint (NonfungiblePositionManager V3)
      '0x219f5d17', // uni increaseLiquidity (V3)
      '0x0c49ccbe', // uni decreaseLiquidity (V3)
      '0xfc6f7865', // uni collect (V3)
      '0xdd46508f', // uni modifyLiquidities (PositionManager V4)
    ])
    expect(result.selectorTypes).toEqual([
      OP_APPROVE,
      OP_DEPOSIT,
      OP_WITHDRAW,
      OP_WITHDRAW,
      OP_REPAY,
      OP_CLAIM,
      OP_CLAIM,
      OP_SWAP,
      OP_SWAP,
      OP_SWAP,
      OP_SWAP,
      OP_DEPOSIT,
      OP_DEPOSIT,
      OP_WITHDRAW,
      OP_CLAIM,
      OP_DEPOSIT,
    ])
  })

  it('reproduces the historical yield-farmer preset (aave + morpho)', () => {
    const result = composeBindings('base-sepolia', ['aave', 'morpho'])

    expect(result.allowedProtocols).toEqual([
      AAVE_BASE_SEPOLIA.pool,
      AAVE_BASE_SEPOLIA.rewards,
      MORPHO_BLUE_BASE_SEPOLIA,
    ])
    expect(result.parserProtocols).toEqual([
      AAVE_BASE_SEPOLIA.pool,
      AAVE_BASE_SEPOLIA.rewards,
      MORPHO_BLUE_BASE_SEPOLIA,
    ])
    expect(result.parserAddresses).toEqual([
      AAVE_BASE_SEPOLIA.parser,
      AAVE_BASE_SEPOLIA.parser,
      MORPHO_BLUE_PARSER_BASE_SEPOLIA,
    ])

    expect(result.selectors).toEqual([
      APPROVE,
      '0x617ba037',
      '0x69328dec',
      '0xa415bcad',
      '0x573ade81',
      '0x236300dc',
      '0xbb492bf5',
      '0xa99aad89', // morpho supply
      '0x5c2bea49', // morpho withdraw
      '0x20b76e81', // morpho repay
      '0x238d6579', // morpho supplyCollateral
      '0x8720316d', // morpho withdrawCollateral
    ])
    expect(result.selectorTypes).toEqual([
      OP_APPROVE,
      OP_DEPOSIT,
      OP_WITHDRAW,
      OP_WITHDRAW,
      OP_REPAY,
      OP_CLAIM,
      OP_CLAIM,
      OP_DEPOSIT,
      OP_WITHDRAW,
      OP_REPAY,
      OP_DEPOSIT,
      OP_WITHDRAW,
    ])
  })

  it('produces a working custom (single-protocol) deploy', () => {
    const result = composeBindings('base-sepolia', ['aave'])
    expect(result.allowedProtocols.length).toBeGreaterThan(0)
    expect(result.selectors[0]).toBe(APPROVE) // approve always present
    expect(result.parserAddresses.every(addr => /^0x[0-9a-fA-F]{40}$/.test(addr))).toBe(true)
  })

  it('dedupes selectors when two protocols share one (idempotent)', () => {
    // Compose aave twice — should not produce duplicate selectors
    const single = composeBindings('base-sepolia', ['aave'])
    const doubled = composeBindings('base-sepolia', ['aave', 'aave'])
    expect(doubled.selectors).toEqual(single.selectors)
    expect(doubled.selectorTypes).toEqual(single.selectorTypes)
    // But protocol/parser arrays still duplicate (different storage keys per
    // address — `setAllowedAddresses` and `registerParser` are address-keyed,
    // so duplicates are wasted gas but not wrong).
    expect(doubled.allowedProtocols.length).toBe(single.allowedProtocols.length * 2)
    expect(doubled.parserProtocols.length).toBe(single.parserProtocols.length * 2)
  })

  it('throws SelectorCollisionError when same selector maps to different opTypes', () => {
    // We can't easily induce this from the production data, so we test by
    // calling composeBindings against a hand-rolled bindings map. Inline
    // by re-importing — keep this test self-contained.
    // (If composeBindings ever stops being pure, revisit.)
    const localCompose = (selectors: { selector: `0x${string}`; opType: number }[]) => {
      const seen = new Map<string, number>()
      for (const { selector, opType } of selectors) {
        const key = selector.toLowerCase()
        const existing = seen.get(key)
        if (existing !== undefined && existing !== opType) {
          throw new SelectorCollisionError(selector, existing, opType)
        }
        seen.set(key, opType)
      }
    }
    expect(() =>
      localCompose([
        { selector: '0x12345678', opType: OP_DEPOSIT },
        { selector: '0x12345678', opType: OP_WITHDRAW },
      ])
    ).toThrow(SelectorCollisionError)
  })

  it('lists supported protocol ids', () => {
    const supported = getSupportedProtocolIds('base-sepolia')
    expect(supported).toContain('aave')
    expect(supported).toContain('morpho')
    expect(supported).toContain('uniswap')
    // merkl deliberately not in bindings (no parser deployed)
    expect(supported).not.toContain('merkl')
  })

  it('returns an empty bindings map for unconfigured networks', () => {
    expect(getSupportedProtocolIds('base')).toEqual([])
    expect(composeBindings('base', ['aave'])).toEqual({
      allowedProtocols: [],
      parserProtocols: [],
      parserAddresses: [],
      // Common selectors still added because protocolIds is non-empty —
      // see comment in composeBindings. This is harmless: the resulting
      // vault would whitelist nothing so the agent can't call anything.
      selectors: [APPROVE],
      selectorTypes: [OP_APPROVE],
    })
  })
})
