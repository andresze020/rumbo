import { cn } from '@/lib/utils'

type TagChipProps = {
  name: string
  color?: string | null
  className?: string
  /** Compact variant for dense rows (e.g. the transaction list). */
  size?: 'sm' | 'md'
}

/**
 * A small pill for a tag: a colored dot (neutral when the tag has no color)
 * plus its name. Purely presentational — used everywhere a tag is shown so the
 * look stays consistent across the tags page, transaction list, and pickers.
 */
export function TagChip({ name, color, className, size = 'md' }: TagChipProps) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/40 font-medium text-foreground',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn('shrink-0 rounded-full', size === 'sm' ? 'size-1.5' : 'size-2')}
        style={{ backgroundColor: color ?? 'var(--muted-foreground)' }}
      />
      <span className="truncate">{name}</span>
    </span>
  )
}
