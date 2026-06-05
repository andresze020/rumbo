'use client'

import { useEffect, useState, type ReactNode } from 'react'
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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function GlobalAddTransactionButton({
  className,
  children,
  'aria-label': ariaLabel,
  title,
  defaultAccountId,
}: {
  className?: string
  children?: ReactNode
  'aria-label'?: string
  title?: string
  defaultAccountId?: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState<QuickAddFormData | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [addNextDefaults, setAddNextDefaults] = useState<AddNextDefaults | null>(null)

  const nextDate = searchParams.get('next_date')
  const nextType = searchParams.get('next_type')
  const nextAccount = searchParams.get('next_account')
  const nextStatus = searchParams.get('next_status')

  useEffect(() => {
    if (!nextDate && !nextType && !nextAccount) return

    const type = nextType === 'income' || nextType === 'expense' ? nextType : undefined
    setAddNextDefaults({
      date: nextDate ?? new Date().toISOString().slice(0, 10),
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
    const qs = cleaned.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)

    if (!loading) {
      setLoading(true)
      setLoadError(false)
      getQuickAddFormData()
        .then((data) => {
          setFormData(data ?? null)
          if (!data) setLoadError(true)
        })
        .catch(() => setLoadError(true))
        .finally(() => setLoading(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextDate, nextType, nextAccount])

  async function handleOpen() {
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
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={className}
        aria-label={ariaLabel}
        title={title}
      >
        {children}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
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
                defaultAccountId={addNextDefaults?.accountId ?? defaultAccountId}
                defaultType={addNextDefaults?.type}
                defaultStatus={addNextDefaults?.status}
                returnTo={pathname}
                onCancel={() => { setOpen(false); setAddNextDefaults(null) }}
              />
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
