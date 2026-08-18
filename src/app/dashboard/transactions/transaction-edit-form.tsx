'use client'

import Link from 'next/link'
import { useState } from 'react'
import { updateManualTransactionAction } from './actions'
import { CategoryPicker } from './category-picker'
import { PayeePicker, type PayeeOption } from './payee-picker'
import { TagMultiSelect, type TagOption } from '@/components/tag-multi-select'
import { AmountInput } from '@/components/amount-input'
import { Callout } from '@/components/callout'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/submit-button'
import { roundToCents } from '@/lib/calc'
import { formatCurrency } from '@/lib/format'
import { nativeSelectCls, formActionsCls, formBtnCls } from '@/lib/form-styles'
import { cn } from '@/lib/utils'

type TransactionType = 'income' | 'expense'

type EditAccount = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
  icon?: string | null
}

type EditCategory = {
  id: string
  name: string
  category_type: string
  parent_category_id: string | null
  icon?: string | null
}

type TransactionEditFormProps = {
  transactionId: string
  transactionType: TransactionType
  transactionDate: string
  /** BR-045 — `HH:MM` or empty for an untimed transaction. */
  transactionTime: string
  accountId: string
  categoryId: string
  amount: number
  cancelHref: string
  description: string
  merchantName: string
  notes: string
  status: string
  /** Household base currency — what the reports and totals are denominated in. */
  baseCurrency: string
  /**
   * BR-031 slice 2 — the rate this transaction was recorded at, as stored on its
   * ledger entry (`amount_base_currency = amount_account_currency * rate`). 1 for
   * a base-currency transaction.
   */
  exchangeRateToBase: number
  accounts: EditAccount[]
  categories: EditCategory[]
  payees: PayeeOption[]
  tags: TagOption[]
  selectedTagIds: string[]
  returnTo: string
}

function formatAccountLabel(account: EditAccount) {
  const label = [
    account.name,
    account.institution_name || null,
    account.currency_code,
  ]
    .filter(Boolean)
    .join(' · ')
  return account.icon ? `${account.icon} ${label}` : label
}

export function TransactionEditForm({
  transactionId,
  transactionType,
  transactionDate,
  transactionTime,
  accountId,
  categoryId,
  amount,
  cancelHref,
  description,
  merchantName,
  notes,
  status,
  baseCurrency,
  exchangeRateToBase,
  accounts,
  categories,
  payees,
  tags,
  selectedTagIds,
  returnTo,
}: TransactionEditFormProps) {
  const [selectedAccountId, setSelectedAccountId] = useState(accountId)
  const [amountInput, setAmountInput] = useState(amount.toFixed(2))
  const originalCurrency = accounts.find((a) => a.id === accountId)?.currency_code
  const amountCurrency =
    accounts.find((a) => a.id === selectedAccountId)?.currency_code ??
    originalCurrency ??
    'USD'

  // BR-031 slice 2 — the create form shows what a foreign-currency amount is
  // worth in the base currency as a line of text under the amount, because that
  // figure is derived from the rate and never typed. The edit form showed
  // nothing, so correcting a COP amount meant doing the CAD arithmetic in your
  // head to know what the change did to your reports. Same treatment here, from
  // the rate the transaction was actually recorded at.
  const parsedAmount = Number(amountInput)
  const amountIsValid =
    amountInput.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount > 0
  const rateIsUsable = Number.isFinite(exchangeRateToBase) && exchangeRateToBase > 0
  const isMultiCurrency = amountCurrency !== baseCurrency

  // Changing the account to one in a *different* currency is the case this
  // preview cannot cover: `update_manual_transaction` re-uses the rate already on
  // the ledger entry, so the saved base amount would be this amount converted at
  // a rate that belongs to the old currency. The form does not block the edit —
  // it says what will happen, which is the honest thing it can do without a new
  // RPC parameter (see docs/pending-work.md).
  const currencyChanged =
    Boolean(originalCurrency) && amountCurrency !== originalCurrency

  const baseEquivalent =
    isMultiCurrency && !currencyChanged && rateIsUsable && amountIsValid
      ? formatCurrency(
          roundToCents(parsedAmount * exchangeRateToBase),
          baseCurrency
        )
      : null

  return (
    <form action={updateManualTransactionAction} className="space-y-4">
      <input type="hidden" name="transaction_id" value={transactionId} />
      <input type="hidden" name="return_to" value={returnTo} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`edit_date_${transactionId}`}>Date</Label>
          <Input
            id={`edit_date_${transactionId}`}
            name="transaction_date"
            type="date"
            defaultValue={transactionDate}
            required
          />
        </div>

        {/* BR-045: the edit form always shows the time, even when the add form
            has it hidden — otherwise a time set once could never be corrected
            or cleared. Empty submits as "untimed". */}
        <div className="space-y-2">
          <Label htmlFor={`edit_time_${transactionId}`}>Time</Label>
          <Input
            id={`edit_time_${transactionId}`}
            name="transaction_time"
            type="time"
            defaultValue={transactionTime}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`edit_status_${transactionId}`}>Status</Label>
          <select
            id={`edit_status_${transactionId}`}
            name="status"
            defaultValue={status}
            className={nativeSelectCls}
          >
            <option value="posted">Posted</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`edit_account_${transactionId}`}>Account</Label>
          <select
            id={`edit_account_${transactionId}`}
            name="account_id"
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className={nativeSelectCls}
            required
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {formatAccountLabel(account)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`edit_amount_${transactionId}`}>Amount</Label>
          <AmountInput
            id={`edit_amount_${transactionId}`}
            name="amount"
            currencyCode={amountCurrency}
            value={amountInput}
            onValueChange={setAmountInput}
            withCalculator
            required
          />
          {baseEquivalent ? (
            <p className="text-xs text-muted-foreground">
              ≈ <span className="font-medium text-foreground">{baseEquivalent}</span>{' '}
              at the rate this transaction was recorded at.
            </p>
          ) : null}
        </div>
      </div>

      {currencyChanged ? (
        <Callout variant="warning">
          {`This transaction was recorded in ${originalCurrency} and you are moving it to a ${amountCurrency} account. `}
          {`The exchange rate saved with it does not change, so its ${baseCurrency} value in your reports will be wrong. `}
          {`Void this transaction and record it again on the ${amountCurrency} account instead.`}
        </Callout>
      ) : null}

      <CategoryPicker
        categories={categories}
        transactionType={transactionType}
        defaultCategoryId={categoryId}
        onCategoryChange={() => undefined}
      />

      <div className="space-y-2">
        <Label htmlFor={`edit_description_${transactionId}`}>
          Description
        </Label>
        <Input
          id={`edit_description_${transactionId}`}
          name="description"
          defaultValue={description}
        />
      </div>

      <PayeePicker
        payees={payees}
        defaultValue={merchantName}
        label={transactionType === 'income' ? 'Payer' : 'Payee'}
        helpText="Pick an existing payee or type a new name to create it."
        inputId={`edit_payee_${transactionId}`}
      />

      <div className="space-y-2">
        <Label htmlFor={`edit_notes_${transactionId}`}>Notes</Label>
        <Textarea
          id={`edit_notes_${transactionId}`}
          name="notes"
          defaultValue={notes}
        />
      </div>

      <TagMultiSelect
        tags={tags}
        defaultValue={selectedTagIds}
        label="Tags"
        helpText="Attach one or more labels to slice this transaction later."
        manageLabel="Manage tags"
      />

      <div className={formActionsCls}>
        <SubmitButton type="submit" className={formBtnCls} pendingText="Saving transaction">
          Save transaction
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
