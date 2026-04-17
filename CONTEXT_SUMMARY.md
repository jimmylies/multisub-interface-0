# MultiClaw Context Summary

## Repos

- Frontend: `/Users/leo/multisub-interface-0`
- Contracts and oracle: `/Users/leo/MultiClaw`

## Current Network

- Frontend network: Base Sepolia
- Frontend env uses `VITE_NETWORK=base-sepolia`

## Key On-Chain Addresses

- AgentVaultFactory: `0x577f4F4Fa4ED3146c65E8Cf2f851A330BA4334Ca`
- ModuleRegistry: `0xB19a2AAf5472b1e49e35eEa14f4c0dD25D89Ab96`
- Shared oracle address: `0x763072E0FDa74Eecab3e60BF5BC5b8A46866be7E`
- Current EOA-owned module: `0x92aA3cbE7Bb110a842897673A8F9A3a83c7864bE`
- Older active module: `0x16D44268C4e3a567c5ff87cCCa10Fe46f8a656Bb`
- EOA / avatar used in the latest flow: `0x962aCEB4C3C53f09110106D08364A8B40eA54568`

## Main Frontend Fixes Already Implemented

### Network and chain labeling

- Switched frontend env defaults to Base Sepolia.
- Centralized chain labels, explorer links, and network mapping.
- Files touched:
  - `/Users/leo/multisub-interface-0/.env`
  - `/Users/leo/multisub-interface-0/.env.example`
  - `/Users/leo/multisub-interface-0/src/lib/chains.ts`
  - `/Users/leo/multisub-interface-0/src/main.tsx`
  - `/Users/leo/multisub-interface-0/src/components/StatsBar.tsx`
  - `/Users/leo/multisub-interface-0/src/pages/WizardPage.tsx`
  - `/Users/leo/multisub-interface-0/src/components/TransactionRow.tsx`
  - `/Users/leo/multisub-interface-0/src/components/ui/toast.tsx`

### Existing module detection

- Added registry lookup from factory.
- Frontend now detects when a Safe already has a module.
- Files touched:
  - `/Users/leo/multisub-interface-0/src/lib/contracts/agentVaultFactory.ts`
  - `/Users/leo/multisub-interface-0/src/lib/contracts/moduleRegistry.ts`
  - `/Users/leo/multisub-interface-0/src/lib/contracts/index.ts`
  - `/Users/leo/multisub-interface-0/src/lib/contracts.ts`
  - `/Users/leo/multisub-interface-0/src/pages/WizardPage.tsx`

### Existing-vault agent flow

- The UI now supports one module with multiple agents.
- If a vault already exists, the wizard configures the new agent on the existing module instead of trying to deploy another module.
- Existing-module flow supports:
  - `registerParser(...)`
  - `registerSelector(...)`
  - `grantRole(...)`
  - `setSubAccountLimits(...)`
  - `setAllowedAddresses(...)`
- It also skips actions already configured on-chain.
- A pre-confirmation popup now explains when multiple wallet signatures are expected and why.
- Main files:
  - `/Users/leo/multisub-interface-0/src/pages/WizardPage.tsx`
  - `/Users/leo/multisub-interface-0/src/lib/contracts/guardian.ts`
  - `/Users/leo/multisub-interface-0/src/hooks/useSafeProposal.ts`

### Successful deploy / existing-vault warning bug

- Fixed the contradictory state where the wizard showed a success card and an "already has a vault" warning right after the same deployment.
- The warning is now suppressed if the registry points to the module just deployed.
- File:
  - `/Users/leo/multisub-interface-0/src/pages/WizardPage.tsx`

### Advanced page loading / manual entry

- `Advanced` no longer acts like nothing is loaded when a vault exists.
- If one vault is discovered, it auto-loads.
- If several are discovered, it shows an openable list.
- Manual module entry is available even when unconfigured.
- Files:
  - `/Users/leo/multisub-interface-0/src/pages/DashboardPage.tsx`
  - `/Users/leo/multisub-interface-0/src/components/ContractSetup.tsx`

### Ownership detection for EOA-owned modules

- The app now recognizes direct EOA ownership, not only Safe multisig signers.
- Owner actions for EOA-owned vaults use direct wallet transactions instead of always going through Safe Protocol Kit.
- Files:
  - `/Users/leo/multisub-interface-0/src/hooks/useSafe.ts`
  - `/Users/leo/multisub-interface-0/src/hooks/useSafeProposal.ts`

### Navigation active state

- Active top-nav section is shown in white.
- File:
  - `/Users/leo/multisub-interface-0/src/layouts/MainLayout.tsx`

### Delete sub-account UX

- Added explicit delete actions instead of forcing users to infer that removing all roles means deletion.
- Files:
  - `/Users/leo/multisub-interface-0/src/pages/AgentsPage.tsx`
  - `/Users/leo/multisub-interface-0/src/components/SubAccountManager.tsx`

### Delete preview regression

- Restored the richer transaction preview for authorization deletion.
- `AgentsPage` now passes full state to the preview modal.
- File:
  - `/Users/leo/multisub-interface-0/src/pages/AgentsPage.tsx`

### Oracle badge UI fix

- The UI was showing `56 years ago` because `lastUpdated = 0` was being formatted as Unix epoch.
- Now:
  - `0` shows as `Never updated`
  - status becomes `Pending`
- Files:
  - `/Users/leo/multisub-interface-0/src/lib/utils.ts`
  - `/Users/leo/multisub-interface-0/src/components/StatsBar.tsx`
  - `/Users/leo/multisub-interface-0/src/components/OracleStatusIndicator.tsx`

## Oracle Investigation

### What was happening

- `getSafeValue()` returned `(0, 0, 0)` for both active Base Sepolia modules.
- That means `updateSafeValue(...)` had never been called successfully for those modules.
- The modules and oracle address were wired correctly on-chain.
- The ETH/USD price feed on Base Sepolia was live.
- Your EOA-owned vault had native ETH, so value should not have been zero.

### Root cause

- There was no oracle process running.
- The off-chain oracle service in `/Users/leo/MultiClaw/oracle` was simply not started.

### Verification performed

- Verified registry discovery on-chain.
- Verified `authorizedOracle()` matched the configured private key.
- Verified Base Sepolia ETH/USD feed returned live data.
- Verified there was no oracle process running before intervention.
- Installed dependencies in `/Users/leo/MultiClaw/oracle`.
- Started the oracle with `npm start`.

### What happened after starting it

- The safe-value oracle discovered both active modules from the registry.
- It updated:
  - `0x16D44268C4e3a567c5ff87cCCa10Fe46f8a656Bb`
  - `0x92aA3cbE7Bb110a842897673A8F9A3a83c7864bE`
- Current observed values after startup:
  - `0x92aA...864bE` -> `getSafeValue() = (393205893032691840221, 1776004310, 1)`
  - `0x16D4...56Bb` -> `getSafeValue() = (39998206400000000000, 1776004306, 1)`

## Oracle Repo Hardening Already Implemented

### Config validation

- Registry mode is now first-class.
- `MODULE_ADDRESS` is no longer mandatory if `REGISTRY_ADDRESS` is present.
- File:
  - `/Users/leo/MultiClaw/oracle/src/config.ts`

### Startup logs

- Startup now logs:
  - selected chain
  - RPC URL
  - whether it is in registry mode or single-module mode
- File:
  - `/Users/leo/MultiClaw/oracle/src/index.ts`

### Example env defaults

- `.env.example` now defaults to `CHAIN=base-sepolia`
- Registry mode is marked as the recommended shared setup
- `MODULE_ADDRESS` is documented as optional fallback
- Files:
  - `/Users/leo/MultiClaw/oracle/.env.example`
  - `/Users/leo/MultiClaw/oracle/README.md`

## Current Oracle Runtime Status

- The oracle was started successfully during this session from:
  - `/Users/leo/MultiClaw/oracle`
- Important note:
  - it is currently a live process started from this session
  - it is not yet installed as a persistent background service
  - if the process stops, updates will stop again

## Remaining Recommended Next Step

- Set up the oracle as a persistent service so it survives terminal closes and restarts.

## Verification Notes

- Frontend builds passed after the frontend patches with `npm run build`.
- Oracle runtime verification succeeded through live startup logs and on-chain `cast call` checks.
- A full oracle TypeScript compile with `npx tsc --noEmit` still reports unrelated pre-existing errors in:
  - `/Users/leo/MultiClaw/oracle/src/analyze-failed-tx.ts`

## Most Important Files To Revisit Later

- Frontend
  - `/Users/leo/multisub-interface-0/src/pages/WizardPage.tsx`
  - `/Users/leo/multisub-interface-0/src/hooks/useSafe.ts`
  - `/Users/leo/multisub-interface-0/src/hooks/useSafeProposal.ts`
  - `/Users/leo/multisub-interface-0/src/pages/DashboardPage.tsx`
  - `/Users/leo/multisub-interface-0/src/pages/AgentsPage.tsx`
  - `/Users/leo/multisub-interface-0/src/components/SubAccountManager.tsx`
  - `/Users/leo/multisub-interface-0/src/components/ContractSetup.tsx`
  - `/Users/leo/multisub-interface-0/src/components/StatsBar.tsx`
  - `/Users/leo/multisub-interface-0/src/components/OracleStatusIndicator.tsx`
  - `/Users/leo/multisub-interface-0/src/lib/utils.ts`

- Oracle / contracts
  - `/Users/leo/MultiClaw/oracle/src/index.ts`
  - `/Users/leo/MultiClaw/oracle/src/config.ts`
  - `/Users/leo/MultiClaw/oracle/src/safe-value.ts`
  - `/Users/leo/MultiClaw/oracle/src/spending-oracle.ts`
  - `/Users/leo/MultiClaw/src/DeFiInteractorModule.sol`

