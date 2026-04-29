import { Eip1193Provider } from '@safe-global/protocol-kit';
import type { PublicClient, WalletClient } from 'viem'

/**
 * EIP-1193 Provider interface
 */
interface RequestArguments {
  readonly method: string;
  readonly params?: readonly unknown[] | object;
}

/**
 * Creates an EIP-1193 compatible provider from a viem PublicClient
 * This avoids circular reference issues when passing to Safe SDK
 */
export function createEip1193Provider(client: PublicClient, walletClient?: WalletClient): Eip1193Provider {
  return {
    request: async (args: RequestArguments): Promise<unknown> => {
      const { method, params } = args;
      // Normalize params to array format
      const paramsArray = params ? (Array.isArray(params) ? params : [params]) : [];
      try {
        // Map EIP-1193 methods to viem client methods
        switch (method) {
          case 'eth_chainId':
            return `0x${client.chain?.id.toString(16)}`

          case 'eth_accounts':
            if (walletClient?.account?.address) {
              return [walletClient.account.address]
            }
            return []

          case 'eth_getBalance':
            const balance = await client.getBalance({ address: paramsArray[0] as `0x${string}` })
            return `0x${balance.toString(16)}`

          case 'eth_getCode':
            return await client.getCode({ address: paramsArray[0] as `0x${string}` })

          case 'eth_getTransactionCount':
            const count = await client.getTransactionCount({ address: paramsArray[0] as `0x${string}` })
            return `0x${count.toString(16)}`

          case 'eth_call':
            const callResult = await client.call({
              to: (paramsArray[0]).to,
              data: (paramsArray[0]).data,
              account: (paramsArray[0]).from,
              value: (paramsArray[0]).value,
            })
            return callResult.data

          case 'eth_estimateGas':
            const estimatedGas = await client.estimateGas({
              to: (paramsArray[0]).to,
              data: (paramsArray[0]).data,
              account: (paramsArray[0]).from,
              value: (paramsArray[0]).value,
            })
            return `0x${estimatedGas.toString(16)}`

          case 'eth_blockNumber':
            const blockNumber = await client.getBlockNumber()
            return `0x${blockNumber.toString(16)}`

          case 'eth_getBlockByNumber':
            return await client.getBlock({
              blockNumber: paramsArray[0] === 'latest' ? undefined : BigInt(paramsArray[0] as string),
              includeTransactions: paramsArray[1] as boolean
            })

          case 'eth_getTransactionReceipt':
            return await client.getTransactionReceipt({ hash: paramsArray[0] as `0x${string}` })

          case 'eth_sendRawTransaction':
            return await client.sendRawTransaction({ serializedTransaction: paramsArray[0] as `0x${string}` })

          case 'eth_sendTransaction':
            if (!walletClient) {
              throw new Error('Wallet client required for eth_sendTransaction')
            }
            const txParams: any = paramsArray[0]
            return await walletClient.sendTransaction({
              chain: walletClient.chain,
              account: txParams.from as `0x${string}`,
              to: txParams.to as `0x${string}`,
              data: txParams.data as `0x${string}`,
              value: txParams.value ? BigInt(txParams.value) : undefined,
              gas: txParams.gas ? BigInt(txParams.gas) : undefined,
              gasPrice: txParams.gasPrice ? BigInt(txParams.gasPrice) : undefined,
            })

          case 'eth_sign':
            if (!walletClient) {
              throw new Error('Wallet client required for eth_sign')
            }
            const [signAddress, message] = paramsArray as [string, string]
            // eth_sign signs raw bytes — pass as { raw } so viem doesn't
            // UTF-8 encode the hex string (which would produce a wrong signature).
            return await walletClient.signMessage({
              account: signAddress as `0x${string}`,
              message: { raw: message as `0x${string}` },
            })

          case 'eth_signTypedData':
          case 'eth_signTypedData_v3':
          case 'eth_signTypedData_v4':
            if (!walletClient) {
              throw new Error('Wallet client required for signTypedData')
            }
            const [typedDataAddress, typedData] = paramsArray as [string, string]
            const parsedData = typeof typedData === 'string' ? JSON.parse(typedData) : typedData
            // Strip EIP712Domain from types — viem derives it from the `domain`
            // object and will error if the types object also contains it.
            const { EIP712Domain: _unused, ...filteredTypes } = parsedData.types ?? {}
            return await walletClient.signTypedData({
              account: typedDataAddress as `0x${string}`,
              ...parsedData,
              types: filteredTypes,
            })

          case 'personal_sign':
            if (!walletClient) {
              throw new Error('Wallet client required for personal_sign')
            }
            const [personalMessage, personalAddress] = paramsArray as [string, string]
            // personal_sign signs raw bytes (same as eth_sign but different param order).
            return await walletClient.signMessage({
              account: (personalAddress || walletClient.account?.address) as `0x${string}`,
              message: { raw: personalMessage as `0x${string}` },
            })

          case 'eth_gasPrice':
            const gasPrice = await client.getGasPrice()
            return `0x${gasPrice.toString(16)}`

          case 'net_version':
            return client.chain?.id.toString()

          default:
            // Use the generic request method for any other methods
            console.log(`Unhandled RPC method: ${method}`, paramsArray)
            return await client.request({ method: method as any, params: paramsArray as any })
        }
      } catch (error) {
        console.error(`EIP-1193 Provider error for method ${method}:`, error)
        throw error
      }
    },
  }
}
