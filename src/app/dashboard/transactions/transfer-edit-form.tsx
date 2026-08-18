'use client'

import Link from 'next/link'
import { ArrowDown } from 'lucide-react'
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

const AMOUNT_LABEL_CLS =
  'text-xs font-medium uppercase tracking-wider text-muted-foreground'
const CURRENCY_CHIP_CLS =
  'rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground'

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
    initialCostCategoryId ??
      costCategories.find((c) =>
        /fee|comis|charg|bank|banc|cargo|surcharg/i.test(c.label)
      )?.id ??
      ''
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
  // The cost can't exceed what you sent (you can't lose more than you moved).
  const sentBaseValue =
    fromRateToBase != null && amountIsValid
      ? parsedAmount * fromRateToBase
      : null
  const costExceedsSent =
    costIsPositive && sentBaseValue != null && parsedCost > sentBaseValue + 0.01
  // Soft advisory: the entered cost is far from what market rates suggest.
  const costLooksOff =
    costTouched &&
    costIsPositive &&
    !costExceedsSent &&
    suggestedCost != null &&
    Math.abs(parsedCost - suggestedCost) > Math.max(1, suggestedCost * 0.2)

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
      (!isCrossCurrencyTransfer || !costIsPositive || Boolean(costCategoryId)) &&
      (!isCrossCurrencyTransfer || !costExceedsSent)
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
      </div>

      {/* BR-031 slice 2 — the two amounts of a cross-currency transfer are both
          real ledger values, and until now the edit form had them in different
          places: "You sent" in the grid above, "You received" below it, with the
          account selectors somewhere else again. The create form pairs each
          amount with its own account in one card so both figures are on screen
          together; the edit form now does the same, with its own native selects
          rather than the create form's mobile sheet picker. */}
      <div className="space-y-2.5 rounded-2xl border bg-muted/30 p-3">
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor={`transfer_amount_${transactionId}`} className={AMOUNT_LABEL_CLS}>
              {isCrossCurrencyTransfer ? 'You sent' : 'Amount'}
            </Label>
            <span className={CURRENCY_CHIP_CLS}>
              {selectedFromAccount?.currency_code ?? baseCurrency}
            </span>
          </div>
          <AmountInput
            id={`transfer_amount_${transactionId}`}
            name="amount"
            currencyCode={selectedFromAccount?.currency_code ?? baseCurrency}
            value={amountInput}
            onValueChange={(v) => {
              setAmountInput(v)
              setCostTouched(false)
            }}
            size="lg"
            withCalculator
            required
            className="mt-1.5"
          />
          <div className="mt-2 space-y-1.5">
            <Label htmlFor={`from_account_${transactionId}`} className={AMOUNT_LABEL_CLS}>
              From account
            </Label>
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
        </div>

        <div className="flex items-center gap-2" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          <ArrowDown className="size-3.5 text-muted-foreground" />
          <span className="h-px flex-1 bg-border" />
        </div>

        <div>
          {/* Only a cross-currency transfer has a second amount to enter. When
              both legs share a currency the same figure arrives, so the
              destination block is just the account. */}
          {isCrossCurrencyTransfer ? (
            <>
              <div className="flex items-center justify-between">
                <Label
                  htmlFor={`transfer_to_amount_${transactionId}`}
                  className={AMOUNT_LABEL_CLS}
                >
                  You received
                </Label>
                <span className={CURRENCY_CHIP_CLS}>
                  {selectedToAccount?.currency_code}
                </span>
              </div>
              <AmountInput
                id={`transfer_to_amount_${transactionId}`}
                name="to_amount"
                currencyCode={selectedToAccount?.currency_code ?? baseCurrency}
                value={toAmountInput}
                onValueChange={(v) => {
                  setToAmountInput(v)
                  setCostTouched(false)
                }}
                size="lg"
                withCalculator
                required
                className="mt-1.5"
              />
            </>
          ) : null}
          <div className={cn('space-y-1.5', isCrossCurrencyTransfer && 'mt-2')}>
            <Label htmlFor={`to_account_${transactionId}`} className={AMOUNT_LABEL_CLS}>
              To account
            </Label>
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
          <p className="mt-1.5 text-xs text-muted-foreground">
            {isCrossCurrencyTransfer
              ? 'How much actually arrived in the destination account, in its own currency.'
              : 'The same amount arrives in the destination account.'}
          </p>
        </div>
      </div>

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
          {costExceedsSent ? (
            <p className="text-xs text-destructive">
              The cost can&rsquo;t be more than what you sent.
            </p>
          ) : costLooksOff && suggestedCost != null ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              We estimated about {formatCurrency(suggestedCost, baseCurrency)} —
              double-check this cost.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              We estimate what this transfer cost you — bank fees plus the
              exchange difference — and file it as an expense. Adjust it if you
              know the exact amount, or set it to 0 if there was no cost.
            </p>
          )}
          <input
            type="hidden"
            name="cost_category_id"
            value={costIsPositive ? costCategoryId : ''}
          />
        </div>
      ) : null}

      {needsFromRate ? (
        <AdvancedFields
          defaultOpen={isCrossCurrencyTransfer}
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
