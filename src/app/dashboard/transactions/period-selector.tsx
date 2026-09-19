'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
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
import {
  appendPeriodParams,
  customPeriod,
  formatPeriodDate,
  resolvesTheSame,
  monthPeriod,
  presetPeriod,
  type PeriodPreset,
  type TransactionPeriod,
} from '@/lib/periods/transaction-period'
import { cn } from '@/lib/utils'

type PeriodSelectorProps = {
  /** The applied period, parsed from the URL by the server. */
  period: TransactionPeriod
  /** What the trigger reads, rendered server-side so first paint is right. */
  label: string
  /** Every applied filter *except* the period, as a query string. */
  baseQuery: string
}

const PRESET_LABELS: { preset: PeriodPreset; label: string }[] = [
  { preset: 'this-month', label: 'This month' },
  { preset: 'last-month', label: 'Last month' },
  { preset: 'last-3-months', label: 'Last 3 months' },
  { preset: 'last-6-months', label: 'Last 6 months' },
  { preset: 'ytd', label: 'Year to date' },
  { preset: 'all-time', label: 'All time' },
]

const optionCls =
  'flex h-11 items-center justify-center rounded-xl border px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60'
const optionActiveCls = 'border-primary bg-primary text-primary-foreground shadow-sm'
const optionIdleCls = 'bg-background hover:bg-muted'

export function PeriodSelector({ period, label, baseQuery }: PeriodSelectorProps) {
  const ui = useUiTranslation()
  const { locale } = useLanguage()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => Number(period.month.slice(0, 4)))

  // A range being typed is staged here and only travels on Apply: a half-typed
  // "From" would otherwise navigate on every keystroke.
  const [customFrom, setCustomFrom] = useState(period.dateFrom)
  const [customTo, setCustomTo] = useState(period.dateTo)
  // The From/To pair only exists once Custom range is chosen — stacking it
  // under every preset is what made the old filter sheet so tall.
  const [customOpen, setCustomOpen] = useState(period.kind === 'custom')

  // Navigation is client-side, so this component survives it: re-seed from what
  // the server actually applied. Adjusted during render rather than in an
  // effect, per https://react.dev/learn/you-might-not-need-an-effect.
  const [syncedKey, setSyncedKey] = useState(periodKey(period))
  if (periodKey(period) !== syncedKey) {
    setSyncedKey(periodKey(period))
    setYear(Number(period.month.slice(0, 4)))
    setCustomFrom(period.dateFrom)
    setCustomTo(period.dateTo)
    setCustomOpen(period.kind === 'custom')
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

  /** One place where a period becomes a URL — the same shape the server parses. */
  function go(next: TransactionPeriod) {
    setOpen(false)
    const params = new URLSearchParams(baseQuery)
    appendPeriodParams(params, next)
    router.push(`/dashboard/transactions?${params.toString()}`)
  }

  const customIsValid = customFrom !== '' && customTo !== '' && customFrom <= customTo

  // Which preset, if any, is showing the same days as the applied period.
  // A preset is the more specific statement, so when one matches, the month
  // grid stands down — exactly one control is lit, never two and never none.
  const matchedPreset =
    PRESET_LABELS.find((option) =>
      resolvesTheSame(period, presetPeriod(option.preset))
    )?.preset ?? null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${ui('Period')}: ${label}`}
        className={cn(
          // No calendar icon: on a 320px line shared with the screen title,
          // 16px of decoration is 16px the month name does not get.
          'relative inline-flex h-8 min-w-0 max-w-full shrink items-center gap-1 rounded-full border bg-card px-3 text-sm font-medium text-foreground shadow-sm shadow-black/[0.03] transition-colors',
          "before:absolute before:inset-x-0 before:-top-1.5 before:-bottom-1.5 before:content-['']",
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60'
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle>{ui('Period')}</DrawerTitle>
            <DrawerDescription>
              {ui('Everything on this screen is measured over this period.')}
            </DrawerDescription>
          </DrawerHeader>

          <div className="mx-auto w-full max-w-md overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="grid grid-cols-2 gap-2">
              {PRESET_LABELS.map((option) => {
                const isCurrent = matchedPreset === option.preset
                return (
                  <button
                    key={option.preset}
                    type="button"
                    onClick={() => go(presetPeriod(option.preset))}
                    aria-pressed={isCurrent}
                    className={cn(
                      optionCls,
                      isCurrent ? optionActiveCls : optionIdleCls
                    )}
                  >
                    {ui(option.label)}
                  </button>
                )
              })}
            </div>

            {/* ── Custom range ─────────────────────────────────────────── */}
            <button
              type="button"
              onClick={() => setCustomOpen((current) => !current)}
              aria-expanded={customOpen}
              className={cn(
                optionCls,
                'mt-2 w-full justify-between px-3',
                period.kind === 'custom' && !matchedPreset
                  ? optionActiveCls
                  : optionIdleCls
              )}
            >
              <span>{ui('Custom range')}</span>
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none',
                  customOpen && 'rotate-180'
                )}
                aria-hidden="true"
              />
            </button>

            {customOpen ? (
              <div className="mt-2 space-y-2 duration-200 animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none">
                <DateField
                  label={ui('From')}
                  value={customFrom}
                  onChange={setCustomFrom}
                  locale={locale}
                />
                <DateField
                  label={ui('To')}
                  value={customTo}
                  onChange={setCustomTo}
                  locale={locale}
                />
                <button
                  type="button"
                  disabled={!customIsValid}
                  onClick={() => go(customPeriod(customFrom, customTo))}
                  className={cn(
                    optionCls,
                    'w-full border-primary bg-primary text-primary-foreground shadow-sm hover:opacity-90 disabled:pointer-events-none disabled:opacity-50'
                  )}
                >
                  {ui('Apply range')}
                </button>
              </div>
            ) : null}

            {/* ── A specific month ─────────────────────────────────────── */}
            {/* The presets only reach two months back; this is how the rest of
                the history is reachable at all. */}
            <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {ui('Pick a month')}
            </p>
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setYear((current) => current - 1)}
                aria-label={ui('Previous year')}
                className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </button>
              <span aria-live="polite" className="text-base font-semibold tabular-nums">
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
                const candidate = monthPeriod(value)
                const isCurrent =
                  !matchedPreset && period.kind === 'month' && period.month === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => go(candidate)}
                    aria-pressed={isCurrent}
                    className={cn(
                      optionCls,
                      'capitalize',
                      isCurrent ? optionActiveCls : optionIdleCls
                    )}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}

function periodKey(period: TransactionPeriod) {
  return `${period.kind}|${period.preset ?? ''}|${period.month}|${period.dateFrom}|${period.dateTo}`
}

/**
 * A date row that *reads* as a date.
 *
 * `<input type="date">` renders in the browser's locale, which on an English
 * UI gives "01/09/2026" — a string that means two different days depending on
 * where you are standing. The native control still does the picking (it is the
 * only thing that opens the platform calendar), but it is laid over the row
 * transparently and the row itself shows "Sep 1, 2026".
 */
function DateField({
  label,
  value,
  onChange,
  locale,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  locale: Parameters<typeof formatPeriodDate>[1]
}) {
  return (
    <div className="relative flex h-13 items-center justify-between gap-3 rounded-xl border bg-background px-3 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-medium text-foreground">
        {value ? formatPeriodDate(value, locale) : '—'}
      </span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 outline-none"
      />
    </div>
  )
}
