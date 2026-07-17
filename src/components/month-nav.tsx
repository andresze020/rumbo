import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { formatMonthLabel } from '@/lib/format'

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

export function MonthNav({
  month,
  basePath,
  searchParams,
  previousLabel,
  nextLabel,
}: MonthNavProps) {
  const previousMonth = shiftMonth(month, -1)
  const nextMonth = shiftMonth(month, 1)

  return (
    <div className="flex items-center gap-2">
      <Link
        href={buildHref(basePath, previousMonth, searchParams)}
        aria-label={previousLabel}
        className={buttonVariants({ variant: 'outline', size: 'icon' })}
      >
        <ChevronLeft />
      </Link>
      <span className="min-w-[8rem] text-center text-sm font-medium">
        {formatMonthLabel(month)}
      </span>
      <Link
        href={buildHref(basePath, nextMonth, searchParams)}
        aria-label={nextLabel}
        className={buttonVariants({ variant: 'outline', size: 'icon' })}
      >
        <ChevronRight />
      </Link>
    </div>
  )
}
