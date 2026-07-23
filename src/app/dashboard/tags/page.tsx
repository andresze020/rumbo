import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Plus, Search, Tags } from 'lucide-react'
import { TagForm } from './tag-form'
import { TagRow, type TagVM } from './tag-row'
import { archiveTagAction } from './actions'
import { isTagColor } from './colors'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { ArchiveToast } from '@/components/archive-toast'
import { EmptyState } from '@/components/empty-state'
import { FormDialog } from '@/components/form-dialog'
import { MetricCard } from '@/components/metric-card'
import { PageHeader } from '@/components/page-header'
import { InfoTooltip } from '@/components/info-tooltip'
import { Callout } from '@/components/callout'
import { cn } from '@/lib/utils'

type TagsPageProps = {
  searchParams: Promise<{
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

type TagStatsRow = {
  id: string
  name: string
  color: string | null
  is_archived: boolean
  txn_count: number | string
  last_txn_date: string | null
  created_at: string
}

function tagsPath({
  showArchived,
  q,
  mode,
  edit,
}: {
  showArchived?: boolean
  q?: string
  mode?: 'create'
  edit?: string
} = {}) {
  const params = new URLSearchParams()
  if (showArchived) params.set('showArchived', 'true')
  if (q?.trim()) params.set('q', q.trim())
  if (mode) params.set('mode', mode)
  if (edit) params.set('edit', edit)
  const qs = params.toString()
  return `/dashboard/tags${qs ? `?${qs}` : ''}`
}

/** Short, locale-stable "last used" date (matches lib/format's en-CA base). */
function formatLastUsed(date: string | null) {
  if (!date) return null
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default async function TagsPage({ searchParams }: TagsPageProps) {
  const params = await searchParams
  const errorMessage = typeof params.error === 'string' ? params.error : null
  const showArchived = params.showArchived === 'true'
  const searchQuery = typeof params.q === 'string' ? params.q.trim() : ''
  const normalizedSearch = searchQuery.toLowerCase()
  const isCreating = params.mode === 'create'
  const editTagId =
    typeof params.edit === 'string' && !isCreating ? params.edit : null

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

  const { data: statsData, error: tagsError } = await supabase.rpc(
    'get_tags_with_stats',
    { p_household_id: household.id }
  )

  const allTags = ((statsData ?? []) as TagStatsRow[])
    .map((row) => ({
      id: row.id,
      name: row.name,
      color: isTagColor(row.color) ? row.color : null,
      isArchived: row.is_archived,
      txnCount: Number(row.txn_count ?? 0),
      lastTxnDate: row.last_txn_date,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const activeTags = allTags.filter((tag) => !tag.isArchived)
  const archivedCount = allTags.length - activeTags.length
  const totalTagged = activeTags.reduce((sum, tag) => sum + tag.txnCount, 0)
  const unusedCount = activeTags.filter((tag) => tag.txnCount === 0).length

  const displayTags = (showArchived
    ? allTags.filter((tag) => tag.isArchived)
    : activeTags
  ).filter((tag) => !normalizedSearch || tag.name.toLowerCase().includes(normalizedSearch))

  const rows: TagVM[] = displayTags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    isArchived: tag.isArchived,
    txnCount: tag.txnCount,
    lastUsedLabel: formatLastUsed(tag.lastTxnDate),
    editHref: tagsPath({ showArchived, q: searchQuery, edit: tag.id }),
    transactionsHref: `/dashboard/transactions?tag_id=${tag.id}`,
  }))

  const selectedEditTag = allTags.find((tag) => tag.id === editTagId) ?? null
  const cancelHref = tagsPath({ showArchived, q: searchQuery })

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:gap-6 sm:p-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <PageHeader
        className="hidden md:flex"
        eyebrow={household.name}
        title={
          <span className="flex items-center gap-1.5">
            Tags
            <InfoTooltip
              label="Tags"
              text="Free-form labels you can attach to any transaction (e.g. vacation-2026, reimbursable). Unlike categories, a transaction can carry several, and tags never affect reports or budgets."
            />
          </span>
        }
        description="Maintain the labels used to slice transactions across categories."
        actions={
          <>
            <Link
              href={tagsPath({ showArchived, q: searchQuery, mode: 'create' })}
              className={buttonVariants({ size: 'sm' })}
            >
              <Plus aria-hidden="true" />
              New
            </Link>
            <Link
              href={tagsPath({ showArchived: !showArchived, q: searchQuery })}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {showArchived ? 'Hide archived' : 'Show archived'}
            </Link>
          </>
        }
      />

      <div className="flex items-center gap-2 md:hidden">
        <Link
          href="/dashboard/more"
          className={buttonVariants({ variant: 'outline', size: 'icon' })}
          aria-label="Back to More"
        >
          <ArrowLeft aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold leading-tight">Tags</h1>
          <p className="truncate text-[11px] text-muted-foreground">Transaction labels</p>
        </div>
        <Link
          href={tagsPath({ showArchived, q: searchQuery, mode: 'create' })}
          className={buttonVariants({ size: 'sm' })}
        >
          <Plus aria-hidden="true" />
          New
        </Link>
      </div>

      <ArchiveToast
        action={archiveTagAction}
        idField="tag_id"
        archivedMessage="Tag archived."
        restoredMessage="Tag restored."
        undoLabel="Undo"
      />

      {/* ── Notifications ──────────────────────────────────────────────── */}
      {errorMessage ? <Callout variant="error">{errorMessage}</Callout> : null}
      {params.created === '1' ? <Callout variant="success">Tag created.</Callout> : null}
      {params.updated === '1' ? <Callout variant="success">Tag updated.</Callout> : null}

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div className="hidden gap-4 md:grid sm:grid-cols-3">
        <MetricCard
          label="Active tags"
          value={String(activeTags.length)}
          description={`${archivedCount} archived`}
          icon={<Tags />}
          accent="bg-primary/10 text-primary"
        />
        <MetricCard
          label="Tagged transactions"
          value={String(totalTagged)}
          description="Links across active tags"
          icon={<Tags />}
          accent="bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400"
        />
        <MetricCard
          label="Unused tags"
          value={String(unusedCount)}
          description="Not on any transaction"
          icon={<Tags />}
          accent="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
        />
      </div>

      {/* ── Dialogs ────────────────────────────────────────────────────── */}
      {isCreating ? (
        <FormDialog
          title="New tag"
          description="Add a tag to this household."
          cancelHref={cancelHref}
        >
          <TagForm mode="create" showArchived={showArchived} cancelHref={cancelHref} />
        </FormDialog>
      ) : null}

      {selectedEditTag ? (
        <FormDialog
          title="Edit tag"
          description={`Update ${selectedEditTag.name}.`}
          cancelHref={cancelHref}
        >
          <TagForm
            mode="edit"
            tag={{
              id: selectedEditTag.id,
              name: selectedEditTag.name,
              color: selectedEditTag.color,
            }}
            showArchived={showArchived}
            cancelHref={cancelHref}
          />
        </FormDialog>
      ) : null}

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form action="/dashboard/tags" className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-sm">
          {showArchived ? <input type="hidden" name="showArchived" value="true" /> : null}
          <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-background px-3">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              name="q"
              defaultValue={searchQuery}
              placeholder="Search tags..."
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <button
            type="submit"
            aria-label="Search tags"
            className={buttonVariants({ variant: 'outline', size: 'icon' })}
          >
            <Search aria-hidden="true" />
          </button>
        </form>

        <Link
          href={tagsPath({ showArchived: !showArchived, q: searchQuery })}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'hidden sm:ml-auto md:inline-flex')}
        >
          {showArchived ? 'Hide archived' : 'Show archived'}
        </Link>
      </div>

      {/* ── Tag list ───────────────────────────────────────────────────── */}
      {tagsError ? (
        <Callout variant="error">Could not load tags. Try refreshing.</Callout>
      ) : rows.length ? (
        <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
          {rows.map((tag) => (
            <TagRow key={tag.id} tag={tag} showArchived={showArchived} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            showArchived
              ? 'No archived tags'
              : searchQuery
              ? 'No tags match this search'
              : 'No tags yet'
          }
          description={
            showArchived
              ? 'Archived tags will appear here after you archive one.'
              : searchQuery
              ? 'Try another search term or clear the filter.'
              : 'Create a tag, then attach it to transactions from the add or edit form.'
          }
          actionHref={
            showArchived
              ? tagsPath({ q: searchQuery })
              : tagsPath({ showArchived, q: searchQuery, mode: 'create' })
          }
          actionLabel={showArchived ? 'Hide archived' : 'New tag'}
        />
      )}
    </main>
  )
}
