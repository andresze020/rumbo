'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  createManualTransactionAction,
  createTransferTransactionAction,
} from './actions'
import { CategoryPicker } from './category-picker'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/submit-button'
import { fetchFxRate } from '@/lib/fx'

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
  baseCurrency: string
  cancelHref?: string
  onCancel?: () => void
  categories: TransactionFormCategory[]
  defaultDate: string
  defaultAccountId?: string
}

const selectCls =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function formatAccountLabel(account: TransactionFormAccount) {
  return [account.name, account.institution_name || null, account.currency_code]
    .filter(Boolean)
    .join(' · ')
}

export function TransactionForm({
  accounts,
  baseCurrency,
  cancelHref,
  onCancel,
  categories,
  defaultDate,
  defaultAccountId,
}: TransactionFormProps) {
  const [transactionType, setTransactionType] = useState<TransactionType>('expense')
  const [transactionDate, setTransactionDate] = useState(defaultDate)
  const [accountId, setAccountId] = useState(defaultAccountId ?? '')
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [userRate, setUserRate] = useState('')
  const [fetchingRate, setFetchingRate] = useState(false)
  const [fxNote, setFxNote] = useState('')
  const [fxError, setFxError] = useState('')

  const selectedAccount = accounts.find((a) => a.id === accountId)
  const isMultiCurrency = Boolean(
    selectedAccount && selectedAccount.currency_code !== baseCurrency
  )
  const parsedRate = Number(userRate)
  const rateIsValid =
    userRate.trim() !== '' && Number.isFinite(parsedRate) && parsedRate > 0
  const exchangeRateToBase = rateIsValid ? String(1 / parsedRate) : ''

  const compatibleCategories = useMemo(
    () =>
      categories.filter(
        (c) => transactionType !== 'transfer' && c.category_type === transactionType
      ),
    [categories, transactionType]
  )
  const isTransfer = transactionType === 'transfer'
  const selectedFromAccount = accounts.find((a) => a.id === fromAccountId)
  const selectedToAccount = accounts.find((a) => a.id === toAccountId)
  const isCrossCurrencyTransfer =
    Boolean(selectedFromAccount && selectedToAccount) &&
    selectedFromAccount?.currency_code !== selectedToAccount?.currency_code
  const isTransferNonBaseCurrency =
    isTransfer &&
    !isCrossCurrencyTransfer &&
    Boolean(selectedFromAccount) &&
    selectedFromAccount?.currency_code !== baseCurrency
  const submitAction = isTransfer
    ? createTransferTransactionAction
    : createManualTransactionAction
  const canSubmit = isTransfer
    ? accounts.length >= 2 &&
      Boolean(fromAccountId) &&
      Boolean(toAccountId) &&
      !isCrossCurrencyTransfer &&
      (!isTransferNonBaseCurrency || rateIsValid)
    : compatibleCategories.length > 0 &&
      Boolean(categoryId) &&
      (!isMultiCurrency || rateIsValid)

  useEffect(() => {
    if (!isMultiCurrency || !selectedAccount || !transactionDate) return
    void autoFetch(selectedAccount.currency_code, transactionDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, transactionDate])

  useEffect(() => {
    if (!isTransferNonBaseCurrency || !selectedFromAccount || !transactionDate) return
    void autoFetch(selectedFromAccount.currency_code, transactionDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromAccountId, transactionDate])

  async function autoFetch(accountCurrency: string, date: string) {
    setFetchingRate(true)
    setFxNote('')
    setFxError('')
    const result = await fetchFxRate(baseCurrency, accountCurrency, date)
    setFetchingRate(false)
    if (result.rate !== null) {
      setUserRate(String(parseFloat(result.rate.toFixed(6))))
      if (result.isLatest) {
        setFxNote(
          `No rate available for future dates — using latest market rate (${result.date}).`
        )
      } else {
        setFxNote(`Rate for ${result.date}.`)
      }
    } else {
      setFxError(result.error)
    }
  }

  function handleTransactionTypeChange(value: TransactionType) {
    setTransactionType(value)
    // Reset transfer-specific fields unconditionally; preserve accountId between income/expense
    setFromAccountId('')
    setToAccountId('')
    setCategoryId('')
    setUserRate('')
    setFxNote('')
    setFxError('')
  }

  return (
    <form action={submitAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="transaction_type">Type</Label>
        <select
          id="transaction_type"
          name="transaction_type"
          value={transactionType}
          onChange={(e) => handleTransactionTypeChange(e.target.value as TransactionType)}
          className={selectCls}
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
          value={transactionDate}
          onChange={(e) => {
            setTransactionDate(e.target.value)
            if (isMultiCurrency) {
              setUserRate('')
              setFxNote('')
              setFxError('')
            }
          }}
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
              onChange={(e) => {
                const next = e.target.value
                setFromAccountId(next)
                if (next === toAccountId) setToAccountId('')
              }}
              className={selectCls}
            >
              <option value="" disabled>Select source</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id} disabled={a.id === toAccountId}>
                  {formatAccountLabel(a)}
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
              onChange={(e) => {
                const next = e.target.value
                setToAccountId(next)
                if (next === fromAccountId) setFromAccountId('')
              }}
              className={selectCls}
            >
              <option value="" disabled>Select destination</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id} disabled={a.id === fromAccountId}>
                  {formatAccountLabel(a)}
                </option>
              ))}
            </select>
          </div>

          {accounts.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              Create at least two accounts to transfer between them.
            </p>
          ) : null}

          {isCrossCurrencyTransfer ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              Cross-currency transfers are not supported yet.
            </p>
          ) : isTransferNonBaseCurrency ? (
            <div className="space-y-2">
              <Label htmlFor="user_rate">
                1 {baseCurrency} = ? {selectedFromAccount?.currency_code}
                {fetchingRate ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    Fetching rate…
                  </span>
                ) : null}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="user_rate"
                  type="text"
                  inputMode="decimal"
                  placeholder={fetchingRate ? 'Fetching…' : 'e.g. 2690'}
                  value={userRate}
                  onChange={(e) => {
                    setUserRate(e.target.value)
                    setFxNote('')
                    setFxError('')
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={fetchingRate}
                  onClick={() =>
                    selectedFromAccount &&
                    autoFetch(selectedFromAccount.currency_code, transactionDate)
                  }
                >
                  Refresh
                </Button>
              </div>
              {fxError ? (
                <p className="text-xs text-destructive">{fxError}</p>
              ) : fxNote ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">{fxNote}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Auto-filled for {transactionDate}. Edit if needed.
                </p>
              )}
              <input type="hidden" name="exchange_rate_to_base" value={exchangeRateToBase} />
            </div>
          ) : (
            <input type="hidden" name="exchange_rate_to_base" value="1" />
          )}
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
              onChange={(e) => {
                setAccountId(e.target.value)
                setUserRate('')
                setFxNote('')
                setFxError('')
              }}
              className={selectCls}
            >
              <option value="" disabled>Select account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {formatAccountLabel(a)}
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
        <Input id="amount" name="amount" type="number" min="0.01" step="0.01" required />
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
        <select id="status" name="status" defaultValue="posted" className={selectCls}>
          <option value="posted">Posted</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {!isTransfer ? (
        isMultiCurrency ? (
          <div className="space-y-2">
            <Label htmlFor="user_rate">
              1 {baseCurrency} = ? {selectedAccount?.currency_code}
              {fetchingRate ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  Fetching rate…
                </span>
              ) : null}
            </Label>
            <div className="flex gap-2">
              <Input
                id="user_rate"
                type="text"
                inputMode="decimal"
                placeholder={fetchingRate ? 'Fetching…' : 'e.g. 2690'}
                value={userRate}
                onChange={(e) => {
                  setUserRate(e.target.value)
                  setFxNote('')
                  setFxError('')
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={fetchingRate}
                onClick={() =>
                  selectedAccount &&
                  autoFetch(selectedAccount.currency_code, transactionDate)
                }
              >
                Refresh
              </Button>
            </div>
            {fxError ? (
              <p className="text-xs text-destructive">{fxError}</p>
            ) : fxNote ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">{fxNote}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Auto-filled for {transactionDate}. Edit if needed.
              </p>
            )}
            <input type="hidden" name="exchange_rate_to_base" value={exchangeRateToBase} />
          </div>
        ) : (
          <input type="hidden" name="exchange_rate_to_base" value="1" />
        )
      ) : null}

      <div className="flex flex-wrap gap-2">
        <SubmitButton
          type="submit"
          disabled={!canSubmit}
          pendingText={isTransfer ? 'Creating transfer' : 'Creating transaction'}
        >
          {isTransfer ? 'Create transfer' : 'Create transaction'}
        </SubmitButton>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : cancelHref ? (
          <Link href={cancelHref} className={buttonVariants({ variant: 'outline' })}>
            Cancel
          </Link>
        ) : null}
      </div>
    </form>
  )
}
