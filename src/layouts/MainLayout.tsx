import { Outlet, Link, NavLink } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'

import { SkipLink, SkipLinkTarget } from '@/components/SkipLink'
import { useUserRoles } from '@/hooks/useUserRoles'
import { useAccount } from 'wagmi'
import { ROUTES } from '@/router/routes'
import { Tooltip } from '@/components/ui/tooltip'

export function MainLayout() {
  const { isConnected } = useAccount()
  const { isSafeOwner, isDualRole } = useUserRoles()
  const getNavClassName = ({ isActive }: { isActive: boolean }) =>
    [
      'px-3 py-1.5 rounded-md text-sm transition-colors',
      isActive
        ? 'bg-elevated-1 text-primary'
        : 'text-secondary hover:text-primary hover:bg-elevated-1',
    ].join(' ')

  return (
    <div className="min-h-screen app-background">
      {/* Skip Link for Accessibility */}
      <SkipLink />

      {/* Header */}
      <header
        className="top-0 z-50 sticky border-subtle border-b glass"
        role="banner"
      >
        <div className="flex justify-between items-center mx-auto px-3 md:px-6 h-14 md:h-16 container">
          {/* Logo */}
          <Link
            to={ROUTES.HOME}
            className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity"
          >
            <img
              src="/logo.png"
              alt="MultiClaw"
              className="w-8 h-8 md:w-9 md:h-9 object-contain"
            />
            <div>
              <h1 className="font-semibold text-primary text-base md:text-lg leading-tight">
                MultiClaw
              </h1>
              <p className="-mt-0.5 text-caption text-tertiary hidden md:block">
                {!isConnected
                  ? 'DeFi, Delegated.'
                  : isDualRole
                    ? 'Owner + Sub-Account'
                    : isSafeOwner
                      ? 'Safe Owner'
                      : 'DeFi Delegated'}
              </p>
            </div>
          </Link>

          {/* Navigation */}
          <nav
            className="items-center gap-1 hidden md:flex"
            role="navigation"
          >
            <NavLink
              to={ROUTES.WIZARD}
              className={getNavClassName}
            >
              Deploy
            </NavLink>
            <NavLink
              to={ROUTES.DASHBOARD}
              className={getNavClassName}
            >
              Dashboard
            </NavLink>
            <Tooltip content="Coming soon">
              <span className="px-3 py-1.5 rounded-md font-medium text-sm text-accent-primary opacity-50 cursor-not-allowed select-none">
                Break the Vault
              </span>
            </Tooltip>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2 md:gap-3">

            {isConnected ? (
              <ConnectButton
                accountStatus="address"
                chainStatus="icon"
                showBalance={false}
              />
            ) : (
              <ConnectButton.Custom>
                {({ openConnectModal, mounted }) => {
                  const ready = mounted
                  if (!ready) return null

                  return (
                    <button
                      onClick={openConnectModal}
                      className="group inline-flex relative justify-center items-center bg-gradient-to-r shadow-glow hover:shadow-xl px-3 md:px-6 rounded-md h-9 md:h-10 overflow-hidden font-semibold text-black text-sm md:text-base hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 from-accent-primary to-accent-secondary"
                    >
                      <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform -translate-x-full group-hover:translate-x-full duration-700" />
                      <span className="z-10 relative">Connect</span>
                    </button>
                  )
                }}
              </ConnectButton.Custom>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main
        className="mx-auto px-6 py-8 min-h-[calc(100dvh-130px)] container"
        role="main"
      >
        <SkipLinkTarget />
        <Outlet />
      </main>

      {/* Footer */}
      <footer
        className="mt-auto border-subtle border-t"
        role="contentinfo"
      >
        <div className="mx-auto px-6 py-6 text-center container">
          <p className="text-caption text-tertiary">
            Secured by Safe • Built for DeFi •{' '}
            <a
              href="https://docs.multiclaws.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-primary hover:underline"
            >
              Docs
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
