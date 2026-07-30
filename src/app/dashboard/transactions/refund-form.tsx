'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createRefundTransactionAction } from './actions'
import { AmountInput } from '@/components/amount-input'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/submit-button'
import { formActionsCls, formBtnCls } from '@/lib/form-styles'
import { formatCurrency, todayIsoDateLocal } from '@/lib/format'
import { useLanguage } from '@/components/language-provider'
import { cn } from '@/lib/utils'

/**
 * BR-040 — record a refund against an expense.
 *
 * Everything except the amount and the date is fixed by the original: the refund
 * goes back to the same account and into the **same category**, because that is
 * what makes the category net to the true cost. Letting the user re-pick the
 * category here would be a way to defeat the whole point, so they are hidden
 * inputs rather than selects.
 *
 * The amount defaults to the full remaining amount, since a full refund is the
 * common case, and a partial one is a matter of typing less.
 */
export function RefundForm({
  transactionId,
  accountId,
  categoryId,
  accountName,
  categoryName,
  currencyCode,
  originalAmount,
  remainingAmount,
  exchangeRateToBase,
  description,
  cancelHref,
  returnTo,
}: {
  transactionId: string
  accountId: string
  categoryId: string
  accountName: string
  categoryName: string
  currencyCode: string
  originalAmount: number
  /** Original minus refunds already recorded against it. */
  remainingAmount: number
  exchangeRateToBase: number
  description: string
  cancelHref: string
  returnTo: string
}) {
  const { locale } = useLanguage()
  const [amount, setAmount] = useState(remainingAmount.toFixed(2))
  const [refundDate, setRefundDate] = useState(() => todayIsoDateLocal())

  const amountNumber = Number(amount)
  const exceedsRemaining =
    Number.isFinite(amountNumber) && amountNumber > remainingAmount + 0.001
  const isPartial =
    Number.isFinite(amountNumber) && amountNumber > 0 && amountNumber < remainingAmount

  return (
    <form action={createRefundTransactionAction} className="space-y-4">
      <input type="hidden" name="refunded_transaction_id" value={transactionId} />
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="category_id" value={categoryId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <input
        type="hidden"
        name="exchange_rate_to_base"
        value={String(exchangeRateToBase)}
      />

      <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">{description}</p>
        <p>
          {formatCurrency(originalAmount, currencyCode, locale)} · {accountName} ·{' '}
          {categoryName}
        </p>
        {remainingAmount < originalAmount ? (
          <p>
            {formatCurrency(remainingAmount, currencyCode, locale)} left to refund.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`refund_amount_${transactionId}`}>Refund amount</Label>
          <AmountInput
            id={`refund_amount_${transactionId}`}
            name="amount"
            currencyCode={currencyCode}
            value={amount}
            onValueChange={setAmount}
            required
          />
          {exceedsRemaining ? (
            <p className="text-xs text-red-600 dark:text-red-400">
              That is more than is left to refund on this transaction.
            </p>
          ) : isPartial ? (
            <p className="text-xs text-muted-foreground">
              A partial refund. The category keeps the rest as a real cost.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`refund_date_${transactionId}`}>Date received</Label>
          <Input
            id={`refund_date_${transactionId}`}
            name="transaction_date"
            type="date"
            value={refundDate}
            onChange={(event) => setRefundDate(event.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`refund_description_${transactionId}`}>Description</Label>
        <Input
          id={`refund_description_${transactionId}`}
          name="description"
          maxLength={200}
          defaultValue={`Refund: ${description}`}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`refund_notes_${transactionId}`}>Notes (optional)</Label>
        <Textarea id={`refund_notes_${transactionId}`} name="notes" rows={2} />
      </div>

      <p className="text-xs text-muted-foreground">
        The money goes back into {accountName}, and {categoryName} is reduced by
        this amount — so your reports show what the purchase actually cost.
      </p>

      <div className={formActionsCls}>
        <SubmitButton
          type="submit"
          className={formBtnCls}
          pendingText="Recording…"
          disabled={exceedsRemaining}
        >
          Record refund
        </SubmitButton>
        <Link
          href={cancelHref}
          className={cn(buttonVariants({ variant: 'outline' }), formBtnCls)}
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
