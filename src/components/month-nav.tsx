'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { formatMonthLabel, localeToBcp47 } from '@/lib/format'
import { useLanguage } from '@/components/language-provider'
import { cn } from '@/lib/utils'
import type { Locale } from '@/lib/i18n/dictionaries'

type MonthNavProps = {
  /** Currently selected month, formatted as `YYYY-MM`. */
  month: string
  /** Base path for the page, e.g. `/dashboard`. */
  basePath: string
  /** Other query params to preserve when navigating between months. */
  searchParams?: Record<string, string>
  /** Translated aria-label for the "previous month" control. */
  previousLabel: string
  /** Translated aria-label for the "next month" control. */
  nextLabel: string
}

function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1))
  const shiftedYear = shifted.getUTCFullYear()
  const shiftedMonth = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  return `${shiftedYear}-${shiftedMonth}`
}

function buildHref(basePath: string, month: string, searchParams?: Record<string, string>) {
  const params = new URLSearchParams(searchParams)
  params.set('month', month)
  return `${basePath}?${params.toString()}`
}

/** "Jan", "Feb", … in the reader's language — for the picker's month grid, not a full date. */
function monthShortName(monthIndex: number, locale: Locale): string {
  return new Intl.DateTimeFormat(localeToBcp47(locale), { month: 'short' }).format(new Date(2020, monthIndex, 1))
}

export function MonthNav({
  month,
  basePath,
  searchParams,
  previousLabel,
  nextLabel,
}: MonthNavProps) {
  const { locale, t } = useLanguage()
  const previousMonth = shiftMonth(month, -1)
  const nextMonth = shiftMonth(month, 1)
  const [open, setOpen] = useState(false)
  const [year, selectedMonthNumber] = month.split('-').map(Number)
  const [pickerYear, setPickerYear] = useState(year)

  return (
    <div className="flex items-center gap-2">
      <Link
        href={buildHref(basePath, previousMonth, searchParams)}
        aria-label={previousLabel}
        className={buttonVariants({ variant: 'outline', size: 'icon' })}
      >
        <ChevronLeft />
      </Link>
      <button
        type="button"
        onClick={() => {
          setPickerYear(year)
          setOpen(true)
        }}
        className="min-w-[8rem] rounded-md px-2 py-1 text-center text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {formatMonthLabel(month, locale)}
      </button>
      <Link
        href={buildHref(basePath, nextMonth, searchParams)}
        aria-label={nextLabel}
        className={buttonVariants({ variant: 'outline', size: 'icon' })}
      >
        <ChevronRight />
      </Link>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{t('common.selectMonth')}</DrawerTitle>
            <div className="flex items-center justify-center gap-4 pt-1">
              <button
                type="button"
                onClick={() => setPickerYear((y) => y - 1)}
                aria-label={t('common.previousYear')}
                className={buttonVariants({ variant: 'outline', size: 'icon' })}
              >
                <ChevronLeft />
              </button>
              <span className="min-w-12 text-center text-base font-semibold tabular-nums">{pickerYear}</span>
              <button
                type="button"
                onClick={() => setPickerYear((y) => y + 1)}
                aria-label={t('common.nextYear')}
                className={buttonVariants({ variant: 'outline', size: 'icon' })}
              >
                <ChevronRight />
              </button>
            </div>
          </DrawerHeader>
          <div className="grid grid-cols-4 gap-2 p-4 pt-2">
            {Array.from({ length: 12 }, (_, index) => {
              const candidate = `${pickerYear}-${String(index + 1).padStart(2, '0')}`
              const active = pickerYear === year && index + 1 === selectedMonthNumber
              return (
                <Link
                  key={candidate}
                  href={buildHref(basePath, candidate, searchParams)}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'rounded-lg border py-2.5 text-center text-sm font-medium capitalize transition-colors',
                    active ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'
                  )}
                >
                  {monthShortName(index, locale)}
                </Link>
              )
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
