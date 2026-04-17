# Morpho Smart Wallet Interface

A management interface for Safe owners to create and manage sub-accounts with delegated DeFi permissions. Built with React, TypeScript, Vite, RainbowKit, wagmi, viem, Tailwind CSS, and shadcn/ui.

## Overview

This dApp provides a user-friendly interface for the [Morpho Smart Wallet](../Documents/miel/morpho-smart-wallet) system, which enables Safe multisig owners to delegate limited DeFi operations to sub-accounts without compromising security.

### What is Morpho Smart Wallet?

Morpho Smart Wallet solves the DeFi custody trilemma by combining:

- **Security**: Safe multisig retains ultimate control over all assets
- **Usability**: Sub-accounts can execute daily DeFi operations with single signature
- **Flexibility**: Role-based permissions with time-windowed cumulative limits

## Key Features

### For Safe Owners

- Connect Safe multisig wallet
- View Safe balance and DeFi positions
- Create and manage sub-accounts
- Grant/revoke deposit and withdrawal roles
- Monitor sub-account activity in real-time
- Emergency pause all operations
- View transaction history and alerts

### For Sub-Accounts

- Connect as authorized sub-account
- Deposit to Morpho Vaults (up to 10% of Safe balance per 24h)
- Withdraw from Morpho Vaults (up to 5% of position per 24h)
- View remaining limits and window reset time
- Track personal transaction history

## Security Model

### Limits and Protection

- **Deposit Limit**: 10% of Safe balance per 24-hour rolling window
- **Withdrawal Limit**: 5% of vault position per 24-hour rolling window
- **Slippage Protection**: All operations require min/max share parameters
- **Cumulative Tracking**: Prevents rapid draining via multiple small transactions
- **Emergency Pause**: Safe owners can freeze all operations instantly

### Permission Roles

1. **DEFI_DEPOSIT_ROLE** (Role ID: 1): Can deposit to Morpho Vaults
2. **DEFI_WITHDRAW_ROLE** (Role ID: 2): Can withdraw from Morpho Vaults

Sub-accounts can have one or both roles assigned by the Safe.

## Prerequisites

- Node.js 18+ and pnpm installed
- A Safe multisig deployed (create at [app.safe.global](https://app.safe.global/))
- Zodiac Roles module enabled on your Safe
- Guardian and SmartWallet contracts deployed
- WalletConnect Project ID (get one at [cloud.walletconnect.com](https://cloud.walletconnect.com/))

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment

Create a `.env` file:

```env
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

## Development

Run the development server:

```bash
pnpm dev
```

The app will be available at `http://localhost:5173`

## Build

Build for production:

```bash
pnpm build
```

Preview the production build:

```bash
pnpm preview
```

## Usage Guide

### As a Safe Owner

1. **Connect Your Safe**

   - Click "Connect Wallet"
   - Select your Safe multisig address
   - Ensure you have signer permissions

2. **View Dashboard**

   - See Safe USDC balance
   - View vault positions and shares
   - Monitor all sub-account activity

3. **Create Sub-Account**

   - Navigate to "Sub-Accounts" tab
   - Enter sub-account address (any Ethereum address)
   - Select roles to grant (Deposit and/or Withdraw)
   - Confirm transaction (requires Safe signatures)

4. **Monitor Activity**

   - View real-time deposits and withdrawals
   - See cumulative limits usage
   - Receive unusual activity alerts (>8% deposits, >4% withdrawals)

5. **Emergency Response**
   - Click "Emergency Pause" to freeze all operations
   - Revoke compromised sub-account roles
   - Unpause when secure

### As a Sub-Account

1. **Connect Wallet**

   - Connect with your authorized address
   - View your assigned roles and limits

2. **Deposit to Vault**

   - Enter deposit amount (max 10% of Safe balance per 24h)
   - Set slippage tolerance
   - Execute transaction (single signature)

3. **Withdraw from Vault**

   - Enter withdrawal amount (max 5% of position per 24h)
   - Set slippage tolerance
   - Execute transaction (single signature)

4. **Track Limits**
   - See remaining allowance in current 24h window
   - View window reset countdown
   - Check transaction history

## Smart Contract Integration

This dApp integrates with three core contracts:

### Guardian Contract

- Enforces cumulative limits
- Executes vault deposits/withdrawals
- Emits comprehensive events
- Provides pause mechanism

### SmartWallet.sol

- Manages sub-account whitelist
- Handles protocol whitelisting
- Executes delegated transactions

### Zodiac Roles

- Role-based access control
- Validates permissions before execution
- Forwards calls to Safe

## Architecture

```
┌─────────────────┐
│  Safe Multisig  │ ← Ultimate control (2/3 signatures)
└────────┬────────┘
         ↓
┌─────────────────┐
│  Zodiac Roles   │ ← Access control layer
└────────┬────────┘
         ↓
┌─────────────────┐
│    Guardian     │ ← Limit enforcement
└────────┬────────┘
         ↓
┌─────────────────┐
│  Sub-Accounts   │ ← Delegated permissions
└────────┬────────┘
         ↓
┌─────────────────┐
│  Morpho Vaults  │ ← DeFi protocols
└─────────────────┘
```

## Technologies Used

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **RainbowKit** - Wallet connection UI
- **wagmi v2** - React hooks for Ethereum
- **viem 2.x** - TypeScript Ethereum library
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Re-usable component library
- **TanStack Query** - Data fetching and caching
- **Lucide React** - Icon library

## Project Structure

```
msw-interface/
├── src/
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── SafeDashboard.tsx   # Safe owner dashboard
│   │   ├── SubAccountManager.tsx # Create/manage sub-accounts
│   │   ├── DepositInterface.tsx  # Deposit to vaults
│   │   ├── WithdrawInterface.tsx # Withdraw from vaults
│   │   ├── ActivityMonitor.tsx   # Transaction history
│   │   └── EmergencyControls.tsx # Pause/unpause
│   ├── lib/
│   │   ├── utils.ts            # Utility functions
│   │   └── contracts.ts        # Contract ABIs and addresses
│   ├── types/
│   │   └── contracts.ts        # TypeScript contract types
│   ├── App.tsx                 # Main app component
│   ├── main.tsx                # Entry point
│   ├── wagmi.ts                # wagmi configuration
│   └── index.css               # Global styles
├── public/
├── .env.example
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## Security Considerations

1. **Never share sub-account private keys**: They have limited access but can still move 5% per 24h
2. **Monitor unusual activity alerts**: Set up notifications for large operations
3. **Regular sub-account rotation**: Revoke and recreate sub-accounts periodically
4. **Test on testnet first**: Deploy and test on Sepolia before mainnet
5. **Keep Safe signers secure**: Safe owners have ultimate control

## Troubleshooting

### Connection Issues

- Ensure your Safe is on the correct network
- Verify Zodiac Roles module is enabled
- Check that contracts are deployed

### Transaction Failures

- "Unauthorized": Sub-account doesn't have required role
- "ExceedsDepositLimit": Exceeds 10% cumulative limit in 24h window
- "ExceedsWithdrawLimit": Exceeds 5% cumulative limit in 24h window
- "Paused": System is in emergency pause mode

### Limit Calculations

- Limits are based on balance/position at window start (not current)
- Each sub-account has independent 24h windows
- Windows reset automatically after 24 hours

## Related Documentation

- [Project Overview](../Documents/miel/morpho-smart-wallet/PROJECT_OVERVIEW.md)
- [Technical Details](../Documents/miel/morpho-smart-wallet/TECHNICAL_DETAILS.md)
- [Examples](../Documents/miel/morpho-smart-wallet/EXAMPLE.md)
- [Smart Contracts](../Documents/miel/morpho-smart-wallet/src/)

## License

MIT License

## Disclaimer

⚠️ **Use at your own risk**

- This software is provided "as is" without warranty
- Smart contracts should be audited before production use
- Test thoroughly on testnets first
- Not financial advice

---

**Built for secure, flexible DeFi custody** 🛡️
