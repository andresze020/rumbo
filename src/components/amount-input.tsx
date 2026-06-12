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
  /** Raw initial value (e.g. "150.00"); shown formatted with thousands/decimal separators. Ignored when `value` is provided. */
  defaultValue?: string
  /** Controlled raw value. Pair with `onValueChange` when the parent needs the amount (e.g. FX conversion previews). */
  value?: string
  /** Called with the sanitized raw numeric string on every change (controlled mode). */
  onValueChange?: (raw: string) => void
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
  value,
  onValueChange,
  placeholder = '0.00',
  required,
}: AmountInputProps) {
  const [internalRaw, setInternalRaw] = useState(() => sanitizeAmountInput(defaultValue))
  const raw = value !== undefined ? sanitizeAmountInput(value) : internalRaw
  const symbol = getCurrencySymbol(currencyCode)

  function handleChange(next: string) {
    const sanitized = sanitizeAmountInput(next)
    if (value === undefined) setInternalRaw(sanitized)
    onValueChange?.(sanitized)
  }

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
        onChange={(e) => handleChange(e.target.value)}
        className="pl-7"
        required={required}
      />
      <input type="hidden" name={name} value={raw} />
    </div>
  )
}
