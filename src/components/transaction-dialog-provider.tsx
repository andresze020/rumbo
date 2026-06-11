'use client'

import {
  createContext,
  useContext,
  useEffect,
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

type TransactionType = 'income' | 'expense'

type AddNextDefaults = {
  date: string
  type?: TransactionType
  accountId?: string
  status?: string
}

type TransactionDialogContextValue = {
  openDialog: (defaultAccountId?: string) => void
}

const TransactionDialogContext = createContext<TransactionDialogContextValue | null>(null)

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function TransactionDialogProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState<QuickAddFormData | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [addNextDefaults, setAddNextDefaults] = useState<AddNextDefaults | null>(null)
  const [triggerAccountId, setTriggerAccountId] = useState<string | undefined>()

  const nextDate = searchParams.get('next_date')
  const nextType = searchParams.get('next_type')
  const nextAccount = searchParams.get('next_account')
  const nextStatus = searchParams.get('next_status')
  const created = searchParams.get('created')

  // After "Save and Add Next", reopen the dialog pre-filled with the next entry's defaults.
  useEffect(() => {
    if (!nextDate && !nextType && !nextAccount) return

    const type = nextType === 'income' || nextType === 'expense' ? nextType : undefined
    setAddNextDefaults({
      date: nextDate ?? todayIsoDate(),
      type,
      accountId: nextAccount ?? undefined,
      status: nextStatus ?? undefined,
    })
    setFormKey((k) => k + 1)
    setOpen(true)

    const cleaned = new URLSearchParams(searchParams.toString())
    cleaned.delete('next_date')
    cleaned.delete('next_type')
    cleaned.delete('next_account')
    cleaned.delete('next_status')
    cleaned.delete('created') // prevent the auto-close effect from firing after the URL is cleaned
    const qs = cleaned.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)

    // Refresh form data in background without showing a loading state.
    getQuickAddFormData()
      .then((data) => { if (data) setFormData(data) })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextDate, nextType, nextAccount])

  // Auto-close the dialog after the final "Create transaction" in an add-next session.
  useEffect(() => {
    if (created !== '1' || nextDate || nextType || nextAccount || !addNextDefaults) return
    setOpen(false)
    setAddNextDefaults(null)
    const cleaned = new URLSearchParams(searchParams.toString())
    cleaned.delete('created')
    const qs = cleaned.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [created, nextDate, nextType, nextAccount, addNextDefaults])

  async function openDialog(defaultAccountId?: string) {
    setTriggerAccountId(defaultAccountId)
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
        <DialogContent className="overflow-y-auto max-h-[90dvh] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add transaction</DialogTitle>
            <DialogDescription>
              Add a manual income, expense, or transfer transaction.
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
                defaultType={addNextDefaults?.type}
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
