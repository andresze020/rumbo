'use client'

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { pushToast, type QueuedToast } from '@/lib/toast-queue'
import { cn } from '@/lib/utils'

const TOAST_DURATION_MS = 5000

type ToastAction = {
  label: string
  onClick: () => void
}

type ToastInput = {
  message: string
  action?: ToastAction
}

type ToastItem = QueuedToast<ToastAction>

type ToastContextValue = {
  toast: (input: ToastInput) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    (input: ToastInput) => {
      const id = Date.now() + Math.random()
      // A repeat of a message already showing replaces it under the new id, so
      // the earlier timer finds nothing to dismiss and this one restarts the
      // five seconds (see `pushToast`).
      setToasts((current) => pushToast(current, input, id))
      setTimeout(() => dismiss(id), TOAST_DURATION_MS)
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="vv-pin-bottom pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end">
        {toasts.map((item) => (
          <div
            key={item.id}
            role="status"
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm shadow-sm shadow-black/[0.03] ring-1 ring-foreground/10',
              'animate-in slide-in-from-bottom-2 fade-in-0 duration-150'
            )}
          >
            <span className="text-card-foreground">
              {item.message}
              {item.count > 1 ? (
                <span className="ml-1.5 tabular-nums text-muted-foreground">×{item.count}</span>
              ) : null}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              {item.action ? (
                <button
                  type="button"
                  onClick={() => {
                    item.action?.onClick()
                    dismiss(item.id)
                  }}
                  className="font-medium text-primary hover:underline"
                >
                  {item.action.label}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss"
                className="text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
