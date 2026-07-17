'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adjustBalanceAction } from './actions'
import { AdvancedFields } from '@/components/advanced-fields'
import { AmountInput } from '@/components/amount-input'
import { InfoTooltip } from '@/components/info-tooltip'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/submit-button'
import { fetchFxRate } from '@/lib/fx'
import { formatCurrency } from '@/lib/format'
import { formActionsCls, formBtnCls } from '@/lib/form-styles'
import { cn } from '@/lib/utils'

/**
 * BR-017: reconcile an account's current balance. The user types the balance
 * they want the account to show (amount owed for liabilities); the server RPC
 * computes the delta from the current posted balance and posts a single
 * ledger-safe `adjustment` transaction. History is never edited.
 */
export function BalanceAdjustmentForm({
  accountId,
  accountClass,
  accountCurrency,
  currentBalanceDisplay,
  defaultDate,
  showArchived,
  baseCurrency,
}: {
  accountId: string
  accountClass: string
  accountCurrency: string
  /** Current balance in the account's display convention (owed = positive). */
  currentBalanceDisplay: number
  defaultDate: string
  showArchived: boolean
  baseCurrency: string
}) {
  const isLiability = accountClass === 'liability'
  const isMultiCurrency = accountCurrency !== baseCurrency
  const cancelHref = `/dashboard/accounts${showArchived ? '?showArchived=true' : ''}`

  const [balanceDate, setBalanceDate] = useState(defaultDate)
  const [newBalance, setNewBalance] = useState(currentBalanceDisplay.toFixed(2))
  const [userRate, setUserRate] = useState('')
  const [fetchingRate, setFetchingRate] = useState(false)
  const [fxNote, setFxNote] = useState('')
  const [fxError, setFxError] = useState('')

  const parsedRate = Number(userRate)
  const rateIsValid =
    userRate.trim() !== '' && Number.isFinite(parsedRate) && parsedRate > 0
  const parsedNew = Number(newBalance)
  const parsedNewValid = newBalance.trim() !== '' && Number.isFinite(parsedNew)
  const targetStored = isLiability ? -Math.abs(parsedNew) : parsedNew
  const delta = parsedNewValid ? targetStored - currentBalanceStored() : null

  function currentBalanceStored() {
    return isLiability ? -Math.abs(currentBalanceDisplay) : currentBalanceDisplay
  }

  useEffect(() => {
    if (!isMultiCurrency) return
    void autoFetch(balanceDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceDate])

  async function autoFetch(date: string) {
    setFetchingRate(true)
    setFxNote('')
    setFxError('')
    const result = await fetchFxRate(baseCurrency, accountCurrency, date)
    setFetchingRate(false)
    if (result.rate !== null) {
      setUserRate(String(parseFloat(result.rate.toFixed(6))))
      setFxNote(
        result.isLatest
          ? `No rate available for future dates — using latest market rate (${result.date}).`
          : `Rate for ${result.date}.`
      )
    } else {
      setFxError(result.error)
    }
  }

  const noChange = delta !== null && Math.abs(delta) < 0.005
  const canSubmit =
    parsedNewValid && !noChange && (!isMultiCurrency || rateIsValid)

  return (
    <form action={adjustBalanceAction} className="space-y-4">
      <input type="hidden" name="account_id" value={accountId} />

      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        <span className="text-muted-foreground">
          {isLiability ? 'Current amount owed' : 'Current balance'}
        </span>
        <p className="mt-0.5 font-semibold tabular-nums">
          {formatCurrency(currentBalanceDisplay, accountCurrency)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`adjust_balance_${accountId}`}>
            {isLiability ? 'New amount owed' : 'New balance'}
          </Label>
          <AmountInput
            id={`adjust_balance_${accountId}`}
            name="new_balance"
            currencyCode={accountCurrency}
            value={newBalance}
            onValueChange={setNewBalance}
          />
          {isLiability ? (
            <p className="text-xs text-muted-foreground">
              Enter the amount owed as a positive number. Stored as a negative
              balance so it reduces net worth correctly.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Enter a negative value for a negative balance.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`adjust_date_${accountId}`}>Date</Label>
          <Input
            id={`adjust_date_${accountId}`}
            name="adjustment_date"
            type="date"
            value={balanceDate}
            onChange={(e) => {
              setBalanceDate(e.target.value)
              if (isMultiCurrency) {
                setUserRate('')
                setFxNote('')
                setFxError('')
              }
            }}
            required
          />
        </div>
      </div>

      {delta !== null && !noChange ? (
        <p className="text-sm text-muted-foreground">
          Posts a{' '}
          <span
            className={cn(
              'font-semibold',
              delta > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            )}
          >
            {delta > 0 ? '+' : '−'}
            {formatCurrency(Math.abs(delta), accountCurrency)}
          </span>{' '}
          adjustment entry.
        </p>
      ) : null}

      {noChange ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          This matches the current balance — nothing to adjust.
        </p>
      ) : null}

      {isMultiCurrency ? (
        <AdvancedFields
          defaultOpen
          summary={
            rateIsValid
              ? `Exchange rate: 1 ${baseCurrency} = ${userRate} ${accountCurrency}`
              : undefined
          }
        >
          <Label htmlFor={`adjust_rate_${accountId}`}>
            Exchange rate: 1 {baseCurrency} = ? {accountCurrency}
            <InfoTooltip term="exchangeRate" label="Exchange rate" />
            {fetchingRate ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                Fetching rate…
              </span>
            ) : null}
          </Label>
          <p className="text-xs text-muted-foreground">
            Enter how many {accountCurrency} make up 1 {baseCurrency}. This
            converts the adjustment into {baseCurrency} for your net worth and
            reports.
          </p>
          <div className="flex gap-2">
            <Input
              id={`adjust_rate_${accountId}`}
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
              onClick={() => autoFetch(balanceDate)}
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
              Auto-filled for {balanceDate}. Edit if needed.
            </p>
          )}
          {rateIsValid ? (
            <input type="hidden" name="rate_base_to_account" value={String(parsedRate)} />
          ) : (
            <input type="hidden" name="exchange_rate_to_base" value="1" />
          )}
        </AdvancedFields>
      ) : (
        <input type="hidden" name="exchange_rate_to_base" value="1" />
      )}

      <div className="space-y-2">
        <Label htmlFor={`adjust_notes_${accountId}`}>Reason / notes</Label>
        <Textarea
          id={`adjust_notes_${accountId}`}
          name="notes"
          placeholder="e.g. Reconciled with bank statement"
        />
      </div>

      <div className={formActionsCls}>
        <SubmitButton
          type="submit"
          disabled={!canSubmit}
          className={formBtnCls}
          pendingText="Adjusting balance"
        >
          Adjust balance
        </SubmitButton>
        <Link href={cancelHref} className={cn(buttonVariants({ variant: 'outline' }), formBtnCls)}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
