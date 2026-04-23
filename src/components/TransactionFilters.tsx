import { useState } from 'react'
import { Filter, Calendar, Coins, Activity, ChevronDown, X, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { type TransactionFilter, type OpType, OP_TYPES } from '@/hooks/useTransactionHistory'
import { cn } from '@/lib/utils'

interface TransactionFiltersProps {
  filter: TransactionFilter
  onFilterChange: (filter: TransactionFilter) => void
  availableTokens?: Array<{ address: string; symbol: string }>
  availableAgents?: Array<{ address: string; label: string }>
  className?: string
}

// Single-select dropdown
function FilterDropdown({
  label,
  value,
  options,
  onChange,
  icon: Icon,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  icon: typeof Filter
}) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedOption = options.find((opt) => opt.value === value)

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors',
          'bg-elevated border-subtle hover:border-default',
          isOpen && 'border-accent-primary'
        )}
      >
        <Icon className="w-4 h-4 text-tertiary" />
        <span className="text-sm text-secondary">{label}:</span>
        <span className="text-sm font-medium text-primary">{selectedOption?.label || value}</span>
        <ChevronDown
          className={cn('w-4 h-4 text-tertiary transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 min-w-[160px] py-1 bg-elevated border border-subtle rounded-lg shadow-lg z-20 animate-fade-in">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                className={cn(
                  'w-full px-3 py-2 text-left text-sm transition-colors',
                  'hover:bg-elevated-2',
                  option.value === value ? 'text-accent-primary font-medium' : 'text-primary'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Multi-select dropdown for tokens
function TokenMultiSelect({
  selected,
  options,
  onChange,
}: {
  selected: string[]
  options: Array<{ value: string; label: string }>
  onChange: (selected: string[]) => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  const toggle = (address: string) => {
    if (selected.includes(address)) {
      onChange(selected.filter((a) => a !== address))
    } else {
      onChange([...selected, address])
    }
  }

  const label =
    selected.length === 0
      ? 'All Tokens'
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0].slice(0, 6))
        : `${selected.length} tokens`

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors',
          'bg-elevated border-subtle hover:border-default',
          (isOpen || selected.length > 0) && 'border-accent-primary'
        )}
      >
        <Coins className="w-4 h-4 text-tertiary" />
        <span className="text-sm text-secondary">Token:</span>
        <span className="text-sm font-medium text-primary">{label}</span>
        <ChevronDown
          className={cn('w-4 h-4 text-tertiary transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 min-w-[160px] py-1 bg-elevated border border-subtle rounded-lg shadow-lg z-20 animate-fade-in">
            {options.map((option) => {
              const isSelected = selected.includes(option.value)
              return (
                <button
                  key={option.value}
                  onClick={() => toggle(option.value)}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm transition-colors flex items-center justify-between',
                    'hover:bg-elevated-2',
                    isSelected ? 'text-accent-primary font-medium' : 'text-primary'
                  )}
                >
                  {option.label}
                  {isSelected && <Check className="w-3 h-3 shrink-0" />}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export function TransactionFilters({
  filter,
  onFilterChange,
  availableTokens = [],
  availableAgents = [],
  className,
}: TransactionFiltersProps) {
  const typeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'protocol', label: 'Protocol' },
    { value: 'transfer', label: 'Transfers' },
  ]

  const opTypeOptions = [
    { value: 'all', label: 'All Operations' },
    ...Object.entries(OP_TYPES)
      .filter(([value]) => value !== '0')
      .map(([value, label]) => ({ value, label })),
  ]

  const dateRangeOptions = [
    { value: 'all', label: 'All Time' },
    { value: '24h', label: 'Last 24h' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
  ]

  const tokenOptions = availableTokens.map((token) => ({
    value: token.address,
    label: token.symbol,
  }))

  const agentOptions = [
    { value: 'all', label: 'All Agents' },
    ...availableAgents.map((agent) => ({
      value: agent.address,
      label: agent.label,
    })),
  ]

  const selectedTokens = filter.tokens ?? []

  const activeFilterCount = [
    filter.type !== 'all' && filter.type,
    filter.opType !== 'all' && filter.opType,
    filter.dateRange !== 'all' && filter.dateRange,
    selectedTokens.length > 0 && true,
    filter.agent !== 'all' && filter.agent,
  ].filter(Boolean).length

  const handleClearFilters = () => {
    onFilterChange({
      type: 'all',
      opType: 'all',
      dateRange: 'all',
      tokens: [],
      agent: 'all',
    })
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Filter header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-tertiary" />
          <span className="text-sm font-medium text-secondary">Filters</span>
          {activeFilterCount > 0 && (
            <Badge variant="accent" className="text-xs">
              {activeFilterCount} active
            </Badge>
          )}
        </div>

        {activeFilterCount > 0 && (
          <button
            onClick={handleClearFilters}
            className="flex items-center gap-1 text-sm text-tertiary hover:text-primary transition-colors"
          >
            <X className="w-3 h-3" />
            Clear all
          </button>
        )}
      </div>

      {/* Filter controls */}
      <div className="flex flex-wrap gap-3">
        <FilterDropdown
          label="Type"
          value={filter.type || 'all'}
          options={typeOptions}
          onChange={(value) =>
            onFilterChange({ ...filter, type: value as TransactionFilter['type'] })
          }
          icon={Activity}
        />

        {filter.type !== 'transfer' && (
          <FilterDropdown
            label="Operation"
            value={filter.opType?.toString() || 'all'}
            options={opTypeOptions}
            onChange={(value) =>
              onFilterChange({
                ...filter,
                opType: value === 'all' ? 'all' : (Number(value) as OpType),
              })
            }
            icon={Activity}
          />
        )}

        <FilterDropdown
          label="Period"
          value={filter.dateRange || 'all'}
          options={dateRangeOptions}
          onChange={(value) =>
            onFilterChange({ ...filter, dateRange: value as TransactionFilter['dateRange'] })
          }
          icon={Calendar}
        />

        {availableTokens.length > 0 && (
          <TokenMultiSelect
            selected={selectedTokens}
            options={tokenOptions}
            onChange={(tokens) => onFilterChange({ ...filter, tokens })}
          />
        )}

        {availableAgents.length > 0 && (
          <FilterDropdown
            label="Agent"
            value={filter.agent || 'all'}
            options={agentOptions}
            onChange={(value) => onFilterChange({ ...filter, agent: value })}
            icon={Filter}
          />
        )}
      </div>

      {/* Active filter badges */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filter.type && filter.type !== 'all' && (
            <Badge
              variant="outline"
              className="flex items-center gap-1 cursor-pointer hover:bg-elevated-2"
              onClick={() => onFilterChange({ ...filter, type: 'all' })}
            >
              {typeOptions.find((o) => o.value === filter.type)?.label}
              <X className="w-3 h-3" />
            </Badge>
          )}

          {filter.opType && filter.opType !== 'all' && (
            <Badge
              variant="outline"
              className="flex items-center gap-1 cursor-pointer hover:bg-elevated-2"
              onClick={() => onFilterChange({ ...filter, opType: 'all' })}
            >
              {OP_TYPES[filter.opType as OpType]}
              <X className="w-3 h-3" />
            </Badge>
          )}

          {filter.dateRange && filter.dateRange !== 'all' && (
            <Badge
              variant="outline"
              className="flex items-center gap-1 cursor-pointer hover:bg-elevated-2"
              onClick={() => onFilterChange({ ...filter, dateRange: 'all' })}
            >
              {dateRangeOptions.find((o) => o.value === filter.dateRange)?.label}
              <X className="w-3 h-3" />
            </Badge>
          )}

          {selectedTokens.map((address) => (
            <Badge
              key={address}
              variant="outline"
              className="flex items-center gap-1 cursor-pointer hover:bg-elevated-2"
              onClick={() =>
                onFilterChange({ ...filter, tokens: selectedTokens.filter((a) => a !== address) })
              }
            >
              {availableTokens.find((t) => t.address === address)?.symbol || address.slice(0, 6)}
              <X className="w-3 h-3" />
            </Badge>
          ))}

          {filter.agent && filter.agent !== 'all' && (
            <Badge
              variant="outline"
              className="flex items-center gap-1 cursor-pointer hover:bg-elevated-2"
              onClick={() => onFilterChange({ ...filter, agent: 'all' })}
            >
              {availableAgents.find((agent) => agent.address === filter.agent)?.label || 'Agent'}
              <X className="w-3 h-3" />
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}
