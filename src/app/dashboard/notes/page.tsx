import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, CalendarRange, Plus, Search } from 'lucide-react'
import { NoteForm } from './note-form'
import { NoteRow, type NoteVM } from './note-row'
import { archiveNoteAction } from './actions'
import { isNoteColor } from './colors'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { ArchiveToast } from '@/components/archive-toast'
import { EmptyState } from '@/components/empty-state'
import { FormDialog } from '@/components/form-dialog'
import { MonthNav } from '@/components/month-nav'
import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { Callout } from '@/components/callout'
import { formatIsoDate, formatMonthLabel, todayIsoDateLocal } from '@/lib/format'
import { getLocale } from '@/lib/i18n/server'
import { translate } from '@/lib/i18n/translate'
import { createUiTranslator } from '@/lib/i18n/ui'
import { cn } from '@/lib/utils'

type NotesPageProps = {
  searchParams: Promise<{
    month?: string
    all?: string
    created?: string
    updated?: string
    archived?: string
    unarchived?: string
    showArchived?: string
    q?: string
    mode?: string
    edit?: string
    error?: string
  }>
}

type NoteRowData = {
  id: string
  note_date: string
  title: string
  body: string | null
  color: string | null
  is_archived: boolean
}

const ISO_MONTH = /^\d{4}-\d{2}$/

function currentMonthParam() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return {
    from: `${month}-01`,
    to: new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10),
  }
}

function notesPath({
  month,
  all,
  showArchived,
  q,
  mode,
  edit,
}: {
  month?: string
  all?: boolean
  showArchived?: boolean
  q?: string
  mode?: 'create'
  edit?: string
} = {}) {
  const params = new URLSearchParams()
  if (month && ISO_MONTH.test(month)) params.set('month', month)
  if (all) params.set('all', 'true')
  if (showArchived) params.set('showArchived', 'true')
  if (q?.trim()) params.set('q', q.trim())
  if (mode) params.set('mode', mode)
  if (edit) params.set('edit', edit)
  const qs = params.toString()
  return `/dashboard/notes${qs ? `?${qs}` : ''}`
}

export default async function NotesPage({ searchParams }: NotesPageProps) {
  const params = await searchParams
  const locale = await getLocale()
  const ui = createUiTranslator(locale)
  const errorMessage = typeof params.error === 'string' ? params.error : null
  const showArchived = params.showArchived === 'true'
  // A search is about finding a note, not about a month — so searching, and the
  // explicit "All months" toggle, both widen the range.
  const searchQuery = typeof params.q === 'string' ? params.q.trim() : ''
  const month = ISO_MONTH.test(params.month ?? '') ? (params.month as string) : currentMonthParam()
  const allMonths = params.all === 'true' || searchQuery !== ''
  const isCreating = params.mode === 'create'
  const editNoteId = typeof params.edit === 'string' && !isCreating ? params.edit : null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.default_household_id) redirect('/onboarding')

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('id, name')
    .eq('id', profile.default_household_id)
    .single()
  if (householdError || !household) redirect('/onboarding')

  let query = supabase
    .from('notes')
    .select('id, note_date, title, body, color, is_archived')
    .eq('household_id', household.id)
    .eq('is_archived', showArchived)
    .order('note_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (!allMonths) {
    const bounds = monthBounds(month)
    query = query.gte('note_date', bounds.from).lte('note_date', bounds.to)
  }

  const { data: noteData, error: notesError } = await query

  // The edited note may sit outside the current range (a different month), so it
  // is fetched on its own rather than looked up in the list.
  const { data: editData } = editNoteId
    ? await supabase
        .from('notes')
        .select('id, note_date, title, body, color, is_archived')
        .eq('id', editNoteId)
        .eq('household_id', household.id)
        .maybeSingle()
    : { data: null }

  const normalizedSearch = searchQuery.toLowerCase()
  const notes = ((noteData ?? []) as NoteRowData[]).filter(
    (note) =>
      !normalizedSearch ||
      note.title.toLowerCase().includes(normalizedSearch) ||
      (note.body ?? '').toLowerCase().includes(normalizedSearch)
  )

  const rows: NoteVM[] = notes.map((note) => ({
    id: note.id,
    dateLabel: formatIsoDate(note.note_date, locale),
    weekdayLabel: formatIsoDate(note.note_date, locale, { weekday: 'long' }),
    title: note.title,
    body: note.body,
    color: isNoteColor(note.color) ? note.color : null,
    isArchived: note.is_archived,
    editHref: notesPath({
      month,
      all: params.all === 'true',
      showArchived,
      q: searchQuery,
      edit: note.id,
    }),
    transactionsHref: `/dashboard/transactions?date_from=${note.note_date}&date_to=${note.note_date}`,
  }))

  const selectedEditNote = (editData as NoteRowData | null) ?? null
  const cancelHref = notesPath({
    month,
    all: params.all === 'true',
    showArchived,
    q: searchQuery,
  })
  const createHref = notesPath({
    month,
    all: params.all === 'true',
    showArchived,
    q: searchQuery,
    mode: 'create',
  })
  // A new note defaults to today when today falls in the viewed month, and to the
  // first of that month otherwise — never to a day the user is not looking at.
  const today = todayIsoDateLocal()
  const defaultDate =
    allMonths || today.slice(0, 7) === month ? today : `${month}-01`

  const rangeLabel = allMonths ? 'all months' : formatMonthLabel(month, locale)

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 pb-24 sm:gap-6 sm:p-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <PageHeader
        className="hidden md:flex"
        eyebrow={household.name}
        title="Notes"
        description="Dated reminders and context, kept separate from your transactions."
        actions={
          <>
            {!allMonths ? (
              <MonthNav
                month={month}
                basePath="/dashboard/notes"
                searchParams={showArchived ? { showArchived: 'true' } : undefined}
                previousLabel={translate(locale, 'common.previousMonth')}
                nextLabel={translate(locale, 'common.nextMonth')}
              />
            ) : null}
            <Link href={createHref} className={buttonVariants({ size: 'sm' })}>
              <Plus aria-hidden="true" />
              {ui('New')}
            </Link>
          </>
        }
      />

      <div className="flex items-center gap-2 md:hidden">
        <Link
          href="/dashboard/more"
          className={buttonVariants({ variant: 'outline', size: 'icon' })}
          aria-label={ui('Back to More')}
        >
          <ArrowLeft aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold leading-tight">{ui('Notes')}</h1>
          <p className="truncate text-[11px] text-muted-foreground">{ui('Dated reminders')}</p>
        </div>
        <Link href={createHref} className={buttonVariants({ size: 'sm' })}>
          <Plus aria-hidden="true" />
          {ui('New')}
        </Link>
      </div>

      {!allMonths ? (
        <div className="md:hidden">
          <MonthNav
            month={month}
            basePath="/dashboard/notes"
            searchParams={showArchived ? { showArchived: 'true' } : undefined}
            previousLabel={translate(locale, 'common.previousMonth')}
            nextLabel={translate(locale, 'common.nextMonth')}
          />
        </div>
      ) : null}

      <ArchiveToast
        action={archiveNoteAction}
        idField="note_id"
        archivedMessage="Note archived."
        restoredMessage="Note restored."
        undoLabel="Undo"
      />

      {/* ── Notifications ──────────────────────────────────────────────── */}
      {errorMessage ? <Callout variant="error">{errorMessage}</Callout> : null}
      {params.created === '1' ? <Callout variant="success">{ui('Note saved.')}</Callout> : null}
      {params.updated === '1' ? <Callout variant="success">{ui('Note updated.')}</Callout> : null}

      {/* ── Dialogs ────────────────────────────────────────────────────── */}
      {isCreating ? (
        <FormDialog
          title="New note"
          description="A note about a day. Nothing here touches your accounts, balances or reports."
          cancelHref={cancelHref}
        >
          <NoteForm
            mode="create"
            defaultDate={defaultDate}
            month={month}
            showArchived={showArchived}
            searchQuery={searchQuery}
            cancelHref={cancelHref}
          />
        </FormDialog>
      ) : null}

      {selectedEditNote ? (
        <FormDialog
          title="Edit note"
          description={`Update ${selectedEditNote.title}.`}
          cancelHref={cancelHref}
        >
          <NoteForm
            mode="edit"
            note={{
              id: selectedEditNote.id,
              noteDate: selectedEditNote.note_date,
              title: selectedEditNote.title,
              body: selectedEditNote.body,
              color: isNoteColor(selectedEditNote.color) ? selectedEditNote.color : null,
            }}
            defaultDate={defaultDate}
            month={month}
            showArchived={showArchived}
            searchQuery={searchQuery}
            cancelHref={cancelHref}
          />
        </FormDialog>
      ) : null}

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form action="/dashboard/notes" className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-sm">
          {showArchived ? <input type="hidden" name="showArchived" value="true" /> : null}
          <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-background px-3">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              name="q"
              defaultValue={searchQuery}
              placeholder={ui('Search notes...')}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <button
            type="submit"
            aria-label={ui('Search notes')}
            className={buttonVariants({ variant: 'outline', size: 'icon' })}
          >
            <Search aria-hidden="true" />
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Link
            href={notesPath({
              month,
              all: !allMonths,
              showArchived,
            })}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {ui(allMonths ? 'One month at a time' : 'All months')}
          </Link>
          <Link
            href={notesPath({
              month,
              all: params.all === 'true',
              showArchived: !showArchived,
              q: searchQuery,
            })}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {ui(showArchived ? 'Hide archived' : 'Show archived')}
          </Link>
        </div>
      </div>

      {/* ── Note list ──────────────────────────────────────────────────── */}
      {notesError ? (
        <Callout variant="error">{ui('Could not load notes. Try refreshing.')}</Callout>
      ) : rows.length ? (
        <>
          <p className="text-[11px] text-muted-foreground">
            {rows.length === 1 ? '1 note' : `${rows.length} notes`} · {rangeLabel}
          </p>
          <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
            {rows.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                month={month}
                showArchived={showArchived}
                searchQuery={searchQuery}
              />
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          title={
            showArchived
              ? 'No archived notes'
              : searchQuery
              ? 'No notes match this search'
              : allMonths
              ? 'No notes yet'
              : 'No notes this month'
          }
          description={
            showArchived
              ? 'Archived notes will appear here after you archive one.'
              : searchQuery
              ? 'Try another search term, or clear it to browse by month.'
              : 'Write down what happened on a day, or what needs to. Notes are yours alone — they never affect balances, budgets or reports.'
          }
          actionHref={showArchived ? notesPath({ month, q: searchQuery }) : createHref}
          actionLabel={showArchived ? 'Hide archived' : 'New note'}
        />
      )}

      {/* ── Cross-link ─────────────────────────────────────────────────── */}
      <Link
        href={`/dashboard/calendar?month=${month}`}
        className={cn(
          'flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm shadow-black/[0.03] transition-colors hover:bg-muted/40'
        )}
      >
        <span
          className="flex size-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400"
          aria-hidden="true"
        >
          <CalendarRange className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Calendar</p>
          <p className="text-xs text-muted-foreground">
            See what you actually spent, day by day, for the same month.
          </p>
        </div>
      </Link>
    </main>
  )
}
