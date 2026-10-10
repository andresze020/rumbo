import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * HH-3 (PRV-2): the lock beside a private account's name, wherever one is
 * listed. Only its owner ever sees one — RLS hides everyone else's private
 * accounts outright — so it reads "only you can see this", not "someone's".
 *
 * Hook-free so server and client components can both use it. The default
 * label is English: server pages sit inside a `LocalizedClientBoundary`, which
 * translates `aria-label` and `title`; client components pass `label={ui(…)}`.
 */
export function PrivateAccountMarker({
  label = 'Private account: only you can see it',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <Lock
      role="img"
      aria-label={label}
      className={cn('inline size-3 shrink-0 text-muted-foreground', className)}
    >
      <title>{label}</title>
    </Lock>
  )
}
