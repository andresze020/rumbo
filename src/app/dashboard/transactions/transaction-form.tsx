'use client'

import { useMemo, useState } from 'react'
import {
  createManualTransactionAction,
  createTransferTransactionAction,
} from './actions'
import { CategoryPicker } from './category-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type TransactionType = 'income' | 'expense' | 'transfer'

export type TransactionFormAccount = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
}

export type TransactionFormCategory = {
  id: string
  name: string
  category_type: string
  reporting_type: string
  parent_category_id: string | null
}

type TransactionFormProps = {
  accounts: TransactionFormAccount[]
  categories: TransactionFormCategory[]
  defaultDate: string
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

export function TransactionForm({
  accounts,
  categories,
  defaultDate,
}: TransactionFormProps) {
  const [transactionType, setTransactionType] =
    useState<TransactionType>('expense')
  const [accountId, setAccountId] = useState('')
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')

  const compatibleCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          transactionType !== 'transfer' &&
          category.category_type === transactionType
      ),
    [categories, transactionType]
  )
  const isTransfer = transactionType === 'transfer'
  const submitAction = isTransfer
    ? createTransferTransactionAction
    : createManualTransactionAction
  const canSubmit = isTransfer
    ? accounts.length >= 2
    : compatibleCategories.length > 0 && Boolean(categoryId)

  function handleTransactionTypeChange(value: TransactionType) {
    setTransactionType(value)
    setAccountId('')
    setFromAccountId('')
    setToAccountId('')
    setCategoryId('')
  }

  return (
    <form action={submitAction} className="space-y-4">
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
          <option value="transfer">Transfer</option>
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

      {isTransfer ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="from_account_id">From account</Label>
            <select
              id="from_account_id"
              name="from_account_id"
              required
              value={fromAccountId}
              onChange={(event) => {
                const nextAccountId = event.target.value
                setFromAccountId(nextAccountId)

                if (nextAccountId === toAccountId) {
                  setToAccountId('')
                }
              }}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="" disabled>
                Select source
              </option>
              {accounts.map((account) => (
                <option
                  key={account.id}
                  value={account.id}
                  disabled={account.id === toAccountId}
                >
                  {formatAccountLabel(account)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="to_account_id">To account</Label>
            <select
              id="to_account_id"
              name="to_account_id"
              required
              value={toAccountId}
              onChange={(event) => {
                const nextAccountId = event.target.value
                setToAccountId(nextAccountId)

                if (nextAccountId === fromAccountId) {
                  setFromAccountId('')
                }
              }}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="" disabled>
                Select destination
              </option>
              {accounts.map((account) => (
                <option
                  key={account.id}
                  value={account.id}
                  disabled={account.id === fromAccountId}
                >
                  {formatAccountLabel(account)}
                </option>
              ))}
            </select>
          </div>

          {accounts.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              Create at least two accounts to transfer between them.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="account_id">Account</Label>
            <select
              id="account_id"
              name="account_id"
              required
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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

          <CategoryPicker
            key={transactionType}
            categories={compatibleCategories}
            transactionType={transactionType}
            onCategoryChange={setCategoryId}
          />
        </>
      )}

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

      {!isTransfer ? (
        <div className="space-y-2">
          <Label htmlFor="merchant_name">Merchant</Label>
          <Input id="merchant_name" name="merchant_name" />
        </div>
      ) : null}

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

      {!isTransfer ? (
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
      ) : null}

      <Button type="submit" className="w-full" disabled={!canSubmit}>
        {isTransfer ? 'Create transfer' : 'Create transaction'}
      </Button>
    </form>
  )
}
