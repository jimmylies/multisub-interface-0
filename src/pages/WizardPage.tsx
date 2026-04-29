import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useChainId,
  useReadContract,
  usePublicClient,
} from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { isAddress, decodeEventLog, parseUnits, zeroAddress, type Address } from 'viem'
import { ExternalLink, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CopyButton } from '@/components/ui/copy-button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ROUTES } from '@/router/routes'
import { getExplorerBase, selectedChain, selectedNetworkName } from '@/lib/chains'
import { composeBindings, getSupportedProtocolIds } from '@/lib/protocolBindings'
import {
  AGENT_VAULT_FACTORY_ABI,
  GUARDIAN_ABI as GUARDIAN_ABI_CONST,
  MODULE_REGISTRY_ABI,
  ROLES,
  SAFE_ABI,
} from '@/lib/contracts'
const GUARDIAN_ABI = GUARDIAN_ABI_CONST as unknown as any[]
import { PROTOCOLS } from '@/lib/protocols'
import { encodeContractCall, useSafeProposal } from '@/hooks/useSafeProposal'
import { Tooltip } from '@/components/ui/tooltip'
import { TRANSACTION_TYPES } from '@/lib/transactionTypes'
import { useContractAddresses } from '@/contexts/ContractAddressContext'

// Preset IDs match PresetRegistry on-chain (0-indexed via presetCount++)
const PRESET_IDS: Record<string, number> = {
  'defi-trader': 0,
  'yield-farmer': 1,
  'payment-agent': 2,
}

// Preset definitions
const PRESETS = [
  {
    id: 'defi-trader',
    name: 'DeFi Trader',
    description: 'Swap tokens on Uniswap. Supply to Aave V3.',
    protocols: ['Uniswap V3/V4', 'Aave V3'],
    defaultBps: 500,
    roleLabel: 'EXECUTE',
    icon: '~',
  },
  {
    id: 'yield-farmer',
    name: 'Yield Farmer',
    description: 'Deposit into Morpho Blue and Aave V3. Maximize yield safely.',
    protocols: ['Aave V3', 'Morpho Blue'],
    defaultBps: 1000,
    roleLabel: 'EXECUTE',
    icon: '+',
  },
  {
    id: 'payment-agent',
    name: 'Payment Agent',
    description: 'Transfer tokens to specified recipients. No DeFi interactions.',
    protocols: ['Transfer only'],
    defaultBps: 100,
    roleLabel: 'TRANSFER',
    icon: '>',
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Define your own guardrails. Full control over protocols, limits, and roles.',
    protocols: ['You decide'],
    defaultBps: 500,
    roleLabel: 'Custom',
    icon: '*',
  },
] as const

type Step = 'preset' | 'configure' | 'review'

type ExistingVaultTransaction = { to: `0x${string}`; data: `0x${string}` }

type ExistingVaultTransactionExplanation = {
  title: string
  description: string
}

function getPresetProtocolLabels(
  presetId: string,
  chainId: number,
  fallbackLabels: readonly string[]
): string[] {
  if (presetId === 'custom' || presetId === 'payment-agent') {
    return [...fallbackLabels]
  }

  if (chainId !== selectedChain.id) {
    return [...fallbackLabels]
  }

  const presetConfig = PRESET_CONFIG[presetId]
  if (!presetConfig) {
    return [...fallbackLabels]
  }

  const presetIds = new Set(presetConfig.protocolIds)
  const matchingProtocols = PROTOCOLS.filter(protocol => presetIds.has(protocol.id)).map(
    protocol => protocol.name
  )

  return matchingProtocols.length > 0 ? matchingProtocols : [...fallbackLabels]
}

// Fixed deployment config — set via environment variables
const FACTORY_ADDRESS = import.meta.env.VITE_AGENT_VAULT_FACTORY_ADDRESS as Address | undefined
const ORACLE_ADDRESS = import.meta.env.VITE_ORACLE_ADDRESS as Address | undefined
// Protocol ids with parser+selector bindings on the active network.
// Anything not in here is shown as "coming soon" in the Custom picker.
const supportedProtocolIds = getSupportedProtocolIds(selectedNetworkName)
// Major tokens on Base Sepolia with Chainlink price feeds
const BASE_SEPOLIA_PRICE_FEEDS: { token: Address; feed: Address }[] = [
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
const PRICE_FEED_TOKENS = BASE_SEPOLIA_PRICE_FEEDS.filter(p => p.token !== zeroAddress).map(p => p.token)
const PRICE_FEED_ADDRESSES = BASE_SEPOLIA_PRICE_FEEDS.filter(p => p.token !== zeroAddress).map(p => p.feed)

const PRESET_ROLE_IDS: Record<string, number> = {
  'defi-trader': ROLES.DEFI_EXECUTE_ROLE,
  'yield-farmer': ROLES.DEFI_EXECUTE_ROLE,
  'payment-agent': ROLES.DEFI_TRANSFER_ROLE,
}

// Named-preset metadata: which protocols + role + default limit. Parsers
// and selectors are derived at deploy time via composeBindings, so adding
// a new protocol to a preset is a one-line change here.
interface NamedPresetConfig {
  roleId: number
  maxSpendingBps: number
  protocolIds: readonly string[]
}

const PRESET_CONFIG: Record<string, NamedPresetConfig> = {
  'defi-trader': {
    roleId: ROLES.DEFI_EXECUTE_ROLE,
    maxSpendingBps: 500,
    protocolIds: ['aave', 'uniswap'],
  },
  'yield-farmer': {
    roleId: ROLES.DEFI_EXECUTE_ROLE,
    maxSpendingBps: 1000,
    protocolIds: ['aave', 'morpho'],
  },
  'payment-agent': {
    roleId: ROLES.DEFI_TRANSFER_ROLE,
    maxSpendingBps: 100,
    protocolIds: [],
  },
}

export function WizardPage() {
  const navigate = useNavigate()
  const { setGuardian } = useContractAddresses()
  const { isConnected, address: connectedAddress } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const [step, setStep] = useState<Step>('preset')
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [agentAddress, setAgentAddress] = useState('')
  const [spendingLimitUSD, setSpendingLimitUSD] = useState('5000')
  const [spendingLimitBps, setSpendingLimitBps] = useState('5')
  const [safeAddress, setSafeAddress] = useState('')
  const [selectedProtocols, setSelectedProtocols] = useState<string[]>([])
  const [oracleless, setOracleless] = useState(false)
  const [deployedModule, setDeployedModule] = useState<string | null>(null)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [existingVaultTxHash, setExistingVaultTxHash] = useState<`0x${string}` | null>(null)
  const [usedExistingVault, setUsedExistingVault] = useState(false)
  const [isExistingVaultFlowModalOpen, setIsExistingVaultFlowModalOpen] = useState(false)
  const [pendingExistingVaultTransactions, setPendingExistingVaultTransactions] = useState<
    ExistingVaultTransaction[]
  >([])
  const [pendingExistingVaultExplanations, setPendingExistingVaultExplanations] = useState<
    ExistingVaultTransactionExplanation[]
  >([])
  // Enable-module flow (post-deploy): track tx hash so the success card can render its state
  const [enableModuleTxHash, setEnableModuleTxHash] = useState<`0x${string}` | null>(null)
  const [enableModuleError, setEnableModuleError] = useState<string | null>(null)
  const [isEnablingModule, setIsEnablingModule] = useState(false)

  // Effective oracle: real address in oracle mode, zeroAddress in oracleless mode
  const effectiveOracle: Address | undefined = oracleless ? zeroAddress : ORACLE_ADDRESS
  // In oracleless mode, oracle address can be missing (we use zeroAddress)
  const oracleConfigOk = oracleless || !!ORACLE_ADDRESS

  const { writeContract, reset: resetWriteContract, data: txHash, isPending: isWriting } = useWriteContract()
  const {
    data: receipt,
    isLoading: isConfirming,
    isSuccess,
    isError: isReceiptError,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    query: {
      enabled: Boolean(txHash),
    },
  })

  const txReverted = isSuccess && receipt?.status === 'reverted'
  const txFailed = isReceiptError || txReverted
  const txFailMessage = txReverted
    ? 'Transaction reverted on-chain.'
    : (receiptError?.message ?? null)
  const hasValidSafeAddress = isAddress(safeAddress)

  const { data: moduleRegistryAddress } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: AGENT_VAULT_FACTORY_ABI,
    functionName: 'registry',
    query: {
      enabled: Boolean(FACTORY_ADDRESS),
    },
  })

  const { data: existingModule } = useReadContract({
    address: moduleRegistryAddress,
    abi: MODULE_REGISTRY_ABI,
    functionName: 'getModuleForSafe',
    args: hasValidSafeAddress ? [safeAddress as Address] : undefined,
    query: {
      enabled: Boolean(moduleRegistryAddress) && hasValidSafeAddress,
    },
  })

  const existingModuleAddress =
    existingModule && existingModule !== zeroAddress ? (existingModule as `0x${string}`) : null

  // Safe owner check — connected wallet must be a Safe signer to call enableModule
  const { data: safeOwners } = useReadContract({
    address: hasValidSafeAddress ? (safeAddress as Address) : undefined,
    abi: SAFE_ABI,
    functionName: 'getOwners',
    query: { enabled: hasValidSafeAddress },
  })
  const isConnectedSafeOwner = Boolean(
    connectedAddress &&
    (safeOwners as Address[] | undefined)?.some(
      owner => owner.toLowerCase() === connectedAddress.toLowerCase()
    )
  )

  // Module activation check — re-runs after the activation tx is mined
  const moduleToCheck =
    deployedModule && deployedModule !== 'unknown' ? (deployedModule as Address) : undefined
  const { data: isModuleEnabledOnSafe, refetch: refetchModuleEnabled } = useReadContract({
    address: hasValidSafeAddress ? (safeAddress as Address) : undefined,
    abi: SAFE_ABI,
    functionName: 'isModuleEnabled',
    args: moduleToCheck ? [moduleToCheck] : undefined,
    query: { enabled: hasValidSafeAddress && Boolean(moduleToCheck) },
  })

  const justDeployedRegisteredModule =
    Boolean(deployedModule) &&
    deployedModule !== 'unknown' &&
    existingModuleAddress?.toLowerCase() === deployedModule?.toLowerCase()
  const showExistingModuleWarning = Boolean(existingModuleAddress) && !justDeployedRegisteredModule
  const isExistingVaultDirectOwnerFlow =
    Boolean(connectedAddress) &&
    Boolean(safeAddress) &&
    connectedAddress!.toLowerCase() === safeAddress.toLowerCase()
  const expectedExistingVaultWalletApprovals = isExistingVaultDirectOwnerFlow
    ? pendingExistingVaultTransactions.length
    : pendingExistingVaultTransactions.length > 0
      ? 2
      : 0

  const preset = PRESETS.find(p => p.id === selectedPreset)
  const selectedPresetProtocolLabels = preset
    ? getPresetProtocolLabels(preset.id, chainId, preset.protocols)
    : []
  const stepOrder: Step[] = ['preset', 'configure', 'review']
  const currentStepIndex = stepOrder.indexOf(step)
  const isDeploying = isWriting || isConfirming
  const { proposeTransaction, isPending: isConfiguringExistingVault } = useSafeProposal()

  async function executeExistingVaultConfiguration(transactions: ExistingVaultTransaction[]) {
    setDeployError(null)
    setExistingVaultTxHash(null)
    setUsedExistingVault(false)
    setIsExistingVaultFlowModalOpen(false)

    if (!isConnectedSafeOwner) {
      setDeployError(
        `Connected wallet is not an owner of this Safe. Switch to a signer of ${safeAddress.slice(0, 6)}…${safeAddress.slice(-4)} to continue.`
      )
      return
    }

    try {
      const result = await proposeTransaction(
        transactions.length === 1 ? transactions[0] : transactions,
        {
          transactionType: TRANSACTION_TYPES.GRANT_ROLE,
          safeAddressOverride: safeAddress as Address,
          moduleOwnerOverride: safeAddress as Address,
        }
      )

      if (result.success) {
        setUsedExistingVault(true)
        setDeployedModule(existingModuleAddress)
        setExistingVaultTxHash(result.transactionHash as `0x${string}`)
        setPendingExistingVaultTransactions([])
        setPendingExistingVaultExplanations([])
      } else if ('cancelled' in result && result.cancelled) {
        return
      } else {
        throw result.error || new Error('Transaction failed')
      }
    } catch (error) {
      setDeployError(error instanceof Error ? error.message : 'Failed to configure existing vault')
    }
  }

  async function handleEnableModule() {
    if (!moduleToCheck || !hasValidSafeAddress) return
    setEnableModuleError(null)
    setIsEnablingModule(true)
    try {
      const result = await proposeTransaction(
        {
          to: safeAddress as Address,
          data: encodeContractCall(
            safeAddress as Address,
            SAFE_ABI as unknown as any[],
            'enableModule',
            [moduleToCheck]
          ),
        },
        {
          transactionType: TRANSACTION_TYPES.ENABLE_MODULE,
          safeAddressOverride: safeAddress as Address,
          moduleOwnerOverride: safeAddress as Address,
        }
      )
      if (result.success) {
        setEnableModuleTxHash(result.transactionHash as `0x${string}`)
        // Poll until the RPC reflects the module activation (up to ~20s)
        for (let i = 0; i < 5; i++) {
          await new Promise(res => setTimeout(res, 3000))
          const { data: enabled } = await refetchModuleEnabled()
          if (enabled) break
        }
      } else if ('cancelled' in result && result.cancelled) {
        return
      } else {
        throw result.error || new Error('Transaction failed')
      }
    } catch (error) {
      setEnableModuleError(
        error instanceof Error ? error.message : 'Failed to enable module on Safe'
      )
    } finally {
      setIsEnablingModule(false)
    }
  }

  async function handleConfigureExistingVault() {
    if (!preset || !existingModuleAddress || !isAddress(agentAddress)) {
      return
    }

    if (!publicClient) {
      setDeployError('No RPC client available — check your network connection.')
      return
    }

    const transactions: ExistingVaultTransaction[] = []
    const explanations: ExistingVaultTransactionExplanation[] = []
    const addTransaction = (
      transaction: ExistingVaultTransaction,
      explanation: ExistingVaultTransactionExplanation
    ) => {
      transactions.push(transaction)
      explanations.push(explanation)
    }

    // Auto-detect the guardian's actual on-chain mode instead of relying on UI toggle
    let guardianIsOracleless = oracleless
    try {
      guardianIsOracleless = (await publicClient.readContract({
        address: existingModuleAddress,
        abi: GUARDIAN_ABI,
        functionName: 'isOracleless',
      })) as boolean
    } catch {
      // Fallback to UI toggle if call fails
    }

    // Early blocker: if this agent already has a role in the vault, stop here.
    const roleToCheck =
      preset.id === 'custom'
        ? ROLES.DEFI_EXECUTE_ROLE
        : (PRESET_ROLE_IDS[preset.id] ?? ROLES.DEFI_EXECUTE_ROLE)
    try {
      const agentAlreadyHasRole = await publicClient.readContract({
        address: existingModuleAddress,
        abi: GUARDIAN_ABI,
        functionName: 'hasRole',
        args: [agentAddress as Address, roleToCheck],
      })
      if (agentAlreadyHasRole) {
        setDeployError(
          `Agent ${agentAddress.slice(0, 6)}…${agentAddress.slice(-4)} already has access in this vault. To update its limits or permissions, use the Dashboard instead.`
        )
        return
      }
    } catch {
      // If the call fails, continue and let the transaction surface any issue
    }

    // Register any missing price feeds on the existing guardian
    const feedStatuses = await Promise.all(
      BASE_SEPOLIA_PRICE_FEEDS.map(async ({ token, feed }) => {
        try {
          const currentFeed = (await publicClient.readContract({
            address: existingModuleAddress,
            abi: GUARDIAN_ABI,
            functionName: 'tokenPriceFeeds',
            args: [token],
          })) as string
          return {
            token,
            feed,
            needsRegistration:
              currentFeed.toLowerCase() === '0x0000000000000000000000000000000000000000',
          }
        } catch {
          return { token, feed, needsRegistration: true }
        }
      })
    )

    const missingFeeds = feedStatuses.filter(f => f.needsRegistration && f.token !== zeroAddress)
    missingFeeds.forEach(({ token, feed }) => {
      addTransaction(
        {
          to: existingModuleAddress,
          data: encodeContractCall(existingModuleAddress, GUARDIAN_ABI, 'setTokenPriceFeed', [
            token,
            feed,
          ]),
        },
        {
          title: 'Register token price feed',
          description: `Sets the Chainlink price feed for token ${token.slice(0, 6)}…${token.slice(-4)} so the guardian can value it on-chain.`,
        }
      )
    })

    if (preset.id === 'custom') {
      const alreadyHasRoleCustom = await publicClient.readContract({
        address: existingModuleAddress,
        abi: GUARDIAN_ABI,
        functionName: 'hasRole',
        args: [agentAddress as Address, ROLES.DEFI_EXECUTE_ROLE],
      })

      if (!alreadyHasRoleCustom) {
        addTransaction(
          {
            to: existingModuleAddress,
            data: encodeContractCall(existingModuleAddress, GUARDIAN_ABI, 'grantRole', [
              agentAddress as Address,
              ROLES.DEFI_EXECUTE_ROLE,
            ]),
          },
          {
            title: 'Grant agent role',
            description:
              'Gives this agent the EXECUTE permission needed to operate inside the vault.',
          }
        )
      }

      addTransaction(
        {
          to: existingModuleAddress,
          data: encodeContractCall(existingModuleAddress, GUARDIAN_ABI, 'setSubAccountLimits', [
            agentAddress as Address,
            guardianIsOracleless ? 0n : BigInt(Math.round(Number(spendingLimitBps || '0') * 100)),
            guardianIsOracleless ? parseUnits(spendingLimitUSD || '0', 18) : 0n,
            86400n,
          ]),
        },
        {
          title: 'Set spending limits',
          description: 'Applies the spending cap and 24-hour window for this agent.',
        }
      )

      // Custom path: derive parsers + selectors + protocol whitelist from
      // the user's protocol selection (same composeBindings used at deploy).
      // This makes Custom usable post-deploy too, not just at fresh deploy.
      const composed = composeBindings(selectedNetworkName, selectedProtocols)

      // Register any missing parsers
      const parserStatuses = await Promise.all(
        composed.parserProtocols.map(async (protocol, i) => {
          const currentParser = await publicClient.readContract({
            address: existingModuleAddress,
            abi: GUARDIAN_ABI,
            functionName: 'protocolParsers',
            args: [protocol],
          })
          return {
            protocol,
            parser: composed.parserAddresses[i],
            needsRegistration:
              (currentParser as string).toLowerCase() !== composed.parserAddresses[i].toLowerCase(),
          }
        })
      )
      parserStatuses
        .filter(p => p.needsRegistration)
        .forEach(({ protocol, parser }) => {
          addTransaction(
            {
              to: existingModuleAddress,
              data: encodeContractCall(existingModuleAddress, GUARDIAN_ABI, 'registerParser', [
                protocol,
                parser,
              ]),
            },
            {
              title: 'Register protocol parser',
              description: `Lets the vault validate interactions with ${protocol.slice(0, 6)}…${protocol.slice(-4)}.`,
            }
          )
        })

      // Register any missing selectors
      const selectorStatuses = await Promise.all(
        composed.selectors.map(async (selector, i) => {
          const currentOpType = await publicClient.readContract({
            address: existingModuleAddress,
            abi: GUARDIAN_ABI,
            functionName: 'selectorType',
            args: [selector],
          })
          return {
            selector,
            opType: composed.selectorTypes[i],
            needsRegistration: Number(currentOpType) !== composed.selectorTypes[i],
          }
        })
      )
      selectorStatuses
        .filter(s => s.needsRegistration)
        .forEach(({ selector, opType }) => {
          addTransaction(
            {
              to: existingModuleAddress,
              data: encodeContractCall(existingModuleAddress, GUARDIAN_ABI, 'registerSelector', [
                selector,
                opType,
              ]),
            },
            {
              title: 'Register operation selector',
              description: `Maps selector ${selector} so the agent can call it.`,
            }
          )
        })

      if (composed.allowedProtocols.length > 0) {
        addTransaction(
          {
            to: existingModuleAddress,
            data: encodeContractCall(existingModuleAddress, GUARDIAN_ABI, 'setAllowedAddresses', [
              agentAddress as Address,
              composed.allowedProtocols,
              true,
            ]),
          },
          {
            title: 'Whitelist allowed protocols',
            description:
              'Restricts this agent to the protocol addresses derived from your selection.',
          }
        )
      }
    } else {
      const presetConfig = chainId === selectedChain.id ? PRESET_CONFIG[preset.id] : undefined

      if (!presetConfig) {
        setDeployError(
          'Adding preset agents to an existing vault is not supported on this network.'
        )
        return
      }

      // Compose the same parser/selector/whitelist arrays the factory would
      // have written at fresh deploy. Then diff vs on-chain state and only
      // queue the missing pieces.
      const composed = composeBindings(selectedNetworkName, presetConfig.protocolIds)

      const parserStatuses = await Promise.all(
        composed.parserProtocols.map(async (protocol, i) => {
          const currentParser = await publicClient.readContract({
            address: existingModuleAddress,
            abi: GUARDIAN_ABI,
            functionName: 'protocolParsers',
            args: [protocol],
          })
          return {
            protocol,
            parser: composed.parserAddresses[i],
            needsRegistration:
              (currentParser as string).toLowerCase() !== composed.parserAddresses[i].toLowerCase(),
          }
        })
      )

      parserStatuses
        .filter(({ needsRegistration }) => needsRegistration)
        .forEach(({ protocol, parser }) => {
          addTransaction(
            {
              to: existingModuleAddress,
              data: encodeContractCall(existingModuleAddress, GUARDIAN_ABI, 'registerParser', [
                protocol,
                parser,
              ]),
            },
            {
              title: 'Register protocol parser',
              description: `Lets the vault validate interactions with protocol ${protocol.slice(0, 6)}...${protocol.slice(-4)}.`,
            }
          )
        })

      const selectorStatuses = await Promise.all(
        composed.selectors.map(async (selector, i) => {
          const currentOpType = await publicClient.readContract({
            address: existingModuleAddress,
            abi: GUARDIAN_ABI,
            functionName: 'selectorType',
            args: [selector],
          })

          return {
            selector,
            opType: composed.selectorTypes[i],
            needsRegistration: Number(currentOpType) !== composed.selectorTypes[i],
          }
        })
      )

      selectorStatuses
        .filter(({ needsRegistration }) => needsRegistration)
        .forEach(({ selector, opType }) => {
          addTransaction(
            {
              to: existingModuleAddress,
              data: encodeContractCall(existingModuleAddress, GUARDIAN_ABI, 'registerSelector', [
                selector,
                opType,
              ]),
            },
            {
              title: 'Register operation selector',
              description: `Maps selector ${selector} to the preset safety rules before the agent can use it.`,
            }
          )
        })

      const alreadyHasRole = await publicClient.readContract({
        address: existingModuleAddress,
        abi: GUARDIAN_ABI,
        functionName: 'hasRole',
        args: [agentAddress as Address, PRESET_ROLE_IDS[preset.id]],
      })

      if (!alreadyHasRole) {
        addTransaction(
          {
            to: existingModuleAddress,
            data: encodeContractCall(existingModuleAddress, GUARDIAN_ABI, 'grantRole', [
              agentAddress as Address,
              PRESET_ROLE_IDS[preset.id],
            ]),
          },
          {
            title: 'Grant agent role',
            description: `Gives this agent the ${preset.roleLabel} permission required by the preset.`,
          }
        )
      }

      addTransaction(
        {
          to: existingModuleAddress,
          data: encodeContractCall(existingModuleAddress, GUARDIAN_ABI, 'setSubAccountLimits', [
            agentAddress as Address,
            guardianIsOracleless ? 0n : BigInt(Math.round(Number(spendingLimitBps || '0') * 100)),
            guardianIsOracleless ? parseUnits(spendingLimitUSD || '0', 18) : 0n,
            86400n,
          ]),
        },
        {
          title: 'Set spending limits',
          description: 'Applies the spending cap and daily reset window for this agent.',
        }
      )

      if (composed.allowedProtocols.length > 0) {
        addTransaction(
          {
            to: existingModuleAddress,
            data: encodeContractCall(existingModuleAddress, GUARDIAN_ABI, 'setAllowedAddresses', [
              agentAddress as Address,
              composed.allowedProtocols,
              true,
            ]),
          },
          {
            title: 'Whitelist allowed protocols',
            description:
              'Allows this agent to call only the protocol contracts included in the preset.',
          }
        )
      }
    }

    if (transactions.length === 0) {
      setDeployError(
        'This agent already appears to be configured for the selected preset on the existing vault.'
      )
      return
    }

    if (transactions.length > 1) {
      setPendingExistingVaultTransactions(transactions)
      setPendingExistingVaultExplanations(explanations)
      setIsExistingVaultFlowModalOpen(true)
      return
    }

    await executeExistingVaultConfiguration(transactions)
  }

  async function handleDeploy() {
    if (!preset || !isAddress(safeAddress) || !isAddress(agentAddress)) return

    // Existing vault flow doesn't need factory or oracle — handle it first
    if (showExistingModuleWarning) {
      try {
        await handleConfigureExistingVault()
      } catch (error) {
        setDeployError(
          error instanceof Error ? error.message : 'Failed to configure existing vault'
        )
      }
      return
    }

    if (!FACTORY_ADDRESS || !effectiveOracle) return

    // Oracleless mode requires a USD spending limit
    if (oracleless && (!spendingLimitUSD || Number(spendingLimitUSD) <= 0)) {
      setDeployError('Oracleless mode requires a USD spending limit')
      return
    }

    setDeployError(null)
    setDeployedModule(null)
    setUsedExistingVault(false)
    setExistingVaultTxHash(null)
    resetWriteContract()
    setIsSimulating(true)

    const presetId = PRESET_IDS[preset.id]
    // In oracleless mode, price feeds are not strictly needed for spending tracking
    // but we still pass them for token decimal lookups in approve/transfer paths
    const priceFeedTokens = PRICE_FEED_TOKENS
    const priceFeedAddresses = PRICE_FEED_ADDRESSES

    try {
      // Always use deployVault so the user's spending limit input is respected.
      // (deployVaultFromPreset uses hardcoded on-chain BPS values, ignoring user input.)
      const maxSpendingBps = oracleless
        ? 0n
        : BigInt(Math.round(Number(spendingLimitBps || '0') * 100))
      const maxSpendingUSD = oracleless ? parseUnits(spendingLimitUSD || '0', 18) : 0n

      // Compose parsers + selectors + protocol whitelist from PROTOCOL_BINDINGS.
      // Named presets supply their own protocolIds; Custom uses what the user
      // selected. Either way Custom now ships a working vault (with parsers
      // and selectors) instead of a half-configured one.
      const presetCfg = presetId !== undefined ? PRESET_CONFIG[preset.id] : undefined
      const roleId = presetCfg ? presetCfg.roleId : ROLES.DEFI_EXECUTE_ROLE
      const protocolIds = presetCfg ? presetCfg.protocolIds : selectedProtocols
      const composed = composeBindings(selectedNetworkName, protocolIds)
      const allowedProtocols = composed.allowedProtocols
      const parserProtocols = composed.parserProtocols
      const parserAddresses = composed.parserAddresses
      const selectors = composed.selectors
      const selectorTypes = composed.selectorTypes

      const vaultConfig = {
        safe: safeAddress as Address,
        oracle: effectiveOracle,
        agentAddress: agentAddress as Address,
        roleId,
        maxSpendingBps,
        maxSpendingUSD,
        windowDuration: 86400n, // 24h
        allowedProtocols,
        parserProtocols,
        parserAddresses,
        selectors,
        selectorTypes,
        priceFeedTokens,
        priceFeedAddresses,
        recipientWhitelistEnabled: false,
        allowedRecipients: [],
      } as const

      // Pre-flight: check the registry directly (bypasses React Query cache) to
      // detect SafeAlreadyHasModule before wasting a gas simulation.
      if (publicClient && moduleRegistryAddress) {
        const registeredModule = await publicClient.readContract({
          address: moduleRegistryAddress,
          abi: MODULE_REGISTRY_ABI,
          functionName: 'getModuleForSafe',
          args: [safeAddress as Address],
        })
        if (registeredModule && registeredModule !== zeroAddress) {
          setDeployError(
            `This Safe already has a Guardian registered in the module registry (${registeredModule}). Use "Open In Dashboard" above to manage it instead.`
          )
          return
        }
      }

      // Simulate first — surfaces the actual revert reason before any gas is spent.
      // If this throws, the outer catch will set deployError with the decoded message.
      if (publicClient && connectedAddress) {
        const { request } = await publicClient.simulateContract({
          address: FACTORY_ADDRESS,
          abi: AGENT_VAULT_FACTORY_ABI,
          functionName: 'deployVault',
          args: [vaultConfig],
          account: connectedAddress,
        })
        writeContract(request, {
          onSuccess(hash) {
            console.log('Vault deployment tx:', hash)
          },
          onError(error) {
            setDeployError(error.message)
          },
        })
      } else {
        writeContract(
          {
            address: FACTORY_ADDRESS,
            abi: AGENT_VAULT_FACTORY_ABI,
            functionName: 'deployVault',
            args: [vaultConfig],
          },
          {
            onSuccess(hash) {
              console.log('Vault deployment tx:', hash)
            },
            onError(error) {
              setDeployError(error.message)
            },
          }
        )
      }
    } catch (error) {
      // Viem's ContractFunctionRevertedError has shortMessage + cause.reason.
      // Prefer the most specific message; fall back through layers to avoid
      // dumping the full "Raw Call Arguments" block into the UI.
      const e = error as {
        shortMessage?: string
        cause?: { reason?: string; shortMessage?: string }
        message?: string
      }
      const raw =
        e.cause?.reason ??
        e.cause?.shortMessage ??
        e.shortMessage ??
        e.message ??
        'Deployment failed'
      // "execution reverted" with no reason means the contract reverted without
      // a message — surface a clearer explanation than the raw EVM term.
      const msg =
        raw === 'execution reverted' || raw === 'Execution reverted.'
          ? 'Deployment failed — the contract rejected the transaction. This usually means the configuration is invalid or the Safe is already registered. If the issue persists, contact support.'
          : raw
      setDeployError(msg)
    } finally {
      setIsSimulating(false)
    }
  }

  // When tx is confirmed, extract module address from AgentVaultCreated event
  if (isSuccess && receipt && !deployedModule) {
    let moduleAddress: string | null = null
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: AGENT_VAULT_FACTORY_ABI,
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName === 'AgentVaultCreated') {
          moduleAddress = (decoded.args as { module: Address }).module
          break
        }
      } catch {
        // Not an AgentVaultCreated event, skip
      }
    }
    setDeployedModule(moduleAddress ?? 'unknown')
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20">
        <h1 className="text-2xl font-semibold text-primary">Deploy an Agent Guardian</h1>
        <p className="text-secondary text-center max-w-md">
          Connect your wallet to deploy a new Guardian with on-chain guardrails for your AI agent.
        </p>
        <ConnectButton />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-8">
        {stepOrder.map((s, i) => (
          <div
            key={s}
            className="flex items-center gap-2"
          >
            <button
              type="button"
              onClick={() => {
                if (i < currentStepIndex) {
                  setStep(s)
                }
              }}
              disabled={i >= currentStepIndex}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                step === s
                  ? 'bg-accent-primary text-black cursor-default'
                  : i < currentStepIndex
                    ? 'bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 cursor-pointer'
                    : 'bg-elevated-2 text-tertiary cursor-not-allowed'
              }`}
              aria-label={i < currentStepIndex ? `Go back to step ${i + 1}` : `Step ${i + 1}`}
            >
              {i + 1}
            </button>
            {i < 2 && <div className="w-12 h-px bg-elevated-2" />}
          </div>
        ))}
        <span className="ml-3 text-sm text-secondary capitalize">{step}</span>
      </div>

      {/* Step 1: Pick Preset */}
      {step === 'preset' && (
        <div>
          <h1 className="text-2xl font-semibold text-primary mb-2">Choose a Preset</h1>
          <p className="text-secondary mb-8">
            Select a template that matches your agent's use case. Presets are just a starting point,
            you can still add custom protocols and adjust the guardrails afterward.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PRESETS.map(p => {
              const isComingSoon = p.id === 'payment-agent'
              const card = (
                <button
                  key={p.id}
                  onClick={() => {
                    if (isComingSoon) return
                    setSelectedPreset(p.id)
                    setSpendingLimitBps(String(p.defaultBps / 100))
                  }}
                  disabled={isComingSoon}
                  className={`w-full text-left p-5 rounded-xl border transition-all ${
                    isComingSoon
                      ? 'border-subtle bg-elevated opacity-50 cursor-not-allowed'
                      : selectedPreset === p.id
                        ? 'border-accent-primary bg-accent-primary/5 shadow-glow'
                        : 'border-subtle bg-elevated hover:border-accent-primary/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl w-10 h-10 rounded-lg bg-elevated-2 flex items-center justify-center font-mono text-accent-primary">
                      {p.icon}
                    </span>
                    <div className="flex-1">
                      <h3 className="font-semibold text-primary">{p.name}</h3>
                      <p className="text-sm text-secondary mt-1">{p.description}</p>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {getPresetProtocolLabels(p.id, chainId, p.protocols).map(proto => (
                          <span
                            key={proto}
                            className="text-xs px-2 py-0.5 rounded-full bg-elevated-2 text-tertiary"
                          >
                            {proto}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 text-xs text-tertiary">Role: {p.roleLabel}</div>
                    </div>
                  </div>
                </button>
              )
              return isComingSoon ? (
                <Tooltip
                  key={p.id}
                  content="Coming soon"
                >
                  {card}
                </Tooltip>
              ) : (
                card
              )
            })}
          </div>
          <div className="flex justify-end mt-8">
            <Button
              onClick={() => setStep('configure')}
              disabled={!selectedPreset}
              className="bg-accent-primary text-black hover:bg-accent-primary/90 disabled:opacity-50"
            >
              Next: Configure
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Configure */}
      {step === 'configure' && preset && (
        <div>
          <h1 className="text-2xl font-semibold text-primary mb-2">Configure: {preset.name}</h1>
          <p className="text-secondary mb-8">
            Set the Safe address, agent signer, and spending limit.
          </p>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-primary mb-1.5">Safe Address</label>
              <Input
                value={safeAddress}
                onChange={e => setSafeAddress(e.target.value)}
                placeholder="0x... (your Safe multisig)"
                className="bg-elevated-2 border-subtle"
              />
              {safeAddress && !isAddress(safeAddress) && (
                <p className="text-red-400 text-xs mt-1">Invalid address</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-primary mb-1.5">
                Agent Signer Address
              </label>
              <Input
                value={agentAddress}
                onChange={e => setAgentAddress(e.target.value)}
                placeholder="0x... (the AI agent's EOA)"
                className="bg-elevated-2 border-subtle"
              />
              {agentAddress && !isAddress(agentAddress) && (
                <p className="text-red-400 text-xs mt-1">Invalid address</p>
              )}
            </div>

            {/* Trust mode toggle */}
            <div>
              <label className="block text-sm font-medium text-primary mb-1.5">Trust Mode</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setOracleless(false)
                  }}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    !oracleless
                      ? 'border-accent-primary bg-accent-primary/5'
                      : 'border-subtle bg-elevated hover:border-accent-primary/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="w-4 h-4 text-accent-primary" />
                    <span className="text-sm font-medium text-primary">Oracle-managed</span>
                  </div>
                  <p className="text-xs text-tertiary">
                    Off-chain oracle tracks portfolio value &amp; spending. Supports both BPS and
                    USD limits. Worst-case oracle compromise: ~40% per window.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOracleless(true)
                    setSpendingLimitUSD('')
                  }}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    oracleless
                      ? 'border-accent-primary bg-accent-primary/5'
                      : 'border-subtle bg-elevated hover:border-accent-primary/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="w-4 h-4 text-accent-primary" />
                    <span className="text-sm font-medium text-primary">Oracleless</span>
                  </div>
                  <p className="text-xs text-tertiary">
                    Zero off-chain trust. USD-only limits, enforced solely by on-chain cumulative
                    counter.
                  </p>
                </button>
              </div>
            </div>

            {/* Spending limit */}
            <div>
              <label className="block text-sm font-medium text-primary mb-1.5">
                Spending Limit per 24h
              </label>

              {oracleless ? (
                <div className="flex items-center gap-3">
                  <span className="text-secondary text-lg">$</span>
                  <Input
                    type="number"
                    value={spendingLimitUSD}
                    onChange={e => setSpendingLimitUSD(e.target.value)}
                    min={1}
                    step={100}
                    placeholder="5000"
                    className="bg-elevated-2 border-subtle w-40"
                  />
                  <span className="text-secondary text-sm">USD per 24h window</span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    value={spendingLimitBps}
                    onChange={e => setSpendingLimitBps(e.target.value)}
                    min={0.01}
                    max={100}
                    step={0.5}
                    placeholder="5"
                    className="bg-elevated-2 border-subtle w-40"
                  />
                  <span className="text-secondary text-sm">% of portfolio per 24h</span>
                </div>
              )}

              <p className="text-xs text-tertiary mt-1.5">
                {oracleless
                  ? 'The agent cannot spend more than this USD amount in any rolling 24-hour period. Enforced on-chain.'
                  : 'Percentage of the total portfolio value the agent can spend per 24-hour window. Tracked by the oracle.'}
              </p>
            </div>
          </div>

          {selectedPreset === 'custom' && (
            <div className="mt-8 space-y-4">
              <div>
                <label className="block text-sm font-medium text-primary mb-1.5">
                  Allowed Protocols
                </label>
                <p className="text-xs text-tertiary mb-3">
                  Select which protocols the agent is allowed to interact with. All contract
                  addresses for each protocol will be whitelisted.
                </p>
              </div>
              <div className="space-y-2">
                {PROTOCOLS.map(protocol => {
                  // A protocol is selectable only if it has parser+selector
                  // bindings on the active network. Anything else would deploy
                  // a half-configured vault that can't actually call it.
                  const isComingSoon = !supportedProtocolIds.includes(protocol.id)
                  const isSelected = !isComingSoon && selectedProtocols.includes(protocol.id)
                  const card = (
                    <button
                      key={protocol.id}
                      type="button"
                      disabled={isComingSoon}
                      onClick={() => {
                        if (isComingSoon) return
                        setSelectedProtocols(prev =>
                          isSelected
                            ? prev.filter(id => id !== protocol.id)
                            : [...prev, protocol.id]
                        )
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        isComingSoon
                          ? 'border-subtle bg-elevated opacity-50 cursor-not-allowed'
                          : isSelected
                            ? 'border-accent-primary bg-accent-primary/5'
                            : 'border-subtle bg-elevated hover:border-accent-primary/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-primary">{protocol.name}</span>
                          <span className="text-xs text-tertiary ml-2">{protocol.description}</span>
                        </div>
                        {!isComingSoon && (
                          <div
                            className={`w-5 h-5 rounded border flex items-center justify-center text-xs ${
                              isSelected
                                ? 'border-accent-primary bg-accent-primary text-black'
                                : 'border-subtle'
                            }`}
                          >
                            {isSelected && '✓'}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {protocol.contracts.map(c => (
                          <span
                            key={c.id}
                            className="text-xs px-1.5 py-0.5 rounded bg-elevated-2 text-tertiary"
                          >
                            {c.name}
                          </span>
                        ))}
                      </div>
                    </button>
                  )
                  return isComingSoon ? (
                    <Tooltip
                      key={protocol.id}
                      content="Coming soon"
                    >
                      {card}
                    </Tooltip>
                  ) : (
                    card
                  )
                })}
              </div>
              {selectedProtocols.length === 0 && (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <p className="text-xs text-yellow-400">
                    No protocols selected. The agent will not be able to interact with any DeFi
                    protocol. You can add more protocols later from the dashboard.
                  </p>
                </div>
              )}
            </div>
          )}

          {(!FACTORY_ADDRESS || !oracleConfigOk) && (
            <div className="mt-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-400">
                Missing deployment config. Set VITE_AGENT_VAULT_FACTORY_ADDRESS
                {!oracleless && ' and VITE_ORACLE_ADDRESS'} in your environment.
                {!oracleless && ' Or enable Oracleless mode above.'}
              </p>
            </div>
          )}

          <div className="flex justify-between mt-10">
            <Button
              variant="outline"
              onClick={() => setStep('preset')}
            >
              Back
            </Button>
            <Button
              onClick={() => setStep('review')}
              disabled={
                !isAddress(agentAddress) ||
                !isAddress(safeAddress) ||
                !FACTORY_ADDRESS ||
                !oracleConfigOk ||
                (oracleless && (!spendingLimitUSD || Number(spendingLimitUSD) <= 0))
              }
              className="bg-accent-primary text-black hover:bg-accent-primary/90 disabled:opacity-50"
            >
              Next: Review
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Deploy */}
      {step === 'review' && preset && (
        <div>
          <h1 className="text-2xl font-semibold text-primary mb-2">Review & Deploy</h1>
          <p className="text-secondary mb-8">
            Confirm your Guardian configuration. This will deploy a Guardian contract configured for
            your agent.
          </p>

          <div className="bg-elevated rounded-xl border border-subtle p-6 space-y-4">
            <div className="flex justify-between">
              <span className="text-secondary">Preset</span>
              <span className="text-primary font-medium">{preset.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-secondary">Safe</span>
              <div className="flex items-center gap-1">
                <span className="text-primary font-mono text-sm">
                  {safeAddress.slice(0, 6)}...{safeAddress.slice(-4)}
                </span>
                <CopyButton value={safeAddress} />
                <a
                  href={`${getExplorerBase(chainId)}/address/${safeAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-6 h-6 rounded text-tertiary hover:text-secondary hover:bg-elevated-2 transition-colors"
                  title="View on explorer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-secondary">Agent Signer</span>
              <div className="flex items-center gap-1">
                <span className="text-primary font-mono text-sm">
                  {agentAddress.slice(0, 6)}...{agentAddress.slice(-4)}
                </span>
                <CopyButton value={agentAddress} />
                <a
                  href={`${getExplorerBase(chainId)}/address/${agentAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-6 h-6 rounded text-tertiary hover:text-secondary hover:bg-elevated-2 transition-colors"
                  title="View on explorer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-secondary">Role</span>
              <span className="text-primary">{preset.roleLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-secondary">Trust Mode</span>
              <span className="text-primary">
                {oracleless ? 'Oracleless (zero off-chain trust)' : 'Oracle-managed'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-secondary">Spending Limit</span>
              <span className="text-primary">
                {oracleless
                  ? `$${Number(spendingLimitUSD || 0).toLocaleString()} per 24h`
                  : `${spendingLimitBps}% of portfolio per 24h`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-secondary">Protocols</span>
              <span className="text-primary text-right">
                {selectedPreset === 'custom'
                  ? selectedProtocols
                      .map(id => PROTOCOLS.find(p => p.id === id)?.name)
                      .filter(Boolean)
                      .join(', ') || 'None'
                  : selectedPresetProtocolLabels.join(', ')}
              </span>
            </div>
          </div>

          {showExistingModuleWarning && existingModuleAddress && (
            <div className="mt-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-sm font-medium text-yellow-400">
                This Safe already has a registered Guardian
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-xs text-yellow-400/80 font-mono">
                  {existingModuleAddress}
                </span>
                <CopyButton value={existingModuleAddress} />
                <a
                  href={`${getExplorerBase(chainId)}/address/${existingModuleAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-5 h-5 rounded text-yellow-400/70 hover:text-yellow-400 transition-colors"
                  title="View Guardian"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-xs text-yellow-400/80 mt-2">
                Only one Guardian is allowed per Safe. Instead of creating a second one, this wizard
                will add the new agent to the existing Guardian with the selected preset.
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setGuardian(existingModuleAddress as `0x${string}`)
                    navigate(`${ROUTES.DASHBOARD}?guardian=${existingModuleAddress}`)
                  }}
                >
                  Open In Dashboard
                </Button>
              </div>
            </div>
          )}

          {deployError && !isSimulating && (
            <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 space-y-2">
              <p className="text-sm text-red-400">{deployError}</p>
              {FACTORY_ADDRESS && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-red-400/70 font-mono">
                    Factory: {FACTORY_ADDRESS.slice(0, 10)}...{FACTORY_ADDRESS.slice(-8)}
                  </span>
                  <CopyButton value={FACTORY_ADDRESS} />
                  <a
                    href={`${getExplorerBase(chainId)}/address/${FACTORY_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-5 h-5 rounded text-red-400/70 hover:text-red-400 transition-colors"
                    title="View factory contract"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {isConfiguringExistingVault && (
            <div className="mt-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
              <p className="text-sm text-blue-400">Configuring the existing Guardian...</p>
            </div>
          )}

          {isSimulating && (
            <div className="mt-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
              <p className="text-sm text-blue-400">Validating configuration...</p>
            </div>
          )}

          {!isSimulating && isWriting && (
            <div className="mt-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
              <p className="text-sm text-blue-400">Waiting for wallet confirmation...</p>
            </div>
          )}

          {!isSimulating && isConfirming && !txFailed && txHash && (
            <div className="mt-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-center gap-3 mb-2">
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
                <p className="text-sm text-blue-400 font-medium">
                  Transaction submitted — waiting for confirmation...
                </p>
              </div>
              <div className="flex items-center gap-1.5 ml-7">
                <span className="text-xs text-blue-400/70 font-mono">
                  {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </span>
                <CopyButton value={txHash} />
                <a
                  href={`${getExplorerBase(chainId)}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-5 h-5 rounded text-blue-400/70 hover:text-blue-400 transition-colors"
                  title="View transaction"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {!isSimulating && txFailed && txHash && (
            <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 space-y-2">
              <p className="text-sm font-medium text-red-400">Transaction failed</p>
              {txFailMessage && (
                <p className="text-xs text-red-400/80 break-words">{txFailMessage}</p>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-red-400/70 font-mono">
                  {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </span>
                <CopyButton value={txHash} />
                <a
                  href={`${getExplorerBase(chainId)}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-5 h-5 rounded text-red-400/70 hover:text-red-400 transition-colors"
                  title="View transaction"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {(usedExistingVault || (isSuccess && !txReverted && txHash)) && (
            <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20 space-y-3">
              <p className="text-sm font-medium text-green-400">
                {usedExistingVault
                  ? 'The agent has been added to the existing Guardian successfully!'
                  : 'Guardian deployed successfully!'}
              </p>

              <div>
                <p className="text-xs text-green-400/70 mb-1">Transaction</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-green-400 font-mono">
                    {(usedExistingVault ? existingVaultTxHash : txHash)?.slice(0, 10)}...
                    {(usedExistingVault ? existingVaultTxHash : txHash)?.slice(-8)}
                  </span>
                  <CopyButton value={(usedExistingVault ? existingVaultTxHash : txHash)!} />
                  <a
                    href={`${getExplorerBase(chainId)}/tx/${usedExistingVault ? existingVaultTxHash : txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-6 h-6 rounded text-green-400/70 hover:text-green-400 transition-colors"
                    title="View transaction"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {deployedModule && deployedModule !== 'unknown' && (
                <div>
                  <p className="text-xs text-green-400/70 mb-1">Guardian address</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-green-400 font-mono">{deployedModule}</span>
                    <CopyButton value={deployedModule} />
                    <a
                      href={`${getExplorerBase(chainId)}/address/${deployedModule}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center w-6 h-6 rounded text-green-400/70 hover:text-green-400 transition-colors"
                      title="View on explorer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              )}

              {!usedExistingVault &&
                deployedModule &&
                deployedModule !== 'unknown' &&
                (isModuleEnabledOnSafe ? (
                  <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-300">
                    Guardian is enabled on the Safe — the agent is ready to operate.
                    {enableModuleTxHash && (
                      <a
                        href={`${getExplorerBase(chainId)}/tx/${enableModuleTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 underline hover:text-green-200"
                      >
                        View tx
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 space-y-2">
                    <p className="text-xs font-medium text-yellow-300">
                      Activate the Guardian on your Safe
                    </p>
                    <p className="text-xs text-yellow-300/80">
                      One Safe transaction calls <code className="font-mono">enableModule</code>.
                      The signer must be a Safe owner.
                    </p>
                    {!isConnectedSafeOwner && (
                      <p className="text-xs text-red-400">
                        Connected wallet is not a Safe owner — switch to a signer of{' '}
                        {safeAddress.slice(0, 6)}…{safeAddress.slice(-4)} to continue.
                      </p>
                    )}
                    {enableModuleError && (
                      <p className="text-xs text-red-400 break-words">{enableModuleError}</p>
                    )}
                    <Button
                      onClick={handleEnableModule}
                      disabled={isEnablingModule || !isConnectedSafeOwner}
                      className="bg-accent-primary text-black hover:bg-accent-primary/90 disabled:opacity-50"
                    >
                      {isEnablingModule ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Enabling…
                        </>
                      ) : (
                        'Enable Guardian on Safe'
                      )}
                    </Button>
                  </div>
                ))}

              <div className="pt-1">
                <p className="text-xs text-green-400/70 mb-2">
                  {usedExistingVault
                    ? 'The new agent is now configured on the existing Guardian.'
                    : isModuleEnabledOnSafe
                      ? 'You can now go to the Dashboard to manage the Guardian.'
                      : 'Activate the Guardian above, then proceed to the Dashboard.'}
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    const target = usedExistingVault
                      ? existingModuleAddress
                      : deployedModule && deployedModule !== 'unknown'
                        ? deployedModule
                        : null
                    if (target) setGuardian(target as `0x${string}`)
                    navigate(`${ROUTES.DASHBOARD}?guardian=${target ?? ''}`)
                  }}
                >
                  Go to Dashboard
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-between mt-8">
            <Button
              variant="outline"
              onClick={() => setStep('configure')}
              disabled={isDeploying}
            >
              Back
            </Button>
            <Button
              onClick={handleDeploy}
              disabled={
                isSimulating ||
                isDeploying ||
                isConfiguringExistingVault ||
                usedExistingVault ||
                (isSuccess && !txReverted && !usedExistingVault)
              }
              className="bg-accent-primary text-black hover:bg-accent-primary/90 disabled:opacity-50"
            >
              {isConfiguringExistingVault
                ? 'Configuring Existing Guardian...'
                : isSimulating
                  ? 'Validating...'
                  : isWriting
                    ? 'Confirm in Wallet...'
                    : isConfirming && !txFailed
                      ? 'Deploying...'
                      : usedExistingVault || (isSuccess && !txReverted)
                        ? 'Deployed!'
                        : txFailed
                          ? 'Retry Deploy'
                          : showExistingModuleWarning
                            ? 'Add Agent To Existing Guardian'
                            : 'Deploy Guardian'}
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={isExistingVaultFlowModalOpen}
        onOpenChange={open => {
          if (!open && !isConfiguringExistingVault) {
            setIsExistingVaultFlowModalOpen(false)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogClose onClose={() => setIsExistingVaultFlowModalOpen(false)} />
          <DialogHeader>
            <DialogTitle>
              Approve {expectedExistingVaultWalletApprovals} transaction
              {expectedExistingVaultWalletApprovals === 1 ? '' : 's'}
            </DialogTitle>
            <DialogDescription>
              {isExistingVaultDirectOwnerFlow
                ? 'Your wallet will sign each transaction separately.'
                : 'Transactions are bundled into one Safe flow — sign once, then execute.'}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="ghost"
              disabled={isConfiguringExistingVault}
              onClick={() => setIsExistingVaultFlowModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={isConfiguringExistingVault || pendingExistingVaultTransactions.length === 0}
              onClick={() => executeExistingVaultConfiguration(pendingExistingVaultTransactions)}
            >
              {isConfiguringExistingVault ? 'Submitting...' : 'Continue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
