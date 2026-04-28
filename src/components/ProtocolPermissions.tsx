import { useState, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/tooltip'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { GUARDIAN_ABI, ROLES, ROLE_DESCRIPTIONS, ROLE_NAMES } from '@/lib/contracts'
import { PROTOCOLS, Protocol, ProtocolContract, getContractAddresses } from '@/lib/protocols'
import { useContractAddresses } from '@/contexts/ContractAddressContext'
import { useSafeProposal, encodeContractCall } from '@/hooks/useSafeProposal'
import { useAllowedAddresses } from '@/hooks/useSafe'
import { composeBindings } from '@/lib/protocolBindings'
import { selectedNetworkName } from '@/lib/chains'
import {
  useSubAccountFullState,
  mergeProtocolsWithChanges,
  mergeRolesWithChanges,
} from '@/hooks/useSubAccountFullState'
import { TRANSACTION_TYPES } from '@/lib/transactionTypes'
import { useToast } from '@/contexts/ToastContext'
import { useTransactionPreviewContext } from '@/contexts/TransactionPreviewContext'
import type {
  TransactionPreviewData,
  ProtocolChange,
  ContractChange,
} from '@/types/transactionPreview'

interface ProtocolPermissionsProps {
  subAccountAddress: `0x${string}`
}

export function ProtocolPermissions({ subAccountAddress }: ProtocolPermissionsProps) {
  const { addresses } = useContractAddresses()
  const queryClient = useQueryClient()
  const publicClient = usePublicClient()
  const [selectedProtocols, setSelectedProtocols] = useState<Map<string, Set<string>>>(new Map())
  const [expandedProtocol, setExpandedProtocol] = useState<string | null>(null)
  const { toast } = useToast()
  const { showPreview } = useTransactionPreviewContext()

  const { proposeTransaction, isPending } = useSafeProposal()

  // Get full sub-account state for preview context
  const { fullState: currentFullState, hasExecuteRole } = useSubAccountFullState(subAccountAddress)

  const addressesToCheck = useMemo(() => {
    const allAddresses: `0x${string}`[] = []
    PROTOCOLS.forEach(protocol => {
      protocol.contracts.forEach(contract => {
        getContractAddresses(contract).forEach(addr => allAddresses.push(addr))
      })
    })
    return allAddresses
  }, [])

  // Fetch already allowed addresses from contract
  const {
    data: allowedAddresses = new Set(),
    isLoading: isLoadingAllowed,
  } = useAllowedAddresses(subAccountAddress, addressesToCheck)

  useEffect(() => {
    const newMap = new Map<string, Set<string>>()

    PROTOCOLS.forEach(protocol => {
      const selectedContracts = new Set<string>()

      // Check which contracts are allowed (all addresses must be allowed)
      protocol.contracts.forEach(contract => {
        const addresses = getContractAddresses(contract)
        const allAllowed = addresses.every(addr => allowedAddresses.has(addr))
        if (allAllowed) {
          selectedContracts.add(contract.id)
        }
      })

      if (selectedContracts.size > 0) {
        newMap.set(protocol.id, selectedContracts)
      }
    })

    setSelectedProtocols(newMap)
  }, [allowedAddresses])

  const hasChanges = useMemo(() => {
    // Collecter les adresses sélectionnées
    const selectedAddresses = new Set<`0x${string}`>()

    selectedProtocols.forEach((contractIds, protocolId) => {
      const protocol = PROTOCOLS.find(p => p.id === protocolId)
      if (protocol) {
        contractIds.forEach(contractId => {
          const contract = protocol.contracts.find(c => c.id === contractId)
          if (contract) {
            getContractAddresses(contract).forEach(addr => selectedAddresses.add(addr))
          }
        })
      }
    })

    // Compare with currently authorized addresses
    if (selectedAddresses.size !== allowedAddresses.size) {
      return true
    }

    for (const addr of selectedAddresses) {
      if (!allowedAddresses.has(addr)) {
        return true
      }
    }

    return false
  }, [selectedProtocols, allowedAddresses])

  const toggleProtocol = (protocolId: string) => {
    const protocol = PROTOCOLS.find(p => p.id === protocolId)
    if (!protocol) return

    const current = selectedProtocols.get(protocolId)
    if (current && current.size > 0) {
      // Deselect protocol and all contracts
      const newMap = new Map(selectedProtocols)
      newMap.delete(protocolId)
      setSelectedProtocols(newMap)
    } else {
      // Select all contracts in the protocol
      const newMap = new Map(selectedProtocols)
      const allContractIds = new Set(protocol.contracts.map(c => c.id))
      newMap.set(protocol.id, allContractIds)
      setSelectedProtocols(newMap)
    }
  }

  const toggleContract = (protocolId: string, contractId: string) => {
    const newMap = new Map(selectedProtocols)
    const current = newMap.get(protocolId) || new Set<string>()

    if (current.has(contractId)) {
      current.delete(contractId)
      if (current.size === 0) {
        newMap.delete(protocolId)
      } else {
        newMap.set(protocolId, current)
      }
    } else {
      current.add(contractId)
      newMap.set(protocolId, current)
    }

    setSelectedProtocols(newMap)
  }

  const selectAllContracts = (protocol: Protocol) => {
    const newMap = new Map(selectedProtocols)
    const allContractIds = new Set(protocol.contracts.map(c => c.id))
    newMap.set(protocol.id, allContractIds)
    setSelectedProtocols(newMap)
  }

  const deselectAllContracts = (protocol: Protocol) => {
    const newMap = new Map(selectedProtocols)
    newMap.delete(protocol.id)
    setSelectedProtocols(newMap)
  }

  const { added, removed } = useMemo(() => {
    const selectedAddressSet = new Set<string>()
    selectedProtocols.forEach((contractIds, protocolId) => {
      const protocol = PROTOCOLS.find(p => p.id === protocolId)
      protocol?.contracts.forEach(c => {
        if (contractIds.has(c.id)) {
          getContractAddresses(c).forEach(addr => selectedAddressSet.add(addr))
        }
      })
    })

    let addedCount = 0
    let removedCount = 0
    selectedAddressSet.forEach(addr => {
      if (!allowedAddresses.has(addr as `0x${string}`)) addedCount++
    })
    allowedAddresses.forEach(addr => {
      if (!selectedAddressSet.has(addr)) removedCount++
    })
    return { added: addedCount, removed: removedCount }
  }, [selectedProtocols, allowedAddresses])

  const handleSavePermissions = async () => {
    if (!addresses.guardian) {
      toast.warning('Contract not configured')
      return
    }

    // Build set of currently selected addresses
    const selectedAddressSet = new Set<string>()
    selectedProtocols.forEach((contractIds, protocolId) => {
      const protocol = PROTOCOLS.find(p => p.id === protocolId)
      protocol?.contracts.forEach(c => {
        if (contractIds.has(c.id)) {
          getContractAddresses(c).forEach(addr => selectedAddressSet.add(addr))
        }
      })
    })

    // Build protocol changes for preview
    const protocolChanges: ProtocolChange[] = PROTOCOLS.map(protocol => {
      const selectedContracts = selectedProtocols.get(protocol.id) || new Set<string>()

      const contracts: ContractChange[] = protocol.contracts.map(contract => {
        const contractAddresses = getContractAddresses(contract)
        const isCurrentlyAllowed = contractAddresses.every(addr => allowedAddresses.has(addr))
        const isSelected = selectedContracts.has(contract.id)

        let action: 'add' | 'remove' | 'unchanged' = 'unchanged'
        if (isSelected && !isCurrentlyAllowed) {
          action = 'add'
        } else if (!isSelected && isCurrentlyAllowed) {
          action = 'remove'
        }

        return {
          contractId: contract.id,
          contractName: contract.name,
          address: contract.address,
          description: contract.description,
          action,
        }
      })

      return {
        protocolId: protocol.id,
        protocolName: protocol.name,
        contracts,
      }
    }).filter(p => p.contracts.some(c => c.action !== 'unchanged'))

    const hasProtocolAdditions = protocolChanges.some(protocol =>
      protocol.contracts.some(contract => contract.action === 'add')
    )
    const roleChanges =
      hasProtocolAdditions && !hasExecuteRole
        ? [
            {
              roleId: ROLES.DEFI_EXECUTE_ROLE,
              roleName: ROLE_NAMES[ROLES.DEFI_EXECUTE_ROLE],
              description: ROLE_DESCRIPTIONS[ROLES.DEFI_EXECUTE_ROLE],
              action: 'add' as const,
            },
          ]
        : []

    if (protocolChanges.length === 0) {
      toast.warning('No changes to apply')
      return
    }

    // Build full state with protocol changes applied
    const fullStateWithChanges = {
      roles:
        roleChanges.length > 0
          ? mergeRolesWithChanges(currentFullState.roles, roleChanges)
          : currentFullState.roles,
      spendingLimits: currentFullState.spendingLimits, // Unchanged
      protocols: mergeProtocolsWithChanges(currentFullState.protocols, protocolChanges),
    }

    const previewData: TransactionPreviewData = {
      type: 'update-protocols',
      subAccountAddress,
      protocols: protocolChanges,
      fullState: fullStateWithChanges,
    }

    showPreview(previewData, async () => {
      const transactions: Array<{ to: `0x${string}`; data: `0x${string}` }> = []

      // Addresses to ADD (selected but not yet allowed)
      const addressesToAdd: `0x${string}`[] = []
      // Track which protocol IDs are being newly added so we can register
      // their parsers and selectors (required for the guardian to validate calls)
      const newlyAddedProtocolIds: string[] = []
      selectedProtocols.forEach((contractIds, protocolId) => {
        const protocol = PROTOCOLS.find(p => p.id === protocolId)
        if (!protocol) return
        let hasNew = false
        protocol.contracts.forEach(c => {
          if (contractIds.has(c.id)) {
            getContractAddresses(c).forEach(addr => {
              if (!allowedAddresses.has(addr)) {
                addressesToAdd.push(addr)
                hasNew = true
              }
            })
          }
        })
        if (hasNew) newlyAddedProtocolIds.push(protocolId)
      })

      // Addresses to REMOVE (currently allowed but deselected)
      const addressesToRemove: `0x${string}`[] = []
      allowedAddresses.forEach(addr => {
        if (!selectedAddressSet.has(addr)) {
          addressesToRemove.push(addr)
        }
      })

      // Register parsers + selectors for newly added protocols.
      // Without these the guardian module cannot parse or classify calls,
      // so the agent's transactions would revert even though the addresses
      // are whitelisted.
      // addresses.guardian is guaranteed non-null here — checked at the top
      // of handleSavePermissions before showPreview was called.
      const guardian = addresses.guardian!

      if (newlyAddedProtocolIds.length > 0 && publicClient) {
        const composed = composeBindings(selectedNetworkName, newlyAddedProtocolIds)

        // Parsers: check on-chain, register only what's missing
        for (let i = 0; i < composed.parserProtocols.length; i++) {
          const protocol = composed.parserProtocols[i]
          const parser = composed.parserAddresses[i]
          const currentParser = await publicClient.readContract({
            address: guardian,
            abi: GUARDIAN_ABI,
            functionName: 'protocolParsers',
            args: [protocol],
          })
          if ((currentParser as string).toLowerCase() !== parser.toLowerCase()) {
            transactions.push({
              to: guardian,
              data: encodeContractCall(guardian, GUARDIAN_ABI as unknown as any[], 'registerParser', [
                protocol,
                parser,
              ]),
            })
          }
        }

        // Selectors: check on-chain, register only what's missing
        for (let i = 0; i < composed.selectors.length; i++) {
          const selector = composed.selectors[i]
          const opType = composed.selectorTypes[i]
          const currentOpType = await publicClient.readContract({
            address: guardian,
            abi: GUARDIAN_ABI,
            functionName: 'selectorType',
            args: [selector],
          })
          if (Number(currentOpType) !== opType) {
            transactions.push({
              to: guardian,
              data: encodeContractCall(guardian, GUARDIAN_ABI as unknown as any[], 'registerSelector', [
                selector,
                opType,
              ]),
            })
          }
        }
      }

      // Build transaction to ADD addresses
      if (addressesToAdd.length > 0) {
        if (!hasExecuteRole) {
          transactions.push({
            to: guardian,
            data: encodeContractCall(guardian, GUARDIAN_ABI as unknown as any[], 'grantRole', [
              subAccountAddress,
              ROLES.DEFI_EXECUTE_ROLE,
            ]),
          })
        }

        transactions.push({
          to: guardian,
          data: encodeContractCall(
            guardian,
            GUARDIAN_ABI as unknown as any[],
            'setAllowedAddresses',
            [subAccountAddress, addressesToAdd, true]
          ),
        })
      }

      // Build transaction to REMOVE addresses
      if (addressesToRemove.length > 0) {
        transactions.push({
          to: guardian,
          data: encodeContractCall(
            guardian,
            GUARDIAN_ABI as unknown as any[],
            'setAllowedAddresses',
            [subAccountAddress, addressesToRemove, false]
          ),
        })
      }

      try {
        const result = await proposeTransaction(
          transactions.length === 1 ? transactions[0] : transactions,
          { transactionType: TRANSACTION_TYPES.SET_ALLOWED_ADDRESSES }
        )

        if (result.success) {
          // Optimistically update the allowed addresses cache so the UI reflects
          // the change immediately without waiting for the RPC refetch
          const newAllowedSet = new Set<`0x${string}`>()
          selectedProtocols.forEach((contractIds, protocolId) => {
            const protocol = PROTOCOLS.find(p => p.id === protocolId)
            protocol?.contracts.forEach(c => {
              if (contractIds.has(c.id)) {
                getContractAddresses(c).forEach(addr => newAllowedSet.add(addr))
              }
            })
          })
          queryClient.setQueryData(
            ['allowedAddresses', addresses.guardian, subAccountAddress, addressesToCheck],
            newAllowedSet
          )
          // Refetch after a delay to let the RPC index the new block
          setTimeout(() => {
            queryClient.refetchQueries({
              predicate: query =>
                Array.isArray(query.queryKey) && query.queryKey[0] === 'allowedAddresses',
            })
          }, 4000)
          toast.success('Protocol permissions updated')
        } else if ('cancelled' in result && result.cancelled) {
          // User cancelled - do nothing
          return
        } else {
          throw result.error || new Error('Transaction failed')
        }
      } catch (error) {
        console.error('Error proposing permissions:', error)
        const errorMsg = error instanceof Error ? error.message : 'Failed to propose transaction'
        toast.error(`Transaction failed: ${errorMsg}`)
      }
    })
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <CardTitle>Protocol Permissions</CardTitle>
        <CardDescription>
          Select which DeFi protocol contracts this sub-account can interact with
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoadingAllowed ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-3 border-2 border-accent-primary border-t-transparent rounded-full w-8 h-8 animate-spin" />
            <p className="text-small text-tertiary">Loading permissions...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {PROTOCOLS.map(protocol => {
              const isComingSoon = protocol.id === 'merkl'

              if (isComingSoon) {
                return (
                  <Tooltip key={protocol.id} content="Coming soon">
                    <div className="rounded-xl border overflow-hidden border-subtle bg-elevated opacity-50 cursor-not-allowed">
                      <div className="flex justify-between items-center p-4">
                        <div className="flex flex-1 gap-3">
                          <Checkbox
                            id={`protocol-${protocol.id}`}
                            checked={false}
                            onChange={() => {}}
                            label=""
                            disabled
                          />
                          <div className="flex-1">
                            <p className="font-medium text-primary text-small">{protocol.name}</p>
                            <p className="mt-0.5 text-caption text-tertiary">{protocol.description}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Tooltip>
                )
              }

              const selectedContracts = selectedProtocols.get(protocol.id)
              const hasSelectedContracts = selectedContracts && selectedContracts.size > 0
              const isExpanded = expandedProtocol === protocol.id

              // Check if any contract in protocol is currently allowed
              const isProtocolAllowed = protocol.contracts.some(c =>
                getContractAddresses(c).some(addr => allowedAddresses.has(addr))
              )

              // Check if there are newly selected contracts (not yet allowed)
              const hasNewSelections =
                hasSelectedContracts &&
                protocol.contracts.some(
                  c =>
                    selectedContracts.has(c.id) &&
                    getContractAddresses(c).some(addr => !allowedAddresses.has(addr))
                )

              // Determine background color based on state
              const getProtocolBgClass = () => {
                if (hasNewSelections) return 'bg-success-muted border-success/20'
                if (isProtocolAllowed) return 'bg-info-muted border-info/20'
                return 'bg-elevated border-subtle'
              }

              return (
                <div
                  key={protocol.id}
                  className={`rounded-xl border overflow-hidden transition-colors ${getProtocolBgClass()}`}
                >
                  <div className="flex justify-between items-center p-4">
                    <div className="flex flex-1 gap-3">
                      <Checkbox
                        id={`protocol-${protocol.id}`}
                        checked={hasSelectedContracts}
                        onChange={() => toggleProtocol(protocol.id)}
                        label=""
                      />
                      <div
                        className="flex-1 cursor-pointer"
                        onClick={() => setExpandedProtocol(isExpanded ? null : protocol.id)}
                      >
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-primary text-small">{protocol.name}</p>
                          {isProtocolAllowed && <Badge variant="info">Allowed</Badge>}
                          {hasSelectedContracts && (
                            <Badge
                              variant="secondary"
                              className="text-xs"
                            >
                              {selectedContracts.size} contract
                              {selectedContracts.size !== 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-caption text-tertiary">{protocol.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          selectedContracts?.size === protocol.contracts.length
                            ? deselectAllContracts(protocol)
                            : selectAllContracts(protocol)
                        }
                      >
                        {selectedContracts?.size === protocol.contracts.length
                          ? 'Deselect All'
                          : 'Select All'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedProtocol(isExpanded ? null : protocol.id)}
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="space-y-2 my-3 mr-4 ml-6 pl-3 border-muted border-l">
                      {protocol.contracts.map(contract => {
                        const contractAddresses = getContractAddresses(contract)
                        const isContractAllowed = contractAddresses.every(addr =>
                          allowedAddresses.has(addr)
                        )
                        return (
                          <ContractCheckbox
                            key={contract.id}
                            contract={contract}
                            checked={selectedContracts?.has(contract.id) || false}
                            onToggle={() => toggleContract(protocol.id, contract.id)}
                            isAllowed={isContractAllowed}
                          />
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            <div className="pt-4 border-subtle border-t">
              <Button
                onClick={handleSavePermissions}
                disabled={isPending || !hasChanges}
                className="w-full"
              >
                {isPending
                  ? 'Proposing to Safe...'
                  : hasChanges
                    ? `Propose Changes (${added} added, ${removed} removed)`
                    : 'No Changes'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface ContractCheckboxProps {
  contract: ProtocolContract
  checked: boolean
  onToggle: () => void
  isAllowed: boolean
}

function ContractCheckbox({ contract, checked, onToggle, isAllowed }: ContractCheckboxProps) {
  const isNewlySelected = checked && !isAllowed

  const getBgClass = () => {
    if (isNewlySelected) return 'bg-success-muted'
    if (isAllowed) return 'bg-info-muted'
    return 'bg-elevated-2'
  }

  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg transition-colors ${getBgClass()}`}>
      <Checkbox
        id={`contract-${contract.id}`}
        checked={checked}
        onChange={onToggle}
        label=""
      />
      <label
        htmlFor={`contract-${contract.id}`}
        className="flex-1 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm">{contract.name}</p>
          {isAllowed && <Badge variant="info">Allowed</Badge>}
          {isNewlySelected && <Badge variant="success">New</Badge>}
        </div>
        <p className="mt-0.5 text-muted-foreground text-xs">{contract.description}</p>
      </label>
    </div>
  )
}
