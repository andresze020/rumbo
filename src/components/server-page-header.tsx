import type { ReactNode } from 'react'
import { getLocale } from '@/lib/i18n/server'
import { createUiTranslator } from '@/lib/i18n/ui'
import { cn } from '@/lib/utils'

type ServerPageHeaderProps = {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

/** Server-rendered page header so localized copy is correct on first paint. */
export async function ServerPageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: ServerPageHeaderProps) {
  const ui = createUiTranslator(await getLocale())
  const localizedTitle = typeof title === 'string' ? ui(title) : title
  const localizedDescription =
    typeof description === 'string' ? ui(description) : description

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
          {localizedTitle}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{localizedDescription}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-end gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
