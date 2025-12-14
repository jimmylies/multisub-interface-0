import { createContext, useContext, useReducer, useCallback, ReactNode } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  message: string
  duration: number // ms, 0 = persistent
  createdAt: number
}

interface ToastState {
  toasts: Toast[]
}

type ToastAction =
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

function toastReducer(state: ToastState, action: ToastAction): ToastState {
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
    success: (message: string) => string
    error: (message: string) => string
    warning: (message: string) => string
    info: (message: string) => string
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

  const addToast = useCallback((type: ToastType, message: string): string => {
    const id = generateId()
    const toast: Toast = {
      id,
      type,
      message,
      duration: DURATION_BY_TYPE[type],
      createdAt: Date.now(),
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
    success: (message: string) => addToast('success', message),
    error: (message: string) => addToast('error', message),
    warning: (message: string) => addToast('warning', message),
    info: (message: string) => addToast('info', message),
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
