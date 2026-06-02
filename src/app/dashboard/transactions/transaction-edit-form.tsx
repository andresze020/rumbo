'use client'

import Link from 'next/link'
import { updateManualTransactionAction } from './actions'
import { CategoryPicker } from './category-picker'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type TransactionType = 'income' | 'expense'

type EditAccount = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
}

type EditCategory = {
  id: string
  name: string
  category_type: string
  parent_category_id: string | null
}

type TransactionEditFormProps = {
  transactionId: string
  transactionType: TransactionType
  transactionDate: string
  accountId: string
  categoryId: string
  amount: number
  cancelHref: string
  description: string
  notes: string
  status: string
  accounts: EditAccount[]
  categories: EditCategory[]
  returnTo: string
}

function formatAccountLabel(account: EditAccount) {
  return [
    account.name,
    account.institution_name || null,
    account.currency_code,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function TransactionEditForm({
  transactionId,
  transactionType,
  transactionDate,
  accountId,
  categoryId,
  amount,
  cancelHref,
  description,
  notes,
  status,
  accounts,
  categories,
  returnTo,
}: TransactionEditFormProps) {
  return (
    <form action={updateManualTransactionAction} className="space-y-4">
      <input type="hidden" name="transaction_id" value={transactionId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="merchant_name" value="" />

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

        <div className="space-y-2">
          <Label htmlFor={`edit_status_${transactionId}`}>Status</Label>
          <select
            id={`edit_status_${transactionId}`}
            name="status"
            defaultValue={status}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
            defaultValue={accountId}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
          <Input
            id={`edit_amount_${transactionId}`}
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={amount}
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

      <div className="space-y-2">
        <Label htmlFor={`edit_notes_${transactionId}`}>Notes</Label>
        <Textarea
          id={`edit_notes_${transactionId}`}
          name="notes"
          defaultValue={notes}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit">Save transaction</Button>
        <Link
          href={cancelHref}
          className={buttonVariants({ variant: 'outline' })}
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
