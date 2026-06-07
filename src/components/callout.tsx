import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type CalloutVariant = 'info' | 'success' | 'warning' | 'error'

const variantClass: Record<CalloutVariant, string> = {
  info: 'border-border bg-muted/50 text-foreground',
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  warning:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
}

/**
 * Inline status banner used for form feedback, load errors and empty hints.
 * Keeps the previously-repeated banner markup consistent across pages.
 */
export function Callout({
  variant = 'info',
  children,
  className,
}: {
  variant?: CalloutVariant
  children: ReactNode
  className?: string
}) {
  return (
    <div
      role={variant === 'error' ? 'alert' : undefined}
      className={cn(
        'rounded-lg border px-4 py-3 text-sm',
        variantClass[variant],
        className
      )}
    >
      {children}
    </div>
  )
}
