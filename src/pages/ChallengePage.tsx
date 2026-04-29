import { useState, useRef, useEffect } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const CHALLENGE_API_URL = import.meta.env.VITE_CHALLENGE_API_URL || 'http://localhost:3001'

// Vault config for display (updated after deployment)
const VAULT_CONFIG = {
  safeAddress: import.meta.env.VITE_CHALLENGE_SAFE || '0x...',
  moduleAddress: import.meta.env.VITE_CHALLENGE_MODULE || '0x...',
  spendingLimit: 500,
  protocols: ['Aave V3', 'Morpho'],
  totalFunds: 2000,
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

interface VaultStats {
  balance: number
  totalAttempts: number
  lastUpdated: string
}

/**
 * ChallengePage - "Break the Vault" public challenge.
 * Users send natural language instructions to an AI agent that's protected
 * by MultiClaw on-chain guardrails. If someone can trick the agent into
 * draining the vault, they win.
 */
export function ChallengePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'system',
      content:
        'Welcome to Break the Vault! Send instructions to the AI agent managing a ' +
        VAULT_CONFIG.totalFunds +
        ' USDC vault. The agent can deposit into Aave and Morpho, but all actions are constrained by on-chain guardrails. Can you trick it into draining the funds?',
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
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

  const resetChat = async () => {
    if (isResetting || isLoading) return
    setIsResetting(true)
    try {
      await fetch(`${CHALLENGE_API_URL}/api/chat/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'default' }),
      })
    } catch {
      // Silently ignore - still clear local state
    } finally {
      setIsResetting(false)
    }
    setMessages([
      {
        role: 'system',
        content:
          'Conversation reset. Send instructions to the AI agent managing a ' +
          VAULT_CONFIG.totalFunds +
          ' USDC vault.',
        timestamp: new Date(),
      },
    ])
    setInput('')
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="font-bold text-primary text-3xl">Break the Vault</h1>
        <p className="mx-auto mt-2 max-w-2xl text-secondary">
          A real AI agent manages a Guardian with real funds on Base. On-chain guardrails protect
          it.
          <span className="font-medium text-accent-primary"> Can you break through?</span>
        </p>
      </div>

      <div className="items-start gap-6 grid grid-cols-1 lg:grid-cols-3">
        {/* Chat panel */}
        <div className="flex flex-col lg:col-span-2 bg-elevated border border-subtle rounded-xl overflow-hidden">
          {/* Chat header */}
          <div className="flex justify-between items-center px-4 py-2.5 border-subtle border-b">
            <span className="font-medium text-secondary text-xs">Agent Chat</span>
            <button
              onClick={resetChat}
              disabled={isResetting || isLoading}
              className="inline-flex items-center gap-1.5 disabled:opacity-40 text-tertiary hover:text-red-400 text-xs transition-colors disabled:cursor-not-allowed"
              title="Clear conversation"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isResetting ? 'Clearing...' : 'Clear chat'}
            </button>
          </div>
          {/* Messages */}
          <div className="flex-1 space-y-4 p-4 min-h-[300px] max-h-[50vh] overflow-y-auto">
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
                    <div className="mb-1 font-medium text-xs text-accent-secondary">Agent</div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <div className="mt-1 text-tertiary text-xs">
                    {msg.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-elevated-2 px-4 py-3 rounded-xl">
                  <div className="flex items-center gap-1.5">
                    <div className="rounded-full w-2 h-2 animate-bounce bg-accent-primary" />
                    <div className="rounded-full w-2 h-2 animate-bounce bg-accent-primary [animation-delay:0.1s]" />
                    <div className="rounded-full w-2 h-2 animate-bounce bg-accent-primary [animation-delay:0.2s]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-subtle border-t">
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
                className="disabled:opacity-50 text-black bg-accent-primary hover:bg-accent-primary/90"
              >
                Send
              </Button>
            </form>
          </div>
        </div>

        {/* Sidebar: Vault info + Rules */}
        <div className="space-y-4">
          {/* Vault Stats */}
          <div className="bg-elevated p-5 border border-subtle rounded-xl">
            <h3 className="mb-4 font-semibold text-primary text-sm">Guardian Status</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-secondary text-sm">Balance</span>
                <span className="font-mono font-semibold text-sm text-accent-primary">
                  {stats.balance}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary text-sm">Attempts</span>
                <span className="font-mono text-primary text-sm">{stats.totalAttempts}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary text-sm">Spending Limit</span>
                <span className="text-primary text-sm">{VAULT_CONFIG.spendingLimit}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary text-sm">Protocols</span>
                <span className="text-primary text-sm text-right">
                  {VAULT_CONFIG.protocols.join(', ')}
                </span>
              </div>
            </div>
          </div>

          {/* Rules */}
          <div className="bg-elevated p-5 border border-subtle rounded-xl">
            <h3 className="mb-3 font-semibold text-primary text-sm">Challenge Rules</h3>
            <ul className="space-y-2 text-secondary text-sm">
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
                The agent is intentionally jailbreakable - the security is on-chain, not in the
                prompt
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
