import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PageHeaderProps = {
  /** Small muted line above the title — e.g. the household name. */
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Right-aligned controls (buttons, month picker, etc.). */
  actions?: ReactNode
  className?: string
}

/**
 * Consistent page heading used across every dashboard module so titles,
 * subtitles and primary actions line up the same way everywhere.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between',
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.6rem]">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex flex-wrap items-end gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
