'use client'

import Link from 'next/link'
import { useState } from 'react'
import { updateManualTransactionAction } from './actions'
import { CategoryPicker } from './category-picker'
import { PayeePicker, type PayeeOption } from './payee-picker'
import { TagMultiSelect, type TagOption } from '@/components/tag-multi-select'
import { AmountInput } from '@/components/amount-input'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/submit-button'
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
  accounts,
  categories,
  payees,
  tags,
  selectedTagIds,
  returnTo,
}: TransactionEditFormProps) {
  const [selectedAccountId, setSelectedAccountId] = useState(accountId)
  const amountCurrency =
    accounts.find((a) => a.id === selectedAccountId)?.currency_code ??
    accounts.find((a) => a.id === accountId)?.currency_code ??
    'USD'

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
            defaultValue={amount.toFixed(2)}
            withCalculator
            required
          />
        </div>
      </div>

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
