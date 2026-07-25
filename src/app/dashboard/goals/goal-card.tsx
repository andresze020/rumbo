import Link from 'next/link'
import { StatusBadge } from '@/components/status-badge'
import { SubmitButton } from '@/components/submit-button'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatCurrency, formatIsoDate, formatPercent } from '@/lib/format'
import { goalProgress } from '@/lib/goals/shared'
import type { Locale } from '@/lib/i18n/dictionaries'
import { translate, type TranslationKey } from '@/lib/i18n/translate'
import { setGoalStatusAction } from './actions'

type Goal = {
  id: string
  name: string
  goal_type: string
  target_amount: number | string
  current_amount: number | string
  currency_code: string
  target_date: string | null
  status: string
}

type GoalCardProps = {
  goal: Goal
  linkedAccountName: string | null
  editHref: string
  contributeHref: string
  withdrawHref: string
  locale: Locale
}

export function GoalCard({
  goal,
  linkedAccountName,
  editHref,
  contributeHref,
  withdrawHref,
  locale,
}: GoalCardProps) {
  const targetAmount = Number(goal.target_amount)
  const currentAmount = Number(goal.current_amount)
  const progress = goalProgress(currentAmount, targetAmount)
  const isArchived = goal.status === 'archived'
  const isPaused = goal.status === 'paused'
  const goalTypeKey: Record<string, TranslationKey> = {
    emergency_fund: 'goals.types.emergencyFund',
    debt_payoff: 'goals.types.debtPayoff',
    down_payment: 'goals.types.downPayment',
    travel: 'goals.types.travel',
    retirement: 'goals.types.retirement',
    custom: 'goals.types.custom',
  }
  const typeKey = goalTypeKey[goal.goal_type]
  const typeLabel = typeKey ? translate(locale, typeKey) : goal.goal_type

  return (
    <div
      className={cn(
        'flex flex-col rounded-2xl border bg-card p-5 shadow-sm shadow-black/[0.03]',
        (isArchived || isPaused) && 'opacity-75'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{goal.name}</p>
            {goal.status !== 'active' ? <StatusBadge status={goal.status} /> : null}
          </div>
          <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
            {typeLabel}
            {goal.target_date
              ? ` · ${translate(locale, 'goals.targetDate', {
                  date: formatIsoDate(goal.target_date, locale),
                })}`
              : ''}
          </p>
        </div>
      </div>

      <p className="mt-3.5 font-mono text-2xl font-bold tabular-nums">
        {formatCurrency(currentAmount, goal.currency_code, locale)}
      </p>

      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">
          {translate(locale, 'goals.progress', {
            progress: formatPercent(progress, locale, { minimumFractionDigits: 0 }),
          })}
        </span>
        <span className="tabular-nums">
          {translate(locale, 'goals.target', {
            amount: formatCurrency(targetAmount, goal.currency_code, locale),
          })}
        </span>
      </div>

      <div className="mt-auto flex flex-col items-stretch gap-2 border-t pt-3.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {linkedAccountName ?? 'No linked account'}
        </span>
        <div className="grid grid-cols-2 gap-1.5 sm:flex sm:shrink-0 sm:flex-wrap sm:items-center">
          <Link
            href={editHref}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full sm:w-auto')}
          >
            Edit
          </Link>
          {!isArchived ? (
            <Link
              href={contributeHref}
              className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'w-full sm:w-auto')}
            >
              Add funds
            </Link>
          ) : null}
          {!isArchived && currentAmount > 0 ? (
            <Link
              href={withdrawHref}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full sm:w-auto')}
            >
              Withdraw
            </Link>
          ) : null}
          {goal.status === 'active' ? (
            <StatusForm goalId={goal.id} status="paused" label="Pause" className="w-full sm:w-auto" />
          ) : null}
          {isPaused ? (
            <StatusForm goalId={goal.id} status="active" label="Resume" className="w-full sm:w-auto" />
          ) : null}
          {!isArchived ? (
            <StatusForm
              goalId={goal.id}
              status="archived"
              label="Archive"
              variant="ghost"
              className="w-full sm:w-auto"
            />
          ) : (
            <StatusForm
              goalId={goal.id}
              status="active"
              label="Restore"
              variant="ghost"
              className="w-full sm:w-auto"
            />
          )}
        </div>
      </div>
    </div>
  )
}

function StatusForm({
  goalId,
  status,
  label,
  variant = 'outline',
  className,
}: {
  goalId: string
  status: string
  label: string
  variant?: 'outline' | 'ghost'
  className?: string
}) {
  return (
    <form action={setGoalStatusAction} className={className}>
      <input type="hidden" name="goal_id" value={goalId} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton
        type="submit"
        size="sm"
        variant={variant}
        pendingText={`${label}…`}
        className="w-full sm:w-auto"
      >
        {label}
      </SubmitButton>
    </form>
  )
}
