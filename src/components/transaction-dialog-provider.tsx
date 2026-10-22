'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TransactionForm } from '@/app/dashboard/transactions/transaction-form'
import type { TransactionCopyPayload } from '@/app/dashboard/transactions/transaction-list'
import {
  getQuickAddFormData,
  type QuickAddFormData,
} from '@/app/dashboard/quick-add-actions'
import { X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'
import { useBackDismiss } from '@/lib/use-back-dismiss'
import { EntryTimingReadout } from '@/components/entry-timing-readout'
import {
  isEntryTimingEnabled,
  recordEntrySample,
  setEntryTimingEnabled,
  type EntryEvent,
  type EntryVariant,
} from '@/lib/perf/entry-timing'
import { useSoftKeyboardInset } from '@/lib/use-soft-keyboard'
import { todayIsoDateLocal } from '@/lib/format'

type TransactionType = 'income' | 'expense'
type OpenDialogType = 'income' | 'expense' | 'transfer'

type AddNextDefaults = {
  date: string
  type?: TransactionType
  accountId?: string
  status?: string
  categoryId?: string
  payeeName?: string
  tagIds?: string[]
}

/** The `next_*` params `createManualTransactionAction` sends back for a batch. */
const ADD_NEXT_PARAMS = [
  'next_date',
  'next_type',
  'next_account',
  'next_status',
  'next_category',
  'next_payee',
  'next_tags',
  'next_seq',
] as const

type OpenDialogOptions = {
  accountId?: string
  type?: OpenDialogType
  /** BR-028: prefill the description (e.g. text received from a PWA share). */
  description?: string
  /** BR-034: prefill the whole form from an existing transaction. */
  copy?: TransactionCopyPayload
}

type TransactionDialogContextValue = {
  openDialog: (options?: OpenDialogOptions) => void
}

const TransactionDialogContext = createContext<TransactionDialogContextValue | null>(null)

// The viewer's calendar day, not UTC — this seeds the form's date field, which
// BR-033's "Today" chip must agree with. See `todayIsoDateLocal`.
function todayIsoDate() {
  return todayIsoDateLocal()
}

/**
 * Scroll whatever field is being typed into back into view once the keyboard
 * is up.
 *
 * Lifting the sheet above the keyboard leaves very little sheet, and the
 * browser's own "scroll the focused input into view" runs before the sheet has
 * been resized and lands in the wrong place, so redo it against the final
 * geometry.
 */
function useKeepFocusedFieldVisible(keyboardOpen: boolean) {
  useEffect(() => {
    if (!keyboardOpen) return

    const reveal = () => {
      const active = document.activeElement
      if (!(active instanceof HTMLElement)) return
      if (!active.matches('input, select, textarea')) return

      // Only when the field is actually out of the way. Scrolling a field that
      // is already on screen is what made a deliberate scroll snap back: the
      // user drags, this fires, and the page yanks itself home.
      const rect = active.getBoundingClientRect()
      const visibleBottom = window.visualViewport
        ? window.visualViewport.height
        : window.innerHeight
      if (rect.top >= 0 && rect.bottom <= visibleBottom) return

      // Top, not centre. Centring was there to keep the field clear of the
      // sticky action bar, which now hides itself while the keyboard is up —
      // and centring spent the whole sheet on the one field you are already
      // looking at. Anchoring it to the top spends the rest on the fields that
      // come *after* it, which is what you need to see next.
      active.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }

    // The sheet resizes a frame or two behind the keyboard animation; wait for
    // the new height before deciding where the top is.
    const timer = window.setTimeout(reveal, 150)
    // Moving between fields while the keyboard is already up does not reopen
    // it, so this effect would not re-run on its own.
    document.addEventListener('focusin', reveal)

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('focusin', reveal)
    }
    // Deliberately the *boolean*, not the pixel inset. Scrolling with the
    // keyboard up hides and shows the browser's URL bar, which changes
    // `window.innerHeight` and so the measured inset — and keying this effect
    // on that number meant every one of those wobbles re-ran it and dragged the
    // page back to the focused field mid-scroll. Only opening the keyboard
    // should reveal anything; the guard above handles the rest.
  }, [keyboardOpen])
}

/**
 * Params that describe *this* navigation rather than the view behind the
 * dialog: a toast to show, a dialog to reopen, a share payload to consume.
 * Everything else — the transactions screen's filters, above all — has to
 * survive the round trip, or creating a transaction silently drops the filters
 * the user was working in.
 */
const TRANSIENT_RETURN_PARAMS = [
  'created',
  'updated',
  'voided',
  'unvoided',
  'undo_id',
  'error',
  'edit',
  'mode',
  'page',
  'quick_add',
  'share_title',
  'share_text',
  'share_url',
  ...ADD_NEXT_PARAMS,
] as const

/** The current view as a URL the server action can redirect back to. */
function buildReturnTo(pathname: string, searchParams: URLSearchParams) {
  const kept = new URLSearchParams(searchParams.toString())
  for (const key of TRANSIENT_RETURN_PARAMS) kept.delete(key)
  const query = kept.toString()
  return query ? `${pathname}?${query}` : pathname
}

function readQuickAddType(searchParams: URLSearchParams): OpenDialogType | null {
  const type = searchParams.get('quick_add')
  return type === 'income' || type === 'expense' || type === 'transfer' ? type : null
}

/**
 * BR-028: builds a description prefill from a PWA Web Share Target GET request.
 * The manifest maps the OS share sheet's title/text/url onto the
 * `share_title`/`share_text`/`share_url` query params; we fold them into a
 * single description string (preferring the text, appending the URL when it
 * isn't already contained in it). Returns null when no share params are present.
 */
function readSharedDescription(searchParams: URLSearchParams): string | null {
  const title = searchParams.get('share_title')?.trim()
  const text = searchParams.get('share_text')?.trim()
  const url = searchParams.get('share_url')?.trim()
  if (!title && !text && !url) return null

  const base = text || title || ''
  const description = url && !base.includes(url) ? `${base ? `${base} ` : ''}${url}` : base
  // Descriptions are short single-line labels; keep the shared payload bounded.
  return description.slice(0, 200)
}

function readAddNextDefaults(searchParams: URLSearchParams): AddNextDefaults | null {
  const nextDate = searchParams.get('next_date')
  const nextType = searchParams.get('next_type')
  const nextAccount = searchParams.get('next_account')
  const nextStatus = searchParams.get('next_status')
  const nextSeq = searchParams.get('next_seq')

  if (!nextDate && !nextType && !nextAccount && !nextSeq) return null

  const type = nextType === 'income' || nextType === 'expense' ? nextType : undefined
  const tagIds = (searchParams.get('next_tags') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  return {
    date: nextDate ?? todayIsoDate(),
    type,
    accountId: nextAccount ?? undefined,
    status: nextStatus ?? undefined,
    categoryId: searchParams.get('next_category') ?? undefined,
    payeeName: searchParams.get('next_payee') ?? undefined,
    tagIds: tagIds.length > 0 ? tagIds : undefined,
  }
}

/**
 * Strip one-shot flags (`created`, `next_*`) from the address bar without a
 * server round trip.
 *
 * For screens whose server render does not read these flags (Transactions):
 * there a `router.replace()` was a full navigation, and after every "Save &
 * Add Next" the list was rendered on the server twice more (once for the
 * toast's cleanup, once for the dialog's) while the next entry was being
 * typed. See `stripOneShotFlags` for the screens that do read them. The App Router integrates `history.replaceState`, so
 * `useSearchParams` still sees the cleaned URL. `history.state` is passed
 * through so the router's entry, and `useBackDismiss`'s overlay marker on it,
 * survive.
 */
/**
 * Writes one entry-timing sample once the browser has painted (two frames).
 *
 * Deliberately not cancelled by the effect that schedules it. Landing a save
 * re-renders the provider straight away — the toast strips `created=1` from
 * the URL in the very next frame — and an effect cleanup that cancelled the
 * pending frame threw every `save` sample away (first device run, 2026-10-22:
 * only `open.cold` was ever recorded). The timer was already taken off its
 * ref, so letting the frame run cannot record a sample twice.
 */
function recordAfterPaint(
  event: EntryEvent,
  timer: { start: number; variant: EntryVariant }
) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() =>
      recordEntrySample(event, timer.variant, performance.now() - timer.start)
    )
  })
}

export function replaceUrlInPlace(href: string) {
  window.history.replaceState(window.history.state, '', href)
}

/**
 * What the first open shows while the form's lists load (T1 of the premium
 * entry sprint). It used to be one line of grey text, "Loading form…", on an
 * otherwise empty full-screen sheet — in the 2026-10-14 recording it sat
 * there for several seconds and read as a blank screen. This is the form's
 * own outline instead: type switch, the large amount, the field rows and the
 * action bar at the bottom edge, so the eye lands where the amount will be.
 *
 * Nothing in it is interactive. Typing before the lists arrive was considered
 * and left out: the amount's currency comes from the account, and the account
 * is exactly what has not loaded yet.
 */
function TransactionFormSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-1 flex-col gap-3">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="flex flex-1 flex-col gap-3">
        {/* Type switch */}
        <div className="h-11 w-full animate-pulse rounded-2xl bg-muted" />
        {/* Amount card */}
        <div className="space-y-3 rounded-2xl border p-3">
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          <div className="h-14 w-full animate-pulse rounded-xl bg-muted/70" />
        </div>
        {/* Date chips + field rows, one card like the form's own list */}
        <div className="rounded-2xl border px-3">
          <div className="flex gap-2 py-3">
            {[0, 1, 2].map((chip) => (
              <div key={chip} className="h-10 flex-1 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="flex h-11 items-center gap-3 border-t">
              <div className="size-4 shrink-0 animate-pulse rounded bg-muted" />
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              <div className="ml-auto h-3 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="hidden max-sm:block max-sm:flex-1" />
        <div className="h-11 w-full animate-pulse rounded-xl bg-muted sm:h-9 sm:w-48" />
      </div>
    </div>
  )
}

export function TransactionDialogProvider({
  children,
  householdId,
}: {
  children: ReactNode
  /** The active household; cached form data from any other one is ignored. */
  householdId: string | null
}) {
  const pathname = usePathname()
  const router = useRouter()

  /**
   * Strips `created` / `next_*` once they have done their job. On
   * Transactions that is a plain history update (`replaceUrlInPlace`): no
   * part of that page reads the flags on the server, so a navigation there
   * only re-rendered the list for nothing. Accounts, Debts and the assistant
   * do read `created=1` server-side (their own "… created" banners), so there
   * the cleanup stays a real navigation, which also takes the banner away.
   */
  function stripOneShotFlags(href: string) {
    if (pathname === '/dashboard/transactions') replaceUrlInPlace(href)
    else router.replace(href)
  }
  const searchParams = useSearchParams()
  const { t } = useLanguage()
  const ui = useUiTranslation()
  const keyboardInset = useSoftKeyboardInset()
  useKeepFocusedFieldVisible(keyboardInset > 0)

  // Read pending "Save and Add Next" defaults straight from the URL on first
  // render so a freshly mounted provider (e.g. after a server-action redirect
  // remounts this layout) opens pre-filled instead of starting empty.
  const [open, setOpen] = useState(() => readAddNextDefaults(searchParams) !== null)
  const [formData, setFormData] = useState<QuickAddFormData | null>(null)
  // Mirrors `formData` for `refreshFormData`, which must see the latest value
  // from inside an async call started by an earlier render.
  const formDataRef = useRef<QuickAddFormData | null>(null)
  const formFetchInFlight = useRef(false)
  // A background refresh is running (the form may already be on screen).
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(() => readAddNextDefaults(searchParams) !== null)
  const [loadError, setLoadError] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [addNextDefaults, setAddNextDefaults] = useState<AddNextDefaults | null>(() =>
    readAddNextDefaults(searchParams)
  )
  const [triggerAccountId, setTriggerAccountId] = useState<string | undefined>()
  const [triggerType, setTriggerType] = useState<OpenDialogType | undefined>()
  // BR-028: description prefilled from a PWA share (persists across the
  // getQuickAddFormData load + URL cleanup that follow the share redirect).
  const [sharedDescription, setSharedDescription] = useState<string | undefined>()
  // BR-034: the source transaction a "Copy" is seeded from.
  const [copyDefaults, setCopyDefaults] = useState<TransactionCopyPayload | undefined>()

  // T4 entry timing (opt-in, `?entry_timing=on`; see lib/perf/entry-timing).
  // Only a start time and a variant are held — never anything about the entry.
  const [entryTimingOn, setEntryTimingOn] = useState(false)
  const openTimer = useRef<{ start: number; variant: EntryVariant } | null>(null)
  const saveTimer = useRef<{ start: number; variant: EntryVariant } | null>(null)

  const returnTo = useMemo(
    () => buildReturnTo(pathname, new URLSearchParams(searchParams.toString())),
    [pathname, searchParams]
  )

  /**
   * Seed a new entry from the list you are looking at.
   *
   * Filtering to one account, one category or one payee and then tapping + is
   * a statement of intent — you are about to add something to *that*. Only a
   * filter narrowed to exactly one value counts; two accounts is not a hint,
   * and anything the caller passed to `openDialog` (an account card, a Copy)
   * is more specific and wins.
   *
   * Deliberately not "whatever you entered last time": a category carried in
   * from yesterday's groceries onto today's gas is a miscategorised
   * transaction the user never chose, and this app exists to make the
   * categories mean something.
   */
  const filterDefaults = useMemo(() => {
    if (pathname !== '/dashboard/transactions') return null
    const only = (key: string) => {
      const values = searchParams.getAll(key)
      return values.length === 1 ? values[0] : undefined
    }
    const type = only('type')
    return {
      accountId: only('account_id'),
      categoryId: only('category_id'),
      payeeId: only('payee_id'),
      type:
        type === 'income' || type === 'expense' || type === 'transfer'
          ? (type as OpenDialogType)
          : undefined,
    }
  }, [pathname, searchParams])

  // The type the form will actually open on, needed before render to decide
  // whether a filtered category is compatible with it. `'expense'` mirrors
  // TransactionForm's own fallback.
  // The MQ-009 cache, scoped to the active household: another household's
  // accounts and categories are never shown, not even for the moment before
  // the refetch lands.
  const usableFormData =
    formData && formData.householdId === householdId ? formData : null

  const seededType: OpenDialogType =
    copyDefaults?.type ??
    addNextDefaults?.type ??
    triggerType ??
    filterDefaults?.type ??
    'expense'

  const seededCategoryId =
    copyDefaults?.categoryId ??
    addNextDefaults?.categoryId ??
    usableFormData?.categories.find(
      (category) =>
        category.id === filterDefaults?.categoryId &&
        category.category_type === seededType
    )?.id

  // The filter carries a payee id; the form's combobox works in names.
  const seededPayeeName =
    copyDefaults?.payeeName ??
    addNextDefaults?.payeeName ??
    usableFormData?.payees.find((payee) => payee.id === filterDefaults?.payeeId)?.name

  // An account the form is seeded with (Copy, "Save and add next", a card's
  // Add, a filter) has to be in the lists the form renders: an id the form
  // cannot resolve reads as a base-currency account and would post at an
  // exchange rate of 1. While a refresh may still bring it (cached lists from
  // before it existed), wait for it; once fresh lists lack it, drop the seed.
  const knownAccountIds = new Set(usableFormData?.accounts.map((a) => a.id) ?? [])
  const requestedAccountId =
    copyDefaults?.accountId ??
    addNextDefaults?.accountId ??
    triggerAccountId ??
    filterDefaults?.accountId
  const awaitingSeededAccount =
    refreshing &&
    [requestedAccountId, copyDefaults?.fromAccountId, copyDefaults?.toAccountId].some(
      (id) => id !== undefined && !knownAccountIds.has(id)
    )
  const seededAccount = (id: string | undefined) =>
    id !== undefined && knownAccountIds.has(id) ? id : undefined

  const nextDate = searchParams.get('next_date')
  const nextType = searchParams.get('next_type')
  const nextAccount = searchParams.get('next_account')
  const nextStatus = searchParams.get('next_status')
  const nextSeq = searchParams.get('next_seq')
  const created = searchParams.get('created')
  const hasPendingNext = !!(nextDate || nextType || nextAccount || nextSeq)

  // Tracks which "next_seq" (or fallback key) has already been applied, so a
  // double effect run (Strict Mode, or rapid re-renders) doesn't reprocess
  // the same redirect twice.
  const processedSeqRef = useRef<string | null>(null)

  // After "Save and Add Next", (re)open the dialog pre-filled with the next
  // entry's defaults and refresh the form data. Runs on mount too, so a
  // remounted provider recovers from a redirect that already set the URL params.
  useEffect(() => {
    if (!hasPendingNext) return

    const seqKey = nextSeq ?? `${nextDate}-${nextType}-${nextAccount}-${nextStatus}`
    if (processedSeqRef.current === seqKey) return
    processedSeqRef.current = seqKey

    const frame = window.requestAnimationFrame(() => {
      setAddNextDefaults(readAddNextDefaults(searchParams))
      // The entry just saved may have been a Copy (BR-034) or a share
      // (BR-028). Their amount, description and notes belonged to *that*
      // entry; left in place they were seeded again into the next draft,
      // which is the carried-over amount "Save & Add Next" promises never to
      // make. The add-next params carry everything the next entry keeps.
      setCopyDefaults(undefined)
      setSharedDescription(undefined)
      setFormKey((k) => k + 1)
      setOpen(true)
      setLoading(true)

      // Fully sequence the fetch and the URL cleanup. The cleanup used to be a
      // router.replace(), and starting one while getQuickAddFormData() was
      // still in flight could hang that server action indefinitely, leaving
      // the dialog stuck on "Loading form...". On Transactions it is a plain
      // history update now (`stripOneShotFlags`); elsewhere it still
      // navigates, so the order and the timeout stay: a hang, whatever its
      // cause, still surfaces a "try again" message instead of spinning
      // forever.
      let settled = false
      const timeoutId = window.setTimeout(() => {
        if (settled) return
        settled = true
        setLoadError(true)
        setLoading(false)
        cleanNextParams()
      }, 10000)

      function cleanNextParams() {
        const cleaned = new URLSearchParams(searchParams.toString())
        for (const key of ADD_NEXT_PARAMS) cleaned.delete(key)
        cleaned.delete('created') // prevent the auto-close effect from firing after the URL is cleaned
        const qs = cleaned.toString()
        stripOneShotFlags(qs ? `${pathname}?${qs}` : pathname)
      }

      getQuickAddFormData()
        .then((data) => {
          if (settled) return
          if (data) {
            formDataRef.current = data
            setFormData(data)
            setLoadError(false)
          } else if (!formDataRef.current) {
            setLoadError(true)
          }
        })
        .catch(() => {
          if (!settled) setLoadError(true)
        })
        .finally(() => {
          if (settled) return
          settled = true
          window.clearTimeout(timeoutId)
          setLoading(false)
          cleanNextParams()
        })
    })

    return () => window.cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPendingNext, nextDate, nextType, nextAccount, nextStatus, nextSeq])

  // Auto-close the dialog after the final "Create transaction" in an add-next session.
  useEffect(() => {
    if (created !== '1' || hasPendingNext || !addNextDefaults) return
    const frame = window.requestAnimationFrame(() => {
      setOpen(false)
      setAddNextDefaults(null)
      const cleaned = new URLSearchParams(searchParams.toString())
      cleaned.delete('created')
      const qs = cleaned.toString()
      stripOneShotFlags(qs ? `${pathname}?${qs}` : pathname)
    })

    return () => window.cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [created, hasPendingNext, addNextDefaults])

  // Opens the dialog when landing on a `?quick_add=income|expense|transfer`
  // link (e.g. a PWA manifest shortcut) or a Web Share Target GET (BR-028),
  // then strips the params from the URL.
  const processedQuickAddRef = useRef(false)
  useEffect(() => {
    if (processedQuickAddRef.current) return
    const shared = readSharedDescription(searchParams)
    // A share always lands on the expense quick-add; an explicit quick_add param
    // still wins when both are present.
    const type = readQuickAddType(searchParams) ?? (shared !== null ? 'expense' : null)
    if (!type) return
    processedQuickAddRef.current = true

    openDialog({ type, description: shared ?? undefined })

    const cleaned = new URLSearchParams(searchParams.toString())
    cleaned.delete('quick_add')
    cleaned.delete('share_title')
    cleaned.delete('share_text')
    cleaned.delete('share_url')
    const qs = cleaned.toString()
    // In place: this runs while `openDialog`'s fetch is in flight, which is
    // exactly when a router navigation could stall it (see below).
    replaceUrlInPlace(qs ? `${pathname}?${qs}` : pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The household switcher re-renders this provider in place. If the dialog
  // is open with the previous household's lists, fetch the new household's.
  useEffect(() => {
    if (!open || !formDataRef.current) return
    if (formDataRef.current.householdId === householdId) return
    void refreshFormData()
    // Only a household change should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId])

  async function openDialog(options?: OpenDialogOptions) {
    openTimer.current = {
      start: performance.now(),
      variant: formDataRef.current?.householdId === householdId ? 'warm' : 'cold',
    }
    setTriggerAccountId(options?.accountId)
    setTriggerType(options?.type)
    setSharedDescription(options?.description)
    setCopyDefaults(options?.copy)
    // A copy re-seeds every field, so force a fresh form even when the dialog
    // was already mounted from a previous open.
    setFormKey((key) => key + 1)
    setOpen(true)
    await refreshFormData()
  }

  /**
   * Stale-while-revalidate for the form's reference data (MQ-009).
   *
   * Every open used to block on `getQuickAddFormData()` behind "Loading form…"
   * — about a second on a phone, every time, for accounts and categories that
   * almost never change between two entries. Now only the first open in a
   * session waits. Later opens show the form at once with the last data and
   * refetch underneath; the fresh lists replace the old ones in place (same
   * `formKey`, so nothing typed is lost).
   *
   * BF-011 still holds: the refetch runs on *every* open, so a category created
   * a moment ago on the Categories screen is in the picker as soon as it
   * lands. A failed background refresh keeps the data already on screen.
   */
  async function refreshFormData() {
    if (formFetchInFlight.current) return
    formFetchInFlight.current = true
    // Another household's lists are not a cache for this one: switching
    // households waits for fresh data like a first open.
    const hasCachedData = formDataRef.current?.householdId === householdId
    if (!hasCachedData) {
      setLoading(true)
      setLoadError(false)
    }
    setRefreshing(true)
    try {
      const data = await getQuickAddFormData()
      if (data) {
        formDataRef.current = data
        setFormData(data)
        setLoadError(false)
      } else if (!hasCachedData) {
        setLoadError(true)
      }
    } catch {
      if (!hasCachedData) setLoadError(true)
    } finally {
      formFetchInFlight.current = false
      setLoading(false)
      setRefreshing(false)
    }
  }

  function clearPrefills() {
    setAddNextDefaults(null)
    setSharedDescription(undefined)
    setCopyDefaults(undefined)
  }

  function closeDialog() {
    setOpen(false)
    clearPrefills()
  }

  // `?entry_timing=on|off` switches the timing readout for this device, then
  // leaves the address bar.
  useEffect(() => {
    const requested = searchParams.get('entry_timing')
    if (requested === 'on' || requested === 'off') {
      setEntryTimingEnabled(requested === 'on')
      const cleaned = new URLSearchParams(searchParams.toString())
      cleaned.delete('entry_timing')
      const qs = cleaned.toString()
      replaceUrlInPlace(qs ? `${pathname}?${qs}` : pathname)
    }
    // A frame later, like the provider's other URL-driven state.
    const frame = window.requestAnimationFrame(() => setEntryTimingOn(isEntryTimingEnabled()))
    return () => window.cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('entry_timing')])

  // open: the form is on screen. Recorded after the next paint (two frames),
  // not when React committed it.
  const formOnScreen = open && !!usableFormData && !awaitingSeededAccount
  useEffect(() => {
    if (!formOnScreen || !openTimer.current) return
    const timer = openTimer.current
    openTimer.current = null
    recordAfterPaint('open', timer)
  }, [formOnScreen, formKey])

  // save: the redirect has landed (`created=1`), with the next draft up when
  // it was "Save & Add Next". A submit that never lands (a validation error)
  // leaves a stale timer; anything older than 30 s is dropped, not recorded.
  useEffect(() => {
    if (created !== '1' || !saveTimer.current) return
    const timer = saveTimer.current
    saveTimer.current = null
    if (performance.now() - timer.start > 30_000) return
    recordAfterPaint('save', timer)
    // `searchParams`, not just `created`: a screen that never strips
    // `created=1` would otherwise hide the second save's landing.
  }, [created, searchParams])

  // Back dismisses the entry sheet instead of leaving the screen behind it.
  // A picker sheet opened on top of this one owns its own history entry, so it
  // is always the one Back reaches first.
  useBackDismiss(open, () => {
    closeDialog()
    return false
  })

  return (
    <TransactionDialogContext.Provider value={{ openDialog }}>
      {children}

      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value)
          if (!value) clearPrefills()
        }}
      >
        <DialogContent
          // Own close button: the built-in one is absolutely positioned in the
          // corner, where on a phone it lands on top of the type selector's
          // "Transfer". Ours gets its own row instead (see below).
          showCloseButton={false}
          // Lift the mobile bottom sheet above the on-screen keyboard so its
          // footer buttons stay reachable; no-op on desktop (inset is 0).
          style={
            keyboardInset
              ? { bottom: keyboardInset, maxHeight: `calc(100dvh - ${keyboardInset}px - 0.5rem)` }
              : undefined
          }
          className={
            // Centered dialog on desktop; a full screen on mobile. It used to be
            // a 92dvh bottom sheet, which left a strip of dashboard above it and
            // spent the remaining 8% on nothing — while the form below still had
            // to scroll. A phone entering a transaction is doing one thing, so it
            // gets the whole screen: `h-dvh`, square corners, and the actions
            // pushed to the bottom edge by the spacer inside the form.
            'max-h-[90dvh] overflow-y-auto sm:max-w-xl ' +
            // Flex column on mobile so the form can claim the leftover height
            // and pin its actions to the bottom edge; the desktop grid is
            // untouched.
            'max-sm:flex max-sm:flex-col max-sm:gap-3 ' +
            'max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 ' +
            'max-sm:h-dvh max-sm:max-h-dvh max-sm:rounded-none ' +
            'max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] ' +
            'max-sm:data-open:slide-in-from-bottom-10 max-sm:data-closed:slide-out-to-bottom-10'
          }
        >
          {/* The drag handle was a bottom-sheet affordance, and this is a full
              screen now — nothing to drag it down by, and this X is the way
              out. Desktop never showed the handle. */}

          {/* A row of its own on mobile, not a corner overlay: absolutely
              positioned it sat on top of the type selector and clipped
              "Transfer". On desktop it goes back to the corner, where there is
              a title bar to sit beside and nothing to collide with. */}
          <div className="flex shrink-0 justify-end sm:absolute sm:top-2 sm:right-2 sm:z-10">
            <button
              type="button"
              onClick={closeDialog}
              aria-label={ui('Close')}
              className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground transition-colors active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-7 sm:bg-transparent sm:text-muted-foreground sm:hover:bg-muted"
            >
              <X className="size-5 sm:size-4" aria-hidden="true" />
            </button>
          </div>
          {/* Screen-reader-only on every phone, not just under a keyboard: the
              title and its subtitle spend ~70px describing something the user
              just tapped a button to do, and the segmented control plus the
              AMOUNT label below say it anyway. `sr-only` rather than unmounted,
              so the dialog keeps its accessible name — and `DialogContent`
              draws its own close X, so nothing here is the way out. */}
          <DialogHeader className="max-sm:sr-only">
            <DialogTitle>{t('transactionForm.dialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('transactionForm.dialogDescription')}
            </DialogDescription>
          </DialogHeader>

          {/* Only the very first open waits: later ones render the last data
              while it revalidates (MQ-009, `refreshFormData`). */}
          {(loading && !usableFormData) || awaitingSeededAccount ? (
            <TransactionFormSkeleton label={ui('Loading form…')} />
          ) : loadError && !usableFormData ? (
            <p className="py-4 text-sm text-destructive">
              {ui('Could not load form data. Please refresh and try again.')}
            </p>
          ) : usableFormData ? (
            usableFormData.accounts.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Create an account first before adding transactions.
              </p>
            ) : (
              <div
                className="contents"
                // Starts the T4 save timer. Capture phase, so it runs before the
                // form's own submit handling; `submitter` tells "Save & Add
                // Next" (name="add_next") from a plain create.
                onSubmitCapture={(event) => {
                  const submitter = (event.nativeEvent as SubmitEvent).submitter
                  saveTimer.current = {
                    start: performance.now(),
                    variant: submitter?.getAttribute('name') === 'add_next' ? 'next' : 'close',
                  }
                }}
              >
              <TransactionForm
                key={formKey}
                accounts={usableFormData.accounts}
                baseCurrency={usableFormData.baseCurrency}
                categories={usableFormData.categories}
                payees={usableFormData.payees}
                tags={usableFormData.tags}
                currencies={usableFormData.currencies}
                // A copy is always dated today (BR-034) — everything else about
                // it comes from the source transaction.
                defaultDate={addNextDefaults?.date ?? todayIsoDate()}
                defaultAccountId={seededAccount(requestedAccountId)}
                defaultType={seededType}
                defaultStatus={addNextDefaults?.status}
                defaultDescription={copyDefaults?.description ?? sharedDescription}
                defaultAmount={copyDefaults?.amount}
                defaultToAmount={copyDefaults?.toAmount}
                defaultCategoryId={seededCategoryId}
                defaultMerchantName={seededPayeeName}
                defaultNotes={copyDefaults?.notes}
                defaultTagIds={copyDefaults?.tagIds ?? addNextDefaults?.tagIds}
                defaultFromAccountId={seededAccount(copyDefaults?.fromAccountId)}
                defaultToAccountId={seededAccount(copyDefaults?.toAccountId)}
                visibleFields={usableFormData.formFields}
                quickEntry={usableFormData.quickEntry}
                categoryMemory={usableFormData.categoryMemory}
                // The full view, filters included — not just the pathname, or
                // the redirect after "Create transaction" lands on an
                // unfiltered list.
                returnTo={returnTo}
                onCancel={closeDialog}
              />
              </div>
            )
          ) : null}
        </DialogContent>
      </Dialog>
      {entryTimingOn ? <EntryTimingReadout /> : null}
    </TransactionDialogContext.Provider>
  )
}

export function useTransactionDialog() {
  const context = useContext(TransactionDialogContext)
  if (!context) {
    throw new Error('useTransactionDialog must be used within a TransactionDialogProvider')
  }
  return context
}
