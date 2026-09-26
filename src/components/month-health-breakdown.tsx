import Link from 'next/link'
import type { ReactNode } from 'react'
import { formatPercent } from '@/lib/format'
import {
  HEALTH_BUDGET_WEIGHT,
  HEALTH_SAVINGS_WEIGHT,
  type HealthAction,
  type HealthBreakdown,
} from '@/lib/health/score'
import type { Locale } from '@/lib/i18n/dictionaries'
import { translate, type TranslationKey } from '@/lib/i18n/translate'
import { cn } from '@/lib/utils'

const ACTION_COPY: Record<HealthAction, { text: TranslationKey; cta: TranslationKey | null }> = {
  raise_savings: { text: 'dashboard.healthActionRaiseSavings', cta: 'dashboard.healthCtaReviewExpenses' },
  rein_in_budget: { text: 'dashboard.healthActionReinInBudget', cta: 'dashboard.healthCtaReviewBudget' },
  record_income: { text: 'dashboard.healthActionRecordIncome', cta: 'dashboard.healthCtaReviewIncome' },
  set_budget: { text: 'dashboard.healthActionSetBudget', cta: 'dashboard.healthCtaSetBudget' },
  keep_going: { text: 'dashboard.healthActionKeepGoing', cta: null },
}

/** Where the suggested action for `action` lands, scoped to `month`. */
export function healthActionHref(action: HealthAction, month: string): string | null {
  switch (action) {
    case 'raise_savings':
      return `/dashboard/transactions?month=${month}&type=expense`
    case 'record_income':
      return `/dashboard/transactions?month=${month}&type=income`
    case 'rein_in_budget':
    case 'set_budget':
      return `/dashboard/budgets?month=${month}`
    case 'keep_going':
      return null
  }
}

/**
 * RUM-009 — the numbers behind a Month health grade: each input, its sub-score
 * and weight, the action implied by the weakest component, and (collapsed) the
 * thresholds. Rendered from `healthBreakdown()` so every surface that shows
 * the score shows the same explanation.
 */
export function MonthHealthBreakdown({
  breakdown,
  month,
  locale,
  className,
  showAction = true,
}: {
  breakdown: HealthBreakdown
  month: string
  locale: Locale
  className?: string
  /** False where the caller already shows the action (MonthHealthSummary). */
  showAction?: boolean
}) {
  const t = (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars)
  const pct = (value: number) => formatPercent(value, locale, { minimumFractionDigits: 0 })
  const { savings, budget, weakest, action } = breakdown
  const copy = ACTION_COPY[action]
  const href = healthActionHref(action, month)

  const rows = [
    {
      key: 'savings' as const,
      label: t('dashboard.savingsRate'),
      value: savings.rate == null ? t('dashboard.healthNoIncome') : pct(savings.rate),
      points: t('dashboard.healthPoints', { points: Math.round(savings.points), weight: pct(savings.weight) }),
    },
    ...(budget
      ? [
          {
            key: 'budget' as const,
            label: t('dashboard.healthBudgetUsed'),
            value: pct(budget.percentUsed),
            points: t('dashboard.healthPoints', { points: Math.round(budget.points), weight: pct(budget.weight) }),
          },
        ]
      : []),
  ]
  // Only call a component "weakest" when there is something to compare it to
  // and it is actually below 100.
  const showWeakest = budget !== null && action !== 'keep_going'

  return (
    <div className={cn('min-w-0 space-y-2.5 text-xs', className)}>
      <dl className="divide-y rounded-lg border">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3 px-3 py-2">
            <dt className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              {row.label}
              {showWeakest && weakest === row.key ? (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                  {t('dashboard.healthWeakest')}
                </span>
              ) : null}
            </dt>
            <dd className="shrink-0 text-right">
              <span className="font-semibold tabular-nums text-foreground">{row.value}</span>
              <span className="ml-2 tabular-nums text-muted-foreground">{row.points}</span>
            </dd>
          </div>
        ))}
      </dl>
      {!budget ? <p className="text-muted-foreground">{t('dashboard.healthNoBudget')}</p> : null}
      {showAction ? (
      <p className="leading-relaxed text-foreground">
        {t(copy.text)}
        {copy.cta && href ? (
          <>
            {' '}
            <Link href={href} className="font-semibold text-primary hover:underline">
              {t(copy.cta)} →
            </Link>
          </>
        ) : null}
      </p>
      ) : null}
      <details className="group text-muted-foreground">
        <summary className="cursor-pointer font-semibold text-primary hover:underline">
          {t('dashboard.healthHowCalculated')}
        </summary>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 leading-relaxed">
          <li>{t('dashboard.healthThresholdSavings')}</li>
          <li>{t('dashboard.healthThresholdBudget')}</li>
          <li>
            {t('dashboard.healthThresholdWeights', {
              savings: pct(HEALTH_SAVINGS_WEIGHT),
              budget: pct(HEALTH_BUDGET_WEIGHT),
            })}
          </li>
          <li>{t('dashboard.healthThresholdGrades')}</li>
        </ul>
      </details>
    </div>
  )
}

/**
 * The one-line Month health for the Dashboard's cash-flow card (2026-09-25
 * redesign): grade, score and the suggested action, with the full RUM-009
 * breakdown one click away under "Details". Same numbers as Month review.
 */
export function MonthHealthSummary({
  breakdown,
  month,
  locale,
  tooltip,
}: {
  breakdown: HealthBreakdown
  month: string
  locale: Locale
  tooltip?: ReactNode
}) {
  const t = (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars)
  const copy = ACTION_COPY[breakdown.action]
  const href = healthActionHref(breakdown.action, month)

  // Ring gauge (2026-09-26): the score as a filled arc, in the status color of
  // its band. The grade sits next to it as text, so color is never the only cue.
  const radius = 19
  const circumference = 2 * Math.PI * radius
  const filled = (Math.max(0, Math.min(100, breakdown.score)) / 100) * circumference
  const ringTone =
    breakdown.score >= 70
      ? 'text-emerald-500'
      : breakdown.score >= 50
      ? 'text-amber-500'
      : 'text-rose-500'

  return (
    <div className="text-xs">
      <div className="flex items-start gap-3">
        <span className="relative flex size-12 shrink-0 items-center justify-center" aria-hidden="true">
          <svg viewBox="0 0 48 48" className="absolute inset-0 size-12 -rotate-90">
            <circle cx="24" cy="24" r={radius} fill="none" stroke="var(--muted)" strokeWidth="4" />
            <circle
              cx="24"
              cy="24"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${circumference}`}
              className={ringTone}
            />
          </svg>
          <span className="text-sm font-semibold tabular-nums">{breakdown.score}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">{t('dashboard.monthHealth')}</span>
            <span className="rounded-md bg-muted px-1.5 py-px text-[11px] font-semibold">{breakdown.grade}</span>
            <span className="sr-only">· {breakdown.score}/100</span>
            {tooltip}
          </p>
          <p className="mt-0.5 leading-relaxed text-muted-foreground">
            {t(copy.text)}
            {copy.cta && href ? (
              <>
                {' '}
                <Link href={href} className="whitespace-nowrap font-semibold text-primary hover:underline">
                  {t(copy.cta)} →
                </Link>
              </>
            ) : null}
          </p>
        </div>
      </div>
      <details className="mt-2 pl-[3.75rem]">
        <summary className="cursor-pointer font-semibold text-primary hover:underline">
          {t('dashboard.healthDetails')}
        </summary>
        <MonthHealthBreakdown breakdown={breakdown} month={month} locale={locale} showAction={false} className="mt-2" />
      </details>
    </div>
  )
}
