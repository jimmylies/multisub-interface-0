import { useEffect, useState, useCallback } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, AlertTriangle, Info, X, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast, Toast, ToastType } from '@/contexts/ToastContext'
import { useChainId } from 'wagmi'

const toastVariants = cva(
  'relative flex items-start gap-3 w-80 p-4 rounded-xl border shadow-lg backdrop-blur-sm overflow-hidden',
  {
    variants: {
      type: {
        success: 'bg-success-muted/90 border-success/20',
        error: 'bg-error-muted/90 border-error/20',
        warning: 'bg-warning-muted/90 border-warning/20',
        info: 'bg-info-muted/90 border-info/20',
      },
    },
    defaultVariants: {
      type: 'info',
    },
  }
)

const iconVariants = cva('w-5 h-5 flex-shrink-0 mt-0.5', {
  variants: {
    type: {
      success: 'text-success',
      error: 'text-error',
      warning: 'text-warning',
      info: 'text-info',
    },
  },
})

const progressVariants = cva('absolute bottom-0 left-0 h-0.5', {
  variants: {
    type: {
      success: 'bg-success/60',
      error: 'bg-error/60',
      warning: 'bg-warning/60',
      info: 'bg-info/60',
    },
  },
})

const ICONS: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

// Etherscan URL helper
function getExplorerUrl(chainId: number, txHash: string): string {
  const explorers: Record<number, string> = {
    1: 'https://etherscan.io',
    11155111: 'https://sepolia.etherscan.io',
    137: 'https://polygonscan.com',
    42161: 'https://arbiscan.io',
    10: 'https://optimistic.etherscan.io',
    8453: 'https://basescan.org',
  }
  const baseUrl = explorers[chainId] || 'https://etherscan.io'
  return `${baseUrl}/tx/${txHash}`
}

interface ToastItemProps extends VariantProps<typeof toastVariants> {
  toast: Toast
  onDismiss: (id: string) => void
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [isPaused, setIsPaused] = useState(false)
  const [progress, setProgress] = useState(100)
  const chainId = useChainId()

  const handleDismiss = useCallback(() => {
    onDismiss(toast.id)
  }, [onDismiss, toast.id])

  useEffect(() => {
    if (toast.duration === 0 || isPaused) return

    const startTime = Date.now()
    const endTime = startTime + toast.duration

    const updateProgress = () => {
      const now = Date.now()
      const remaining = Math.max(0, endTime - now)
      const percent = (remaining / toast.duration) * 100
      setProgress(percent)

      if (remaining <= 0) {
        handleDismiss()
      }
    }

    const interval = setInterval(updateProgress, 50)
    return () => clearInterval(interval)
  }, [toast.duration, toast.id, isPaused, handleDismiss])

  const Icon = ICONS[toast.type]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 50, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={cn(toastVariants({ type: toast.type }))}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="alert"
    >
      {/* Icon with animation */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 20 }}
      >
        <Icon className={iconVariants({ type: toast.type })} />
      </motion.div>

      {/* Content */}
      <div className="flex-1 min-w-0 pr-6">
        {toast.title && (
          <p className="text-primary font-medium text-sm mb-0.5">{toast.title}</p>
        )}
        <p className="text-primary/90 text-small break-words">{toast.message}</p>

        {/* Actions */}
        {(toast.action || toast.txHash) && (
          <div className="flex items-center gap-2 mt-2">
            {toast.txHash && (
              <a
                href={getExplorerUrl(chainId, toast.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary/80 hover:text-primary transition-colors"
              >
                View TX
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {toast.action && (
              <button
                onClick={() => {
                  toast.action?.onClick()
                  handleDismiss()
                }}
                className="text-xs font-medium text-primary/80 hover:text-primary transition-colors"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded-md text-tertiary hover:text-primary hover:bg-white/10 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Progress bar */}
      {toast.duration > 0 && (
        <motion.div
          className={cn(progressVariants({ type: toast.type }))}
          initial={{ width: '100%' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.05, ease: 'linear' }}
        />
      )}
    </motion.div>
  )
}

export function ToastContainer() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="fixed top-20 right-4 z-[100] flex flex-col gap-3">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </AnimatePresence>
    </div>
  )
}
