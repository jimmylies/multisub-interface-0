import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TooltipIcon } from '@/components/ui/tooltip'
import { useAcquiredBalances } from '@/hooks/useSafe'
import { formatTokenAmount } from '@/lib/utils'
import { useTokensMetadata } from '@/hooks/useTokenMetadata'
import { useTimeRemaining } from '@/hooks/useTimeRemaining'

interface AcquiredBalancesCardProps {
  address: `0x${string}`
}

interface TokenRowProps {
  token: {
    address: `0x${string}`
    balance: bigint
    symbol: string
    decimals: number
    timestamp: number
  }
}

function TokenRow({ token }: TokenRowProps) {
  const timeRemaining = useTimeRemaining(token.timestamp)

  return (
    <div className="flex justify-between items-center bg-gradient-to-r from-green-50 dark:from-green-950/30 to-emerald-50 dark:to-emerald-950/30 p-3 border border-green-200 dark:border-green-900 rounded-lg">
      <div className="flex items-center gap-3">
        <div className="flex justify-center items-center bg-green-500 rounded-full w-8 h-8 font-bold text-white text-xs">
          {token.symbol.slice(0, 2)}
        </div>
        <div>
          <p className="font-medium text-sm">{token.symbol}</p>
          <p className="text-muted-foreground text-xs">Acquired</p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-semibold text-sm">{formatTokenAmount(token.balance, token.decimals)}</p>
        {timeRemaining.isExpired ? (
          <div>
            <p className="text-orange-600 dark:text-orange-400 text-xs">
              {timeRemaining.formatted}
            </p>
            <p className="opacity-70 text-muted-foreground text-xs">Pending oracle update</p>
          </div>
        ) : (
          <div>
            <p className="text-green-600 dark:text-green-400 text-xs">
              {timeRemaining.formatted}
              {token.timestamp !== 0 && ' left'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Common tokens to track on Base mainnet
const TOKENS_TO_TRACK = [
  {
    symbol: 'USDC',
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
    decimals: 6,
  },
  {
    symbol: 'WETH',
    address: '0x4200000000000000000000000000000000000006' as `0x${string}`,
    decimals: 18,
  },
  {
    symbol: 'USDT',
    address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' as `0x${string}`,
    decimals: 6,
  },
  // { symbol: 'WBTC', address: '0x29f2D40B0605204364af54EC677bD022dA425d03' as `0x${string}`, decimals: 8 },
  {
    symbol: 'DAI',
    address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb' as `0x${string}`,
    decimals: 18,
  },
]

export function AcquiredBalancesCard({ address }: AcquiredBalancesCardProps) {
  const tokenAddresses = TOKENS_TO_TRACK.map(t => t.address)
  const { data: balances = new Map(), isLoading } = useAcquiredBalances(address, tokenAddresses)

  // Extract token addresses from balances
  const tokenAddressesFromBalances = Array.from(balances.keys()).map(addr => addr as `0x${string}`)

  // Fetch metadata for all tokens with balances
  const { data: tokensMetadata = new Map(), isLoading: isLoadingMetadata } = useTokensMetadata(
    tokenAddressesFromBalances
  )

  if (isLoading || isLoadingMetadata) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acquired Balances</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Loading...</p>
        </CardContent>
      </Card>
    )
  }

  // Create list of tokens with metadata and timestamp from balances Map
  const tokensWithBalance = Array.from(balances.entries())
    .filter(([, tokenData]) => tokenData.balance > 0n)
    .map(([tokenAddress, tokenData]) => {
      const metadata = tokensMetadata.get(tokenAddress.toLowerCase()) || {
        symbol: `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}`,
        decimals: 18,
      }
      return {
        address: tokenAddress as `0x${string}`,
        balance: tokenData.balance,
        timestamp: tokenData.timestamp,
        ...metadata,
      }
    })

  // Don't render if no acquired balances
  if (tokensWithBalance.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          Acquired Balances
          <TooltipIcon content="Tokens received from DeFi operations (swaps, deposits, claims) are FREE to use for 24 hours. They don't count against your spending allowance during this period." />
          <Badge
            variant="secondary"
            className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs"
          >
            Free 24h ✨
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {tokensWithBalance.map(token => (
            <TokenRow
              key={token.address}
              token={token}
            />
          ))}
        </div>
        <div className="bg-blue-50 dark:bg-blue-950/30 mt-3 p-2 border border-blue-200 dark:border-blue-900 rounded">
          <p className="text-blue-700 dark:text-blue-300 text-xs">
            💡 These tokens can be used in operations without affecting your spending limit for the
            next 24 hours.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
