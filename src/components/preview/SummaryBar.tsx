import { useMemo } from 'react'
import { motion } from 'framer-motion'
import type { TransactionPreviewData } from '@/types/transactionPreview'
import { countChanges } from '@/hooks/useTransactionPreview'

interface SummaryBarProps {
  data: TransactionPreviewData
}

export function SummaryBar({ data }: SummaryBarProps) {
  const { additions, removals } = useMemo(() => countChanges(data), [data])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.3 }}
      className="flex items-center justify-center gap-6 py-3 border-t border-subtle bg-elevated-2"
    >
      {additions > 0 && (
        <div className="flex items-center gap-2">
          <motion.div
            animate={{
              boxShadow: [
                '0 0 4px rgba(18, 255, 128, 0.4)',
                '0 0 8px rgba(18, 255, 128, 0.6)',
                '0 0 4px rgba(18, 255, 128, 0.4)',
              ],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="w-2 h-2 rounded-full bg-success"
          />
          <span className="text-small text-success font-medium">
            {additions} addition{additions !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {removals > 0 && (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-error" />
          <span className="text-small text-error font-medium">
            {removals} removal{removals !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {additions === 0 && removals === 0 && (
        <span className="text-small text-tertiary">No changes detected</span>
      )}
    </motion.div>
  )
}
