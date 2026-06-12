import { cn } from '@/lib/utils'

type BalanceAmountProps = {
  /** Pre-formatted currency string, already signed (e.g. "−US$10.00"). */
  label: string
  /** Signed numeric value — drives the color: positive = green, negative = red, zero = neutral. */
  amount: number
  className?: string
}

/**
 * Renders an account balance with crisp green (positive) / red (negative)
 * coloring that stays distinguishable in both light and dark themes. The leading
 * minus sign in the label is a redundant non-color cue for color-blind users
 * (see [[feedback-user-colorblind]]). Display only — never mutates the value.
 */
export function BalanceAmount({ label, amount, className }: BalanceAmountProps) {
  const tone =
    amount < 0
      ? 'text-red-600 dark:text-red-400'
      : amount > 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : undefined

  return (
    <span className={cn('tabular-nums font-semibold', tone, className)}>
      {label}
    </span>
  )
}
