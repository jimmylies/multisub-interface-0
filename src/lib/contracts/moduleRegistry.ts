export const MODULE_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'getModuleForSafe',
    inputs: [{ name: 'safe', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getActiveModules',
    inputs: [],
    outputs: [{ name: '', type: 'address[]', internalType: 'address[]' }],
    stateMutability: 'view',
  },
] as const
