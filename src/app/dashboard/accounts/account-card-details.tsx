'use client'

import Link from 'next/link'
import { ArrowRight, Plus, Settings } from 'lucide-react'
import { GlobalAddTransactionButton } from '@/components/global-add-transaction-button'
import { buttonVariants } from '@/components/ui/button'
import { useLanguage } from '@/components/language-provider'
import { cn } from '@/lib/utils'

/**
 * BR-030 — the card's statement cycle, already formatted. The strings are built
 * on the server (which has the locale and the currency) so this stays a dumb
 * renderer, matching how every other label reaches this component.
 */
export type CardCycleView = {
  payableLabel: string
  outstandingLabel: string
  paidSinceCloseLabel: string | null
  closedWindowLabel: string
  closedDueLabel: string
  openWindowLabel: string
  openDueLabel: string
  isOverdue: boolean
  billingAccountName: string | null
}

type AccountDetailsPanelProps = {
  accountId: string
  accountName: string
  editHref: string
  isArchived: boolean
  postedLabel: string
  pendingLabel: string
  projectedLabel: string
  balanceType: 'posted' | 'owed'
  /** BR-030 — present only for a card with a configured cycle. */
  cardCycle?: CardCycleView | null
}

/**
 * Label on the left, figure on the right — one line each. The breakdown used to
 * be three centred columns, which clipped any long figure ("COP 29,262,9…") on a
 * phone; a statement-style list can never clip because the number owns its own
 * line end.
 */
function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-semibold tabular-nums">{value}</span>
    </div>
  )
}

/**
 * Everything about an account that is not its name and its balance: the posted /
 * pending / projected breakdown, the statement cycle, and the row's actions.
 * Hidden behind the row's chevron so the list itself stays one line per account.
 */
export function AccountDetailsPanel({
  accountId,
  accountName,
  editHref,
  isArchived,
  postedLabel,
  pendingLabel,
  projectedLabel,
  balanceType,
  cardCycle = null,
}: AccountDetailsPanelProps) {
  const { t } = useLanguage()
  const isOwed = balanceType === 'owed'
  const actionClass = cn(
    buttonVariants({ variant: 'outline', size: 'sm' }),
    'h-8 gap-1.5 px-2.5 text-xs font-medium'
  )

  return (
    <div className="space-y-3 px-3 pb-3 sm:px-4">
      <div className="space-y-1.5 border-t border-border/60 pt-2.5">
        <DetailLine
          label={isOwed ? t('accounts.postedOwed') : t('accounts.posted')}
          value={postedLabel}
        />
        <DetailLine
          label={isOwed ? t('accounts.pendingOwed') : t('accounts.pending')}
          value={pendingLabel}
        />
        <DetailLine
          label={isOwed ? t('accounts.projectedOwed') : t('accounts.projected')}
          value={projectedLabel}
        />
      </div>

      {/* BR-030: the two figures one under the other. They are never added
          together — the first is billed on its due date, the second has not been
          billed at all yet. */}
      {cardCycle ? (
        <div className="space-y-2.5 border-t border-border/60 pt-2.5">
          <div className="space-y-0.5">
            <DetailLine
              label={t('accounts.cyclePayable')}
              value={cardCycle.payableLabel}
            />
            <p className="text-[11px] text-muted-foreground">
              {cardCycle.closedWindowLabel}
            </p>
            <p
              className={cn(
                'text-[11px]',
                cardCycle.isOverdue
                  ? 'font-semibold text-rose-600 dark:text-rose-400'
                  : 'text-muted-foreground'
              )}
            >
              {t('accounts.cycleDue')} {cardCycle.closedDueLabel}
              {cardCycle.isOverdue ? ` · ${t('accounts.cycleOverdue')}` : ''}
            </p>
            {cardCycle.paidSinceCloseLabel ? (
              <p className="text-[11px] text-muted-foreground">
                {t('accounts.cyclePaidSinceClose')} {cardCycle.paidSinceCloseLabel}
              </p>
            ) : null}
          </div>
          <div className="space-y-0.5">
            <DetailLine
              label={t('accounts.cycleOutstanding')}
              value={cardCycle.outstandingLabel}
            />
            <p className="text-[11px] text-muted-foreground">
              {cardCycle.openWindowLabel}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {t('accounts.cycleDue')} {cardCycle.openDueLabel}
            </p>
            {cardCycle.billingAccountName ? (
              <p className="text-[11px] text-muted-foreground">
                {t('accounts.cyclePaidFrom')} {cardCycle.billingAccountName}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* The actions used to sit on their own permanent strip under every row —
          three unlabelled icons per account. Behind the chevron they cost no
          height at rest and can afford words. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2.5">
        {!isArchived ? (
          <GlobalAddTransactionButton
            className={actionClass}
            defaultAccountId={accountId}
            title={`${t('common.addTransaction')} — ${accountName}`}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            {t('common.addTransaction')}
          </GlobalAddTransactionButton>
        ) : null}
        <Link
          href={`/dashboard/transactions?account_id=${accountId}`}
          className={actionClass}
        >
          <ArrowRight className="size-3.5" aria-hidden="true" />
          {t('nav.transactions')}
        </Link>
        <Link href={editHref} className={actionClass}>
          <Settings className="size-3.5" aria-hidden="true" />
          {t('common.edit')}
        </Link>
      </div>
    </div>
  )
}
