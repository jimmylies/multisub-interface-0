import { useEffect, useState, useCallback } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast, Toast, ToastType } from '@/contexts/ToastContext'

const toastVariants = cva(
  'relative flex items-start gap-3 w-80 p-4 rounded-xl border-l-[3px] shadow-lg backdrop-blur-sm animate-toast-in',
  {
    variants: {
      type: {
        success: 'bg-success-muted border-l-success',
        error: 'bg-error-muted border-l-error',
        warning: 'bg-warning-muted border-l-warning',
        info: 'bg-info-muted border-l-info',
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

const progressVariants = cva('absolute bottom-0 left-0 h-1 rounded-bl-xl', {
  variants: {
    type: {
      success: 'bg-success/40',
      error: 'bg-error/40',
      warning: 'bg-warning/40',
      info: 'bg-info/40',
    },
  },
})

const ICONS: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

interface ToastItemProps extends VariantProps<typeof toastVariants> {
  toast: Toast
  onDismiss: (id: string) => void
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [isExiting, setIsExiting] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [progress, setProgress] = useState(100)

  const handleDismiss = useCallback(() => {
    setIsExiting(true)
    setTimeout(() => {
      onDismiss(toast.id)
    }, 200) // Match animation duration
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
    <div
      className={cn(
        toastVariants({ type: toast.type }),
        isExiting && 'animate-toast-out'
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="alert"
    >
      <Icon className={iconVariants({ type: toast.type })} />
      <p className="flex-1 text-primary text-small pr-6">{toast.message}</p>
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded-md text-tertiary hover:text-primary hover:bg-white/10 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
      {toast.duration > 0 && (
        <div
          className={cn(progressVariants({ type: toast.type }))}
          style={{ width: `${progress}%`, transition: isPaused ? 'none' : 'width 50ms linear' }}
        />
      )}
    </div>
  )
}

export function ToastContainer() {
  const { toasts, dismiss } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-20 right-4 z-[100] flex flex-col gap-3">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  )
}
