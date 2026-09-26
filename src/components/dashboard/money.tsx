import { localeToBcp47 } from '@/lib/format'
import type { Locale } from '@/lib/i18n/dictionaries'
import { cn } from '@/lib/utils'

/**
 * A currency amount with its cents set back: "$45,673" at full weight, ".18"
 * smaller and muted. Same string as formatCurrency (same locale default), so
 * it reads identically to a screen reader and in a copy-paste.
 */
export function Money({
  value,
  currency,
  locale = 'en',
  className,
  fractionClassName,
}: {
  value: number
  currency: string
  locale?: Locale
  className?: string
  fractionClassName?: string
}) {
  const parts = new Intl.NumberFormat(localeToBcp47(locale), { style: 'currency', currency }).formatToParts(value)
  const splitAt = parts.findIndex((p) => p.type === 'decimal')
  const whole = (splitAt === -1 ? parts : parts.slice(0, splitAt)).map((p) => p.value).join('')
  const fraction = splitAt === -1 ? '' : parts.slice(splitAt).map((p) => p.value).join('')

  return (
    <span className={cn('tabular-nums', className)}>
      {whole}
      {fraction ? <span className={cn('text-[0.62em] font-medium text-muted-foreground', fractionClassName)}>{fraction}</span> : null}
    </span>
  )
}
