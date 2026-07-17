'use client'

import { useId } from 'react'
import { Store } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type PayeeOption = {
  id: string
  name: string
}

type PayeePickerProps = {
  payees: PayeeOption[]
  defaultValue?: string
  label: string
  /** Helper line explaining the "search existing or create new" behavior. */
  helpText?: string
  /** Optional explicit id (defaults to a generated one). */
  inputId?: string
}

/**
 * Combobox for the transaction form's payee field (BR-009). It is a native
 * text input backed by a <datalist> of existing household payees: typing
 * filters the suggestions, and an unmatched value is created as a new payee on
 * submit (the server RPC normalizes and get-or-creates it). It always submits
 * `payee_name`; the backend resolves that into `payee_id` and keeps
 * `merchant_name` in sync for the existing merchant-based displays.
 */
export function PayeePicker({
  payees,
  defaultValue,
  label,
  helpText,
  inputId,
}: PayeePickerProps) {
  const generatedId = useId()
  const id = inputId ?? `payee_${generatedId}`
  const listId = `${id}_list`

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center text-muted-foreground"
        >
          <Store className="size-4.5" />
        </span>
        <Input
          id={id}
          name="payee_name"
          list={listId}
          defaultValue={defaultValue}
          autoComplete="off"
          placeholder="Search or add a payee"
          className="pl-10"
        />
      </div>
      <datalist id={listId}>
        {payees.map((payee) => (
          <option key={payee.id} value={payee.name} />
        ))}
      </datalist>
      {helpText ? (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      ) : null}
    </div>
  )
}
