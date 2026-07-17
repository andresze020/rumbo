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
import {
  getQuickAddFormData,
  type QuickAddFormData,
} from '@/app/dashboard/quick-add-actions'
import { useLanguage } from '@/components/language-provider'

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
}

type TransactionDialogContextValue = {
  openDialog: (options?: OpenDialogOptions) => void
}

const TransactionDialogContext = createContext<TransactionDialogContextValue | null>(null)

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function readQuickAddType(searchParams: URLSearchParams): OpenDialogType | null {
  const type = searchParams.get('quick_add')
  return type === 'income' || type === 'expense' || type === 'transfer' ? type : null
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

      // Fetch the form data BEFORE calling router.replace() below — issuing the
      // replace first hangs the server action's request (it never resolves nor
      // rejects), leaving the dialog stuck on "Loading form...".
      setLoading(true)
      getQuickAddFormData()
        .then((data) => {
          if (data) {
            setFormData(data)
            setLoadError(false)
          } else {
            setLoadError(true)
          }
        })
        .catch(() => setLoadError(true))
        .finally(() => setLoading(false))

      const cleaned = new URLSearchParams(searchParams.toString())
      cleaned.delete('next_date')
      cleaned.delete('next_type')
      cleaned.delete('next_account')
      cleaned.delete('next_status')
      cleaned.delete('next_seq')
      cleaned.delete('created') // prevent the auto-close effect from firing after the URL is cleaned
      const qs = cleaned.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
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
  // link (e.g. a PWA manifest shortcut), then strips the param from the URL.
  const processedQuickAddRef = useRef(false)
  useEffect(() => {
    if (processedQuickAddRef.current) return
    const type = readQuickAddType(searchParams)
    if (!type) return
    processedQuickAddRef.current = true

    openDialog({ type })

    const cleaned = new URLSearchParams(searchParams.toString())
    cleaned.delete('quick_add')
    const qs = cleaned.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openDialog(options?: OpenDialogOptions) {
    setTriggerAccountId(options?.accountId)
    setTriggerType(options?.type)
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

  return (
    <TransactionDialogContext.Provider value={{ openDialog }}>
      {children}

      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value)
          if (!value) setAddNextDefaults(null)
        }}
      >
        <DialogContent
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
                defaultDate={addNextDefaults?.date ?? todayIsoDate()}
                defaultAccountId={addNextDefaults?.accountId ?? triggerAccountId}
                defaultType={addNextDefaults?.type ?? triggerType}
                defaultStatus={addNextDefaults?.status}
                returnTo={pathname}
                onCancel={() => { setOpen(false); setAddNextDefaults(null) }}
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
