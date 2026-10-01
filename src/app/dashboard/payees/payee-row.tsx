'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeftRight, GitMerge, MoreHorizontal, Pencil, Store } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/submit-button'
import { ConfirmActionButton } from '@/components/confirm-action-button'
import { cn } from '@/lib/utils'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'
import { archivePayeeAction } from './actions'

export type PayeeVM = {
  id: string
  name: string
  isArchived: boolean
  txnCount: number
  lastUsedLabel: string | null
  editHref: string
  mergeHref: string
  transactionsHref: string
}

export function PayeeRow({
  payee,
  showArchived,
}: {
  payee: PayeeVM
  showArchived: boolean
}) {
  const ui = useUiTranslation()
  const muted = payee.isArchived ? 'text-muted-foreground' : ''
  const [actionsOpen, setActionsOpen] = useState(false)

  const summary = (
    <>
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        <Store className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm font-semibold', muted)}>
          {payee.name}
          {payee.isArchived ? (
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 align-middle text-[10px] font-semibold text-muted-foreground">
              {ui('Archived')}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {payee.txnCount} {ui(payee.txnCount === 1 ? 'transaction' : 'transactions')}
          {payee.lastUsedLabel
            ? ` ${ui(`· last used ${payee.lastUsedLabel}`)}`
            : ` ${ui('· never used')}`}
        </span>
      </div>
    </>
  )

  const archiveControl = payee.isArchived ? (
    <form action={archivePayeeAction}>
      <input type="hidden" name="payee_id" value={payee.id} />
      <input type="hidden" name="is_archived" value="false" />
      <input type="hidden" name="show_archived" value={showArchived ? 'true' : 'false'} />
      <SubmitButton type="submit" size="sm" variant="outline" pendingText="Restoring…">
        Restore
      </SubmitButton>
    </form>
  ) : (
    <ConfirmActionButton
      action={archivePayeeAction}
      hiddenFields={{
        payee_id: payee.id,
        is_archived: 'true',
        show_archived: showArchived ? 'true' : 'false',
      }}
      triggerLabel="Archive"
      pendingLabel="Archiving…"
      title="Archive this payee?"
      description="Archived payees are hidden from the payee picker, but existing transactions keep their merchant label. You can restore it anytime."
      cancelLabel="Cancel"
      confirmLabel="Archive"
    />
  )

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/30',
        payee.isArchived && 'bg-muted/20'
      )}
    >
      {/* MQ-015: the row itself opens the payee's transactions — on a phone
          that is the one action worth a full-width target. */}
      {payee.txnCount > 0 ? (
        <Link
          href={payee.transactionsHref}
          className="flex min-w-0 flex-1 items-center gap-3"
          aria-label={ui(`View transactions for ${payee.name}`)}
        >
          {summary}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{summary}</div>
      )}

      {/* sm and up: the row's actions, as before. */}
      <div className="hidden items-center gap-1 sm:flex">
        {payee.txnCount > 0 ? (
          <Link
            href={payee.transactionsHref}
            className={buttonVariants({ variant: 'outline', size: 'icon-sm' })}
            aria-label={ui(`View transactions for ${payee.name}`)}
            title={ui('View transactions')}
          >
            <ArrowLeftRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null}
        <Link
          href={payee.editHref}
          className={buttonVariants({ variant: 'outline', size: 'icon-sm' })}
          aria-label={ui(`Rename ${payee.name}`)}
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </Link>
        {payee.isArchived ? null : (
          <Link
            href={payee.mergeHref}
            className={buttonVariants({ variant: 'outline', size: 'icon-sm' })}
            aria-label={ui(`Merge ${payee.name} into another payee`)}
          >
            <GitMerge className="size-3.5" aria-hidden="true" />
          </Link>
        )}
        {archiveControl}
      </div>

      {/* Phone (MQ-015): four controls per row truncated the name and broke
          its meta line into three; they now sit behind one "⋯" and open
          inline under the row, confirmations unchanged. */}
      <button
        type="button"
        onClick={() => setActionsOpen((open) => !open)}
        aria-expanded={actionsOpen}
        aria-label={ui('Actions')}
        className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'shrink-0 sm:hidden')}
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </button>
      {actionsOpen ? (
        <div className="flex w-full flex-wrap items-center gap-2 pl-11 sm:hidden">
          <Link href={payee.editHref} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <Pencil className="size-3.5" aria-hidden="true" />
            {ui('Edit')}
          </Link>
          {payee.isArchived ? null : (
            <Link href={payee.mergeHref} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <GitMerge className="size-3.5" aria-hidden="true" />
              {ui('Merge')}
            </Link>
          )}
          {archiveControl}
        </div>
      ) : null}
    </div>
  )
}
