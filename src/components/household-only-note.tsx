import { Users } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * HH-3 (SCP-4): where the Household / Mine / Everything switch is absent —
 * budgets, rollover, the month-close snapshot — say on screen that the numbers
 * are the household's, whatever the switch elsewhere is set to.
 *
 * Rendered only for a user who owns a private account (the only one who has a
 * switch to miss); everyone else sees the screen as before (SCP-6). The text
 * is plain English: both host pages sit inside a `LocalizedClientBoundary`.
 */
export function HouseholdOnlyNote({ children, className }: { children: string; className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 text-xs text-muted-foreground', className)}>
      <Users className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-semibold text-foreground">Household only</span>
        <span aria-hidden="true"> · </span>
        {children}
      </span>
    </p>
  )
}
