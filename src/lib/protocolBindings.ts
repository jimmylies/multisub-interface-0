// Per-protocol bindings: parser + selector data keyed by protocol id (matches
// `protocols.ts`). Used by all three deploy paths so a single source of truth
// drives:
//   - named-preset deploy (factory.deployVault config)
//   - custom-preset deploy (user picks protocols, we compose the same shape)
//   - add-protocol-to-existing-vault (Safe-tx batch from the dashboard / wizard)
//
// Why selectors live here and not next to the protocol contract list in
// protocols.ts: a selector is meaningless without its corresponding parser
// registration on the same module, and parsers are chain-specific deployment
// artifacts. Keeping them together prevents "registered selector with no
// parser" footguns.

import type { Address } from 'viem'
import type { NetworkName } from '@/lib/chains'

// OperationType values from DeFiInteractorModule.sol — must stay in sync
// with the contract enum. Any change in the contract should bump these.
export const OP_SWAP = 1
export const OP_DEPOSIT = 2
export const OP_WITHDRAW = 3
export const OP_CLAIM = 4
export const OP_APPROVE = 5
export const OP_REPAY = 6

export interface ParserBinding {
  protocol: Address
  parser: Address
}

export interface SelectorBinding {
  selector: `0x${string}`
  opType: number
}

export interface ProtocolBinding {
  /** Protocol target addresses to whitelist. Subset of `protocols.ts` —
   *  only addresses that have a parser + selectors registered. */
  protocols: Address[]
  /** Parser registrations (protocol address → parser contract). */
  parsers: ParserBinding[]
  /** Selectors specific to this protocol. APPROVE is added once via
   *  COMMON_SELECTORS so we don't have to repeat it per protocol. */
  selectors: SelectorBinding[]
}

/** Selectors that work for any DeFi protocol — registered once per vault. */
const COMMON_SELECTORS: SelectorBinding[] = [
  { selector: '0x095ea7b3', opType: OP_APPROVE }, // ERC20.approve
]

const BASE_SEPOLIA_BINDINGS: Record<string, ProtocolBinding> = {
  aave: {
    protocols: [
      '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27', // Pool
      '0x71B448405c803A3982aBa448133133D2DEAFBE5F', // RewardsController
    ],
    parsers: [
      {
        protocol: '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
        parser: '0x36683D4a7A8561911b0c00138D943b0CF61a437C',
      },
      {
        protocol: '0x71B448405c803A3982aBa448133133D2DEAFBE5F',
        parser: '0x36683D4a7A8561911b0c00138D943b0CF61a437C',
      },
    ],
    selectors: [
      { selector: '0x617ba037', opType: OP_DEPOSIT }, // supply
      { selector: '0x69328dec', opType: OP_WITHDRAW }, // withdraw
      { selector: '0xa415bcad', opType: OP_WITHDRAW }, // borrow → WITHDRAW
      { selector: '0x573ade81', opType: OP_REPAY }, // repay
      { selector: '0x236300dc', opType: OP_CLAIM }, // claimRewards
      { selector: '0xbb492bf5', opType: OP_CLAIM }, // claimAllRewards
    ],
  },
  morpho: {
    protocols: ['0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb'],
    // No Morpho parser is currently deployed on Base Sepolia for the
    // module — selectors are registered without a parser, matching the
    // historical yield-farmer preset shape.
    parsers: [],
    selectors: [
      { selector: '0xa99aad89', opType: OP_DEPOSIT }, // supply
      { selector: '0x5c2bea49', opType: OP_WITHDRAW }, // withdraw
      { selector: '0x20b76e81', opType: OP_REPAY }, // repay
      { selector: '0x238d6579', opType: OP_DEPOSIT }, // supplyCollateral
      { selector: '0x8720316d', opType: OP_WITHDRAW }, // withdrawCollateral
    ],
  },
  uniswap: {
    protocols: [
      '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4', // SwapRouter02 (V3)
      '0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2', // NonfungiblePositionManager (V3)
      '0x492E6456D9528771018DeB9E87ef7750EF184104', // Universal Router
      '0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80', // PositionManager (V4)
    ],
    parsers: [
      {
        protocol: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',
        parser: '0x37F53B27CAAcCb1cDc100d0bC0E52d8B09937aCc',
      },
      {
        protocol: '0x492E6456D9528771018DeB9E87ef7750EF184104',
        parser: '0x0e5A08b67BB89E8050A361f19Bcb70D9Ba6bF568',
      },
    ],
    selectors: [
      { selector: '0x04e45aaf', opType: OP_SWAP }, // exactInputSingle (V3)
      { selector: '0xb858183f', opType: OP_SWAP }, // exactInput (V3)
      { selector: '0x5023b4df', opType: OP_SWAP }, // exactOutputSingle (V3)
      { selector: '0x3593564c', opType: OP_SWAP }, // execute (Universal Router)
      { selector: '0x88316456', opType: OP_DEPOSIT }, // mint (NonfungiblePositionManager V3)
      { selector: '0x219f5d17', opType: OP_DEPOSIT }, // increaseLiquidity (V3)
      { selector: '0x0c49ccbe', opType: OP_WITHDRAW }, // decreaseLiquidity (V3)
      { selector: '0xfc6f7865', opType: OP_CLAIM }, // collect (V3)
      { selector: '0xa0ca4234', opType: OP_DEPOSIT }, // modifyLiquidities (PositionManager V4)
    ],
  },
  // merkl: Distributor parser/selectors not deployed — intentionally absent
  // so users can't whitelist a protocol the agent can't actually call.
}

const BINDINGS_BY_NETWORK: Partial<Record<NetworkName, Record<string, ProtocolBinding>>> = {
  'base-sepolia': BASE_SEPOLIA_BINDINGS,
  // Base mainnet bindings TBD when the parser suite is deployed there.
}

export function getProtocolBindings(network: NetworkName): Record<string, ProtocolBinding> {
  return BINDINGS_BY_NETWORK[network] ?? {}
}

/** Returns the protocol ids that have bindings on a given network. */
export function getSupportedProtocolIds(network: NetworkName): string[] {
  return Object.keys(getProtocolBindings(network))
}

export interface ComposedBindings {
  allowedProtocols: Address[]
  parserProtocols: Address[]
  parserAddresses: Address[]
  selectors: `0x${string}`[]
  selectorTypes: number[]
}

export class SelectorCollisionError extends Error {
  constructor(selector: string, existing: number, conflict: number) {
    super(
      `Selector ${selector} already registered with opType ${existing}, cannot reassign to ${conflict}`
    )
    this.name = 'SelectorCollisionError'
  }
}

/**
 * Aggregate per-protocol bindings into the four parallel arrays expected by
 * AgentVaultFactory.deployVault and DeFiInteractorModule.registerSelector /
 * registerParser.
 *
 * Behavior:
 *  - Empty `protocolIds` → empty arrays (no COMMON_SELECTORS either, since
 *    they're useless without any whitelisted target).
 *  - Unknown protocol id → silently skipped (mirrors
 *    `getProtocolContractAddresses` so the wizard doesn't crash on stale ids).
 *  - Selector dedupe: same selector + same opType → registered once. Same
 *    selector + different opType → throws SelectorCollisionError. The
 *    on-chain `registerSelector` would silently overwrite, so we surface it
 *    as a build-time error instead.
 *  - Parser dedupe: NOT applied. Two protocols pointing at the same parser
 *    address are kept as separate registrations, matching how the historical
 *    PRESET_CONFIG shaped the call.
 */
export function composeBindings(
  network: NetworkName,
  protocolIds: readonly string[]
): ComposedBindings {
  const bindings = getProtocolBindings(network)

  const allowedProtocols: Address[] = []
  const parserProtocols: Address[] = []
  const parserAddresses: Address[] = []
  const selectors: `0x${string}`[] = []
  const selectorTypes: number[] = []
  const seen = new Map<string, number>()

  function pushSelector(selector: `0x${string}`, opType: number): void {
    const key = selector.toLowerCase()
    const existing = seen.get(key)
    if (existing !== undefined) {
      if (existing !== opType) throw new SelectorCollisionError(selector, existing, opType)
      return
    }
    seen.set(key, opType)
    selectors.push(selector)
    selectorTypes.push(opType)
  }

  if (protocolIds.length > 0) {
    for (const s of COMMON_SELECTORS) pushSelector(s.selector, s.opType)
  }

  for (const id of protocolIds) {
    const binding = bindings[id]
    if (!binding) continue
    allowedProtocols.push(...binding.protocols)
    for (const { protocol, parser } of binding.parsers) {
      parserProtocols.push(protocol)
      parserAddresses.push(parser)
    }
    for (const { selector, opType } of binding.selectors) pushSelector(selector, opType)
  }

  return { allowedProtocols, parserProtocols, parserAddresses, selectors, selectorTypes }
}
