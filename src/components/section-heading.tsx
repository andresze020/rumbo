import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type SectionHeadingProps = {
  title: ReactNode
  description?: ReactNode
  /** Right-aligned action, e.g. a "View all" link or secondary button. */
  action?: ReactNode
  className?: string
}

/**
 * Lightweight heading for grouping sections within a page (used above lists
 * and grids that don't sit inside a Card).
 */
export function SectionHeading({
  title,
  description,
  action,
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-2',
        className
      )}
    >
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
