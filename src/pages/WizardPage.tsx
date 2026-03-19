import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { isAddress, type Address } from 'viem'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ROUTES } from '@/router/routes'
import { AGENT_VAULT_FACTORY_ABI } from '@/lib/contracts'

// Preset IDs match PresetRegistry on-chain (1-indexed)
const PRESET_IDS: Record<string, number> = {
  'defi-trader': 1,
  'yield-farmer': 2,
  'payment-agent': 3,
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
    description: 'Deposit into Morpho vaults and Aave V3. Maximize yield safely.',
    protocols: ['Aave V3', 'Morpho Vault', 'Morpho Blue'],
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

export function WizardPage() {
  const navigate = useNavigate()
  const { isConnected } = useAccount()
  const [step, setStep] = useState<Step>('preset')
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [agentAddress, setAgentAddress] = useState('')
  const [oracleAddress, setOracleAddress] = useState('')
  const [spendingBps, setSpendingBps] = useState(500)
  const [safeAddress, setSafeAddress] = useState('')
  const [factoryAddress, setFactoryAddress] = useState(
    import.meta.env.VITE_AGENT_VAULT_FACTORY_ADDRESS || ''
  )
  const [deployedModule, setDeployedModule] = useState<string | null>(null)
  const [deployError, setDeployError] = useState<string | null>(null)

  const { writeContract, data: txHash, isPending: isWriting } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: {
      enabled: Boolean(txHash),
    },
  })

  const preset = PRESETS.find(p => p.id === selectedPreset)
  const isDeploying = isWriting || isConfirming

  async function handleDeploy() {
    if (
      !preset ||
      !isAddress(safeAddress) ||
      !isAddress(agentAddress) ||
      !isAddress(factoryAddress)
    )
      return

    setDeployError(null)
    setDeployedModule(null)

    const presetId = PRESET_IDS[preset.id]

    try {
      if (presetId) {
        // Deploy from preset (standard presets)
        writeContract(
          {
            address: factoryAddress as Address,
            abi: AGENT_VAULT_FACTORY_ABI,
            functionName: 'deployVaultFromPreset',
            args: [
              safeAddress as Address,
              (oracleAddress || safeAddress) as Address, // Fallback to Safe as placeholder
              agentAddress as Address,
              BigInt(presetId),
              [], // priceFeedTokens — configure after deployment
              [], // priceFeedAddresses
            ],
          },
          {
            onSuccess(hash) {
              // Module address will be extracted from receipt event logs
              // For now, show the tx hash and navigate after confirmation
              console.log('Vault deployment tx:', hash)
            },
            onError(error) {
              setDeployError(error.message)
            },
          }
        )
      } else {
        // Custom preset — deploy with full config
        writeContract(
          {
            address: factoryAddress as Address,
            abi: AGENT_VAULT_FACTORY_ABI,
            functionName: 'deployVault',
            args: [
              {
                safe: safeAddress as Address,
                oracle: (oracleAddress || safeAddress) as Address,
                agentAddress: agentAddress as Address,
                roleId: 1, // EXECUTE by default for custom
                maxSpendingBps: BigInt(spendingBps),
                maxSpendingUSD: 0n,
                windowDuration: 86400n, // 24h
                allowedProtocols: [],
                parserProtocols: [],
                parserAddresses: [],
                selectors: [],
                selectorTypes: [],
                priceFeedTokens: [],
                priceFeedAddresses: [],
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

  // When tx is confirmed, extract module address and navigate
  if (isSuccess && txHash && !deployedModule) {
    // Try to parse AgentVaultCreated event from receipt
    // This is a simplified approach — in production you'd use useWaitForTransactionReceipt's data
    setDeployedModule('pending') // Placeholder until we can parse
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
            Select a template that matches your agent's use case. You can customize everything in
            the next step.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedPreset(p.id)
                  setSpendingBps(p.defaultBps)
                }}
                className={`text-left p-5 rounded-xl border transition-all ${
                  selectedPreset === p.id
                    ? 'border-accent-primary bg-accent-primary/5 shadow-glow'
                    : 'border-subtle bg-elevated-1 hover:border-accent-primary/30'
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
                      {p.protocols.map(proto => (
                        <span
                          key={proto}
                          className="text-xs px-2 py-0.5 rounded-full bg-elevated-2 text-tertiary"
                        >
                          {proto}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-tertiary">
                      Default: {p.defaultBps / 100}% / 24h | Role: {p.roleLabel}
                    </div>
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
          <p className="text-secondary mb-8">Set the budget, agent signer, and Safe address.</p>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-primary mb-2">
                AgentVaultFactory Address
              </label>
              <Input
                value={factoryAddress}
                onChange={e => setFactoryAddress(e.target.value)}
                placeholder="0x... (deployed AgentVaultFactory contract)"
                className="bg-elevated-1 border-subtle"
              />
              {factoryAddress && !isAddress(factoryAddress) && (
                <p className="text-red-400 text-xs mt-1">Invalid address</p>
              )}
              <p className="text-xs text-tertiary mt-1">
                Set via VITE_AGENT_VAULT_FACTORY_ADDRESS env var or enter manually.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-primary mb-2">Safe Address</label>
              <Input
                value={safeAddress}
                onChange={e => setSafeAddress(e.target.value)}
                placeholder="0x... (your Safe multisig address)"
                className="bg-elevated-1 border-subtle"
              />
              {safeAddress && !isAddress(safeAddress) && (
                <p className="text-red-400 text-xs mt-1">Invalid address</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-primary mb-2">
                Agent Signer Address
              </label>
              <Input
                value={agentAddress}
                onChange={e => setAgentAddress(e.target.value)}
                placeholder="0x... (the AI agent's EOA key)"
                className="bg-elevated-1 border-subtle"
              />
              {agentAddress && !isAddress(agentAddress) && (
                <p className="text-red-400 text-xs mt-1">Invalid address</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-primary mb-2">Oracle Address</label>
              <Input
                value={oracleAddress}
                onChange={e => setOracleAddress(e.target.value)}
                placeholder="0x... (oracle wallet that updates spending state)"
                className="bg-elevated-1 border-subtle"
              />
              {oracleAddress && !isAddress(oracleAddress) && (
                <p className="text-red-400 text-xs mt-1">Invalid address</p>
              )}
              <p className="text-xs text-tertiary mt-1">
                The oracle monitors spending and updates allowances. See oracle/ for setup.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-primary mb-2">
                Spending Limit (basis points per 24h)
              </label>
              <div className="flex items-center gap-4">
                <Input
                  type="number"
                  value={spendingBps}
                  onChange={e => setSpendingBps(Number(e.target.value))}
                  min={1}
                  max={2000}
                  className="bg-elevated-1 border-subtle w-32"
                />
                <span className="text-secondary text-sm">{spendingBps / 100}% of Safe value</span>
              </div>
              <p className="text-xs text-tertiary mt-1">
                Max: 2000 bps (20%). Hard cap enforced on-chain.
              </p>
            </div>
          </div>

          <div className="flex justify-between mt-8">
            <Button
              variant="outline"
              onClick={() => setStep('preset')}
            >
              Back
            </Button>
            <Button
              onClick={() => setStep('review')}
              disabled={
                !isAddress(agentAddress) || !isAddress(safeAddress) || !isAddress(factoryAddress)
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

          <div className="bg-elevated-1 rounded-xl border border-subtle p-6 space-y-4">
            <div className="flex justify-between">
              <span className="text-secondary">Preset</span>
              <span className="text-primary font-medium">{preset.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-secondary">Factory</span>
              <span className="text-primary font-mono text-sm">
                {factoryAddress.slice(0, 6)}...{factoryAddress.slice(-4)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-secondary">Safe</span>
              <span className="text-primary font-mono text-sm">
                {safeAddress.slice(0, 6)}...{safeAddress.slice(-4)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-secondary">Agent Signer</span>
              <span className="text-primary font-mono text-sm">
                {agentAddress.slice(0, 6)}...{agentAddress.slice(-4)}
              </span>
            </div>
            {oracleAddress && (
              <div className="flex justify-between">
                <span className="text-secondary">Oracle</span>
                <span className="text-primary font-mono text-sm">
                  {oracleAddress.slice(0, 6)}...{oracleAddress.slice(-4)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-secondary">Role</span>
              <span className="text-primary">{preset.roleLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-secondary">Spending Limit</span>
              <span className="text-primary">{spendingBps / 100}% per 24h</span>
            </div>
            <div className="flex justify-between">
              <span className="text-secondary">Protocols</span>
              <span className="text-primary">{preset.protocols.join(', ')}</span>
            </div>
          </div>

          <div className="mt-6 p-4 rounded-lg bg-accent-primary/5 border border-accent-primary/20">
            <p className="text-sm text-secondary">
              After deployment, you will need to enable the module on your Safe (1 multisig
              transaction). The agent cannot operate until the module is enabled.
            </p>
          </div>

          {deployError && (
            <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-sm text-red-400">{deployError}</p>
            </div>
          )}

          {isSuccess && txHash && (
            <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-sm text-green-400">
                Vault deployed successfully! Tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </p>
              <Button
                variant="outline"
                className="mt-2"
                onClick={() => navigate(ROUTES.AGENTS)}
              >
                Go to Dashboard
              </Button>
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
              disabled={isDeploying || isSuccess}
              className="bg-accent-primary text-black hover:bg-accent-primary/90 disabled:opacity-50"
            >
              {isWriting
                ? 'Confirm in Wallet...'
                : isConfirming
                  ? 'Deploying...'
                  : isSuccess
                    ? 'Deployed!'
                    : 'Deploy Vault'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
