'use client'

import { useState, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { useLanguage } from '@/components/language-provider'
import { formatIsoDate } from '@/lib/format'

/**
 * A native date field with the chosen date spelled out under it, in the UI's
 * language (MQ-013).
 *
 * The native control renders in the *phone's* locale: `01/10/2026` under an
 * English UI whose lists say "Oct 1, 2026" — the first of October or the tenth
 * of January? The line underneath ("Thu, Oct 1, 2026") settles it. The value
 * posted is still the plain ISO date. Controlled (`value` + `onValueChange`)
 * or not (`defaultValue`), like `AmountInput`.
 */
export function DateInput({
  value,
  defaultValue,
  onValueChange,
  ...props
}: Omit<ComponentProps<typeof Input>, 'type' | 'value' | 'defaultValue' | 'onChange'> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}) {
  const { locale } = useLanguage()
  const [internal, setInternal] = useState(defaultValue ?? '')
  const current = value ?? internal

  return (
    <>
      <Input
        {...props}
        type="date"
        value={current}
        onChange={(event) => {
          if (value === undefined) setInternal(event.target.value)
          onValueChange?.(event.target.value)
        }}
      />
      {/^\d{4}-\d{2}-\d{2}$/.test(current) ? (
        <p className="text-xs text-muted-foreground" aria-hidden="true">
          {formatIsoDate(current, locale, {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </p>
      ) : null}
    </>
  )
}
