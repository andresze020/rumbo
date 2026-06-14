import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'

type MoneyTone = 'neutral' | 'auto' | 'positive' | 'negative' | 'muted'

type MoneyProps = {
  value: number | string
  currency: string
  /**
   * Color treatment:
   * - `neutral` (default): inherits text color.
   * - `auto`: negative amounts turn red, everything else inherits.
   * - `positive` / `negative`: force semantic color.
   * - `muted`: secondary/foreground-muted.
   */
  tone?: MoneyTone
  /** Show an explicit "+" in front of positive values (for deltas). */
  signed?: boolean
  className?: string
}

const toneClass: Record<Exclude<MoneyTone, 'auto' | 'neutral'>, string> = {
  positive: 'text-emerald-600 dark:text-emerald-400',
  negative: 'text-red-600 dark:text-red-400',
  muted: 'text-muted-foreground',
}

/**
 * Renders a currency amount with consistent tabular alignment and optional
 * sign-aware coloring. Presentation only — never mutates the value.
 */
export function Money({
  value,
  currency,
  tone = 'neutral',
  signed = false,
  className,
}: MoneyProps) {
  const numeric = Number(value)
  let resolved: string | undefined

  if (tone === 'auto') {
    resolved = numeric < 0 ? toneClass.negative : undefined
  } else if (tone !== 'neutral') {
    resolved = toneClass[tone]
  }

  const formatted = formatCurrency(numeric, currency)
  const display = signed && numeric > 0 ? `+${formatted}` : formatted

  return (
    <span className={cn('tabular-nums', resolved, className)}>{display}</span>
  )
}
