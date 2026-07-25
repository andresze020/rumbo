'use client'

import Link from 'next/link'
import { ArrowLeftRight, GitMerge, Pencil, Store } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/submit-button'
import { ArchiveConfirmButton } from '@/components/archive-confirm-button'
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

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/30',
        payee.isArchived && 'bg-muted/20'
      )}
    >
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

      <div className="flex items-center gap-1">
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

        {payee.isArchived ? (
          <form action={archivePayeeAction}>
            <input type="hidden" name="payee_id" value={payee.id} />
            <input type="hidden" name="is_archived" value="false" />
            <input
              type="hidden"
              name="show_archived"
              value={showArchived ? 'true' : 'false'}
            />
            <SubmitButton type="submit" size="sm" variant="outline" pendingText="Restoring…">
              Restore
            </SubmitButton>
          </form>
        ) : (
          <>
            <Link
              href={payee.mergeHref}
              className={buttonVariants({ variant: 'outline', size: 'icon-sm' })}
              aria-label={ui(`Merge ${payee.name} into another payee`)}
            >
              <GitMerge className="size-3.5" aria-hidden="true" />
            </Link>
            <ArchiveConfirmButton
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
          </>
        )}
      </div>
    </div>
  )
}
