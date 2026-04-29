import { useCallback, useState } from 'react'
import { Address, encodeFunctionData } from 'viem'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import Safe from '@safe-global/protocol-kit'
import { MetaTransactionData } from '@safe-global/safe-core-sdk-types'
import { createEip1193Provider } from '@/lib/viemToEip1193'
import { useModuleOwner, useSafeAddress } from './useSafe'
import { useTransactionInvalidation } from './useTransactionInvalidation'
import { TransactionType } from '@/lib/transactionTypes'

interface TransactionRequest {
  to: Address
  value?: bigint
  data: `0x${string}`
}

interface ProposeTransactionOptions {
  transactionType?: TransactionType
  safeAddressOverride?: Address
  moduleOwnerOverride?: Address
}

function extractTransactionHash(result: unknown): `0x${string}` | undefined {
  if (!result || typeof result !== 'object') return undefined

  const candidate = result as {
    hash?: unknown
    transactionResponse?: { hash?: unknown }
  }

  if (typeof candidate.hash === 'string' && candidate.hash.startsWith('0x')) {
    return candidate.hash as `0x${string}`
  }

  if (
    typeof candidate.transactionResponse?.hash === 'string' &&
    candidate.transactionResponse.hash.startsWith('0x')
  ) {
    return candidate.transactionResponse.hash as `0x${string}`
  }

  return undefined
}

// Helper to detect user rejection errors from wallet
function isUserRejection(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    const name = error.name.toLowerCase()
    return (
      message.includes('user rejected') ||
      message.includes('user denied') ||
      message.includes('user cancelled') ||
      message.includes('rejected the request') ||
      name.includes('userrejected') ||
      name.includes('actionrejected')
    )
  }
  return false
}

export function encodeContractCall(
  contractAddress: Address,
  abi: any[],
  functionName: string,
  args: any[] = []
): `0x${string}` {
  try {
    const functionAbi = abi.find(item => item.type === 'function' && item.name === functionName)

    if (!functionAbi) {
      throw new Error(`Function ${functionName} not found in ABI`)
    }

    return encodeFunctionData({
      abi: [functionAbi],
      functionName,
      args,
    })
  } catch (error) {
    console.error('Error encoding function call:', {
      functionName,
      args,
      error,
    })
    throw new Error(
      `Failed to encode function call for ${functionName}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export function useSafeProposal() {
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const { address } = useAccount()
  const { data: safeAddress } = useSafeAddress()
  const { data: moduleOwner } = useModuleOwner()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const { invalidateQueriesForTransaction } = useTransactionInvalidation()

  const proposeTransaction = useCallback(
    async (
      transaction: TransactionRequest | TransactionRequest[],
      options?: ProposeTransactionOptions
    ) => {
      if (!walletClient || !address) {
        throw new Error('Wallet not connected')
      }

      const resolvedSafeAddress = options?.safeAddressOverride ?? safeAddress
      const resolvedModuleOwner = options?.moduleOwnerOverride ?? moduleOwner

      if (!resolvedSafeAddress) {
        throw new Error('Safe address not found')
      }

      if (!publicClient) {
        throw new Error('Public client not available')
      }

      setIsPending(true)
      setError(null)

      try {
        const transactions = Array.isArray(transaction) ? transaction : [transaction]
        const isDirectOwnerVault =
          Boolean(address) &&
          Boolean(resolvedSafeAddress) &&
          Boolean(resolvedModuleOwner) &&
          address.toLowerCase() === resolvedSafeAddress.toLowerCase() &&
          address.toLowerCase() === resolvedModuleOwner.toLowerCase()

        if (isDirectOwnerVault) {
          const txHashes: `0x${string}`[] = []

          for (const tx of transactions) {
            const txHash = await walletClient.sendTransaction({
              account: walletClient.account!,
              to: tx.to,
              data: tx.data,
              value: tx.value || 0n,
            })

            const receipt = await publicClient.waitForTransactionReceipt({
              hash: txHash,
              confirmations: 1,
            })

            if (receipt.status === 'reverted') {
              throw new Error('Transaction reverted on chain')
            }

            txHashes.push(txHash)
          }

          if (options?.transactionType) {
            // Delay invalidation to let RPC nodes sync after confirmation
            setTimeout(async () => {
              try {
                await invalidateQueriesForTransaction(options.transactionType!)
              } catch (invalidationError) {
                console.warn(
                  'Failed to invalidate queries after direct owner transaction',
                  invalidationError
                )
              }
            }, 4000)
          }

          return {
            success: true,
            safeTxHash: txHashes[0],
            transactionHash: txHashes[txHashes.length - 1],
          }
        }

        // Create EIP-1193 provider from viem clients
        const provider = createEip1193Provider(publicClient, walletClient)

        // Initialize Safe Protocol Kit with signer
        const protocolKit = await Safe.init({
          provider,
          safeAddress: resolvedSafeAddress as string,
          signer: address,
        })

        // Convert transactions to Safe format
        const safeTransactions: MetaTransactionData[] = transactions.map(tx => ({
          to: tx.to,
          value: (tx.value || 0n).toString(),
          data: tx.data,
        }))

        // Create Safe transaction
        const safeTransaction = await protocolKit.createTransaction({
          transactions: safeTransactions,
        })

        // Get transaction hash
        const safeTxHash = await protocolKit.getTransactionHash(safeTransaction)
        console.log('Safe transaction hash:', safeTxHash)

        // Sign the transaction
        const signedTransaction = await protocolKit.signTransaction(safeTransaction)
        console.log('Transaction signed')

        // For Safes with threshold > 1, a single signature isn't enough to
        // execute. Stop here and surface a clear "needs cosigners" message
        // instead of letting executeTransaction revert at the Safe's signature
        // check. The signed payload is returned so the caller could later wire
        // it to the Safe Transaction Service if needed.
        const threshold = await protocolKit.getThreshold()
        if (threshold > 1) {
          return {
            success: false,
            needsCosigners: true,
            threshold,
            safeTxHash,
            error: new Error(
              `This Safe requires ${threshold} signatures. The transaction has been signed by you (1/${threshold}); the remaining cosigners need to sign and execute it from their Safe interface.`
            ),
          }
        }

        // Execute the transaction
        const executeTxResponse = await protocolKit.executeTransaction(signedTransaction)
        console.log('Transaction executed:', executeTxResponse)

        // Get transaction hash from response
        const txHash = extractTransactionHash(executeTxResponse)
        console.log('Transaction hash:', txHash)

        if (!txHash) {
          throw new Error(
            'Transaction executed but no transaction hash was returned by the Safe SDK'
          )
        }

        // Wait for transaction to be confirmed on the blockchain
        console.log('Waiting for transaction confirmation...')
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          confirmations: 1,
        })
        console.log('Transaction confirmed:', receipt)

        // Check if transaction was successful
        if (receipt.status === 'reverted') {
          throw new Error('Transaction reverted on chain')
        }

        // Invalidate relevant queries after a delay to let RPC nodes sync
        if (options?.transactionType) {
          setTimeout(async () => {
            try {
              await invalidateQueriesForTransaction(options.transactionType!)
            } catch (invalidationError) {
              console.warn('Failed to invalidate queries after Safe transaction', invalidationError)
            }
          }, 4000)
        }

        return {
          success: true,
          safeTxHash,
          transactionHash: txHash,
        }
      } catch (err) {
        // Handle user rejection gracefully - not an error, just cancelled
        if (isUserRejection(err)) {
          return { success: false, cancelled: true }
        }

        console.error('Safe transaction failed:', err)
        const errorMessage = err instanceof Error ? err.message : 'Transaction failed'
        setError(err instanceof Error ? err : new Error(errorMessage))
        return { success: false, error: err }
      } finally {
        setIsPending(false)
      }
    },
    [walletClient, address, safeAddress, moduleOwner, publicClient, invalidateQueriesForTransaction]
  )

  return {
    proposeTransaction,
    isPending,
    error,
  }
}
