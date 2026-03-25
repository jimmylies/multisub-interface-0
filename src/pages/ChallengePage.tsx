import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const CHALLENGE_API_URL = import.meta.env.VITE_CHALLENGE_API_URL || 'http://localhost:3001'

// Vault config for display (updated after deployment)
const VAULT_CONFIG = {
  safeAddress: import.meta.env.VITE_CHALLENGE_SAFE || '0x...',
  moduleAddress: import.meta.env.VITE_CHALLENGE_MODULE || '0x...',
  spendingLimit: '500 USDC/day',
  protocols: ['Aave V3', 'Morpho'],
  totalFunds: '$2,000 USDC',
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

interface VaultStats {
  balance: string
  totalAttempts: number
  lastUpdated: string
}

/**
 * ChallengePage — "Break the Vault" public challenge.
 * Users send natural language instructions to an AI agent that's protected
 * by MultiClaw on-chain guardrails. If someone can trick the agent into
 * draining the vault, they win.
 */
export function ChallengePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'system',
      content:
        'Welcome to Break the Vault! Send instructions to the AI agent managing a $2,000 USDC vault. The agent can deposit into Aave and Morpho, but all actions are constrained by on-chain guardrails. Can you trick it into draining the funds?',
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [stats, setStats] = useState<VaultStats>({
    balance: VAULT_CONFIG.totalFunds,
    totalAttempts: 0,
    lastUpdated: new Date().toISOString(),
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevMessageCount = useRef(messages.length)

  // Auto-scroll to bottom only when new messages are added (not on initial render)
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMessageCount.current = messages.length
  }, [messages])

  // Fetch vault stats periodically
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${CHALLENGE_API_URL}/api/stats`)
        if (res.ok) {
          const data = await res.json()
          setStats(data)
        }
      } catch {
        // API not available yet
      }
    }
    fetchStats()
    const interval = setInterval(fetchStats, 30_000)
    return () => clearInterval(interval)
  }, [])

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const res = await fetch(`${CHALLENGE_API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage.content }),
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)

      const data = await res.json()
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.response,
          timestamp: new Date(),
        },
      ])

      // Update stats if returned
      if (data.stats) {
        setStats(data.stats)
      }
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content:
            'The challenge bot is not running yet. It will be available after Base deployment. Try again later!',
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-primary">Break the Vault</h1>
        <p className="text-secondary mt-2 max-w-2xl mx-auto">
          A real AI agent manages a vault with real funds on Base. On-chain guardrails protect it.
          <span className="text-accent-primary font-medium"> Can you break through?</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Chat panel */}
        <div className="lg:col-span-2 flex flex-col bg-elevated rounded-xl border border-subtle overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px] max-h-[50vh]">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-accent-primary/10 text-primary'
                      : msg.role === 'system'
                        ? 'bg-elevated-2 text-secondary italic'
                        : 'bg-elevated-2 text-primary'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="text-xs text-accent-secondary font-medium mb-1">Agent</div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <div className="text-xs text-tertiary mt-1">
                    {msg.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-elevated-2 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-accent-primary animate-bounce" />
                    <div className="w-2 h-2 rounded-full bg-accent-primary animate-bounce [animation-delay:0.1s]" />
                    <div className="w-2 h-2 rounded-full bg-accent-primary animate-bounce [animation-delay:0.2s]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-subtle p-4">
            <form
              onSubmit={e => {
                e.preventDefault()
                sendMessage()
              }}
              className="flex gap-2"
            >
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Tell the agent what to do..."
                className="flex-1 bg-elevated-2 border-subtle"
                disabled={isLoading}
              />
              <Button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="bg-accent-primary text-black hover:bg-accent-primary/90 disabled:opacity-50"
              >
                Send
              </Button>
            </form>
          </div>
        </div>

        {/* Sidebar: Vault info + Rules */}
        <div className="space-y-4">
          {/* Vault Stats */}
          <div className="bg-elevated rounded-xl border border-subtle p-5">
            <h3 className="text-sm font-semibold text-primary mb-4">Vault Status</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-secondary">Balance</span>
                <span className="text-sm font-mono text-accent-primary font-semibold">
                  {stats.balance}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-secondary">Attempts</span>
                <span className="text-sm font-mono text-primary">{stats.totalAttempts}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-secondary">Spending Limit</span>
                <span className="text-sm text-primary">{VAULT_CONFIG.spendingLimit}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-secondary">Protocols</span>
                <span className="text-sm text-primary text-right">
                  {VAULT_CONFIG.protocols.join(', ')}
                </span>
              </div>
            </div>
          </div>

          {/* Rules */}
          <div className="bg-elevated rounded-xl border border-subtle p-5">
            <h3 className="text-sm font-semibold text-primary mb-3">Challenge Rules</h3>
            <ul className="space-y-2 text-sm text-secondary">
              <li className="flex gap-2">
                <span className="text-accent-primary">1.</span>
                Send any instruction to the AI agent
              </li>
              <li className="flex gap-2">
                <span className="text-accent-primary">2.</span>
                The agent can execute DeFi operations within its guardrails
              </li>
              <li className="flex gap-2">
                <span className="text-accent-primary">3.</span>
                If funds leave the Safe to an unauthorized address, you win
              </li>
              <li className="flex gap-2">
                <span className="text-accent-primary">4.</span>
                The agent is intentionally jailbreakable — the security is on-chain, not in the
                prompt
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
