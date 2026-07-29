'use client'

import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

/**
 * BR-046 — confirmation gate for changing an existing account's currency.
 *
 * Wraps the account edit form so the server action still receives the plain
 * `FormData` submit. Every other edit (name, type, notes…) submits untouched;
 * only an actual change of `currency_code` is intercepted, and the dialog
 * explains what does — and does not — happen to history: existing entries keep
 * the `exchange_rate_to_base` they were stored with (BR-002/BR-003), so past
 * amounts are never silently re-converted.
 */
export function CurrencyChangeGuard({
  action,
  currentCurrency,
  title,
  description,
  cancelLabel,
  confirmLabel,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>
  /** The account's currency as stored — the value a change is measured against. */
  currentCurrency: string
  title: string
  description: string
  cancelLabel: string
  confirmLabel: string
  className?: string
  children: ReactNode
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null)
  // Set just before the programmatic re-submit so the guard lets it through.
  const confirmedRef = useRef(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (confirmedRef.current) {
      confirmedRef.current = false
      return
    }
    const nextCurrency = String(
      new FormData(event.currentTarget).get('currency_code') ?? ''
    )
    if (!nextCurrency || nextCurrency === currentCurrency) return

    event.preventDefault()
    setPendingCurrency(nextCurrency)
  }

  function confirm() {
    setPendingCurrency(null)
    confirmedRef.current = true
    formRef.current?.requestSubmit()
  }

  return (
    <>
      <form ref={formRef} action={action} onSubmit={handleSubmit} className={className}>
        {children}
      </form>

      <AlertDialog
        open={pendingCurrency !== null}
        onOpenChange={(open) => {
          if (!open) setPendingCurrency(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>
              {description.replace('{from}', currentCurrency).replace('{to}', pendingCurrency ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
            <Button type="button" size="sm" onClick={confirm}>
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
