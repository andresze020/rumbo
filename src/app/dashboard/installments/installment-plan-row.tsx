'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { cancelInstallmentPlanAction } from './actions'
import { Badge } from '@/components/ui/badge'
import { ConfirmActionButton } from '@/components/confirm-action-button'
import { useLanguage } from '@/components/language-provider'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'

export type InstallmentPlanVM = {
  id: string
  description: string
  status: string
  accountName: string
  categoryName: string
  totalLabel: string
  perInstallmentLabel: string
  installmentCount: number
  paidCount: number
  remainingCount: number
  nextDueLabel: string | null
  startLabel: string
  transactionsHref: string
}

/**
 * BR-035 — one plan in the list, with its *n of N* progress.
 *
 * Progress is derived from the installments themselves rather than stored on the
 * plan, so an early payoff (which voids the future ones) is reflected without a
 * second source of truth to keep in sync.
 */
export function InstallmentPlanRow({ plan }: { plan: InstallmentPlanVM }) {
  const { t } = useLanguage()
  const ui = useUiTranslation()
  const isActive = plan.status === 'active'
  const isCancelled = plan.status === 'cancelled'

  return (
    <div className={isActive ? 'p-4' : 'bg-muted/20 p-4'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-sm font-medium ${isActive ? '' : 'text-muted-foreground'}`}
            >
              {plan.description}
            </span>
            {/* The n of N badge: the position in the plan is the thing a
                recurring template could never express. */}
            <Badge variant="outline" className="text-xs tabular-nums">
              {plan.paidCount} / {plan.installmentCount}
            </Badge>
            {isCancelled ? (
              <Badge variant="outline" className="text-xs">
                {ui('Cancelled')}
              </Badge>
            ) : null}
          </div>
          {/* Pure arithmetic and proper nouns — nothing to translate. */}
          <p className="text-xs text-muted-foreground tabular-nums">
            {plan.perInstallmentLabel} × {plan.installmentCount} = {plan.totalLabel}
          </p>
          <p className="text-xs text-muted-foreground">
            {plan.accountName} · {plan.categoryName}
          </p>
          {/* One template literal per line, so the catalog gets whole sentences
              with {n} placeholders. Fragments around the values would translate
              into nonsense word order for es/fr. */}
          {plan.nextDueLabel ? (
            <p className="text-xs text-muted-foreground">
              {ui(
                `${plan.remainingCount} payments left, next on ${plan.nextDueLabel}`
              )}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {isCancelled ? ui('Remaining payments voided') : ui('All payments recorded')}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={plan.transactionsHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <ArrowRight className="size-3" aria-hidden="true" />
            {t('accounts.viewTransactions')}
          </Link>
          {/* Voids only the payments that have not come due yet — the ones
              already billed are real history. */}
          {isActive ? (
            <ConfirmActionButton
              action={cancelInstallmentPlanAction}
              hiddenFields={{ plan_id: plan.id }}
              triggerLabel="Cancel plan"
              triggerVariant="outline"
              pendingLabel="Cancelling…"
              title="Cancel this plan?"
              description="Payments that have already come due stay in your records. Payments still in the future are voided, and each one can be restored individually."
              cancelLabel={t('common.cancel')}
              confirmLabel="Cancel plan"
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
