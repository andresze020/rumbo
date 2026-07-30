'use client'

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { nativeSelectCls } from '@/lib/form-styles'

/** BR-039 — the only account types the flag is allowed on (mirrors the DB check). */
const ELIGIBLE_TYPES = new Set(['savings', 'investment', 'other'])

export function isTransferExpenseEligible(accountType: string) {
  return ELIGIBLE_TYPES.has(accountType)
}

/**
 * BR-039 — the account type select plus the "count transfers in as expense"
 * toggle, together in one client component.
 *
 * They are paired because the toggle is only legal on savings / investment /
 * other accounts, and the type is editable in the same form: rendered
 * separately, a user could tick the box, switch the type to `checking`, and
 * submit a combination the database rejects. Here the toggle simply disappears
 * when the selected type is not eligible, and its `false` is submitted instead
 * (the server action re-checks anyway — the UI is the convenience, not the
 * guard).
 */
export function AccountTypeWithTransferExpense({
  accountId,
  accountTypes,
  defaultAccountType,
  defaultTreatTransfersAsExpense,
  typeLabel,
  toggleLabel,
  toggleDescription,
}: {
  accountId: string
  accountTypes: Array<{ value: string; label: string }>
  defaultAccountType: string
  defaultTreatTransfersAsExpense: boolean
  typeLabel: string
  toggleLabel: string
  toggleDescription: string
}) {
  const [accountType, setAccountType] = useState(defaultAccountType)
  const eligible = isTransferExpenseEligible(accountType)

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`account_type_${accountId}`}>{typeLabel}</Label>
        <select
          id={`account_type_${accountId}`}
          name="account_type"
          value={accountType}
          onChange={(event) => setAccountType(event.target.value)}
          className={nativeSelectCls}
        >
          {accountTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {eligible ? (
        <Label className="items-start gap-3 rounded-lg border p-3 sm:col-span-2">
          <input
            type="checkbox"
            name="treat_transfers_as_expense"
            defaultChecked={defaultTreatTransfersAsExpense}
            className="mt-0.5 size-4"
          />
          <span className="space-y-1">
            <span className="block">{toggleLabel}</span>
            <span className="block text-sm font-normal text-muted-foreground">
              {toggleDescription}
            </span>
          </span>
        </Label>
      ) : null}
    </>
  )
}
