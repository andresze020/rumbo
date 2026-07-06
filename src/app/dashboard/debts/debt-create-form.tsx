'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createDebtAction } from './actions'
import { AdvancedFields } from '@/components/advanced-fields'
import { AmountInput } from '@/components/amount-input'
import { InfoTooltip } from '@/components/info-tooltip'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/submit-button'
import { fetchFxRate } from '@/lib/fx'
import { nativeSelectCls, formActionsCls, formBtnCls } from '@/lib/form-styles'
import { cn } from '@/lib/utils'

type CurrencyOption = { code: string; name: string }
type LiabilityAccount = { id: string; name: string; account_type: string; currency_code: string }

const selectCls = nativeSelectCls

function formatCurrency(value: number | string, currencyCode: string) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currencyCode,
  }).format(Number(value))
}

export function DebtCreateForm({
  baseCurrency,
  currencyOptions,
  defaultCurrency,
  linkableLiabilityAccounts,
}: {
  baseCurrency: string
  currencyOptions: CurrencyOption[]
  defaultCurrency: string
  linkableLiabilityAccounts: LiabilityAccount[]
}) {
  const today = new Date().toISOString().slice(0, 10)

  const [existingAccountId, setExistingAccountId] = useState('')
  const [selectedCurrency, setSelectedCurrency] = useState(defaultCurrency)
  const [openingBalanceInput, setOpeningBalanceInput] = useState('0')
  const [openingBalanceDate, setOpeningBalanceDate] = useState(today)
  const [userRate, setUserRate] = useState('')
  const [fetchingRate, setFetchingRate] = useState(false)
  const [fxNote, setFxNote] = useState('')
  const [fxError, setFxError] = useState('')

  const isNewAccount = existingAccountId === ''
  const isMultiCurrency = isNewAccount && selectedCurrency !== baseCurrency
  // Loan amounts (principal, minimum payment) live in the debt account's currency.
  const debtCurrency = isNewAccount
    ? selectedCurrency
    : linkableLiabilityAccounts.find((a) => a.id === existingAccountId)?.currency_code ??
      baseCurrency
  const parsedRate = Number(userRate)
  const rateIsValid =
    userRate.trim() !== '' && Number.isFinite(parsedRate) && parsedRate > 0
  const parsedOpeningBalance = Number(openingBalanceInput)
  const conversionPreview =
    rateIsValid &&
    openingBalanceInput.trim() !== '' &&
    Number.isFinite(parsedOpeningBalance) &&
    parsedOpeningBalance !== 0
      ? `${formatCurrency(parsedOpeningBalance, selectedCurrency)} ≈ ${formatCurrency(parsedOpeningBalance / parsedRate, baseCurrency)}`
      : null

  useEffect(() => {
    if (!isMultiCurrency) return
    void autoFetch(selectedCurrency, openingBalanceDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCurrency, isNewAccount, openingBalanceDate])

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

  return (
    <form action={createDebtAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Debt name</Label>
          <Input id="name" name="name" required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="lender_name">Lender</Label>
          <Input id="lender_name" name="lender_name" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="existing_account_id">Existing liability account</Label>
          <select
            id="existing_account_id"
            name="existing_account_id"
            className={selectCls}
            value={existingAccountId}
            onChange={(e) => {
              setExistingAccountId(e.target.value)
              setUserRate('')
              setFxNote('')
              setFxError('')
            }}
          >
            <option value="">Create new account</option>
            {linkableLiabilityAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.account_type.replace('_', ' ')} ·{' '}
                {account.currency_code}
              </option>
            ))}
          </select>
        </div>

        {isNewAccount ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="account_type">New account type</Label>
              <select
                id="account_type"
                name="account_type"
                className={selectCls}
                defaultValue="debt"
              >
                <option value="debt">Debt</option>
                <option value="credit_card">Credit card</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency_code">Currency</Label>
              <select
                id="currency_code"
                name="currency_code"
                className={selectCls}
                value={selectedCurrency}
                onChange={(e) => {
                  setSelectedCurrency(e.target.value)
                  setUserRate('')
                  setFxNote('')
                  setFxError('')
                }}
              >
                {currencyOptions.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} · {currency.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="opening_balance_amount">Current outstanding balance</Label>
              <AmountInput
                id="opening_balance_amount"
                name="opening_balance_amount"
                currencyCode={selectedCurrency}
                value={openingBalanceInput}
                onValueChange={setOpeningBalanceInput}
              />
              <p className="text-xs text-muted-foreground">
                The amount you currently owe. This creates the opening liability balance.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="opening_balance_date">Balance date</Label>
              <Input
                id="opening_balance_date"
                name="opening_balance_date"
                type="date"
                value={openingBalanceDate}
                onChange={(e) => {
                  setOpeningBalanceDate(e.target.value)
                  if (isMultiCurrency) {
                    setUserRate('')
                    setFxNote('')
                    setFxError('')
                  }
                }}
              />
            </div>

          </>
        ) : null}
      </div>

      {isNewAccount ? (
        isMultiCurrency ? (
          <AdvancedFields
            defaultOpen
            summary={
              rateIsValid
                ? `Exchange rate: 1 ${baseCurrency} = ${userRate} ${selectedCurrency}`
                : undefined
            }
          >
            <Label htmlFor="debt_user_rate">
              Exchange rate: 1 {baseCurrency} = ? {selectedCurrency}
              <InfoTooltip term="exchangeRate" label="Exchange rate" />
              {fetchingRate ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  Fetching rate…
                </span>
              ) : null}
            </Label>
            <p className="text-xs text-muted-foreground">
              Enter how many {selectedCurrency} make up 1 {baseCurrency}. This converts the
              outstanding balance above into {baseCurrency} for your net worth and reports.
            </p>
            <div className="flex gap-2">
              <Input
                id="debt_user_rate"
                type="text"
                inputMode="decimal"
                placeholder={fetchingRate ? 'Fetching…' : 'e.g. 1.35'}
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
                onClick={() => autoFetch(selectedCurrency, openingBalanceDate)}
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
                Auto-filled for {openingBalanceDate}. Edit if needed.
              </p>
            )}
            {conversionPreview ? (
              <p className="text-xs font-medium text-foreground">
                {conversionPreview}{' '}
                <span className="font-normal text-muted-foreground">at this rate</span>
              </p>
            ) : null}
            {rateIsValid ? (
              <input
                type="hidden"
                name="rate_base_to_account"
                value={String(parsedRate)}
              />
            ) : (
              <input type="hidden" name="exchange_rate_to_base" value="1" />
            )}
          </AdvancedFields>
        ) : (
          <input type="hidden" name="exchange_rate_to_base" value="1" />
        )
      ) : null}

      <AdvancedFields label="Loan details (optional)">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="original_principal">Original principal</Label>
            <AmountInput
              id="original_principal"
              name="original_principal"
              currencyCode={debtCurrency}
            />
            <p className="text-xs text-muted-foreground">
              Optional. The original amount borrowed, used for progress tracking.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="interest_rate">Interest rate</Label>
            <div className="relative">
              <Input
                id="interest_rate"
                name="interest_rate"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                className="pr-7"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="interest_rate_period">Interest period</Label>
            <select
              id="interest_rate_period"
              name="interest_rate_period"
              className={selectCls}
              defaultValue=""
            >
              <option value="">Not set</option>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="minimum_payment">Minimum payment</Label>
            <AmountInput
              id="minimum_payment"
              name="minimum_payment"
              currencyCode={debtCurrency}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment_due_day">Due day</Label>
            <Input
              id="payment_due_day"
              name="payment_due_day"
              type="number"
              min="1"
              max="31"
              step="1"
            />
          </div>
        </div>
      </AdvancedFields>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" />
      </div>

      <div className={formActionsCls}>
        <SubmitButton type="submit" className={formBtnCls} pendingText="Creating debt">
          Create debt
        </SubmitButton>
        <Link href="/dashboard/debts" className={cn(buttonVariants({ variant: 'outline' }), formBtnCls)}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
