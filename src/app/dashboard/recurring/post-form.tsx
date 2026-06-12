'use client'

import { useState } from 'react'
import Link from 'next/link'
import { postRecurringAction } from './actions'
import { AmountInput } from '@/components/amount-input'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/submit-button'

type PostFormProps = {
  recurringId: string
  name: string
  defaultAmount: string
  defaultDate: string
  currencyCode: string
  baseCurrency: string
}

function formatCurrency(value: number, currencyCode: string) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currencyCode,
  }).format(value)
}

export function PostForm({
  recurringId,
  name,
  defaultAmount,
  defaultDate,
  currencyCode,
  baseCurrency,
}: PostFormProps) {
  const isMultiCurrency = currencyCode !== baseCurrency
  const [rate, setRate] = useState('')

  const rateNumber = Number(rate)
  const amountNumber = Number(defaultAmount)
  const showPreview =
    isMultiCurrency && Number.isFinite(rateNumber) && rateNumber > 0
  const convertedBase = showPreview ? amountNumber / rateNumber : 0

  return (
    <form action={postRecurringAction} className="space-y-4">
      <input type="hidden" name="recurring_id" value={recurringId} />

      <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
        Posting <span className="font-medium text-foreground">{name}</span> as a
        transaction. Adjust the date or amount if this occurrence differs.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`post_date_${recurringId}`}>Date</Label>
          <Input
            id={`post_date_${recurringId}`}
            name="post_date"
            type="date"
            defaultValue={defaultDate}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`post_amount_${recurringId}`}>Amount</Label>
          <AmountInput
            id={`post_amount_${recurringId}`}
            name="amount"
            currencyCode={currencyCode}
            defaultValue={defaultAmount}
            required
          />
        </div>
      </div>

      {isMultiCurrency ? (
        <div className="space-y-2">
          <Label htmlFor={`post_rate_${recurringId}`}>
            Exchange rate: 1 {baseCurrency} = ? {currencyCode}
          </Label>
          <Input
            id={`post_rate_${recurringId}`}
            type="text"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder={`e.g. how many ${currencyCode} make up 1 ${baseCurrency}`}
            required
          />
          <input type="hidden" name="rate_base_to_account" value={rate} />
          {showPreview ? (
            <p className="text-xs text-muted-foreground">
              {formatCurrency(amountNumber, currencyCode)} ≈{' '}
              {formatCurrency(convertedBase, baseCurrency)} at this rate.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Converts the amount into {baseCurrency} for your reports and totals.
            </p>
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`post_notes_${recurringId}`}>Notes (optional)</Label>
        <Textarea id={`post_notes_${recurringId}`} name="notes" rows={2} />
      </div>

      <div className="flex flex-wrap gap-2">
        <SubmitButton type="submit" pendingText="Posting…">
          Post transaction
        </SubmitButton>
        <Link
          href="/dashboard/recurring"
          className={buttonVariants({ variant: 'outline' })}
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
