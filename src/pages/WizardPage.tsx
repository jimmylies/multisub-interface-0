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
import { getExplorerBase } from '@/lib/chains'
import { AGENT_VAULT_FACTORY_ABI, DEFI_INTERACTOR_ABI, MODULE_REGISTRY_ABI, ROLES } from '@/lib/contracts'
import { PROTOCOLS, getProtocolContractAddresses } from '@/lib/protocols'
import { encodeContractCall, useSafeProposal } from '@/hooks/useSafeProposal'
import { TRANSACTION_TYPES } from '@/lib/transactionTypes'

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
    description: 'Swap tokens on Uniswap, 1inch, and Paraswap. Supply to Aave V3.',
    protocols: ['Uniswap V3/V4', 'Universal Router', 'Aave V3', '1inch'],
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

  if (chainId !== 84532) {
    return [...fallbackLabels]
  }

  const presetConfig = BASE_SEPOLIA_PRESET_CONFIG[presetId]
  if (!presetConfig) {
    return [...fallbackLabels]
  }

  const matchingProtocols = PROTOCOLS.filter(protocol => {
    const protocolAddresses = new Set(
      getProtocolContractAddresses(protocol.id).map(addr => addr.toLowerCase())
    )

    return presetConfig.allowedProtocols.some(addr => protocolAddresses.has(addr.toLowerCase()))
  }).map(protocol => protocol.name)

  return matchingProtocols.length > 0 ? matchingProtocols : [...fallbackLabels]
}

// Fixed deployment config — set via environment variables
const FACTORY_ADDRESS = import.meta.env.VITE_AGENT_VAULT_FACTORY_ADDRESS as Address | undefined
const ORACLE_ADDRESS = import.meta.env.VITE_ORACLE_ADDRESS as Address | undefined
const PRICE_FEED_TOKENS = (import.meta.env.VITE_PRICE_FEED_TOKENS || '')
  .split(',')
  .filter(Boolean) as Address[]
const PRICE_FEED_ADDRESSES = (import.meta.env.VITE_PRICE_FEED_ADDRESSES || '')
  .split(',')
  .filter(Boolean) as Address[]

const PRESET_ROLE_IDS: Record<string, number> = {
  'defi-trader': ROLES.DEFI_EXECUTE_ROLE,
  'yield-farmer': ROLES.DEFI_EXECUTE_ROLE,
  'payment-agent': ROLES.DEFI_TRANSFER_ROLE,
}

const BASE_SEPOLIA_PRESET_CONFIG: Record<
  string,
  {
    roleId: number
    maxSpendingBps: number
    allowedProtocols: Address[]
    parserRegistrations: Array<{ protocol: Address; parser: Address }>
    selectorRegistrations: Array<{ selector: `0x${string}`; opType: number }>
  }
> = {
  'defi-trader': {
    roleId: ROLES.DEFI_EXECUTE_ROLE,
    maxSpendingBps: 500,
    allowedProtocols: [
      '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
      '0x71B448405c803A3982aBa448133133D2DEAFBE5F',
      '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',
      '0x492E6456D9528771018DeB9E87ef7750EF184104',
    ],
    parserRegistrations: [
      {
        protocol: '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
        parser: '0x36683D4a7A8561911b0c00138D943b0CF61a437C',
      },
      {
        protocol: '0x71B448405c803A3982aBa448133133D2DEAFBE5F',
        parser: '0x36683D4a7A8561911b0c00138D943b0CF61a437C',
      },
      {
        protocol: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',
        parser: '0x37F53B27CAAcCb1cDc100d0bC0E52d8B09937aCc',
      },
      {
        protocol: '0x492E6456D9528771018DeB9E87ef7750EF184104',
        parser: '0x0e5A08b67BB89E8050A361f19Bcb70D9Ba6bF568',
      },
    ],
    selectorRegistrations: [
      { selector: '0x095ea7b3', opType: 5 },
      { selector: '0x617ba037', opType: 2 },
      { selector: '0x69328dec', opType: 3 },
      { selector: '0xa415bcad', opType: 3 },
      { selector: '0x573ade81', opType: 6 },
      { selector: '0x236300dc', opType: 4 },
      { selector: '0xbb492bf5', opType: 4 },
      { selector: '0x04e45aaf', opType: 1 },
      { selector: '0xb858183f', opType: 1 },
      { selector: '0x5023b4df', opType: 1 },
      { selector: '0x3593564c', opType: 1 },
    ],
  },
  'yield-farmer': {
    roleId: ROLES.DEFI_EXECUTE_ROLE,
    maxSpendingBps: 1000,
    allowedProtocols: [
      '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
      '0x71B448405c803A3982aBa448133133D2DEAFBE5F',
      '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
      '0x6566194141eefa99Af43Bb5Aa71460Ca2Dc90245',
    ],
    parserRegistrations: [
      {
        protocol: '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
        parser: '0x36683D4a7A8561911b0c00138D943b0CF61a437C',
      },
      {
        protocol: '0x71B448405c803A3982aBa448133133D2DEAFBE5F',
        parser: '0x36683D4a7A8561911b0c00138D943b0CF61a437C',
      },
    ],
    selectorRegistrations: [
      { selector: '0x095ea7b3', opType: 5 },
      { selector: '0x617ba037', opType: 2 },
      { selector: '0x69328dec', opType: 3 },
      { selector: '0xa415bcad', opType: 3 },
      { selector: '0x573ade81', opType: 6 },
      { selector: '0x236300dc', opType: 4 },
      { selector: '0xbb492bf5', opType: 4 },
      { selector: '0xa99aad89', opType: 2 },
      { selector: '0x5c2bea49', opType: 3 },
      { selector: '0x20b76e81', opType: 6 },
      { selector: '0x238d6579', opType: 2 },
      { selector: '0x8720316d', opType: 3 },
    ],
  },
  'payment-agent': {
    roleId: ROLES.DEFI_TRANSFER_ROLE,
    maxSpendingBps: 100,
    allowedProtocols: [],
    parserRegistrations: [],
    selectorRegistrations: [],
  },
}

export function WizardPage() {
  const navigate = useNavigate()
  const { isConnected, address: connectedAddress } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const [step, setStep] = useState<Step>('preset')
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [agentAddress, setAgentAddress] = useState('')
  const [spendingLimitUSD, setSpendingLimitUSD] = useState('5000')
  const [spendingLimitBps, setSpendingLimitBps] = useState('5')
  const [spendingMode, setSpendingMode] = useState<'usd' | 'bps'>('usd')
  const [safeAddress, setSafeAddress] = useState('')
  const [selectedProtocols, setSelectedProtocols] = useState<string[]>([])
  const [oracleless, setOracleless] = useState(false)
  const [deployedModule, setDeployedModule] = useState<string | null>(null)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [existingVaultTxHash, setExistingVaultTxHash] = useState<`0x${string}` | null>(null)
  const [usedExistingVault, setUsedExistingVault] = useState(false)
  const [isExistingVaultFlowModalOpen, setIsExistingVaultFlowModalOpen] = useState(false)
  const [pendingExistingVaultTransactions, setPendingExistingVaultTransactions] = useState<
    ExistingVaultTransaction[]
  >([])
  const [pendingExistingVaultExplanations, setPendingExistingVaultExplanations] = useState<
    ExistingVaultTransactionExplanation[]
  >([])

  // Effective oracle: real address in oracle mode, zeroAddress in oracleless mode
  const effectiveOracle: Address | undefined = oracleless ? zeroAddress : ORACLE_ADDRESS
  // In oracleless mode, oracle address can be missing (we use zeroAddress)
  const oracleConfigOk = oracleless || !!ORACLE_ADDRESS

  const { writeContract, data: txHash, isPending: isWriting } = useWriteContract()
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

  const existingModuleAddress = existingModule && existingModule !== zeroAddress ? existingModule : null
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
  const isDeploying = isWriting || isConfirming
  const { proposeTransaction, isPending: isConfiguringExistingVault } = useSafeProposal()

  async function executeExistingVaultConfiguration(transactions: ExistingVaultTransaction[]) {
    setDeployError(null)
    setExistingVaultTxHash(null)
    setUsedExistingVault(false)
    setIsExistingVaultFlowModalOpen(false)

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

  async function handleConfigureExistingVault() {
    if (
      !preset ||
      !existingModuleAddress ||
      !isAddress(agentAddress) ||
      !publicClient
    ) {
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

    if (preset.id === 'custom') {
      addTransaction(
        {
          to: existingModuleAddress,
          data: encodeContractCall(existingModuleAddress, DEFI_INTERACTOR_ABI, 'grantRole', [
            agentAddress as Address,
            ROLES.DEFI_EXECUTE_ROLE,
          ]),
        },
        {
          title: 'Grant agent role',
          description: 'Gives this agent the EXECUTE permission needed to operate inside the vault.',
        }
      )
      addTransaction(
        {
          to: existingModuleAddress,
          data: encodeContractCall(existingModuleAddress, DEFI_INTERACTOR_ABI, 'setSubAccountLimits', [
            agentAddress as Address,
            oracleless ? 0n : spendingMode === 'bps' ? BigInt(Math.round(Number(spendingLimitBps || '0') * 100)) : 10000n,
            spendingMode === 'bps' && !oracleless ? 0n : parseUnits(spendingLimitUSD || '0', 18),
            86400n,
          ]),
        },
        {
          title: 'Set spending limits',
          description: 'Applies the spending cap and 24-hour window for this agent.',
        }
      )

      const allowedProtocols = selectedProtocols.flatMap(id => getProtocolContractAddresses(id) as Address[])
      if (allowedProtocols.length > 0) {
        addTransaction(
          {
            to: existingModuleAddress,
            data: encodeContractCall(existingModuleAddress, DEFI_INTERACTOR_ABI, 'setAllowedAddresses', [
              agentAddress as Address,
              allowedProtocols,
              true,
            ]),
          },
          {
            title: 'Whitelist allowed protocols',
            description: 'Restricts this agent to the protocol addresses you selected for the custom setup.',
          }
        )
      }
    } else {
      const presetConfig = chainId === 84532 ? BASE_SEPOLIA_PRESET_CONFIG[preset.id] : undefined

      if (!presetConfig) {
        setDeployError('Adding preset agents to an existing vault is currently supported on Base Sepolia only.')
        return
      }

      const parserStatuses = await Promise.all(
        presetConfig.parserRegistrations.map(async ({ protocol, parser }) => {
          const currentParser = await publicClient.readContract({
            address: existingModuleAddress,
            abi: DEFI_INTERACTOR_ABI,
            functionName: 'protocolParsers',
            args: [protocol],
          })

          return {
            protocol,
            parser,
            needsRegistration: currentParser.toLowerCase() !== parser.toLowerCase(),
          }
        })
      )

      parserStatuses
        .filter(({ needsRegistration }) => needsRegistration)
        .forEach(({ protocol, parser }) => {
          addTransaction(
            {
              to: existingModuleAddress,
              data: encodeContractCall(existingModuleAddress, DEFI_INTERACTOR_ABI, 'registerParser', [
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
        presetConfig.selectorRegistrations.map(async ({ selector, opType }) => {
          const currentOpType = await publicClient.readContract({
            address: existingModuleAddress,
            abi: DEFI_INTERACTOR_ABI,
            functionName: 'selectorType',
            args: [selector],
          })

          return {
            selector,
            opType,
            needsRegistration: Number(currentOpType) !== opType,
          }
        })
      )

      selectorStatuses
        .filter(({ needsRegistration }) => needsRegistration)
        .forEach(({ selector, opType }) => {
          addTransaction(
            {
              to: existingModuleAddress,
              data: encodeContractCall(existingModuleAddress, DEFI_INTERACTOR_ABI, 'registerSelector', [
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
        abi: DEFI_INTERACTOR_ABI,
        functionName: 'hasRole',
        args: [agentAddress as Address, PRESET_ROLE_IDS[preset.id]],
      })

      if (!alreadyHasRole) {
        addTransaction(
          {
            to: existingModuleAddress,
            data: encodeContractCall(existingModuleAddress, DEFI_INTERACTOR_ABI, 'grantRole', [
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
          data: encodeContractCall(existingModuleAddress, DEFI_INTERACTOR_ABI, 'setSubAccountLimits', [
            agentAddress as Address,
            oracleless ? 0n : spendingMode === 'bps' ? BigInt(Math.round(Number(spendingLimitBps || '0') * 100)) : 10000n,
            spendingMode === 'bps' && !oracleless ? 0n : parseUnits(spendingLimitUSD || '0', 18),
            86400n,
          ]),
        },
        {
          title: 'Set spending limits',
          description: 'Applies the spending cap and daily reset window for this agent.',
        }
      )

      if (presetConfig.allowedProtocols.length > 0) {
        addTransaction(
          {
            to: existingModuleAddress,
            data: encodeContractCall(existingModuleAddress, DEFI_INTERACTOR_ABI, 'setAllowedAddresses', [
              agentAddress as Address,
              presetConfig.allowedProtocols,
              true,
            ]),
          },
          {
            title: 'Whitelist allowed protocols',
            description: 'Allows this agent to call only the protocol contracts included in the preset.',
          }
        )
      }
    }

    if (transactions.length === 0) {
      setDeployError('This agent already appears to be configured for the selected preset on the existing vault.')
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
    if (
      !preset ||
      !isAddress(safeAddress) ||
      !isAddress(agentAddress) ||
      !FACTORY_ADDRESS ||
      !effectiveOracle
    )
      return

    if (showExistingModuleWarning) {
      await handleConfigureExistingVault()
      return
    }

    // Oracleless mode requires a USD spending limit
    if (oracleless && (!spendingLimitUSD || Number(spendingLimitUSD) <= 0)) {
      setDeployError('Oracleless mode requires a USD spending limit')
      return
    }

    setDeployError(null)
    setDeployedModule(null)
    setUsedExistingVault(false)
    setExistingVaultTxHash(null)

    const presetId = PRESET_IDS[preset.id]
    // In oracleless mode, price feeds are not strictly needed for spending tracking
    // but we still pass them for token decimal lookups in approve/transfer paths
    const priceFeedTokens = PRICE_FEED_TOKENS
    const priceFeedAddresses = PRICE_FEED_ADDRESSES

    try {
      if (presetId !== undefined) {
        // Deploy from preset (standard presets)
        writeContract(
          {
            address: FACTORY_ADDRESS,
            abi: AGENT_VAULT_FACTORY_ABI,
            functionName: 'deployVaultFromPreset',
            args: [
              safeAddress as Address,
              effectiveOracle,
              agentAddress as Address,
              BigInt(presetId),
              priceFeedTokens,
              priceFeedAddresses,
            ],
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
      } else {
        // Custom preset — deploy with full config
        // Oracleless mode: BPS=0 (USD-only). Oracle+BPS mode: use user value. Oracle+USD mode: 100% BPS cap.
        const maxSpendingBps = oracleless
          ? 0n
          : spendingMode === 'bps'
            ? BigInt(Math.round(Number(spendingLimitBps || '0') * 100))
            : 10000n
        writeContract(
          {
            address: FACTORY_ADDRESS,
            abi: AGENT_VAULT_FACTORY_ABI,
            functionName: 'deployVault',
            args: [
              {
                safe: safeAddress as Address,
                oracle: effectiveOracle,
                agentAddress: agentAddress as Address,
                roleId: 1, // EXECUTE by default for custom
                maxSpendingBps,
                maxSpendingUSD: spendingMode === 'bps' && !oracleless ? 0n : parseUnits(spendingLimitUSD || '0', 18),
                windowDuration: 86400n, // 24h
                allowedProtocols: selectedProtocols.flatMap(
                  id => getProtocolContractAddresses(id) as Address[]
                ),
                parserProtocols: [],
                parserAddresses: [],
                selectors: [],
                selectorTypes: [],
                priceFeedTokens,
                priceFeedAddresses,
              },
            ],
          },
          {
            onSuccess(hash) {
              console.log('Custom vault deployment tx:', hash)
            },
            onError(error) {
              setDeployError(error.message)
            },
          }
        )
      }
    } catch (error) {
      setDeployError(error instanceof Error ? error.message : 'Deployment failed')
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
        <h1 className="text-2xl font-semibold text-primary">Deploy an Agent Vault</h1>
        <p className="text-secondary text-center max-w-md">
          Connect your wallet to deploy a new vault with on-chain guardrails for your AI agent.
        </p>
        <ConnectButton />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-8">
        {(['preset', 'configure', 'review'] as Step[]).map((s, i) => (
          <div
            key={s}
            className="flex items-center gap-2"
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s
                  ? 'bg-accent-primary text-black'
                  : i < ['preset', 'configure', 'review'].indexOf(step)
                    ? 'bg-accent-primary/20 text-accent-primary'
                    : 'bg-elevated-2 text-tertiary'
              }`}
            >
              {i + 1}
            </div>
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
            Select a template that matches your agent's use case. Presets are just a starting
            point, you can still add custom protocols and adjust the guardrails afterward.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedPreset(p.id)
                  setSpendingLimitBps(String(p.defaultBps / 100))
                  setSpendingMode('bps')
                }}
                className={`text-left p-5 rounded-xl border transition-all ${
                  selectedPreset === p.id
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
            ))}
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
                  onClick={() => { setOracleless(false); setSpendingMode('usd') }}
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
                  onClick={() => { setOracleless(true); setSpendingMode('usd') }}
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
                    counter. Worst-case damage = your USD limit.
                  </p>
                </button>
              </div>
            </div>

            {/* Spending limit */}
            <div>
              <label className="block text-sm font-medium text-primary mb-1.5">
                Spending Limit per 24h
              </label>

              {/* Mode toggle — only show when oracle is enabled */}
              {!oracleless && (
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setSpendingMode('usd')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      spendingMode === 'usd'
                        ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                        : 'border-subtle bg-elevated text-tertiary hover:text-secondary'
                    }`}
                  >
                    USD
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpendingMode('bps')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      spendingMode === 'bps'
                        ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                        : 'border-subtle bg-elevated text-tertiary hover:text-secondary'
                    }`}
                  >
                    % of portfolio
                  </button>
                </div>
              )}

              {spendingMode === 'usd' || oracleless ? (
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
                  : spendingMode === 'bps'
                    ? 'Percentage of the total portfolio value the agent can spend per 24-hour window. Tracked by the oracle.'
                    : 'The agent cannot spend more than this amount in any rolling 24-hour period. Enforced on-chain via price feed oracles.'}
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
                  const isSelected = selectedProtocols.includes(protocol.id)
                  return (
                    <button
                      key={protocol.id}
                      type="button"
                      onClick={() =>
                        setSelectedProtocols(prev =>
                          isSelected
                            ? prev.filter(id => id !== protocol.id)
                            : [...prev, protocol.id]
                        )
                      }
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'border-accent-primary bg-accent-primary/5'
                          : 'border-subtle bg-elevated hover:border-accent-primary/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-primary">{protocol.name}</span>
                          <span className="text-xs text-tertiary ml-2">{protocol.description}</span>
                        </div>
                        <div
                          className={`w-5 h-5 rounded border flex items-center justify-center text-xs ${
                            isSelected
                              ? 'border-accent-primary bg-accent-primary text-black'
                              : 'border-subtle'
                          }`}
                        >
                          {isSelected && '✓'}
                        </div>
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
                })}
              </div>
              {selectedProtocols.length === 0 && (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <p className="text-xs text-yellow-400">
                    No protocols selected. The agent will not be able to interact with any DeFi
                    protocol. You can add protocols after deployment via addAllowedProtocol().
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
            Confirm your vault configuration. This will deploy a DeFiInteractorModule configured for
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
                {!oracleless && spendingMode === 'bps'
                  ? `${spendingLimitBps}% of portfolio per 24h`
                  : `$${Number(spendingLimitUSD || 0).toLocaleString()} per 24h`}
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

          <div className="mt-6 p-4 rounded-lg bg-accent-primary/5 border border-accent-primary/20">
            <p className="text-sm text-secondary">
              After deployment, you will need to enable the module on your Safe (1 multisig
              transaction). The agent cannot operate until the module is enabled.
            </p>
          </div>

          {selectedPreset === 'custom' && (
            <div className="mt-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-sm font-medium text-yellow-400">
                Custom preset: additional setup required
              </p>
              <p className="text-xs text-yellow-400/80 mt-1">
                The custom preset deploys without calldata parsers or function selectors. After
                deployment, you may need to configure these via the module owner functions
                (addParser, addSelector) to enable specific operations.
              </p>
            </div>
          )}

          {showExistingModuleWarning && existingModuleAddress && (
            <div className="mt-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-sm font-medium text-yellow-400">
                This Safe already has a registered vault
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
                  title="View module"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-xs text-yellow-400/80 mt-2">
                `AgentVaultFactory` allows only one registered module per Safe. Instead of creating
                a second module, this wizard will add the new agent to the existing vault with the
                selected preset.
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    localStorage.setItem('defiInteractor', existingModuleAddress)
                    navigate(`${ROUTES.AGENTS}?defiInteractor=${existingModuleAddress}`)
                  }}
                >
                  Open In Agents
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    localStorage.setItem('defiInteractor', existingModuleAddress)
                    navigate(`${ROUTES.DASHBOARD}?defiInteractor=${existingModuleAddress}`)
                  }}
                >
                  Open In Advanced
                </Button>
              </div>
            </div>
          )}

          {deployError && (
            <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-sm text-red-400">{deployError}</p>
            </div>
          )}

          {isConfiguringExistingVault && (
            <div className="mt-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
              <p className="text-sm text-blue-400">Configuring the existing vault...</p>
            </div>
          )}

          {isWriting && (
            <div className="mt-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
              <p className="text-sm text-blue-400">Waiting for wallet confirmation...</p>
            </div>
          )}

          {isConfirming && !txFailed && txHash && (
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

          {txFailed && txHash && (
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
                {usedExistingVault ? 'The agent has been added to the existing vault successfully!' : 'Vault deployed successfully!'}
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
                  <p className="text-xs text-green-400/70 mb-1">Module address</p>
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

              <div className="pt-1">
                <p className="text-xs text-green-400/70 mb-2">
                  {usedExistingVault
                    ? 'The new agent is now configured on the existing vault.'
                    : 'Next: enable this module in your Safe to activate the agent.'}
                </p>
                <Button
                  variant="outline"
                  onClick={() => navigate(ROUTES.AGENTS)}
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
              disabled={isDeploying || isConfiguringExistingVault || usedExistingVault || (isSuccess && !txReverted && !usedExistingVault)}
              className="bg-accent-primary text-black hover:bg-accent-primary/90 disabled:opacity-50"
            >
              {isConfiguringExistingVault
                ? 'Configuring Existing Vault...'
                : isWriting
                ? 'Confirm in Wallet...'
                : isConfirming && !txFailed
                  ? 'Deploying...'
                  : usedExistingVault || (isSuccess && !txReverted)
                    ? 'Deployed!'
                    : txFailed
                      ? 'Retry Deploy'
                      : showExistingModuleWarning
                        ? 'Add Agent To Existing Vault'
                        : 'Deploy Vault'}
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
              Approve {expectedExistingVaultWalletApprovals} transaction{expectedExistingVaultWalletApprovals === 1 ? '' : 's'}
            </DialogTitle>
            <DialogDescription>
              {isExistingVaultDirectOwnerFlow
                ? 'Your wallet will sign each transaction separately.'
                : 'Transactions are bundled into one Safe flow — sign once, then execute.'}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <div className="rounded-lg border border-subtle bg-elevated-2 p-3">
              <p className="text-sm text-secondary">
                <span className="font-medium text-primary">{pendingExistingVaultTransactions.length} setup step{pendingExistingVaultTransactions.length === 1 ? '' : 's'}</span>
                {' '}
                {(() => {
                  const titles = [...new Set(pendingExistingVaultExplanations.map(e => e.title))]
                  return titles.join(', ').toLowerCase()
                })()}
              </p>
            </div>
          </DialogBody>

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
