'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useFormStatus } from 'react-dom'
import { Check, ChevronRight, Circle, HelpCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GlobalAddTransactionButton } from '@/components/global-add-transaction-button'
import { useLanguage } from '@/components/language-provider'
import { copyPreviousMonthBudgetAction } from '@/app/dashboard/budgets/actions'
import type { ChecklistTask, HomeChecklist } from '@/lib/home-checklist/server'
import type { TranslationKey } from '@/lib/i18n/translate'
import { formatMonthLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Onboarding is dismissed for good; the routine only until the month turns. */
const ONBOARDING_HIDE_KEY = 'af_hide_getting_started'
const ROUTINE_HIDE_KEY = 'af_hide_monthly_routine'

const TASK_COPY: Record<ChecklistTask['id'], { titleKey: TranslationKey; hintKey: TranslationKey }> = {
  addAccount: {
    titleKey: 'homeChecklist.tasks.addAccountTitle',
    hintKey: 'homeChecklist.tasks.addAccountHint',
  },
  addTransaction: {
    titleKey: 'homeChecklist.tasks.addTransactionTitle',
    hintKey: 'homeChecklist.tasks.addTransactionHint',
  },
  firstBudget: {
    titleKey: 'homeChecklist.tasks.firstBudgetTitle',
    hintKey: 'homeChecklist.tasks.firstBudgetHint',
  },
  closePreviousMonth: {
    titleKey: 'homeChecklist.tasks.closePreviousMonthTitle',
    hintKey: 'homeChecklist.tasks.closePreviousMonthHint',
  },
  budget: {
    titleKey: 'homeChecklist.tasks.budgetTitle',
    hintKey: 'homeChecklist.tasks.budgetHint',
  },
  recurring: {
    titleKey: 'homeChecklist.tasks.recurringTitle',
    hintKey: 'homeChecklist.tasks.recurringHint',
  },
  review: {
    titleKey: 'homeChecklist.tasks.reviewTitle',
    hintKey: 'homeChecklist.tasks.reviewHint',
  },
  closeMonth: {
    titleKey: 'homeChecklist.tasks.closeMonthTitle',
    hintKey: 'homeChecklist.tasks.closeMonthHint',
  },
}

const COPY_BUDGET_COPY = {
  titleKey: 'homeChecklist.tasks.budgetCopyTitle',
  hintKey: 'homeChecklist.tasks.budgetCopyHint',
} satisfies { titleKey: TranslationKey; hintKey: TranslationKey }

function TaskRow({
  done,
  title,
  hint,
  count,
  pending = false,
}: {
  done: boolean
  title: string
  hint?: string
  count?: number
  pending?: boolean
}) {
  return (
    <span
      className={cn(
        '-mx-2 flex items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors',
        !done && 'hover:bg-muted/60',
        pending && 'opacity-60'
      )}
    >
      {done ? (
        <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn('text-sm font-medium', done && 'text-muted-foreground line-through')}>
            {title}
          </span>
          {!done && count ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
              {count}
            </span>
          ) : null}
        </span>
        {!done && hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      {!done ? (
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : null}
    </span>
  )
}

/** Same row, but aware of the server action's in-flight state. */
function SubmitTaskRow(props: { title: string; hint?: string }) {
  const { pending } = useFormStatus()
  return <TaskRow done={false} pending={pending} {...props} />
}

export function HomeChecklist({ checklist }: { checklist: HomeChecklist }) {
  const { t, locale } = useLanguage()
  const isRoutine = checklist.phase === 'routine'
  const storageKey = isRoutine ? ROUTINE_HIDE_KEY : ONBOARDING_HIDE_KEY
  // Hidden until proven otherwise, so the card never flashes in for someone who
  // dismissed it before localStorage is readable.
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    window.requestAnimationFrame(() => {
      const stored = localStorage.getItem(storageKey)
      // The routine stores the month it was hidden for: a new month brings it back.
      setDismissed(isRoutine ? stored === checklist.month : stored === '1')
    })
  }, [isRoutine, storageKey, checklist.month])

  if (dismissed) return null

  function handleHide() {
    localStorage.setItem(storageKey, isRoutine ? checklist.month : '1')
    setDismissed(true)
  }

  const monthLabel = formatMonthLabel(checklist.month, locale)
  const previousMonthLabel = formatMonthLabel(checklist.previousMonth, locale)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t(isRoutine ? 'homeChecklist.routineTitle' : 'homeChecklist.onboardingTitle')}
        </CardTitle>
        <CardDescription>
          {isRoutine
            ? t('homeChecklist.routineProgress', {
                done: checklist.doneCount,
                total: checklist.total,
                month: monthLabel,
              })
            : t('homeChecklist.progress', {
                done: checklist.doneCount,
                total: checklist.total,
              })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {checklist.tasks.map((task) => {
          const isCopyBudget = task.action.kind === 'copyPreviousBudget'
          const copy = isCopyBudget ? COPY_BUDGET_COPY : TASK_COPY[task.id]
          // `closePreviousMonth` names last month; `closeMonth` names the month
          // being browsed. Every other row ignores the variable.
          const vars = {
            count: task.count ?? 0,
            month: task.id === 'closePreviousMonth' ? previousMonthLabel : monthLabel,
          }
          const title = t(copy.titleKey, vars)
          const hint = t(copy.hintKey, vars)

          if (task.done) {
            return <TaskRow key={task.id} done title={title} />
          }

          if (task.action.kind === 'addTransaction') {
            return (
              <GlobalAddTransactionButton key={task.id} className="block w-full text-left">
                <TaskRow done={false} title={title} hint={hint} count={task.count} />
              </GlobalAddTransactionButton>
            )
          }

          if (task.action.kind === 'copyPreviousBudget') {
            return (
              <form key={task.id} action={copyPreviousMonthBudgetAction}>
                <input type="hidden" name="month" value={task.action.month} />
                <button type="submit" className="block w-full text-left">
                  <SubmitTaskRow title={title} hint={hint} />
                </button>
              </form>
            )
          }

          return (
            <Link key={task.id} href={task.action.href} className="block">
              <TaskRow done={false} title={title} hint={hint} count={task.count} />
            </Link>
          )
        })}

        <div className="flex flex-wrap items-center gap-1 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={handleHide}>
            {t(isRoutine ? 'homeChecklist.hideForMonth' : 'homeChecklist.hide')}
          </Button>
          <Link
            href="/dashboard/help"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <HelpCircle className="size-4" aria-hidden="true" />
            {t('homeChecklist.helpLink')}
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
