'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { updateTransferTransactionAction } from './actions'
import { AdvancedFields } from '@/components/advanced-fields'
import { AmountInput } from '@/components/amount-input'
import { InfoTooltip } from '@/components/info-tooltip'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/submit-button'
import { fetchFxRate } from '@/lib/fx'
import { formatCurrency } from '@/lib/format'
import { nativeSelectCls, formActionsCls, formBtnCls } from '@/lib/form-styles'
import { cn } from '@/lib/utils'

type TransferAccount = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
  icon?: string | null
}

type TransferEditFormProps = {
  transactionId: string
  transactionDate: string
  fromAccountId: string
  toAccountId: string
  amount: number
  cancelHref: string
  description: string
  notes: string
  status: string
  accounts: TransferAccount[]
  returnTo: string
  baseCurrency: string
  initialExchangeRateToBase: number
  // BR-007: amount that arrived in the destination account (its own currency).
  // Equals `amount` for same-currency transfers.
  initialToAmount: number
  // Unified transfer cost (FX spread + fee): expense categories to file it
  // under, plus the currently-saved cost (base currency) + category.
  costCategories: { id: string; label: string }[]
  initialCost: number
  initialCostCategoryId: string | null
}

function formatAccountLabel(account: TransferAccount) {
  const label = [
    account.name,
    account.institution_name || null,
    account.currency_code,
  ]
    .filter(Boolean)
    .join(' · ')
  return account.icon ? `${account.icon} ${label}` : label
}

const selectCls = nativeSelectCls

export function TransferEditForm({
  transactionId,
  transactionDate,
  fromAccountId,
  toAccountId,
  amount,
  cancelHref,
  description,
  notes,
  status,
  accounts,
  returnTo,
  baseCurrency,
  initialExchangeRateToBase,
  initialToAmount,
  costCategories,
  initialCost,
  initialCostCategoryId,
}: TransferEditFormProps) {
  const [selectedFromAccountId, setSelectedFromAccountId] = useState(fromAccountId)
  const [selectedToAccountId, setSelectedToAccountId] = useState(toAccountId)
  const [currentDate, setCurrentDate] = useState(transactionDate)
  const [amountInput, setAmountInput] = useState(amount.toFixed(2))
  const [toAmountInput, setToAmountInput] = useState(
    initialToAmount ? initialToAmount.toFixed(2) : ''
  )

  // Unified transfer cost (FX spread + fee), in the household base currency.
  // Pre-filled from the saved value; if none, it is suggested from market rates
  // (below) until the user edits it.
  const [costInput, setCostInput] = useState(initialCost ? initialCost.toFixed(2) : '')
  const [costTouched, setCostTouched] = useState(initialCost > 0)
  const [costCategoryId, setCostCategoryId] = useState(
    initialCostCategoryId ?? costCategories[0]?.id ?? ''
  )
  // Each leg's market rate to base (1 for the base currency), fetched to suggest
  // the cost = sent·rateFrom − received·rateTo.
  const [fromRateToBase, setFromRateToBase] = useState<number | null>(null)
  const [toRateToBase, setToRateToBase] = useState<number | null>(null)

  // userRate is expressed as "1 baseCurrency = X foreignCurrency" (what the user sees)
  // exchange_rate_to_base = 1 / userRate (what the DB stores)
  const initialUserRate =
    initialExchangeRateToBase > 0 && initialExchangeRateToBase !== 1
      ? String(parseFloat((1 / initialExchangeRateToBase).toFixed(6)))
      : ''
  const [userRate, setUserRate] = useState(initialUserRate)
  const [fetchingRate, setFetchingRate] = useState(false)
  const [fxNote, setFxNote] = useState('')
  const [fxError, setFxError] = useState('')

  const selectedFromAccount = accounts.find((a) => a.id === selectedFromAccountId)
  const selectedToAccount = accounts.find((a) => a.id === selectedToAccountId)

  const isCrossCurrencyTransfer =
    Boolean(selectedFromAccount && selectedToAccount) &&
    selectedFromAccount?.currency_code !== selectedToAccount?.currency_code

  // A rate to base is only required when NEITHER leg is the base currency. When
  // one leg is base, the RPC derives both legs' rates from the two amounts so
  // the transfer stays value-neutral.
  const needsFromRate =
    Boolean(selectedFromAccount) &&
    selectedFromAccount?.currency_code !== baseCurrency &&
    (!selectedToAccount || selectedToAccount.currency_code !== baseCurrency)

  const parsedRate = Number(userRate)
  const rateIsValid =
    userRate.trim() !== '' && Number.isFinite(parsedRate) && parsedRate > 0
  const exchangeRateToBase = rateIsValid ? String(1 / parsedRate) : ''

  const parsedAmount = Number(amountInput)
  const amountIsValid = Number.isFinite(parsedAmount) && parsedAmount > 0

  const parsedToAmount = Number(toAmountInput)
  const toAmountValid = Number.isFinite(parsedToAmount) && parsedToAmount > 0

  // Suggested cost from market rates: what you sent minus what you received,
  // both in base currency. 0 when we can't estimate or you came out ahead.
  const suggestedCost =
    isCrossCurrencyTransfer &&
    amountIsValid &&
    toAmountValid &&
    fromRateToBase != null &&
    toRateToBase != null
      ? Math.max(0, parsedAmount * fromRateToBase - parsedToAmount * toRateToBase)
      : null
  const costValue =
    costTouched || suggestedCost == null ? costInput : suggestedCost.toFixed(2)
  const parsedCost = Number(costValue)
  const costIsPositive = Number.isFinite(parsedCost) && parsedCost > 0

  function conversionPreview() {
    if (!selectedFromAccount || !rateIsValid || !amountIsValid) return null
    return `${formatCurrency(parsedAmount, selectedFromAccount.currency_code)} ≈ ${formatCurrency(parsedAmount / parsedRate, baseCurrency)}`
  }

  const canSubmit = Boolean(
    selectedFromAccountId &&
      selectedToAccountId &&
      selectedFromAccountId !== selectedToAccountId &&
      amountIsValid &&
      (!isCrossCurrencyTransfer || toAmountValid) &&
      (!needsFromRate || rateIsValid) &&
      (!isCrossCurrencyTransfer || !costIsPositive || Boolean(costCategoryId))
  )

  // Fetch each cross-currency leg's market rate to base to suggest the cost.
  useEffect(() => {
    if (!isCrossCurrencyTransfer || !selectedFromAccount || !selectedToAccount || !currentDate) {
      return
    }
    let cancelled = false
    const rateToBase = async (currency: string) => {
      if (currency === baseCurrency) return 1
      const r = await fetchFxRate(baseCurrency, currency, currentDate)
      return r.rate && r.rate > 0 ? 1 / r.rate : null
    }
    void Promise.all([
      rateToBase(selectedFromAccount.currency_code),
      rateToBase(selectedToAccount.currency_code),
    ]).then(([fr, tr]) => {
      if (cancelled) return
      setFromRateToBase(fr)
      setToRateToBase(tr)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFromAccountId, selectedToAccountId, currentDate])

  async function autoFetch(accountCurrency: string, date: string) {
    setFetchingRate(true)
    setFxNote('')
    setFxError('')
    const result = await fetchFxRate(baseCurrency, accountCurrency, date)
    setFetchingRate(false)
    if (result.rate !== null) {
      setUserRate(String(parseFloat(result.rate.toFixed(6))))
      setFxNote(
        result.isLatest
          ? `No rate for future dates — using latest market rate (${result.date}).`
          : `Rate for ${result.date}.`
      )
    } else {
      setFxError(result.error)
    }
  }

  // Auto-fetch rate when account or date changes
  useEffect(() => {
    if (!needsFromRate || !selectedFromAccount || !currentDate) return
    const frame = window.requestAnimationFrame(() => {
      void autoFetch(selectedFromAccount.currency_code, currentDate)
    })

    return () => window.cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFromAccountId, currentDate])

  return (
    <form action={updateTransferTransactionAction} className="space-y-4">
      <input type="hidden" name="transaction_id" value={transactionId} />
      <input type="hidden" name="return_to" value={returnTo} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`transfer_date_${transactionId}`}>Date</Label>
          <Input
            id={`transfer_date_${transactionId}`}
            name="transaction_date"
            type="date"
            defaultValue={transactionDate}
            onChange={(e) => setCurrentDate(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`transfer_status_${transactionId}`}>Status</Label>
          <select
            id={`transfer_status_${transactionId}`}
            name="status"
            defaultValue={status}
            className={selectCls}
          >
            <option value="posted">Posted</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`from_account_${transactionId}`}>From account</Label>
          <select
            id={`from_account_${transactionId}`}
            name="from_account_id"
            value={selectedFromAccountId}
            onChange={(e) => {
              const next = e.target.value
              setSelectedFromAccountId(next)
              setUserRate('')
              setFxNote('')
              setFxError('')
              if (next === selectedToAccountId) setSelectedToAccountId('')
            }}
            className={selectCls}
            required
          >
            <option value="" disabled>Select source</option>
            {accounts.map((account) => (
              <option
                key={account.id}
                value={account.id}
                disabled={account.id === selectedToAccountId}
              >
                {formatAccountLabel(account)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`to_account_${transactionId}`}>To account</Label>
          <select
            id={`to_account_${transactionId}`}
            name="to_account_id"
            value={selectedToAccountId}
            onChange={(e) => {
              const next = e.target.value
              setSelectedToAccountId(next)
              if (next === selectedFromAccountId) setSelectedFromAccountId('')
            }}
            className={selectCls}
            required
          >
            <option value="" disabled>Select destination</option>
            {accounts.map((account) => (
              <option
                key={account.id}
                value={account.id}
                disabled={account.id === selectedFromAccountId}
              >
                {formatAccountLabel(account)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`transfer_amount_${transactionId}`}>
            {isCrossCurrencyTransfer ? 'You sent' : 'Amount'}
            {isCrossCurrencyTransfer ? (
              <span className="font-normal text-muted-foreground">
                {' '}(in {selectedFromAccount?.currency_code})
              </span>
            ) : null}
          </Label>
          <AmountInput
            id={`transfer_amount_${transactionId}`}
            name="amount"
            currencyCode={selectedFromAccount?.currency_code ?? baseCurrency}
            value={amountInput}
            onValueChange={setAmountInput}
            withCalculator
            required
          />
        </div>
      </div>

      {isCrossCurrencyTransfer ? (
        <div className="space-y-2">
          <Label htmlFor={`transfer_to_amount_${transactionId}`}>
            You received{' '}
            <span className="font-normal text-muted-foreground">
              (in {selectedToAccount?.currency_code})
            </span>
          </Label>
          <AmountInput
            id={`transfer_to_amount_${transactionId}`}
            name="to_amount"
            currencyCode={selectedToAccount?.currency_code ?? baseCurrency}
            value={toAmountInput}
            onValueChange={setToAmountInput}
            withCalculator
            required
          />
          <p className="text-xs text-muted-foreground">
            How much actually arrived in the destination account, in its own
            currency.
          </p>
        </div>
      ) : null}

      {isCrossCurrencyTransfer ? (
        <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
          <Label htmlFor={`transfer_cost_${transactionId}`}>
            Transfer cost{' '}
            <span className="font-normal text-muted-foreground">
              (fees + exchange difference, in {baseCurrency})
            </span>
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={`transfer_cost_${transactionId}`}
              name="cost_base"
              inputMode="decimal"
              value={costValue}
              onChange={(e) => {
                setCostInput(e.target.value)
                setCostTouched(true)
              }}
              placeholder="0.00"
              className="sm:flex-1"
            />
            <select
              aria-label="Transfer cost category"
              value={costCategoryId}
              onChange={(e) => setCostCategoryId(e.target.value)}
              className={cn(selectCls, 'sm:flex-1')}
              disabled={!costIsPositive}
            >
              <option value="" disabled>
                Choose a category…
              </option>
              {costCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            We estimate what this transfer cost you — bank fees plus the exchange
            difference — and file it as an expense. Adjust it if you know the
            exact amount, or set it to 0 if there was no cost.
          </p>
          <input
            type="hidden"
            name="cost_category_id"
            value={costIsPositive ? costCategoryId : ''}
          />
        </div>
      ) : null}

      {needsFromRate ? (
        <AdvancedFields
          defaultOpen
          summary={
            rateIsValid
              ? `Exchange rate: 1 ${baseCurrency} = ${userRate} ${selectedFromAccount?.currency_code}`
              : undefined
          }
        >
          <Label htmlFor={`exchange_rate_${transactionId}`}>
            Exchange rate{' '}
            <span className="font-normal text-muted-foreground">
              (1 {baseCurrency} = ? {selectedFromAccount?.currency_code})
            </span>
            <InfoTooltip term="exchangeRate" label="Exchange rate" />
          </Label>
          <Input
            id={`exchange_rate_${transactionId}`}
            type="text"
            inputMode="decimal"
            placeholder={fetchingRate ? 'Fetching rate…' : 'e.g. 3800'}
            value={userRate}
            onChange={(e) => {
              setUserRate(e.target.value)
              setFxNote('')
              setFxError('')
            }}
            disabled={fetchingRate}
          />
          {fxNote ? (
            <p className="text-xs text-muted-foreground">{fxNote}</p>
          ) : null}
          {fxError ? (
            <p className="text-xs text-destructive">{fxError}</p>
          ) : null}
          {conversionPreview() ? (
            <p className="text-xs text-muted-foreground">
              {conversionPreview()}{' '}
              <span className="font-normal text-muted-foreground">at this rate</span>
            </p>
          ) : null}
          {rateIsValid ? (
            <input type="hidden" name="exchange_rate_to_base" value={exchangeRateToBase} />
          ) : (
            <input type="hidden" name="exchange_rate_to_base" value="" />
          )}
        </AdvancedFields>
      ) : (
        <input type="hidden" name="exchange_rate_to_base" value="1" />
      )}

      <div className="space-y-2">
        <Label htmlFor={`transfer_description_${transactionId}`}>Description</Label>
        <Input
          id={`transfer_description_${transactionId}`}
          name="description"
          defaultValue={description}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`transfer_notes_${transactionId}`}>Notes</Label>
        <Textarea
          id={`transfer_notes_${transactionId}`}
          name="notes"
          defaultValue={notes}
        />
      </div>

      <div className={formActionsCls}>
        <SubmitButton
          type="submit"
          className={formBtnCls}
          disabled={!canSubmit}
          pendingText="Saving transfer"
        >
          Save transfer
        </SubmitButton>
        <Link href={cancelHref} className={cn(buttonVariants({ variant: 'outline' }), formBtnCls)}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
