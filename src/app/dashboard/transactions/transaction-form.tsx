'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  createManualTransactionAction,
  createTransferTransactionAction,
} from './actions'
import { CategoryPicker } from './category-picker'
import { AdvancedFields } from '@/components/advanced-fields'
import { InfoTooltip } from '@/components/info-tooltip'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/submit-button'
import { fetchFxRate } from '@/lib/fx'
import {
  formatAmountForDisplay,
  getCurrencySymbol,
  sanitizeAmountInput,
} from '@/lib/format'
import { useLanguage } from '@/components/language-provider'
import { cn } from '@/lib/utils'

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
  defaultType?: TransactionType
  defaultStatus?: string
  defaultAmount?: string
  defaultCategoryId?: string
  defaultDescription?: string
  defaultMerchantName?: string
  returnTo?: string
}

const selectCls =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

const LAST_ACCOUNT_KEY = 'af_last_account_id'
const CATEGORY_USAGE_KEY = 'af_category_usage'

function lastCategoryKey(transactionType: TransactionType) {
  return `af_last_category_id_${transactionType}`
}

function formatAccountLabel(account: TransactionFormAccount) {
  return [account.name, account.institution_name || null, account.currency_code]
    .filter(Boolean)
    .join(' · ')
}

function formatCurrency(value: number | string, currencyCode: string) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currencyCode,
  }).format(Number(value))
}

export function TransactionForm({
  accounts,
  baseCurrency,
  cancelHref,
  onCancel,
  categories,
  defaultDate,
  defaultAccountId,
  defaultType,
  defaultStatus,
  defaultAmount,
  defaultCategoryId,
  defaultDescription,
  defaultMerchantName,
  returnTo,
}: TransactionFormProps) {
  const { t } = useLanguage()
  const [transactionType, setTransactionType] = useState<TransactionType>(defaultType ?? 'expense')
  const [transactionDate, setTransactionDate] = useState(defaultDate)
  const [accountId, setAccountId] = useState(defaultAccountId ?? '')
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? '')
  const [amountInput, setAmountInput] = useState(defaultAmount ?? '')
  const [userRate, setUserRate] = useState('')
  const [fetchingRate, setFetchingRate] = useState(false)
  const [fxNote, setFxNote] = useState('')
  const [fxError, setFxError] = useState('')

  // Apply remembered account/category defaults from previous submissions, once,
  // only when the caller hasn't supplied explicit defaults of their own.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const frame = window.requestAnimationFrame(() => {
      if (!defaultAccountId) {
        const lastAccountId = window.localStorage.getItem(LAST_ACCOUNT_KEY)
        if (lastAccountId && accounts.some((a) => a.id === lastAccountId)) {
          setAccountId((current) => current || lastAccountId)
        }
      }
      if (!defaultCategoryId) {
        const lastCategoryId = window.localStorage.getItem(lastCategoryKey(transactionType))
        if (lastCategoryId && categories.some((c) => c.id === lastCategoryId)) {
          setCategoryId((current) => current || lastCategoryId)
        }
      }
    })

    return () => window.cancelAnimationFrame(frame)
    // Only run on initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedAccount = accounts.find((a) => a.id === accountId)
  const isMultiCurrency = Boolean(
    selectedAccount && selectedAccount.currency_code !== baseCurrency
  )
  const parsedRate = Number(userRate)
  const rateIsValid =
    userRate.trim() !== '' && Number.isFinite(parsedRate) && parsedRate > 0
  const exchangeRateToBase = rateIsValid ? String(1 / parsedRate) : ''
  const parsedAmount = Number(amountInput)
  const amountIsValid =
    amountInput.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount !== 0

  function conversionPreview(foreignCurrency: string | undefined) {
    if (!foreignCurrency || !rateIsValid || !amountIsValid) return null
    return `${formatCurrency(parsedAmount, foreignCurrency)} ≈ ${formatCurrency(parsedAmount / parsedRate, baseCurrency)}`
  }

  const compatibleCategories = useMemo(
    () =>
      categories.filter(
        (c) => transactionType !== 'transfer' && c.category_type === transactionType
      ),
    [categories, transactionType]
  )

  // Most-used categories (for the current type) as one-tap chips.
  const [frequentCategories, setFrequentCategories] = useState<TransactionFormCategory[]>([])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const frame = window.requestAnimationFrame(() => {
      if (compatibleCategories.length < 2) {
        setFrequentCategories([])
        return
      }
      try {
        const raw = window.localStorage.getItem(CATEGORY_USAGE_KEY)
        const usage: Record<string, number> = raw ? JSON.parse(raw) : {}
        const ranked = compatibleCategories
          .filter((c) => usage[c.id] > 0)
          .sort((a, b) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0))
          .slice(0, 4)
        setFrequentCategories(ranked)
      } catch {
        setFrequentCategories([])
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [compatibleCategories])
  const isTransfer = transactionType === 'transfer'
  const selectedFromAccount = accounts.find((a) => a.id === fromAccountId)
  const selectedToAccount = accounts.find((a) => a.id === toAccountId)
  const amountCurrencyCode =
    (isTransfer ? selectedFromAccount?.currency_code : selectedAccount?.currency_code) ??
    baseCurrency
  const amountCurrencySymbol = getCurrencySymbol(amountCurrencyCode)
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

  function rememberDefaults() {
    if (typeof window === 'undefined' || isTransfer) return
    if (accountId) window.localStorage.setItem(LAST_ACCOUNT_KEY, accountId)
    if (!categoryId) return
    window.localStorage.setItem(lastCategoryKey(transactionType), categoryId)
    try {
      const raw = window.localStorage.getItem(CATEGORY_USAGE_KEY)
      const usage: Record<string, number> = raw ? JSON.parse(raw) : {}
      usage[categoryId] = (usage[categoryId] ?? 0) + 1
      window.localStorage.setItem(CATEGORY_USAGE_KEY, JSON.stringify(usage))
    } catch {
      // Ignore malformed usage data; chips simply won't update this time.
    }
  }

  function handleTransactionTypeChange(value: TransactionType) {
    setTransactionType(value)
    if (value === 'transfer') {
      // Carry current account over as the transfer source
      setFromAccountId(accountId)
    }
    setToAccountId('')
    setCategoryId('')
    setUserRate('')
    setFxNote('')
    setFxError('')
  }

  return (
    <form action={submitAction} onSubmit={rememberDefaults} className="space-y-4">
      {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
      <div className="space-y-2">
        <Label htmlFor="transaction_type">
          {t('transactionForm.type')}
          <InfoTooltip term="transfer" label={t('transactionForm.typeTransfer')} />
        </Label>
        <select
          id="transaction_type"
          name="transaction_type"
          value={transactionType}
          onChange={(e) => handleTransactionTypeChange(e.target.value as TransactionType)}
          className={selectCls}
        >
          <option value="expense">{t('transactionForm.typeExpense')}</option>
          <option value="income">{t('transactionForm.typeIncome')}</option>
          <option value="transfer">{t('transactionForm.typeTransfer')}</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="transaction_date">{t('transactionForm.date')}</Label>
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
            <Label htmlFor="from_account_id">{t('transactionForm.fromAccount')}</Label>
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
              <option value="" disabled>{t('transactionForm.selectSource')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id} disabled={a.id === toAccountId}>
                  {formatAccountLabel(a)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="to_account_id">{t('transactionForm.toAccount')}</Label>
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
              <option value="" disabled>{t('transactionForm.selectDestination')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id} disabled={a.id === fromAccountId}>
                  {formatAccountLabel(a)}
                </option>
              ))}
            </select>
          </div>

          {accounts.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              {t('transactionForm.needTwoAccounts')}
            </p>
          ) : null}

          {isCrossCurrencyTransfer ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {t('transactionForm.crossCurrencyNotSupported')}
            </p>
          ) : isTransferNonBaseCurrency ? (
            <AdvancedFields
              defaultOpen
              summary={
                rateIsValid
                  ? `Exchange rate: 1 ${baseCurrency} = ${userRate} ${selectedFromAccount?.currency_code}`
                  : undefined
              }
            >
              <Label htmlFor="user_rate">
                Exchange rate: 1 {baseCurrency} = ? {selectedFromAccount?.currency_code}
                <InfoTooltip term="exchangeRate" label="Exchange rate" />
                {fetchingRate ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    Fetching rate…
                  </span>
                ) : null}
              </Label>
              <p className="text-xs text-muted-foreground">
                Enter how many {selectedFromAccount?.currency_code} make up 1 {baseCurrency}.
                This converts the transfer amount into {baseCurrency} for your reports and totals.
              </p>
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
              {conversionPreview(selectedFromAccount?.currency_code) ? (
                <p className="text-xs font-medium text-foreground">
                  {conversionPreview(selectedFromAccount?.currency_code)}{' '}
                  <span className="font-normal text-muted-foreground">at this rate</span>
                </p>
              ) : null}
              <input type="hidden" name="exchange_rate_to_base" value={exchangeRateToBase} />
            </AdvancedFields>
          ) : (
            <input type="hidden" name="exchange_rate_to_base" value="1" />
          )}
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="account_id">{t('transactionForm.account')}</Label>
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
              <option value="" disabled>{t('transactionForm.selectAccount')}</option>
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
            selectedCategoryId={categoryId}
          />

          {frequentCategories.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('transactionForm.frequentlyUsed')}</span>
              {frequentCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setCategoryId(category.id)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    categoryId === category.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {category.name}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="amount">{t('transactionForm.amount')}</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {amountCurrencySymbol}
          </span>
          <Input
            id="amount"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={formatAmountForDisplay(amountInput)}
            onChange={(e) => setAmountInput(sanitizeAmountInput(e.target.value))}
            className="pl-7"
            required
          />
        </div>
        <input type="hidden" name="amount" value={amountInput} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">{t('transactionForm.description')}</Label>
        <Input id="description" name="description" defaultValue={defaultDescription} />
      </div>

      {!isTransfer ? (
        <div className="space-y-2">
          <Label htmlFor="merchant_name">{t('transactionForm.merchant')}</Label>
          <Input id="merchant_name" name="merchant_name" defaultValue={defaultMerchantName} />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="notes">{t('transactionForm.notes')}</Label>
        <Textarea id="notes" name="notes" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">{t('transactionForm.status')}</Label>
        <select id="status" name="status" defaultValue={defaultStatus ?? 'posted'} className={selectCls}>
          <option value="posted">{t('transactionForm.statusPosted')}</option>
          <option value="pending">{t('transactionForm.statusPending')}</option>
        </select>
      </div>

      {!isTransfer ? (
        isMultiCurrency ? (
          <AdvancedFields
            defaultOpen
            summary={
              rateIsValid
                ? `Exchange rate: 1 ${baseCurrency} = ${userRate} ${selectedAccount?.currency_code}`
                : undefined
            }
          >
            <Label htmlFor="user_rate">
              Exchange rate: 1 {baseCurrency} = ? {selectedAccount?.currency_code}
              <InfoTooltip term="exchangeRate" label="Exchange rate" />
              {fetchingRate ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  Fetching rate…
                </span>
              ) : null}
            </Label>
            <p className="text-xs text-muted-foreground">
              Enter how many {selectedAccount?.currency_code} make up 1 {baseCurrency}. This
              converts the amount into {baseCurrency} for your reports and totals.
            </p>
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
            {conversionPreview(selectedAccount?.currency_code) ? (
              <p className="text-xs font-medium text-foreground">
                {conversionPreview(selectedAccount?.currency_code)}{' '}
                <span className="font-normal text-muted-foreground">at this rate</span>
              </p>
            ) : null}
            <input type="hidden" name="exchange_rate_to_base" value={exchangeRateToBase} />
          </AdvancedFields>
        ) : (
          <input type="hidden" name="exchange_rate_to_base" value="1" />
        )
      ) : null}

      <div className="flex flex-wrap gap-2">
        <SubmitButton
          type="submit"
          disabled={!canSubmit}
          pendingText={isTransfer ? t('transactionForm.creatingTransfer') : t('transactionForm.creatingTransaction')}
        >
          {isTransfer ? t('transactionForm.createTransfer') : t('transactionForm.createTransaction')}
        </SubmitButton>
        {!isTransfer ? (
          <SubmitButton
            type="submit"
            name="add_next"
            value="true"
            variant="outline"
            disabled={!canSubmit}
            pendingText={t('transactionForm.saving')}
          >
            {t('transactionForm.saveAndAddNext')}
          </SubmitButton>
        ) : null}
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('transactionForm.cancel')}
          </Button>
        ) : cancelHref ? (
          <Link href={cancelHref} className={buttonVariants({ variant: 'outline' })}>
            {t('transactionForm.cancel')}
          </Link>
        ) : null}
      </div>
    </form>
  )
}
