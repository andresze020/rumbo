'use client'

import Link from 'next/link'
import { ArrowLeftRight, Pencil } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/submit-button'
import { ArchiveConfirmButton } from '@/components/archive-confirm-button'
import { TagChip } from '@/components/tag-chip'
import { cn } from '@/lib/utils'
import { archiveTagAction } from './actions'

export type TagVM = {
  id: string
  name: string
  color: string | null
  isArchived: boolean
  txnCount: number
  lastUsedLabel: string | null
  editHref: string
  transactionsHref: string
}

export function TagRow({
  tag,
  showArchived,
}: {
  tag: TagVM
  showArchived: boolean
}) {
  const muted = tag.isArchived ? 'text-muted-foreground' : ''

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/30',
        tag.isArchived && 'bg-muted/20'
      )}
    >
      <div className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <TagChip name={tag.name} color={tag.color} className={muted} />
          {tag.isArchived ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Archived
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-[11px] text-muted-foreground">
          {tag.txnCount} {tag.txnCount === 1 ? 'transaction' : 'transactions'}
          {tag.lastUsedLabel ? ` · last used ${tag.lastUsedLabel}` : ' · never used'}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {tag.txnCount > 0 ? (
          <Link
            href={tag.transactionsHref}
            className={buttonVariants({ variant: 'outline', size: 'icon-sm' })}
            aria-label={`View transactions tagged ${tag.name}`}
            title="View transactions"
          >
            <ArrowLeftRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null}
        <Link
          href={tag.editHref}
          className={buttonVariants({ variant: 'outline', size: 'icon-sm' })}
          aria-label={`Edit ${tag.name}`}
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </Link>

        {tag.isArchived ? (
          <form action={archiveTagAction}>
            <input type="hidden" name="tag_id" value={tag.id} />
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
          <ArchiveConfirmButton
            action={archiveTagAction}
            hiddenFields={{
              tag_id: tag.id,
              is_archived: 'true',
              show_archived: showArchived ? 'true' : 'false',
            }}
            triggerLabel="Archive"
            pendingLabel="Archiving…"
            title="Archive this tag?"
            description="Archived tags are hidden from the tag picker, but existing transactions keep the tag. You can restore it anytime."
            cancelLabel="Cancel"
            confirmLabel="Archive"
          />
        )}
      </div>
    </div>
  )
}
