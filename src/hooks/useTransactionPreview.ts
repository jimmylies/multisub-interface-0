import { useState, useCallback } from 'react'
import type { TransactionPreviewData } from '@/types/transactionPreview'

interface UseTransactionPreviewReturn {
  isPreviewOpen: boolean
  previewData: TransactionPreviewData | null
  isPending: boolean
  showPreview: (data: TransactionPreviewData, onConfirm: () => Promise<void>) => void
  handleConfirm: () => Promise<void>
  handleCancel: () => void
}

export function useTransactionPreview(): UseTransactionPreviewReturn {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewData, setPreviewData] = useState<TransactionPreviewData | null>(null)
  const [pendingCallback, setPendingCallback] = useState<(() => Promise<void>) | null>(null)
  const [isPending, setIsPending] = useState(false)

  const showPreview = useCallback(
    (data: TransactionPreviewData, onConfirm: () => Promise<void>) => {
      setPreviewData(data)
      setPendingCallback(() => onConfirm)
      setIsPreviewOpen(true)
    },
    []
  )

  const handleConfirm = useCallback(async () => {
    if (!pendingCallback) return

    setIsPending(true)
    try {
      await pendingCallback()
      // Only close modal on success
      setIsPreviewOpen(false)
      setPreviewData(null)
      setPendingCallback(null)
    } catch (error) {
      // Re-throw error so caller can handle it (e.g., show toast)
      // Keep modal open so user can retry
      throw error
    } finally {
      setIsPending(false)
    }
  }, [pendingCallback])

  const handleCancel = useCallback(() => {
    setIsPreviewOpen(false)
    setPreviewData(null)
    setPendingCallback(null)
  }, [])

  return {
    isPreviewOpen,
    previewData,
    isPending,
    showPreview,
    handleConfirm,
    handleCancel,
  }
}

// Helper to count changes in preview data
export function countChanges(data: TransactionPreviewData): {
  additions: number
  removals: number
  unchanged: number
} {
  let additions = 0
  let removals = 0
  let unchanged = 0

  // Count role changes
  data.roles?.forEach(role => {
    if (role.action === 'add') additions++
    else if (role.action === 'remove') removals++
    else unchanged++
  })

  // Count spending limit changes
  if (data.spendingLimits) {
    if (!data.spendingLimits.before) {
      additions++ // New limit
    } else {
      // Check if values changed
      const before = data.spendingLimits.before
      const after = data.spendingLimits.after
      if (
        before.maxSpendingBps !== after.maxSpendingBps ||
        before.windowDuration !== after.windowDuration
      ) {
        additions++ // Treat updates as additions for visual purposes
      } else {
        unchanged++
      }
    }
  }

  // Count protocol contract changes
  data.protocols?.forEach(protocol => {
    protocol.contracts.forEach(contract => {
      if (contract.action === 'add') additions++
      else if (contract.action === 'remove') removals++
      else unchanged++
    })
  })

  return { additions, removals, unchanged }
}
