'use client'

import { useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/submit-button'
import { useLanguage } from '@/components/language-provider'
import { saveExchangeRateAction } from './settings-actions'

export type ExchangeRateRow = {
  currencyCode: string
  /** 1 currencyCode = rate baseCurrency. Null when nothing is on file yet. */
  rate: number | null
  rateDate: string | null
}

/**
 * An account's balance in base currency is its balance revalued at the rate on
 * file, so this is where a foreign-currency figure stops being the blended
 * historical rate of everything ever posted and becomes what the money is
 * worth today.
 *
 * The rate is stored one way (1 foreign = rate base), but that is the awkward
 * direction to *type* for a currency like COP — 0.00045375 against "1 CAD =
 * 2,204 COP". So both directions are editable and mirror each other; only the
 * direct one is submitted.
 */
function RateFields({
  row,
  baseCurrency,
}: {
  row: ExchangeRateRow
  baseCurrency: string
}) {
  const [direct, setDirect] = useState(row.rate ? String(row.rate) : '')
  const [inverse, setInverse] = useState(
    row.rate ? String(round(1 / row.rate)) : ''
  )

  function onDirectChange(value: string) {
    setDirect(value)
    const parsed = Number(value)
    setInverse(value && Number.isFinite(parsed) && parsed > 0 ? String(round(1 / parsed)) : '')
  }

  function onInverseChange(value: string) {
    setInverse(value)
    const parsed = Number(value)
    setDirect(value && Number.isFinite(parsed) && parsed > 0 ? String(round(1 / parsed)) : '')
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`rate_${row.currencyCode}`}>
          1 {row.currencyCode} =
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id={`rate_${row.currencyCode}`}
            name="rate"
            inputMode="decimal"
            placeholder="0.00045375"
            value={direct}
            onChange={(event) => onDirectChange(event.target.value)}
          />
          <span className="text-sm text-muted-foreground">{baseCurrency}</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`inverse_${row.currencyCode}`}>
          1 {baseCurrency} =
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id={`inverse_${row.currencyCode}`}
            inputMode="decimal"
            placeholder="2204"
            value={inverse}
            onChange={(event) => onInverseChange(event.target.value)}
          />
          <span className="text-sm text-muted-foreground">{row.currencyCode}</span>
        </div>
      </div>
    </div>
  )
}

function round(value: number) {
  // Enough precision for a peso-scale pair without printing float noise.
  return Number(value.toPrecision(10))
}

export function ExchangeRatesSection({
  baseCurrency,
  rows,
  today,
}: {
  baseCurrency: string
  rows: ExchangeRateRow[]
  today: string
}) {
  const { t } = useLanguage()

  if (!rows.length) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.exchangeRates.title')}</CardTitle>
        <CardDescription>{t('settings.exchangeRates.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {rows.map((row) => (
          <form
            key={row.currencyCode}
            action={saveExchangeRateAction}
            className="space-y-3 border-b pb-6 last:border-b-0 last:pb-0"
          >
            <input type="hidden" name="from_currency" value={row.currencyCode} />
            <p className="text-sm font-medium">
              {row.currencyCode} → {baseCurrency}
            </p>
            <RateFields row={row} baseCurrency={baseCurrency} />
            <div className="space-y-1.5">
              <Label htmlFor={`rate_date_${row.currencyCode}`}>
                {t('settings.exchangeRates.rateDate')}
              </Label>
              <Input
                id={`rate_date_${row.currencyCode}`}
                name="rate_date"
                type="date"
                defaultValue={today}
              />
              <p className="text-xs text-muted-foreground">
                {row.rate
                  ? t('settings.exchangeRates.onFile', {
                      currency: row.currencyCode,
                      rate: String(row.rate),
                      base: baseCurrency,
                      date: row.rateDate ?? '',
                    })
                  : t('settings.exchangeRates.none')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('settings.exchangeRates.help')}
              </p>
            </div>
            <SubmitButton type="submit" size="sm" pendingText="Saving…">
              {t('settings.exchangeRates.save')}
            </SubmitButton>
          </form>
        ))}
      </CardContent>
    </Card>
  )
}
