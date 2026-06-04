'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { setOpeningBalanceAction } from './actions'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/submit-button'
import { fetchFxRate } from '@/lib/fx'

export function OpeningBalanceForm({
  accountId,
  accountClass,
  accountCurrency,
  defaultDate,
  showArchived,
  baseCurrency,
}: {
  accountId: string
  accountClass: string
  accountCurrency: string
  defaultDate: string
  showArchived: boolean
  baseCurrency: string
}) {
  const isMultiCurrency = accountCurrency !== baseCurrency
  const cancelHref = `/dashboard/accounts${showArchived ? '?showArchived=true' : ''}`

  const [balanceDate, setBalanceDate] = useState(defaultDate)
  const [userRate, setUserRate] = useState('')
  const [fetchingRate, setFetchingRate] = useState(false)
  const [fxNote, setFxNote] = useState('')
  const [fxError, setFxError] = useState('')

  const parsedRate = Number(userRate)
  const rateIsValid =
    userRate.trim() !== '' && Number.isFinite(parsedRate) && parsedRate > 0

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
    <form action={setOpeningBalanceAction} className="space-y-4">
      <input type="hidden" name="account_id" value={accountId} />

      <div>
        <h3 className="text-sm font-medium">Set opening balance</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Leave blank or enter 0 if this account starts at zero.
        </p>
        {accountClass === 'liability' ? (
          <p className="mt-1 text-sm text-muted-foreground">
            For liability accounts (credit cards, debts), enter the amount owed
            as a positive number. The app stores it as a negative balance
            internally so it reduces net worth correctly.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`opening_balance_amount_${accountId}`}>
            {accountClass === 'liability' ? 'Amount owed' : 'Amount'}
          </Label>
          <Input
            id={`opening_balance_amount_${accountId}`}
            name="opening_balance_amount"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`opening_balance_date_${accountId}`}>Date</Label>
          <Input
            id={`opening_balance_date_${accountId}`}
            name="opening_balance_date"
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

        {isMultiCurrency ? (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={`rate_${accountId}`}>
              1 {baseCurrency} = ? {accountCurrency}
              {fetchingRate ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  Fetching rate…
                </span>
              ) : null}
            </Label>
            <div className="flex gap-2">
              <Input
                id={`rate_${accountId}`}
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
              <input
                type="hidden"
                name="rate_base_to_account"
                value={String(parsedRate)}
              />
            ) : (
              <input type="hidden" name="exchange_rate_to_base" value="1" />
            )}
          </div>
        ) : (
          <input type="hidden" name="exchange_rate_to_base" value="1" />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`opening_notes_${accountId}`}>Notes</Label>
        <Textarea id={`opening_notes_${accountId}`} name="notes" />
      </div>

      <div className="flex flex-wrap gap-2">
        <SubmitButton type="submit" variant="outline" pendingText="Setting balance">
          Set opening balance
        </SubmitButton>
        <Link href={cancelHref} className={buttonVariants({ variant: 'outline' })}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
