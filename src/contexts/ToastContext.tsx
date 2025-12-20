import { createContext, useContext, useReducer, useCallback, ReactNode } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastActionButton {
  label: string
  onClick: () => void
}

export interface Toast {
  id: string
  type: ToastType
  message: string
  title?: string
  duration: number // ms, 0 = persistent
  createdAt: number
  action?: ToastActionButton
  txHash?: string // For View TX action
}

export interface ToastOptions {
  title?: string
  action?: ToastActionButton
  txHash?: string
  duration?: number
}

interface ToastState {
  toasts: Toast[]
}

type ToastReducerAction =
  | { type: 'ADD_TOAST'; payload: Toast }
  | { type: 'REMOVE_TOAST'; payload: string }
  | { type: 'CLEAR_ALL' }

const MAX_TOASTS = 5

const DURATION_BY_TYPE: Record<ToastType, number> = {
  success: 4000,
  error: 0, // persistent
  warning: 6000,
  info: 5000,
}

function toastReducer(state: ToastState, action: ToastReducerAction): ToastState {
  switch (action.type) {
    case 'ADD_TOAST': {
      const newToasts = [...state.toasts, action.payload]
      // Keep only the last MAX_TOASTS
      if (newToasts.length > MAX_TOASTS) {
        return { toasts: newToasts.slice(-MAX_TOASTS) }
      }
      return { toasts: newToasts }
    }
    case 'REMOVE_TOAST':
      return {
        toasts: state.toasts.filter((t) => t.id !== action.payload),
      }
    case 'CLEAR_ALL':
      return { toasts: [] }
    default:
      return state
  }
}

interface ToastContextValue {
  toasts: Toast[]
  toast: {
    success: (message: string, options?: ToastOptions) => string
    error: (message: string, options?: ToastOptions) => string
    warning: (message: string, options?: ToastOptions) => string
    info: (message: string, options?: ToastOptions) => string
    tx: (message: string, txHash: string) => string
  }
  dismiss: (id: string) => void
  dismissAll: () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

function generateId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(toastReducer, { toasts: [] })

  const addToast = useCallback((type: ToastType, message: string, options?: ToastOptions): string => {
    const id = generateId()
    const toast: Toast = {
      id,
      type,
      message,
      title: options?.title,
      duration: options?.duration ?? DURATION_BY_TYPE[type],
      createdAt: Date.now(),
      action: options?.action,
      txHash: options?.txHash,
    }
    dispatch({ type: 'ADD_TOAST', payload: toast })
    return id
  }, [])

  const dismiss = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_TOAST', payload: id })
  }, [])

  const dismissAll = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' })
  }, [])

  const toast = {
    success: (message: string, options?: ToastOptions) => addToast('success', message, options),
    error: (message: string, options?: ToastOptions) => addToast('error', message, options),
    warning: (message: string, options?: ToastOptions) => addToast('warning', message, options),
    info: (message: string, options?: ToastOptions) => addToast('info', message, options),
    // Special helper for transaction toasts
    tx: (message: string, txHash: string) => addToast('success', message, {
      title: 'Transaction Sent',
      txHash,
      duration: 8000,
    }),
  }

  return (
    <ToastContext.Provider value={{ toasts: state.toasts, toast, dismiss, dismissAll }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
