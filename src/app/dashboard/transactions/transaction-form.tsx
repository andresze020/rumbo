'use client'

import { useMemo, useState } from 'react'
import { createManualTransactionAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type TransactionType = 'income' | 'expense'

export type TransactionFormAccount = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
}

export type TransactionFormCategory = {
  id: string
  name: string
  reporting_type: string
}

type TransactionFormProps = {
  accounts: TransactionFormAccount[]
  categories: TransactionFormCategory[]
  defaultDate: string
}

function formatValue(value: string) {
  return value.replaceAll('_', ' ')
}

function formatAccountLabel(account: TransactionFormAccount) {
  return [
    account.name,
    account.institution_name || null,
    account.currency_code,
  ]
    .filter(Boolean)
    .join(' · ')
}

function formatCategoryLabel(category: TransactionFormCategory) {
  return `${category.name} · ${formatValue(category.reporting_type)}`
}

function isCompatibleCategory(
  transactionType: TransactionType,
  category: TransactionFormCategory
) {
  if (transactionType === 'income') {
    return category.reporting_type === 'income'
  }

  return ['expense', 'debt_interest'].includes(category.reporting_type)
}

export function TransactionForm({
  accounts,
  categories,
  defaultDate,
}: TransactionFormProps) {
  const [transactionType, setTransactionType] =
    useState<TransactionType>('expense')
  const [categoryId, setCategoryId] = useState('')

  const compatibleCategories = useMemo(
    () =>
      categories.filter((category) =>
        isCompatibleCategory(transactionType, category)
      ),
    [categories, transactionType]
  )

  function handleTransactionTypeChange(value: TransactionType) {
    setTransactionType(value)
    setCategoryId('')
  }

  return (
    <form action={createManualTransactionAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="transaction_type">Type</Label>
        <select
          id="transaction_type"
          name="transaction_type"
          value={transactionType}
          onChange={(event) =>
            handleTransactionTypeChange(event.target.value as TransactionType)
          }
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="transaction_date">Date</Label>
        <Input
          id="transaction_date"
          name="transaction_date"
          type="date"
          defaultValue={defaultDate}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="account_id">Account</Label>
        <select
          id="account_id"
          name="account_id"
          required
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          defaultValue=""
        >
          <option value="" disabled>
            Select account
          </option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {formatAccountLabel(account)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="category_id">Category</Label>
        <select
          id="category_id"
          name="category_id"
          required
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          disabled={!compatibleCategories.length}
        >
          <option value="" disabled>
            Select category
          </option>
          {compatibleCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {formatCategoryLabel(category)}
            </option>
          ))}
        </select>

        {!compatibleCategories.length ? (
          <p className="text-sm text-muted-foreground">
            No compatible categories available for this transaction type.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="amount">Amount</Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input id="description" name="description" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="merchant_name">Merchant</Label>
        <Input id="merchant_name" name="merchant_name" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <select
          id="status"
          name="status"
          defaultValue="posted"
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="posted">Posted</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="exchange_rate_to_base">Exchange rate to base</Label>
        <Input
          id="exchange_rate_to_base"
          name="exchange_rate_to_base"
          type="number"
          min="0.00000001"
          step="0.00000001"
          defaultValue="1"
          required
        />
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={!compatibleCategories.length}
      >
        Create transaction
      </Button>
    </form>
  )
}
