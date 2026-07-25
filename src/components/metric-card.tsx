import { type ReactNode } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { getLocale } from '@/lib/i18n/server'
import { createUiTranslator } from '@/lib/i18n/ui'

type MetricCardProps = {
  label: string
  value: ReactNode
  description?: string
  delta?: ReactNode
  /** Optional glyph shown in a tinted tile next to the label. */
  icon?: ReactNode
  /** Tailwind classes for the icon tile (bg + text). */
  accent?: string
  /** Color treatment for the value text. */
  valueClassName?: string
  /** Optional inline help icon (e.g. <InfoTooltip />) shown next to the label. */
  tooltip?: ReactNode
}

/**
 * Compact KPI stat tile: label + headline value + optional delta/description.
 * Detailed month-over-month trends live on the dedicated Trends screen
 * (/dashboard/trends), which has room for full-width, interactive charts —
 * the tile stays a clean at-a-glance figure.
 */
export async function MetricCard({
  label,
  value,
  description,
  delta,
  icon,
  accent = 'bg-primary/10 text-primary',
  valueClassName,
  tooltip,
}: MetricCardProps) {
  const ui = createUiTranslator(await getLocale())
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4',
                accent
              )}
              aria-hidden="true"
            >
              {icon}
            </span>
          ) : null}
          <CardTitle className="flex min-w-0 items-center gap-1 text-sm font-medium leading-snug text-muted-foreground">
            <span className="min-w-0">{ui(label)}</span>
            {tooltip}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className={cn('text-2xl font-semibold tracking-tight tabular-nums', valueClassName)}>
          {value}
        </p>
        {delta ? <div className="mt-1.5">{delta}</div> : null}
        {description ? (
          <p className="mt-1.5 text-xs text-muted-foreground">{ui(description)}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
