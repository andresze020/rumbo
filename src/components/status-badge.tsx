import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type StatusBadgeProps = {
  status: string
  className?: string
}

const statusStyles: Record<string, string> = {
  posted:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400',
  pending:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-400',
  voided:
    'border-destructive/30 bg-destructive/10 text-destructive',
  active:
    'border-primary/30 bg-primary/10 text-primary',
  inactive:
    'border-border text-muted-foreground',
}

function formatStatusLabel(status: string) {
  return status
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = statusStyles[status] ?? 'border-border text-muted-foreground'

  return (
    <Badge variant="outline" className={cn(style, className)}>
      {formatStatusLabel(status)}
    </Badge>
  )
}
