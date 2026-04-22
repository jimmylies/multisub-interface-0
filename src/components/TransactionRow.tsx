import { useState } from 'react'
import { useChainId } from 'wagmi'
import {
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownLeft,
  Coins,
  Gift,
  CheckCircle,
  HelpCircle,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/tooltip'
import { type Transaction, OP_TYPES, type OpType } from '@/hooks/useTransactionHistory'
import { useSubAccountNames } from '@/hooks/useSubAccountNames'
import { getExplorerBase } from '@/lib/chains'
import { useTokensMetadata } from '@/hooks/useTokenMetadata'
import { formatTokenAmount, formatTimeAgo, formatUSD, cn } from '@/lib/utils'

// Icon mapping for operation types
const OP_ICONS: Record<OpType, typeof ArrowRightLeft> = {
  0: HelpCircle, // Unknown
  1: ArrowRightLeft, // Swap
  2: ArrowDownLeft, // Deposit
  3: ArrowUpRight, // Withdraw
  4: Gift, // Claim
  5: CheckCircle, // Approve
}

const OP_COLORS: Record<OpType, string> = {
  0: 'text-tertiary',
  1: 'text-info',
  2: 'text-success',
  3: 'text-warning',
  4: 'text-accent-primary',
  5: 'text-secondary',
}

// Explorer URLs
function getExplorerUrl(chainId: number, txHash: string): string {
  return `${getExplorerBase(chainId)}/tx/${txHash}`
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

interface TransactionRowProps {
  transaction: Transaction
  index: number
  showAgent?: boolean
}

export function TransactionRow({ transaction, index, showAgent = false }: TransactionRowProps) {
  const chainId = useChainId()
  const [copied, setCopied] = useState(false)
  const { getAccountName } = useSubAccountNames()

  // Get all tokens for metadata lookup
  const allTokens = [
    ...(transaction.tokensIn || []),
    ...(transaction.tokensOut || []),
    transaction.token,
  ].filter(Boolean) as string[]

  const { data: tokenMetadata } = useTokensMetadata(allTokens as `0x${string}`[])

  const getTokenSymbol = (address: string): string => {
    const metadata = tokenMetadata?.get(address.toLowerCase())
    return metadata?.symbol || shortenAddress(address)
  }

  const getTokenDecimals = (address: string): number => {
    const metadata = tokenMetadata?.get(address.toLowerCase())
    return metadata?.decimals || 18
  }

  const agentName = getAccountName(transaction.subAccount as `0x${string}`)
  const agentLabel = agentName || shortenAddress(transaction.subAccount)

  const handleCopyTxHash = async () => {
    await navigator.clipboard.writeText(transaction.txHash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Render protocol transaction
  if (transaction.type === 'protocol') {
    const opType = transaction.opType ?? 0
    const Icon = OP_ICONS[opType]
    const colorClass = OP_COLORS[opType]

    return (
      <div
        className="flex items-center gap-4 p-4 rounded-lg bg-elevated border border-subtle hover:border-default transition-colors animate-fade-in"
        style={{ animationDelay: `${index * 30}ms` }}
      >
        {/* Icon */}
        <div className={cn('p-2 rounded-lg bg-elevated-2', colorClass)}>
          <Icon className="w-5 h-5" />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-primary">{OP_TYPES[opType]}</span>
            <Badge variant="info" className="text-xs">
              Protocol
            </Badge>
            {showAgent && (
              <Badge variant="outline" className="text-xs">
                Agent: {agentLabel}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs text-muted-foreground">
              cost: ${formatUSD(transaction.spendingCost)}
            </Badge>
          </div>

          {/* Tokens flow */}
          <div className="flex flex-wrap items-center gap-2 text-sm text-secondary">
            {transaction.tokensIn && transaction.tokensIn.length > 0 && (
              <span className="flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-error" />
                {transaction.tokensIn.map((token, i) => (
                  <span key={token}>
                    {formatTokenAmount(
                      transaction.amountsIn?.[i] || 0n,
                      getTokenDecimals(token)
                    )}{' '}
                    {getTokenSymbol(token)}
                    {i < transaction.tokensIn!.length - 1 && ', '}
                  </span>
                ))}
              </span>
            )}

            {transaction.tokensIn?.length && transaction.tokensOut?.length ? (
              <ArrowRightLeft className="w-3 h-3 text-tertiary" />
            ) : null}

            {transaction.tokensOut && transaction.tokensOut.length > 0 && (
              <span className="flex items-center gap-1">
                <ArrowDownLeft className="w-3 h-3 text-success" />
                {transaction.tokensOut.map((token, i) => (
                  <span key={token}>
                    {formatTokenAmount(
                      transaction.amountsOut?.[i] || 0n,
                      getTokenDecimals(token)
                    )}{' '}
                    {getTokenSymbol(token)}
                    {i < transaction.tokensOut!.length - 1 && ', '}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>

        {/* Right side - timestamp and actions */}
        <div className="flex flex-col items-end gap-1">
          <Tooltip content={new Date(transaction.timestamp * 1000).toLocaleString()}>
            <span className="text-sm text-tertiary">
              {formatTimeAgo(BigInt(transaction.timestamp))}
            </span>
          </Tooltip>

          <div className="flex items-center gap-2">
            <Tooltip content={copied ? 'Copied!' : 'Copy TX hash'}>
              <button
                onClick={handleCopyTxHash}
                className="p-1 text-tertiary hover:text-primary transition-colors"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </button>
            </Tooltip>

            <Tooltip content="View on Explorer">
              <a
                href={getExplorerUrl(chainId, transaction.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 text-tertiary hover:text-primary transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            </Tooltip>
          </div>
        </div>
      </div>
    )
  }

  // Render transfer transaction
  return (
    <div
      className="flex items-center gap-4 p-4 rounded-lg bg-elevated border border-subtle hover:border-default transition-colors animate-fade-in"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {/* Icon */}
      <div className="p-2 rounded-lg bg-elevated-2 text-warning">
        <Coins className="w-5 h-5" />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-primary">Transfer</span>
          <Badge variant="warning" className="text-xs">
            Token
          </Badge>
          {showAgent && (
            <Badge variant="outline" className="text-xs">
              Agent: {agentLabel}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs text-muted-foreground">
            cost: ${formatUSD(transaction.spendingCost)}
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-sm text-secondary">
          <span>
            {formatTokenAmount(
              transaction.amount || 0n,
              getTokenDecimals(transaction.token || '')
            )}{' '}
            {getTokenSymbol(transaction.token || '')}
          </span>
          <ArrowRightLeft className="w-3 h-3 text-tertiary" />
          <span className="font-mono text-xs">
            {shortenAddress(transaction.recipient || '')}
          </span>
        </div>
      </div>

      {/* Right side */}
      <div className="flex flex-col items-end gap-1">
        <Tooltip content={new Date(transaction.timestamp * 1000).toLocaleString()}>
          <span className="text-sm text-tertiary">
            {formatTimeAgo(BigInt(transaction.timestamp))}
          </span>
        </Tooltip>

        <div className="flex items-center gap-2">
          <Tooltip content={copied ? 'Copied!' : 'Copy TX hash'}>
            <button
              onClick={handleCopyTxHash}
              className="p-1 text-tertiary hover:text-primary transition-colors"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
          </Tooltip>

          <Tooltip content="View on Explorer">
            <a
              href={getExplorerUrl(chainId, transaction.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-tertiary hover:text-primary transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
