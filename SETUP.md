# Dynamic Contract Address Setup

This application now supports dynamic contract addresses via URL parameters, localStorage, or manual input. This makes it easy to share your Safe configuration with sub-accounts or use the same interface with multiple Safe deployments.

## Quick Start

### Option 1: URL Parameters (Recommended for Sharing)

Share your Safe configuration by adding the contract address to the URL:

```
https://your-app.com/?guardian=0x1234567890abcdef1234567890abcdef12345678
```

Anyone visiting this link will automatically be configured with your Guardian contract.

### Option 2: Manual Input

1. Visit the application without any parameters
2. Enter your Guardian contract address in the setup form
3. Click "Connect to Contract"
4. The address will be saved to localStorage for future visits

### Option 3: Environment Variables (Development)

For development, you can still use environment variables:

```env
VITE_GUARDIAN_ADDRESS=0x1234567890abcdef1234567890abcdef12345678
```

## How It Works

### Priority Order

The application loads contract addresses in this priority order:

1. **URL Parameters** (highest priority)
   - `?guardian=0x...`

2. **LocalStorage** (persisted from previous sessions)
   - Saved when you manually enter an address or visit via URL

3. **Environment Variables** (lowest priority, development only)
   - `VITE_GUARDIAN_ADDRESS`

### Contract Address Management

The app uses React Context (`ContractAddressContext`) to manage addresses globally:

- **Read addresses**: `const { addresses } = useContractAddresses()`
- **Set Guardian**: `setGuardian('0x...')`
- **Check if configured**: `isConfigured` boolean

### Features

#### Shareable Links
Safe admins can copy a shareable link that includes their contract address:
- Click "Copy Shareable Link" in the Contract Setup card
- Share with sub-accounts
- Recipients are automatically configured

#### Change Contracts
Switch between different Safe deployments:
- Click "Change Contracts" in the Contract Setup card
- Clears localStorage
- Redirects to setup screen

## Usage Examples

### For Safe Admins

1. Deploy your Guardian contract
2. Get the contract address
3. Visit: `https://app.com/?guardian=YOUR_ADDRESS`
4. Share this URL with sub-accounts

### For Sub-Accounts

1. Click the link provided by your Safe admin
2. Connect your wallet
3. View your permissions and spending limits
4. The contract address is saved for future visits

### For Developers

```typescript
import { useContractAddresses } from '@/contexts/ContractAddressContext'

function MyComponent() {
  const { addresses, isConfigured } = useContractAddresses()

  // Use addresses.guardian in contract calls
  const { data } = useReadContract({
    address: addresses.guardian,
    abi: GUARDIAN_ABI,
    functionName: 'safe'
  })
}
```

## Migration from Hardcoded Addresses

All components have been updated to use the context:

- ❌ `CONTRACT_ADDRESSES.GUARDIAN` (old)
- ✅ `addresses.guardian` (new)

The `CONTRACT_ADDRESSES` export has been removed from `src/lib/contracts.ts`.

## Troubleshooting

**Address not loading?**
- Check the URL parameter format: `?guardian=0x...`
- Ensure the address is a valid Ethereum address
- Clear localStorage and try again

**Want to reset?**
- Click "Change Contracts" in the setup card
- Or clear localStorage manually
- Or visit without URL parameters

**Testing locally?**
- Set `VITE_GUARDIAN_ADDRESS` in `.env`
- Or use URL parameters in development

## Security Notes

- Addresses are validated using `isAddress()` from viem
- Invalid addresses are rejected
- No sensitive data is stored (only contract addresses)
- LocalStorage is domain-specific
