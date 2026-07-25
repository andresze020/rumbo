'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'

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
  const ui = useUiTranslation()
  const localizedTitle = typeof title === 'string' ? ui(title) : title
  const localizedDescription =
    typeof description === 'string' ? ui(description) : description
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-2',
        className
      )}
    >
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {localizedTitle}
        </h2>
        {description ? (
          <p className="text-xs text-muted-foreground">{localizedDescription}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
