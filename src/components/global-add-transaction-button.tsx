'use client'

import { useState, type ReactNode } from 'react'
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
  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState<QuickAddFormData | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)

  async function handleOpen() {
    setOpen(true)
    if (!formData && !loading) {
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
                accounts={formData.accounts}
                baseCurrency={formData.baseCurrency}
                categories={formData.categories}
                defaultDate={todayIsoDate()}
                defaultAccountId={defaultAccountId}
                onCancel={() => setOpen(false)}
              />
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
