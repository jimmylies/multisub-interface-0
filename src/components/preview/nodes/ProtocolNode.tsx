import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Plus, Minus, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProtocolChange, ChangeAction } from '@/types/transactionPreview'

interface ProtocolNodeProps {
  protocol: ProtocolChange
  delay?: number
  forceAction?: ChangeAction
}

function getProtocolIcon(protocolId: string): string {
  switch (protocolId) {
    case 'uniswap':
      return '🦄'
    case 'aave':
      return '👻'
    case 'morpho':
      return '🦋'
    case 'merkl':
      return '🌳'
    default:
      return '📦'
  }
}

function getActionIcon(action: ChangeAction) {
  switch (action) {
    case 'add':
      return Plus
    case 'remove':
      return Minus
    default:
      return Check
  }
}

function getActionColor(action: ChangeAction) {
  switch (action) {
    case 'add':
      return 'text-success'
    case 'remove':
      return 'text-error'
    default:
      return 'text-tertiary'
  }
}

export function ProtocolNode({ protocol, delay = 0, forceAction }: ProtocolNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const additions = protocol.contracts.filter(c => c.action === 'add').length
  const removals = protocol.contracts.filter(c => c.action === 'remove').length
  const hasChanges = additions > 0 || removals > 0

  // Determine dominant action for styling
  const dominantAction: ChangeAction =
    forceAction ?? (additions > removals ? 'add' : removals > 0 ? 'remove' : 'unchanged')

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: hasChanges || forceAction ? 1 : 0.7 }}
      transition={{ delay, duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      className="relative w-full"
    >
      {/* Node button */}
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        animate={
          dominantAction === 'add'
            ? {
                boxShadow: [
                  '0 0 8px rgba(18, 255, 128, 0.25)',
                  '0 0 16px rgba(18, 255, 128, 0.4)',
                  '0 0 8px rgba(18, 255, 128, 0.25)',
                ],
              }
            : dominantAction === 'remove'
              ? { x: [0, -1, 1, -1, 0] }
              : undefined
        }
        transition={
          dominantAction === 'add'
            ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
            : dominantAction === 'remove'
              ? { duration: 0.4, repeat: Infinity, repeatDelay: 2 }
              : undefined
        }
        className={cn(
          'relative z-20 w-full flex items-center gap-2 p-2 rounded-lg border-2 transition-colors',
          dominantAction === 'add'
            ? 'border-success/40 bg-elevated-2 hover:bg-elevated-3'
            : dominantAction === 'remove'
              ? 'border-error/40 bg-elevated-2 hover:bg-elevated-3'
              : 'border-subtle/50 bg-elevated-2 hover:bg-elevated-3'
        )}
      >
        {/* Protocol icon */}
        <span className="text-base flex-shrink-0">{getProtocolIcon(protocol.protocolId)}</span>

        {/* Protocol info */}
        <div className="flex-1 min-w-0 text-left">
          <span
            className={cn(
              'text-caption font-medium block truncate',
              dominantAction === 'add'
                ? 'text-success'
                : dominantAction === 'remove'
                  ? 'text-error'
                  : 'text-secondary'
            )}
          >
            {protocol.protocolName}
          </span>

          {/* Change summary */}
          {hasChanges && (
            <div className="flex items-center gap-1.5">
              {additions > 0 && <span className="text-caption text-success font-medium">+{additions}</span>}
              {removals > 0 && <span className="text-caption text-error font-medium">-{removals}</span>}
            </div>
          )}
        </div>

        {/* Expand indicator */}
        <ChevronDown
          className={cn('w-3.5 h-3.5 transition-transform text-tertiary flex-shrink-0', isExpanded && 'rotate-180')}
        />
      </motion.button>

      {/* Expanded contracts list */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 bg-elevated border border-subtle rounded-lg overflow-hidden">
              <div className="p-1 max-h-[120px] overflow-y-auto">
                {protocol.contracts.filter(c => c.action !== 'unchanged').map((contract, idx) => {
                  const ActionIcon = getActionIcon(contract.action)
                  return (
                    <motion.div
                      key={contract.contractId}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className={cn(
                        'flex items-center gap-1.5 px-2 py-1 rounded',
                        contract.action === 'add'
                          ? 'bg-success-muted/40'
                          : contract.action === 'remove'
                            ? 'bg-error-muted/40'
                            : ''
                      )}
                    >
                      <ActionIcon className={cn('w-3 h-3 flex-shrink-0', getActionColor(contract.action))} />
                      <span
                        className={cn(
                          'text-caption truncate',
                          contract.action === 'unchanged' ? 'text-tertiary' : 'text-primary'
                        )}
                      >
                        {contract.contractName}
                      </span>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
