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

function formatCurrency(value: number, currencyCode: string) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currencyCode,
  }).format(value)
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
}: TransferEditFormProps) {
  const [selectedFromAccountId, setSelectedFromAccountId] = useState(fromAccountId)
  const [selectedToAccountId, setSelectedToAccountId] = useState(toAccountId)
  const [currentDate, setCurrentDate] = useState(transactionDate)
  const [amountInput, setAmountInput] = useState(amount.toFixed(2))

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

  const isNonBaseCurrencyTransfer =
    !isCrossCurrencyTransfer &&
    Boolean(selectedFromAccount) &&
    selectedFromAccount?.currency_code !== baseCurrency

  const parsedRate = Number(userRate)
  const rateIsValid =
    userRate.trim() !== '' && Number.isFinite(parsedRate) && parsedRate > 0
  const exchangeRateToBase = rateIsValid ? String(1 / parsedRate) : ''

  const parsedAmount = Number(amountInput)
  const amountIsValid = Number.isFinite(parsedAmount) && parsedAmount > 0

  function conversionPreview() {
    if (!selectedFromAccount || !rateIsValid || !amountIsValid) return null
    return `${formatCurrency(parsedAmount, selectedFromAccount.currency_code)} ≈ ${formatCurrency(parsedAmount / parsedRate, baseCurrency)}`
  }

  const canSubmit = Boolean(
    selectedFromAccountId &&
      selectedToAccountId &&
      selectedFromAccountId !== selectedToAccountId &&
      !isCrossCurrencyTransfer &&
      (!isNonBaseCurrencyTransfer || rateIsValid)
  )

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
    if (!isNonBaseCurrencyTransfer || !selectedFromAccount || !currentDate) return
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
          <Label htmlFor={`transfer_amount_${transactionId}`}>Amount</Label>
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
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Cross-currency transfers are not supported yet.
        </p>
      ) : null}

      {isNonBaseCurrencyTransfer ? (
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
