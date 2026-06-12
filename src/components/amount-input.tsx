'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  formatAmountForDisplay,
  getCurrencySymbol,
  sanitizeAmountInput,
} from '@/lib/format'

type AmountInputProps = {
  /** Form field name for the raw (unformatted) numeric value submitted with the form. */
  name: string
  /** Currency whose symbol is shown as a prefix (e.g. the budget's currency). */
  currencyCode: string
  id?: string
  /** Raw initial value (e.g. "150.00"); shown formatted with thousands/decimal separators. */
  defaultValue?: string
  placeholder?: string
  required?: boolean
}

/**
 * Currency-aware amount field: prefixes the currency symbol and groups
 * thousands while typing, so amounts read as money (e.g. "$1,500.00") rather
 * than a bare integer. The visible input carries the `required` validation;
 * a hidden input submits the sanitized numeric string under `name`.
 */
export function AmountInput({
  name,
  currencyCode,
  id,
  defaultValue = '',
  placeholder = '0.00',
  required,
}: AmountInputProps) {
  const [raw, setRaw] = useState(() => sanitizeAmountInput(defaultValue))
  const symbol = getCurrencySymbol(currencyCode)

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {symbol}
      </span>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        placeholder={placeholder}
        value={formatAmountForDisplay(raw)}
        onChange={(e) => setRaw(sanitizeAmountInput(e.target.value))}
        className="pl-7"
        required={required}
      />
      <input type="hidden" name={name} value={raw} />
    </div>
  )
}
