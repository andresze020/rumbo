'use client'

import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/submit-button'
import { ConfirmActionButton } from '@/components/confirm-action-button'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'
import { cn } from '@/lib/utils'
import { archiveNoteAction } from './actions'

export type NoteVM = {
  id: string
  dateLabel: string
  /** Weekday for the date, so a note reads as a day and not just a number. */
  weekdayLabel: string
  title: string
  body: string | null
  color: string | null
  isArchived: boolean
  editHref: string
  /** The day's transactions, so a note about a day can reach that day's ledger. */
  transactionsHref: string
}

export function NoteRow({
  note,
  month,
  showArchived,
  searchQuery,
}: {
  note: NoteVM
  month: string
  showArchived: boolean
  searchQuery: string
}) {
  const ui = useUiTranslation()
  const context = {
    note_id: note.id,
    month,
    show_archived: showArchived ? 'true' : 'false',
    q: searchQuery,
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/30 sm:flex-row sm:items-start sm:gap-3',
        note.isArchived && 'bg-muted/20'
      )}
    >
      <span
        className="mt-1 hidden h-10 w-1.5 shrink-0 rounded-full sm:block"
        style={{ backgroundColor: note.color ?? 'var(--border)' }}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className="size-2 shrink-0 rounded-full sm:hidden"
            style={{ backgroundColor: note.color ?? 'var(--border)' }}
            aria-hidden="true"
          />
          <p className="min-w-0 text-sm font-semibold">{note.title}</p>
          {note.isArchived ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {ui('Archived')}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {note.weekdayLabel} · {note.dateLabel}
        </p>
        {note.body ? (
          <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-muted-foreground">
            {note.body}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Link
          href={note.transactionsHref}
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          That day
        </Link>
        <Link
          href={note.editHref}
          className={buttonVariants({ variant: 'outline', size: 'icon-sm' })}
          aria-label={ui(`Edit ${note.title}`)}
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </Link>

        {note.isArchived ? (
          <form action={archiveNoteAction}>
            {Object.entries({ ...context, is_archived: 'false' }).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <SubmitButton type="submit" size="sm" variant="outline" pendingText="Restoring…">
              Restore
            </SubmitButton>
          </form>
        ) : (
          <ConfirmActionButton
            action={archiveNoteAction}
            hiddenFields={{ ...context, is_archived: 'true' }}
            triggerLabel="Archive"
            pendingLabel="Archiving…"
            title="Archive this note?"
            description="Archived notes are hidden from the list but kept, and nothing in your accounts or reports changes. You can restore it anytime."
            cancelLabel="Cancel"
            confirmLabel="Archive"
          />
        )}
      </div>
    </div>
  )
}
