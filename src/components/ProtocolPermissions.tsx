import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { DEFI_INTERACTOR_ABI } from '@/lib/contracts'
import { PROTOCOLS, Protocol, ProtocolContract } from '@/lib/protocols'
import { useContractAddresses } from '@/contexts/ContractAddressContext'
import { useSafeProposal, encodeContractCall } from '@/hooks/useSafeProposal'
import { useAllowedAddresses } from '@/hooks/useSafe'
import { TRANSACTION_TYPES } from '@/lib/transactionTypes'
import { useToast } from '@/contexts/ToastContext'

interface ProtocolPermissionsProps {
  subAccountAddress: `0x${string}`
}

export function ProtocolPermissions({ subAccountAddress }: ProtocolPermissionsProps) {
  const { addresses } = useContractAddresses()
  const [selectedProtocols, setSelectedProtocols] = useState<Map<string, Set<string>>>(new Map())
  const [expandedProtocol, setExpandedProtocol] = useState<string | null>(null)
  const { toast } = useToast()

  const { proposeTransaction, isPending } = useSafeProposal()

  const addressesToCheck = useMemo(() => {
    const allAddresses: `0x${string}`[] = []
    PROTOCOLS.forEach(protocol => {
      protocol.contracts.forEach(contract => {
        allAddresses.push(contract.address)
      })
    })
    return allAddresses
  }, [])

  // Fetch already allowed addresses from contract
  const { data: allowedAddresses = new Set(), isLoading: isLoadingAllowed } = useAllowedAddresses(
    subAccountAddress,
    addressesToCheck
  )

  useEffect(() => {
    if (allowedAddresses.size === 0) return

    const newMap = new Map<string, Set<string>>()

    PROTOCOLS.forEach(protocol => {
      const selectedContracts = new Set<string>()

      // Check which contracts are allowed
      protocol.contracts.forEach(contract => {
        if (allowedAddresses.has(contract.address)) {
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
            selectedAddresses.add(contract.address)
          }
        })
      }
    })

    // Comparer avec les adresses actuellement autorisées
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
    const current = selectedProtocols.get(protocolId)
    if (current && current.size > 0) {
      // Deselect protocol and all contracts
      const newMap = new Map(selectedProtocols)
      newMap.delete(protocolId)
      setSelectedProtocols(newMap)
    } else {
      // Expand to show contracts
      setExpandedProtocol(expandedProtocol === protocolId ? null : protocolId)
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
        if (contractIds.has(c.id)) selectedAddressSet.add(c.address)
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
    // Collect all selected contract addresses
    const selectedAddresses: `0x${string}`[] = []

    selectedProtocols.forEach((contractIds, protocolId) => {
      const protocol = PROTOCOLS.find(p => p.id === protocolId)
      if (protocol) {
        // Add selected contract addresses
        contractIds.forEach(contractId => {
          const contract = protocol.contracts.find(c => c.id === contractId)
          if (contract) {
            selectedAddresses.push(contract.address)
          }
        })
      }
    })

    if (selectedAddresses.length === 0) {
      toast.warning('Select at least one protocol')
      return
    }

    if (!addresses.defiInteractor) {
      toast.warning('Contract not configured')
      return
    }

    try {
      const data = encodeContractCall(
        addresses.defiInteractor,
        DEFI_INTERACTOR_ABI as unknown as any[],
        'setAllowedAddresses',
        [subAccountAddress, selectedAddresses, true]
      )

      const result = await proposeTransaction(
        { to: addresses.defiInteractor, data },
        { transactionType: TRANSACTION_TYPES.SET_ALLOWED_ADDRESSES }
      )

      if (result.success) {
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
  }

  return (
    <Card>
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
              const selectedContracts = selectedProtocols.get(protocol.id)
              const hasSelectedContracts = selectedContracts && selectedContracts.size > 0
              const isExpanded = expandedProtocol === protocol.id

              // Check if any contract in protocol is currently allowed
              const isProtocolAllowed = protocol.contracts.some(c =>
                allowedAddresses.has(c.address)
              )

              // Check if there are newly selected contracts (not yet allowed)
              const hasNewSelections =
                hasSelectedContracts &&
                protocol.contracts.some(
                  c => selectedContracts.has(c.id) && !allowedAddresses.has(c.address)
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
                      {isExpanded && (
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
                      )}
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
                    <div className="space-y-2 mt-3 ml-6 pl-3 border-muted border-l">
                      {protocol.contracts.map(contract => {
                        const isContractAllowed = allowedAddresses.has(contract.address)
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
                disabled={isPending || selectedProtocols.size === 0 || !hasChanges}
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
