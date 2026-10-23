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
import {
  TransactionForm,
  type TransactionSavedOutcome,
} from '@/app/dashboard/transactions/transaction-form'
import type { TransactionCopyPayload } from '@/app/dashboard/transactions/transaction-list'
import {
  getQuickAddFormData,
  type QuickAddFormData,
} from '@/app/dashboard/quick-add-actions'
import { Check, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'
import { useBackDismiss } from '@/lib/use-back-dismiss'
import { useToast } from '@/components/toast-provider'
import { TRANSACTION_CREATED_PARAM } from '@/lib/transactions/landing-flags'
import { EntryTimingReadout } from '@/components/entry-timing-readout'
import {
  finishPendingSave,
  isEntryTimingEnabled,
  recordEntrySample,
  setEntryTimingEnabled,
  type EntryVariant,
} from '@/lib/perf/entry-timing'
import { useIsMobile } from '@/lib/use-is-mobile'
import { nextDraftNeedsFreshLists } from '@/lib/quick-entry/next-draft'
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

/** Fields that raise the soft keyboard (date and toggle inputs do not). */
const TEXT_ENTRY =
  'textarea, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])' +
  ':not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="date"])' +
  ':not([type="time"]):not([type="range"]):not([type="color"]):not([type="file"])'

/**
 * The top share of the form's scroller that the keyboard never reaches. A field
 * already inside it is left where it is. Phone keyboards take 35–50% of the
 * screen, and Brave believes they take ~100px more than they do (below).
 */
const KEYBOARD_FREE_BAND = 0.25

/** Long enough to read as movement, short enough to finish before the keyboard. */
const PLACE_MS = 160

/**
 * How long the scroll room outlives the last focused field. Tapping a row's
 * toggle (Notes, say) moves focus to that button for a moment before the
 * field inside gets it; dropping the room in between clamped the scroll.
 */
const ROOM_GRACE_MS = 500

/**
 * Phone only: when a field that raises the keyboard gets focus, move it to the
 * top of the form *before* the keyboard arrives. The keyboard then opens over
 * the bottom of the sheet, and nothing on screen has to move again.
 *
 * Measuring the keyboard failed on every round. The sheet used to be lifted
 * above it and re-scrolled once it was up, from the visual viewport's numbers.
 * Brave reports a visual viewport about 100px shorter than what it shows (its
 * bottom toolbar's height, which it hides for the keyboard). So the sheet rose
 * too high and shrank to a strip between the X and the keyboard, and every
 * field jumped twice on the way: once when the sheet resized, once when it was
 * scrolled back (device runs, 2026-10-22). Nothing here reads the keyboard's
 * size. The sheet stays full screen, and the only movement is this one scroll,
 * at focus time.
 *
 * With the keyboard already up (Description → Notes), the move is instant
 * instead. Right after the focus event the browser scrolls the field into
 * the part of the screen it believes is visible, and an animated move had not
 * started yet: it found Notes under the keyboard and panned the whole screen,
 * X row included (device run, 2026-10-23). Placed synchronously, the field is
 * already in view when the browser looks.
 *
 * Only the scroller moves: `scrollIntoView` would also pan the visual
 * viewport, which took the X row off the screen. Near the end of the form the
 * scroller has no room left to bring a field up, so `roomRef` (an empty box
 * after the form) grows while a field is being typed into. It sits under the
 * keyboard and is never seen. A spacer, not padding: the form is a flex child
 * stretched to the scroller's height, and the scroller's bottom padding added
 * no scroll room at all.
 */
function usePlaceFieldsAboveKeyboard(
  enabled: boolean,
  scrollerRef: { current: HTMLDivElement | null },
  roomRef: { current: HTMLDivElement | null }
) {
  useEffect(() => {
    if (!enabled) return
    let frame = 0
    let extra = 0
    let unpadTimer = 0

    const ownField = (node: EventTarget | null): HTMLElement | null => {
      const scroller = scrollerRef.current
      if (!scroller || !(node instanceof HTMLElement)) return null
      if (!node.matches(TEXT_ENTRY) || !scroller.contains(node)) return null
      if ((node as HTMLInputElement).readOnly || (node as HTMLInputElement).disabled) return null
      // A picker sheet's search field is on its own full-screen layer.
      if (node.closest('[role="dialog"]') !== scroller.closest('[role="dialog"]')) return null
      return node
    }

    const scrollTo = (scroller: HTMLElement, to: number, instant: boolean) => {
      window.cancelAnimationFrame(frame)
      const from = scroller.scrollTop
      if (Math.abs(to - from) < 2) return
      if (instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        scroller.scrollTop = to
        return
      }
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / PLACE_MS)
        scroller.scrollTop = from + (to - from) * (1 - (1 - t) ** 3)
        if (t < 1) frame = window.requestAnimationFrame(step)
      }
      frame = window.requestAnimationFrame(step)
    }

    const place = (field: HTMLElement) => {
      const scroller = scrollerRef.current
      if (!scroller) return
      const box = scroller.getBoundingClientRect()
      const rect = field.getBoundingClientRect()
      if (rect.top >= box.top && rect.bottom <= box.top + box.height * KEYBOARD_FREE_BAND) return

      const target = Math.max(0, Math.round(scroller.scrollTop + rect.top - box.top - 12))
      // Room is only ever added during a typing session, never taken away:
      // shrinking it under a scrolled form would clamp the scroll and jump.
      const missing = target - (scroller.scrollHeight - scroller.clientHeight)
      const room = roomRef.current
      if (missing > 0 && room) {
        extra += missing
        room.style.height = `${extra}px`
      }
      // `data-vv-keyboard` is only trusted as a yes/no here, never as a size.
      scrollTo(scroller, target, document.documentElement.hasAttribute('data-vv-keyboard'))
    }

    const unpad = () => {
      if (!extra) return
      extra = 0
      if (roomRef.current) roomRef.current.style.height = ''
    }

    const onFocusIn = (event: FocusEvent) => {
      const field = ownField(event.target)
      if (!field) return
      window.clearTimeout(unpadTimer)
      place(field)
    }
    // Typing is over only when focus stays somewhere that is not another field
    // (a picker, a button, nothing). Moving between fields keeps the room.
    const onFocusOut = () => {
      window.clearTimeout(unpadTimer)
      unpadTimer = window.setTimeout(() => {
        if (!ownField(document.activeElement)) unpad()
      }, ROOM_GRACE_MS)
    }
    // Tapping a field that already has focus reopens a keyboard that Back
    // dismissed, with no new focus event.
    const onClick = (event: MouseEvent) => {
      const field = ownField(event.target)
      if (field && field === document.activeElement) place(field)
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('click', onClick)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(unpadTimer)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('click', onClick)
      unpad()
    }
    // The ref is stable.
  }, [enabled, scrollerRef, roomRef])
}

/**
 * Params that describe *this* navigation rather than the view behind the
 * dialog: a toast to show, a dialog to reopen, a share payload to consume.
 * Everything else — the transactions screen's filters, above all — has to
 * survive the round trip, or creating a transaction silently drops the filters
 * the user was working in.
 */
const TRANSIENT_RETURN_PARAMS = [
  TRANSACTION_CREATED_PARAM,
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
 * Runs `fn` once the browser has painted (two frames) — used to end the
 * entry-timing samples on what the user actually sees.
 *
 * Deliberately not cancelled by the effect that schedules it: landing a save
 * re-renders the provider straight away, and an effect cleanup that cancelled
 * the pending frame threw samples away (first device run, 2026-10-22). Each
 * caller consumes its timer before scheduling, so nothing records twice.
 */
function afterPaint(fn: () => void) {
  window.requestAnimationFrame(() => window.requestAnimationFrame(fn))
}

/**
 * Strip one-shot flags (`txn_created`, `next_*`) from the address bar without
 * a server round trip.
 *
 * A `router.replace()` here was a full navigation: after every "Save & Add
 * Next" the destination page was rendered on the server twice more (once for
 * the toast's cleanup, once for the dialog's) while the next entry was being
 * typed. The App Router integrates `history.replaceState`, so
 * `useSearchParams` still sees the cleaned URL. `history.state` is passed
 * through so the router's entry, and `useBackDismiss`'s overlay marker on it,
 * survive. See `stripOneShotFlags` for the one screen that still navigates.
 */
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
   * Strips `txn_created` / `next_*` once they have done their job, as a plain
   * history update (`replaceUrlInPlace`): no screen's server render reads
   * them, so a navigation only re-rendered the page for nothing. The one
   * exception is the assistant, whose page shows its own "created from the
   * assistant" banner from the flag; there the cleanup stays a navigation,
   * which also takes the banner away.
   */
  function stripOneShotFlags(href: string) {
    if (pathname === '/dashboard/assistant') router.replace(href)
    else replaceUrlInPlace(href)
  }
  const searchParams = useSearchParams()
  const { t } = useLanguage()
  const ui = useUiTranslation()
  // The form's scroller (the wrapper on a phone, the sheet itself on desktop).
  const scrollerRef = useRef<HTMLDivElement>(null)
  // Scroll room under the form while typing; see `usePlaceFieldsAboveKeyboard`.
  const keyboardRoomRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  usePlaceFieldsAboveKeyboard(isMobile, scrollerRef, keyboardRoomRef)
  // Entries saved with "Save & Add Next" since this dialog opened. Shown in
  // the dialog itself: on a phone the full-screen sheet covers the toast stack,
  // so a batch had no visible confirmation at all — the next draft simply
  // appeared, looking like the last one minus its amount.
  const [savedInBatch, setSavedInBatch] = useState(0)

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
  // Unique per save (a timestamp), so two landings in a row are two values.
  const txnCreated = searchParams.get(TRANSACTION_CREATED_PARAM)
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
        cleaned.delete(TRANSACTION_CREATED_PARAM) // prevent the auto-close effect from firing after the URL is cleaned
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
    if (!txnCreated || hasPendingNext || !addNextDefaults) return
    const frame = window.requestAnimationFrame(() => {
      setOpen(false)
      setAddNextDefaults(null)
      const cleaned = new URLSearchParams(searchParams.toString())
      cleaned.delete(TRANSACTION_CREATED_PARAM)
      const qs = cleaned.toString()
      stripOneShotFlags(qs ? `${pathname}?${qs}` : pathname)
    })

    return () => window.cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txnCreated, hasPendingNext, addNextDefaults])

  // "Transaction created." on whichever screen the save landed on. It used to
  // come from the Transactions screen alone, so a save from Accounts or the
  // Dashboard got no confirmation (or another screen's "… created" banner).
  // The assistant page keeps its own banner instead. A plain create is
  // stripped here; an add-next landing is stripped by the effects above once
  // the next draft is up.
  const { toast } = useToast()
  const toastedLanding = useRef<string | null>(null)
  useEffect(() => {
    if (!txnCreated || toastedLanding.current === txnCreated) return
    const frame = window.requestAnimationFrame(() => {
      toastedLanding.current = txnCreated
      if (pathname !== '/dashboard/assistant') {
        toast({ message: t('transactionsList.toastCreated') })
      }
      if (!hasPendingNext && !addNextDefaults) {
        const cleaned = new URLSearchParams(searchParams.toString())
        cleaned.delete(TRANSACTION_CREATED_PARAM)
        const qs = cleaned.toString()
        stripOneShotFlags(qs ? `${pathname}?${qs}` : pathname)
      }
    })
    return () => window.cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txnCreated])

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
    setSavedInBatch(0)
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
    setSavedInBatch(0)
    clearPrefills()
  }

  /**
   * A save from the dialog, reported directly (no redirect; see
   * `saveManualTransaction`). The screen behind is refreshed by the action's
   * own `revalidatePath` in the same response, so the dialog does not wait for
   * it: the toast and the next draft come first.
   */
  function handleSaved({ addNext, next, warning }: TransactionSavedOutcome) {
    afterPaint(finishPendingSave)

    if (addNext && next) {
      setSavedInBatch((count) => count + 1)
      // Same carry-over as the redirect path's `next_*` params: date, type,
      // account, status, category, payee and tags. Never the amount,
      // description or notes — and not a Copy's or a share's either.
      setAddNextDefaults({
        date: next.date,
        type: next.type === 'income' || next.type === 'expense' ? next.type : undefined,
        accountId: next.accountId,
        status: next.status,
        categoryId: next.categoryId,
        payeeName: next.payeeName ?? undefined,
        tagIds: next.tagIds.length > 0 ? next.tagIds : undefined,
      })
      setCopyDefaults(undefined)
      setSharedDescription(undefined)
      setFormKey((key) => key + 1)
      // The next entry starts where the last one did: at the amount, with the
      // confirmation above it. The scroller outlives the remounted form, so
      // without this a long form opened the next draft still scrolled down
      // to the buttons — amount off-screen on a small phone and on desktop.
      window.requestAnimationFrame(() => {
        const scroller = scrollerRef.current
        scroller?.scrollTo({ top: 0 })
        scroller?.closest<HTMLElement>('[data-slot="dialog-content"]')?.scrollTo({ top: 0 })
      })
      // Only when the entry brought something the pickers do not have yet (a
      // new payee, a tag made on the spot): see `nextDraftNeedsFreshLists`.
      if (nextDraftNeedsFreshLists(formDataRef.current, next)) void refreshFormData()
      return
    }

    // The sheet is about to close, so the toast stack is visible again.
    toast({ message: warning ? ui(warning) : t('transactionsList.toastCreated') })
    closeDialog()
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
    afterPaint(() =>
      recordEntrySample('open', timer.variant, performance.now() - timer.start)
    )
  }, [formOnScreen, formKey])

  // save: the redirect has landed (`txn_created`), with the next draft up when
  // it was "Save & Add Next". The start was stamped by the form at submit, in
  // the tab's storage (`markSaveStart`), so it survives whatever the redirect
  // does to this component.
  useEffect(() => {
    if (!txnCreated) return
    afterPaint(finishPendingSave)
  }, [txnCreated])

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
          if (!value) {
            setSavedInBatch(0)
            clearPrefills()
          }
        }}
        // On a phone the sheet is the whole screen, so nothing outside it is
        // meant to be tapped. When a strip of backdrop did show, one tap there
        // threw a half-typed entry away (device run, 2026-10-22). The X,
        // Escape and Back still close it.
        disablePointerDismissal={isMobile}
      >
        <DialogContent
          // Own close button: the built-in one is absolutely positioned in the
          // corner, where on a phone it lands on top of the type selector's
          // "Transfer". Ours gets its own row instead (see below).
          showCloseButton={false}
          className={
            // Centered dialog on desktop; a full screen on mobile. It used to be
            // a 92dvh bottom sheet, which left a strip of dashboard above it and
            // spent the remaining 8% on nothing — while the form below still had
            // to scroll. A phone entering a transaction is doing one thing, so it
            // gets the whole screen: `h-dvh`, square corners, and the actions
            // pushed to the bottom edge by the spacer inside the form.
            'max-h-[90dvh] overflow-y-auto sm:max-w-xl ' +
            // Not lifted above the keyboard: it stays full screen and the
            // keyboard covers its bottom. Fields are moved up before the
            // keyboard opens instead (`usePlaceFieldsAboveKeyboard`).
            //
            // `overflow-clip` on mobile: the sheet itself must not scroll —
            // the wrapper below does. The picker sheets are positioned against
            // this box (see `SelectorSheet`), and while it was the scroller
            // they were shifted up by however far the form had been scrolled,
            // leaving the form's buttons showing under every picker. Clip, not
            // hidden: a `hidden` box is still a scroll container, and the
            // browser's own focus scrolling scrolled it, X row and all.
            'max-sm:overflow-clip ' +
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
          <div className="flex shrink-0 items-center justify-end gap-3 sm:absolute sm:top-2 sm:right-2 sm:z-10">
            {/* The batch's running confirmation, beside the X so it costs no
                height. A tinted pill that pops on every save: as plain green
                text it went unnoticed on the phone (device run, 2026-10-22).
                Always mounted, so a screen reader hears each change. */}
            <p role="status" aria-live="polite" className="mr-auto flex min-w-0">
              {savedInBatch > 0 ? (
                <span
                  key={savedInBatch}
                  className="flex min-w-0 items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-700 duration-300 animate-in fade-in-0 zoom-in-90 dark:text-emerald-300"
                >
                  <Check className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{t('transactionsList.toastCreated')}</span>
                  {savedInBatch > 1 ? (
                    <span className="shrink-0 tabular-nums opacity-80">×{savedInBatch}</span>
                  ) : null}
                </span>
              ) : null}
            </p>
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

          {/* The scroller on mobile (see `overflow-hidden` above). Edge to edge,
              so focus rings and the sticky action bar are not clipped. */}
          <div
            ref={scrollerRef}
            className="max-sm:-mx-4 max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:px-4"
          >
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
                onSaved={handleSaved}
              />
            )
          ) : null}
          <div ref={keyboardRoomRef} aria-hidden="true" className="shrink-0 sm:hidden" />
          </div>
        </DialogContent>
      </Dialog>
      {/* Never over the form: it covered the form's own controls. */}
      {entryTimingOn && !open ? <EntryTimingReadout /> : null}
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
