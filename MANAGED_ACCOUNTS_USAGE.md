# Fetching Managed Accounts from the Contract

This document explains how to fetch managed accounts from the Guardian contract using view functions.

## Overview

The `useManagedAccounts` hook fetches all addresses that have been granted roles in the Guardian contract. It works by:

1. Calling `getSubaccountsByRole(DEFI_EXECUTE_ROLE)` to get all accounts with execute permission
2. Calling `getSubaccountsByRole(DEFI_TRANSFER_ROLE)` to get all accounts with transfer permission
3. Merging the results and building a list of unique addresses with their current role status

## Role Types

The contract supports two role types:
- **DEFI_EXECUTE_ROLE (1)**: Can execute protocol interactions and approvals (limited by portfolio loss %)
- **DEFI_TRANSFER_ROLE (2)**: Can transfer tokens from Safe (configurable % per window)

## Hook Location

The hook is defined in `src/hooks/useSafe.ts`:

```typescript
import { useManagedAccounts } from '@/hooks/useSafe'
```

## Hook Return Value

The hook returns an object with the following properties:

```typescript
{
  accounts: SubAccount[],    // Array of managed accounts with roles
  isLoading: boolean,        // Loading state
  error: Error | null,       // Error if fetch failed
  refetch: () => void        // Function to manually trigger a refetch
}
```

Where `SubAccount` is defined as:

```typescript
interface SubAccount {
  address: `0x${string}`
  hasExecuteRole: boolean
  hasTransferRole: boolean
  addedAt?: number  // Unix timestamp when first role was granted (optional)
}
```

## Usage Example

### Basic Usage in a Component

```typescript
import { useManagedAccounts } from '@/hooks/useSafe'

export function MyComponent() {
  const { accounts, isLoading, error } = useManagedAccounts()

  if (isLoading) {
    return <div>Loading managed accounts...</div>
  }

  if (error) {
    return <div>Error: {error.message}</div>
  }

  return (
    <div>
      <h2>Managed Accounts ({accounts.length})</h2>
      <ul>
        {accounts.map(account => (
          <li key={account.address}>
            {account.address}
            {account.hasExecuteRole && ' - Has Execute Role'}
            {account.hasTransferRole && ' - Has Transfer Role'}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

### Complete Example Component

See `src/components/ManagedAccountsList.tsx` for a complete example component that displays managed accounts in a card with badges for each role.

## How It Works

The hook uses the Wagmi `usePublicClient` to call contract view functions:

1. **Fetches execute accounts**: Calls `getSubaccountsByRole(DEFI_EXECUTE_ROLE)` to get all addresses with execute role
2. **Fetches transfer accounts**: Calls `getSubaccountsByRole(DEFI_TRANSFER_ROLE)` to get all addresses with transfer role
3. **Merges results**: Builds a map of unique addresses and combines their role status
4. **Returns array**: Returns a list of all accounts with at least one active role

## Important Notes

- The hook uses contract view functions (`getSubaccountsByRole`) which are fast and reliable
- Results are cached in component state and won't automatically update when new roles are granted
- To manually refresh the data, call the `refetch()` function returned by the hook
- The hook requires the Guardian contract address to be configured in the `ContractAddressContext`

## Performance Considerations

- **First Load**: Very fast (typically <100ms) as it uses simple view function calls
- **Subsequent Renders**: Results are cached in component state
- **Scalability**: Performance is constant regardless of the number of historical role changes

For production use with many accounts, consider:
- Adding pagination if you expect 100+ managed accounts
- Implementing client-side caching with a library like React Query for automatic refetching
- Adding a loading skeleton UI for better UX
- Implementing optimistic updates when granting/revoking roles

## Troubleshooting

### No accounts showing up

1. Verify the Guardian contract address is correctly configured
2. Check that roles have actually been granted on-chain (transactions confirmed)
3. Ensure you're connected to the correct network
4. Check the browser console for error messages
5. Verify the contract has the `getSubaccountsByRole` function deployed

### Hook returns empty array but accounts exist

1. Verify that the accounts actually have active roles (not all revoked)
2. Check that the contract address matches the deployed contract
3. Ensure the ABI matches the deployed contract version
4. Try calling `refetch()` to manually refresh the data

### Hook shows loading forever

1. Check that you have a valid RPC connection
2. Verify the contract address is a valid deployed contract
3. Check the browser console for network errors
