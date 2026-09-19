'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { useLanguage } from '@/components/language-provider'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'
import { localeToBcp47 } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Placeholder the server leaves in `monthHrefTemplate` where the chosen
 * `YYYY-MM` goes. The href is built server-side (it has to carry every other
 * applied filter) and only the month is filled in here.
 */
export const MONTH_TOKEN = '__month__'

/**
 * Which of the three things the applied period is. `custom` is a real state,
 * not the absence of a month: an explicit range like "Last 3 months" leaves
 * every tile here unselected, and reading it as "not a month, therefore all
 * time" lit up the All time button for it.
 */
export type PeriodMode = 'month' | 'all-time' | 'custom'

type PeriodSelectorProps = {
  /** What the button reads, already localized: "September 2026", "All time"… */
  label: string
  /** The same, abbreviated ("Sep 2026"). A 320px screen has no room for the
      full month name beside the title, and a truncated "September 20…" is
      worse than a short one. */
  shortLabel: string
  /** The applied month, `YYYY-MM`. Also seeds the year the grid opens on. */
  month: string
  mode: PeriodMode
  monthHrefTemplate: string
  allTimeHref: string
}

export function PeriodSelector({
  label,
  shortLabel,
  month,
  mode,
  monthHrefTemplate,
  allTimeHref,
}: PeriodSelectorProps) {
  const ui = useUiTranslation()
  const { locale } = useLanguage()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => Number(month.slice(0, 4)))

  // Navigation is client-side, so this component survives it: re-seed the year
  // grid from whatever the server actually applied, or stepping to 2025 and
  // then picking a month from the *list* would leave the sheet on 2025.
  // Adjusted during render rather than in an effect.
  const [syncedMonth, setSyncedMonth] = useState(month)
  if (month !== syncedMonth) {
    setSyncedMonth(month)
    setYear(Number(month.slice(0, 4)))
  }

  const monthNames = useMemo(() => {
    const format = new Intl.DateTimeFormat(localeToBcp47(locale), {
      month: 'short',
      timeZone: 'UTC',
    })
    return Array.from({ length: 12 }, (_, index) =>
      format.format(new Date(Date.UTC(2020, index, 1)))
    )
  }, [locale])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          // 32px tall to keep the title row short; the pseudo-element takes the
          // tap target back out to 44px.
          'relative inline-flex h-8 min-w-0 shrink items-center gap-1.5 rounded-full border bg-card px-2.5 text-sm font-medium text-foreground shadow-sm shadow-black/[0.03] transition-colors',
          "before:absolute before:inset-x-0 before:-top-1.5 before:-bottom-1.5 before:content-['']",
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60'
        )}
      >
        <CalendarDays
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="truncate sm:hidden">{shortLabel}</span>
        <span className="hidden truncate sm:inline">{label}</span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="pb-[max(1rem,env(safe-area-inset-bottom))]">
          <DrawerHeader className="pb-2">
            <DrawerTitle>{ui('Period')}</DrawerTitle>
            <DrawerDescription>
              {ui('Pick the month you want to look at.')}
            </DrawerDescription>
          </DrawerHeader>

          <div className="mx-auto w-full max-w-md px-4 pb-4">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setYear((current) => current - 1)}
                aria-label={ui('Previous year')}
                className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </button>
              <span
                aria-live="polite"
                className="text-base font-semibold tabular-nums"
              >
                {year}
              </span>
              <button
                type="button"
                onClick={() => setYear((current) => current + 1)}
                aria-label={ui('Next year')}
                className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <ChevronRight className="size-5" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {monthNames.map((name, index) => {
                const value = `${year}-${String(index + 1).padStart(2, '0')}`
                const isCurrent = mode === 'month' && value === month
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => go(monthHrefTemplate.replace(MONTH_TOKEN, value))}
                    aria-pressed={isCurrent}
                    className={cn(
                      'h-11 rounded-xl border text-sm font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                      isCurrent
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'bg-background hover:bg-muted'
                    )}
                  >
                    {name}
                  </button>
                )
              })}
            </div>

            {/* The one non-month period this screen understands. Anything finer
                is a custom range, which lives with the other filters. */}
            <button
              type="button"
              onClick={() => go(allTimeHref)}
              aria-pressed={mode === 'all-time'}
              className={cn(
                'mt-2 h-11 w-full rounded-xl border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                mode === 'all-time'
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'bg-background hover:bg-muted'
              )}
            >
              {ui('All time')}
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
