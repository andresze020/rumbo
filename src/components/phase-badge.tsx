import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Phase } from '@/lib/nav/config'

const PHASE_CLASS: Record<Exclude<Phase, 'alpha'>, string> = {
  beta: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  soon: 'border-border bg-muted text-muted-foreground',
  pro: 'border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300',
}

type PhaseBadgeProps = {
  phase: Phase
  label: string
  className?: string
}

/**
 * Small uppercase badge for non-alpha nav items. Renders nothing for
 * `alpha` since those features ship without a phase label.
 */
export function PhaseBadge({ phase, label, className }: PhaseBadgeProps) {
  if (phase === 'alpha') return null

  return (
    <Badge
      variant="outline"
      className={cn(
        'px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide',
        PHASE_CLASS[phase],
        className
      )}
    >
      {label}
    </Badge>
  )
}
