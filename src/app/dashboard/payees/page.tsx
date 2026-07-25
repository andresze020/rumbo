import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, GitMerge, Plus, Search, Store } from 'lucide-react'
import { PayeeForm } from './payee-form'
import { PayeeMergeForm } from './payee-merge-form'
import { PayeeRow, type PayeeVM } from './payee-row'
import { archivePayeeAction } from './actions'
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
import { formatIsoDate } from '@/lib/format'
import { getLocale } from '@/lib/i18n/server'

type PayeesPageProps = {
  searchParams: Promise<{
    created?: string
    updated?: string
    archived?: string
    unarchived?: string
    merged?: string
    showArchived?: string
    q?: string
    mode?: string
    edit?: string
    merge?: string
    error?: string
  }>
}

type PayeeStatsRow = {
  id: string
  name: string
  is_archived: boolean
  txn_count: number | string
  last_txn_date: string | null
  created_at: string
}

function payeesPath({
  showArchived,
  q,
  mode,
  edit,
  merge,
}: {
  showArchived?: boolean
  q?: string
  mode?: 'create' | 'bulk-merge'
  edit?: string
  merge?: string
} = {}) {
  const params = new URLSearchParams()
  if (showArchived) params.set('showArchived', 'true')
  if (q?.trim()) params.set('q', q.trim())
  if (mode) params.set('mode', mode)
  if (edit) params.set('edit', edit)
  if (merge) params.set('merge', merge)
  const qs = params.toString()
  return `/dashboard/payees${qs ? `?${qs}` : ''}`
}

/** Short, locale-stable "last used" date (matches lib/format's en-CA base). */
export default async function PayeesPage({ searchParams }: PayeesPageProps) {
  const params = await searchParams
  const locale = await getLocale()
  const errorMessage = typeof params.error === 'string' ? params.error : null
  const showArchived = params.showArchived === 'true'
  const searchQuery = typeof params.q === 'string' ? params.q.trim() : ''
  const normalizedSearch = searchQuery.toLowerCase()
  const isCreating = params.mode === 'create'
  const isBulkMerging = params.mode === 'bulk-merge'
  const editPayeeId =
    typeof params.edit === 'string' && !isCreating && !isBulkMerging ? params.edit : null
  const mergePayeeId =
    typeof params.merge === 'string' && !isCreating && !isBulkMerging && !editPayeeId
      ? params.merge
      : null

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

  const { data: statsData, error: payeesError } = await supabase.rpc(
    'get_payees_with_stats',
    { p_household_id: household.id }
  )

  const allPayees = ((statsData ?? []) as PayeeStatsRow[])
    .map((row) => ({
      id: row.id,
      name: row.name,
      isArchived: row.is_archived,
      txnCount: Number(row.txn_count ?? 0),
      lastTxnDate: row.last_txn_date,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const activePayees = allPayees.filter((p) => !p.isArchived)
  const archivedCount = allPayees.length - activePayees.length
  const totalLinked = activePayees.reduce((sum, p) => sum + p.txnCount, 0)
  const unusedCount = activePayees.filter((p) => p.txnCount === 0).length

  const displayPayees = (showArchived
    ? allPayees.filter((p) => p.isArchived)
    : activePayees
  ).filter((p) => !normalizedSearch || p.name.toLowerCase().includes(normalizedSearch))

  const rows: PayeeVM[] = displayPayees.map((p) => ({
    id: p.id,
    name: p.name,
    isArchived: p.isArchived,
    txnCount: p.txnCount,
    lastUsedLabel: p.lastTxnDate ? formatIsoDate(p.lastTxnDate, locale) : null,
    editHref: payeesPath({ showArchived, q: searchQuery, edit: p.id }),
    mergeHref: payeesPath({ showArchived, q: searchQuery, merge: p.id }),
    transactionsHref: `/dashboard/transactions?payee_id=${p.id}`,
  }))

  const selectedEditPayee = allPayees.find((p) => p.id === editPayeeId) ?? null
  const selectedMergePayee =
    allPayees.find((p) => p.id === mergePayeeId && !p.isArchived) ?? null
  const mergeTargets = selectedMergePayee
    ? activePayees
        .filter((p) => p.id !== selectedMergePayee.id)
        .map((p) => ({ id: p.id, name: p.name, txnCount: p.txnCount }))
    : []

  const cancelHref = payeesPath({ showArchived, q: searchQuery })

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:gap-6 sm:p-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <PageHeader
        className="hidden md:flex"
        eyebrow={household.name}
        title={
          <span className="flex items-center gap-1.5">
            Payees
            <InfoTooltip
              label="Payees"
              text="The merchants and people you transact with. Rename to tidy them up, or merge duplicates that the import created."
            />
          </span>
        }
        description="Maintain the list of payees used by the transaction form's merchant picker."
        actions={
          <>
            <Link
              href={payeesPath({ showArchived, q: searchQuery, mode: 'create' })}
              className={buttonVariants({ size: 'sm' })}
            >
              <Plus aria-hidden="true" />
              New
            </Link>
            <Link
              href={payeesPath({ showArchived, q: searchQuery, mode: 'bulk-merge' })}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <GitMerge aria-hidden="true" />
              Merge duplicates
            </Link>
            <Link
              href={payeesPath({ showArchived: !showArchived, q: searchQuery })}
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
          <h1 className="truncate text-[15px] font-bold leading-tight">Payees</h1>
          <p className="truncate text-[11px] text-muted-foreground">Merchant list</p>
        </div>
        <Link
          href={payeesPath({ showArchived, q: searchQuery, mode: 'create' })}
          className={buttonVariants({ size: 'sm' })}
        >
          <Plus aria-hidden="true" />
          New
        </Link>
      </div>

      <ArchiveToast
        action={archivePayeeAction}
        idField="payee_id"
        archivedMessage="Payee archived."
        restoredMessage="Payee restored."
        undoLabel="Undo"
      />

      {/* ── Notifications ──────────────────────────────────────────────── */}
      {errorMessage ? <Callout variant="error">{errorMessage}</Callout> : null}
      {params.created === '1' ? <Callout variant="success">Payee created.</Callout> : null}
      {params.updated === '1' ? <Callout variant="success">Payee updated.</Callout> : null}
      {params.merged !== undefined ? (
        <Callout variant="success">
          Payees merged — {params.merged} transaction
          {params.merged === '1' ? '' : 's'} moved.
        </Callout>
      ) : null}

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div className="hidden gap-4 md:grid sm:grid-cols-3">
        <MetricCard
          label="Active payees"
          value={String(activePayees.length)}
          description={`${archivedCount} archived`}
          icon={<Store />}
          accent="bg-primary/10 text-primary"
        />
        <MetricCard
          label="Linked transactions"
          value={String(totalLinked)}
          description="Across active payees"
          icon={<Store />}
          accent="bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400"
        />
        <MetricCard
          label="Unused payees"
          value={String(unusedCount)}
          description="No transactions yet"
          icon={<Store />}
          accent="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
        />
      </div>

      {/* ── Dialogs ────────────────────────────────────────────────────── */}
      {isCreating ? (
        <FormDialog
          title="New payee"
          description="Add a payee to this household."
          cancelHref={cancelHref}
        >
          <PayeeForm mode="create" showArchived={showArchived} cancelHref={cancelHref} />
        </FormDialog>
      ) : null}

      {selectedEditPayee ? (
        <FormDialog
          title="Rename payee"
          description={`Update ${selectedEditPayee.name}.`}
          cancelHref={cancelHref}
        >
          <PayeeForm
            mode="edit"
            payee={{ id: selectedEditPayee.id, name: selectedEditPayee.name }}
            showArchived={showArchived}
            cancelHref={cancelHref}
          />
        </FormDialog>
      ) : null}

      {selectedMergePayee ? (
        <FormDialog
          title={`Merge ${selectedMergePayee.name}`}
          description="Combine duplicate payees into a single one."
          cancelHref={cancelHref}
        >
          <PayeeMergeForm
            source={{
              id: selectedMergePayee.id,
              name: selectedMergePayee.name,
              txnCount: selectedMergePayee.txnCount,
            }}
            targets={mergeTargets}
            showArchived={showArchived}
            cancelHref={cancelHref}
          />
        </FormDialog>
      ) : null}

      {isBulkMerging ? (
        <FormDialog
          title="Merge duplicate payees"
          description="Select several duplicates and combine them into one surviving payee."
          cancelHref={cancelHref}
        >
          <PayeeMergeForm
            sources={activePayees.map((p) => ({
              id: p.id,
              name: p.name,
              txnCount: p.txnCount,
            }))}
            targets={activePayees.map((p) => ({
              id: p.id,
              name: p.name,
              txnCount: p.txnCount,
            }))}
            showArchived={showArchived}
            cancelHref={cancelHref}
            bulk
          />
        </FormDialog>
      ) : null}

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form action="/dashboard/payees" className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-sm">
          {showArchived ? <input type="hidden" name="showArchived" value="true" /> : null}
          <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-background px-3">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              name="q"
              defaultValue={searchQuery}
              placeholder="Search payees..."
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <button
            type="submit"
            aria-label="Search payees"
            className={buttonVariants({ variant: 'outline', size: 'icon' })}
          >
            <Search aria-hidden="true" />
          </button>
        </form>

        <Link
          href={payeesPath({ showArchived, q: searchQuery, mode: 'bulk-merge' })}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'sm:ml-auto')}
        >
          <GitMerge aria-hidden="true" />
          Merge duplicates
        </Link>
        <Link
          href={payeesPath({ showArchived: !showArchived, q: searchQuery })}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'hidden md:inline-flex')}
        >
          {showArchived ? 'Hide archived' : 'Show archived'}
        </Link>
      </div>

      {/* ── Payee list ─────────────────────────────────────────────────── */}
      {payeesError ? (
        <Callout variant="error">Could not load payees. Try refreshing.</Callout>
      ) : rows.length ? (
        <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
          {rows.map((payee) => (
            <PayeeRow key={payee.id} payee={payee} showArchived={showArchived} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            showArchived
              ? 'No archived payees'
              : searchQuery
              ? 'No payees match this search'
              : 'No payees yet'
          }
          description={
            showArchived
              ? 'Archived payees will appear here after you archive one.'
              : searchQuery
              ? 'Try another search term or clear the filter.'
              : 'Payees are created automatically as you add transactions, or add one here.'
          }
          actionHref={
            showArchived
              ? payeesPath({ q: searchQuery })
              : payeesPath({ showArchived, q: searchQuery, mode: 'create' })
          }
          actionLabel={showArchived ? 'Hide archived' : 'New payee'}
        />
      )}
    </main>
  )
}
