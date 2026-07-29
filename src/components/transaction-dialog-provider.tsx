'use client'

import {
  createContext,
  useContext,
  useEffect,
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
import { useLanguage } from '@/components/language-provider'
import { todayIsoDateLocal } from '@/lib/format'

type TransactionType = 'income' | 'expense'
type OpenDialogType = 'income' | 'expense' | 'transfer'

type AddNextDefaults = {
  date: string
  type?: TransactionType
  accountId?: string
  status?: string
}

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
 * On mobile the dialog is a bottom-anchored sheet, so when the soft keyboard
 * opens it covers the sheet's footer (Create / Save & Add Next / Cancel). The
 * layout viewport doesn't shrink on iOS, so we measure the keyboard overlap via
 * the VisualViewport API and lift the sheet above it. Returns 0 on desktop (no
 * soft keyboard) and on narrow-viewport-only, so the centered desktop dialog is
 * never affected.
 */
function useMobileKeyboardInset() {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const isMobile = window.matchMedia('(max-width: 639px)').matches
      // Overlap between the layout viewport bottom and the visual viewport
      // bottom — i.e. the height taken by the keyboard. Ignore small deltas
      // (browser toolbars) so only a real keyboard triggers the lift.
      const overlap = window.innerHeight - vv.height - vv.offsetTop
      setInset(isMobile && overlap > 120 ? Math.round(overlap) : 0)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  return inset
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
  return {
    date: nextDate ?? todayIsoDate(),
    type,
    accountId: nextAccount ?? undefined,
    status: nextStatus ?? undefined,
  }
}

export function TransactionDialogProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useLanguage()
  const keyboardInset = useMobileKeyboardInset()

  // Read pending "Save and Add Next" defaults straight from the URL on first
  // render so a freshly mounted provider (e.g. after a server-action redirect
  // remounts this layout) opens pre-filled instead of starting empty.
  const [open, setOpen] = useState(() => readAddNextDefaults(searchParams) !== null)
  const [formData, setFormData] = useState<QuickAddFormData | null>(null)
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
      setFormKey((k) => k + 1)
      setOpen(true)
      setLoading(true)

      // Fully sequence the fetch and the URL cleanup: starting router.replace()
      // while getQuickAddFormData() is still in flight can hang that server
      // action indefinitely (it never resolves nor rejects), leaving the
      // dialog stuck on "Loading form...". Only replace the URL once the
      // fetch has settled, and back it with a timeout so a hang (whatever its
      // cause) still surfaces a "try again" message instead of spinning
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
        cleaned.delete('next_date')
        cleaned.delete('next_type')
        cleaned.delete('next_account')
        cleaned.delete('next_status')
        cleaned.delete('next_seq')
        cleaned.delete('created') // prevent the auto-close effect from firing after the URL is cleaned
        const qs = cleaned.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname)
      }

      getQuickAddFormData()
        .then((data) => {
          if (settled) return
          if (data) {
            setFormData(data)
            setLoadError(false)
          } else {
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
      router.replace(qs ? `${pathname}?${qs}` : pathname)
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
    router.replace(qs ? `${pathname}?${qs}` : pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openDialog(options?: OpenDialogOptions) {
    setTriggerAccountId(options?.accountId)
    setTriggerType(options?.type)
    setSharedDescription(options?.description)
    setCopyDefaults(options?.copy)
    // A copy re-seeds every field, so force a fresh form even when the dialog
    // was already mounted from a previous open.
    setFormKey((key) => key + 1)
    setOpen(true)
    if (!loading) {
      setLoading(true)
      setLoadError(false)
      try {
        const data = await getQuickAddFormData()
        if (data) {
          setFormData(data)
        } else {
          setLoadError(true)
        }
      } catch {
        setLoadError(true)
      } finally {
        setLoading(false)
      }
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
          // Lift the mobile bottom sheet above the on-screen keyboard so its
          // footer buttons stay reachable; no-op on desktop (inset is 0).
          style={
            keyboardInset
              ? { bottom: keyboardInset, maxHeight: `calc(100dvh - ${keyboardInset}px - 0.5rem)` }
              : undefined
          }
          className={
            // Centered dialog on desktop; native-style bottom sheet on mobile.
            'max-h-[90dvh] overflow-y-auto sm:max-w-xl ' +
            'max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 ' +
            'max-sm:max-h-[92dvh] max-sm:rounded-t-2xl max-sm:rounded-b-none ' +
            'max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] ' +
            'max-sm:data-open:slide-in-from-bottom-10 max-sm:data-closed:slide-out-to-bottom-10'
          }
        >
          <div aria-hidden="true" className="mx-auto -mb-1 h-1.5 w-10 rounded-full bg-muted sm:hidden" />
          <DialogHeader>
            <DialogTitle>{t('transactionForm.dialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('transactionForm.dialogDescription')}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="py-4 text-sm text-muted-foreground">Loading form…</p>
          ) : loadError ? (
            <p className="py-4 text-sm text-destructive">
              Could not load form data. Please refresh and try again.
            </p>
          ) : formData ? (
            formData.accounts.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Create an account first before adding transactions.
              </p>
            ) : (
              <TransactionForm
                key={formKey}
                accounts={formData.accounts}
                baseCurrency={formData.baseCurrency}
                categories={formData.categories}
                payees={formData.payees}
                tags={formData.tags}
                currencies={formData.currencies}
                // A copy is always dated today (BR-034) — everything else about
                // it comes from the source transaction.
                defaultDate={addNextDefaults?.date ?? todayIsoDate()}
                defaultAccountId={
                  copyDefaults?.accountId ?? addNextDefaults?.accountId ?? triggerAccountId
                }
                defaultType={copyDefaults?.type ?? addNextDefaults?.type ?? triggerType}
                defaultStatus={addNextDefaults?.status}
                defaultDescription={copyDefaults?.description ?? sharedDescription}
                defaultAmount={copyDefaults?.amount}
                defaultCategoryId={copyDefaults?.categoryId}
                defaultMerchantName={copyDefaults?.payeeName}
                defaultNotes={copyDefaults?.notes}
                defaultTagIds={copyDefaults?.tagIds}
                defaultFromAccountId={copyDefaults?.fromAccountId}
                defaultToAccountId={copyDefaults?.toAccountId}
                visibleFields={formData.formFields}
                returnTo={pathname}
                onCancel={closeDialog}
              />
            )
          ) : null}
        </DialogContent>
      </Dialog>
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
