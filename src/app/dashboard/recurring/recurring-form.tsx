'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createRecurringAction, updateRecurringAction } from './actions'
import { AmountInput } from '@/components/amount-input'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/submit-button'
import { RECURRING_FREQUENCIES, type RecurringType } from '@/lib/recurring/shared'

export type RecurringFormCategory = {
  id: string
  name: string
  category_type: string
  parent_category_id: string | null
  icon: string | null
}

export type RecurringFormAccount = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
}

export type RecurringTemplate = {
  id: string
  name: string
  transaction_type: string
  account_id: string | null
  category_id: string | null
  amount: number | string
  frequency: string
  start_date: string
  end_date: string | null
}

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function accountLabel(account: RecurringFormAccount) {
  return [account.name, account.institution_name, account.currency_code]
    .filter(Boolean)
    .join(' · ')
}

function categoryLabel(
  category: RecurringFormCategory,
  byId: Map<string, RecurringFormCategory>
) {
  const parent = category.parent_category_id ? byId.get(category.parent_category_id) : null
  const name = parent ? `${parent.name} / ${category.name}` : category.name
  return category.icon ? `${category.icon} ${name}` : name
}

export function RecurringForm({
  mode,
  template,
  accounts,
  categories,
}: {
  mode: 'create' | 'edit'
  template?: RecurringTemplate
  accounts: RecurringFormAccount[]
  categories: RecurringFormCategory[]
}) {
  const today = new Date().toISOString().slice(0, 10)

  const [transactionType, setTransactionType] = useState<RecurringType>(
    (template?.transaction_type as RecurringType) ?? 'expense'
  )
  const [accountId, setAccountId] = useState(template?.account_id ?? '')
  const [categoryId, setCategoryId] = useState(template?.category_id ?? '')

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  )

  const compatibleCategories = useMemo(
    () => categories.filter((c) => c.category_type === transactionType),
    [categories, transactionType]
  )

  const selectedAccount = accounts.find((a) => a.id === accountId)
  const currencyCode = selectedAccount?.currency_code ?? ''

  const formAction = mode === 'create' ? createRecurringAction : updateRecurringAction

  function handleTypeChange(value: string) {
    setTransactionType(value as RecurringType)
    // Clear the category if it no longer matches the new type.
    const stillValid = categories.some(
      (c) => c.id === categoryId && c.category_type === value
    )
    if (!stillValid) setCategoryId('')
  }

  return (
    <form action={formAction} className="space-y-4">
      {template ? (
        <input type="hidden" name="recurring_id" value={template.id} />
      ) : null}
      <input type="hidden" name="transaction_type" value={transactionType} />
      <input type="hidden" name="currency_code" value={currencyCode} />

      <div className="space-y-2">
        <Label htmlFor={`name_${mode}`}>Name</Label>
        <Input
          id={`name_${mode}`}
          name="name"
          maxLength={120}
          defaultValue={template?.name ?? ''}
          placeholder="Rent, Spotify, Salary…"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`type_${mode}`}>Type</Label>
          <select
            id={`type_${mode}`}
            value={transactionType}
            onChange={(e) => handleTypeChange(e.target.value)}
            className={selectClassName}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`frequency_${mode}`}>Frequency</Label>
          <select
            id={`frequency_${mode}`}
            name="frequency"
            defaultValue={template?.frequency ?? 'monthly'}
            className={selectClassName}
          >
            {RECURRING_FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`account_${mode}`}>Account</Label>
          <select
            id={`account_${mode}`}
            name="account_id"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className={selectClassName}
            required
          >
            <option value="" disabled>
              Select account
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountLabel(account)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`category_${mode}`}>Category</Label>
          <select
            id={`category_${mode}`}
            name="category_id"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={selectClassName}
            required
            disabled={!compatibleCategories.length}
          >
            <option value="" disabled>
              Select category
            </option>
            {compatibleCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {categoryLabel(category, categoriesById)}
              </option>
            ))}
          </select>
          {!compatibleCategories.length ? (
            <p className="text-xs text-muted-foreground">
              No {transactionType} categories available.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`amount_${mode}`}>Amount</Label>
          <AmountInput
            id={`amount_${mode}`}
            name="amount"
            currencyCode={currencyCode || 'USD'}
            defaultValue={template ? Number(template.amount).toFixed(2) : ''}
            required
          />
          {currencyCode ? (
            <p className="text-xs text-muted-foreground">In {currencyCode}.</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Select an account to set the currency.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`start_${mode}`}>Start date</Label>
          <Input
            id={`start_${mode}`}
            name="start_date"
            type="date"
            defaultValue={template?.start_date ?? today}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`end_${mode}`}>End date (optional)</Label>
          <Input
            id={`end_${mode}`}
            name="end_date"
            type="date"
            defaultValue={template?.end_date ?? ''}
          />
          <p className="text-xs text-muted-foreground">
            Leave empty for no end date.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <SubmitButton
          type="submit"
          pendingText={mode === 'create' ? 'Creating…' : 'Saving…'}
        >
          {mode === 'create' ? 'Create recurring' : 'Save changes'}
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
