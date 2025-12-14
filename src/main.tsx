import React from 'react'
import ReactDOM from 'react-dom/client'
import { http, useAccount, WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import App from './App.tsx'
import { config } from './wagmi.ts'
import { ContractAddressProvider } from './contexts/ContractAddressContext.tsx'
import { ViewModeProvider } from './contexts/ViewModeContext.tsx'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import { ToastProvider } from './contexts/ToastContext.tsx'
import { ToastContainer } from './components/ui/toast.tsx'
import { injected } from 'wagmi/connectors'

import '@rainbow-me/rainbowkit/styles.css'
import './index.css'

import { SafeProvider, createConfig } from '@safe-global/safe-react-hooks'
import { sepolia } from 'viem/chains'

const queryClient = new QueryClient()

const SafeProviderWrapper = () => {
  const { address, chain, chainId } = useAccount()

  const provider = chainId === sepolia.id ? 'https://sepolia.drpc.org' : 'https://polygon-rpc.com'

  const safeConfig = createConfig({
    chain: chain || sepolia,
    // sepolia rpc
    provider,
    signer: address,
  })
  return (
    <SafeProvider config={safeConfig}>
      <App />
    </SafeProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider
      defaultTheme="system"
      storageKey="msw-ui-theme"
    >
      <ToastProvider>
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <RainbowKitProvider>
              <ContractAddressProvider>
                <ViewModeProvider>
                  <SafeProviderWrapper />
                </ViewModeProvider>
                <ToastContainer />
              </ContractAddressProvider>
            </RainbowKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>
)
