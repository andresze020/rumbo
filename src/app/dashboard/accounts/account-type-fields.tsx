'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { nativeSelectCls } from '@/lib/form-styles'
import { formatIsoDate, todayIsoDateLocal } from '@/lib/format'
import { useLanguage } from '@/components/language-provider'
import {
  parseCycleDay,
  resolveCardCycle,
  supportsCardCycle,
} from '@/lib/cards/cycle'

/** BR-039 — the only account types the flag is allowed on (mirrors the DB check). */
const ELIGIBLE_TYPES = new Set(['savings', 'investment', 'other'])

export function isTransferExpenseEligible(accountType: string) {
  return ELIGIBLE_TYPES.has(accountType)
}

export type BillingAccountOption = { id: string; name: string }

/**
 * The account-type select together with every field whose *legality depends on
 * the selected type*. There are two:
 *
 * - **BR-039** "count transfers in as expense", legal on savings / investment /
 *   other only.
 * - **BR-030** the statement cycle (statement day, payment day, billing
 *   account), legal on a credit card or a debt account only.
 *
 * They share this component rather than standing alone because the type is
 * editable in the same form: rendered separately, a user could fill in a
 * statement day, switch the type to `checking`, and submit a combination the
 * database rejects. Here each block simply disappears when the selected type
 * cannot carry it. The server action re-checks regardless — the UI is the
 * convenience, not the guard.
 */
export function AccountTypeDependentFields({
  accountId,
  accountTypes,
  defaultAccountType,
  defaultTreatTransfersAsExpense,
  typeLabel,
  toggleLabel,
  toggleDescription,
  defaultStatementDay,
  defaultPaymentDay,
  defaultBillingAccountId,
  billingAccounts,
}: {
  accountId: string
  accountTypes: Array<{ value: string; label: string }>
  defaultAccountType: string
  defaultTreatTransfersAsExpense: boolean
  typeLabel: string
  toggleLabel: string
  toggleDescription: string
  /** BR-030 — empty string when no cycle is configured. */
  defaultStatementDay?: string
  defaultPaymentDay?: string
  defaultBillingAccountId?: string
  /** Accounts the card can be paid from; excludes this account. */
  billingAccounts?: BillingAccountOption[]
}) {
  const { locale } = useLanguage()
  const [accountType, setAccountType] = useState(defaultAccountType)
  const [statementDay, setStatementDay] = useState(defaultStatementDay ?? '')
  const [paymentDay, setPaymentDay] = useState(defaultPaymentDay ?? '')

  const transferExpenseEligible = isTransferExpenseEligible(accountType)
  const cycleEligible = supportsCardCycle(accountType)

  // BR-030's high-value detail from the App B recording: the two cycle windows
  // render here, during account creation, before a single transaction exists.
  // Derived from the two days on every keystroke — nothing is stored, and for an
  // account that already exists the *figures* come from
  // get_card_cycle_summaries, which computes its own window alongside them.
  const parsedStatementDay = parseCycleDay(statementDay)
  const parsedPaymentDay = parseCycleDay(paymentDay)
  const preview =
    cycleEligible && parsedStatementDay !== null && parsedPaymentDay !== null
      ? resolveCardCycle(parsedStatementDay, parsedPaymentDay, todayIsoDateLocal())
      : null

  const dayOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const dueOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }

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

      {transferExpenseEligible ? (
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

      {cycleEligible ? (
        <fieldset className="space-y-3 rounded-lg border p-3 sm:col-span-2">
          <legend className="px-1 text-sm font-medium">Statement cycle</legend>
          <p className="text-xs text-muted-foreground">
            Set both days to see what you owe on the next payment date, separately
            from what you have spent since the statement closed. Leave them empty
            and the account behaves exactly as it does today.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`statement_day_${accountId}`}>
                Statement closes on day
              </Label>
              <Input
                id={`statement_day_${accountId}`}
                name="statement_day"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                step={1}
                placeholder="e.g. 30"
                value={statementDay}
                onChange={(event) => setStatementDay(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`payment_day_${accountId}`}>Payment due on day</Label>
              <Input
                id={`payment_day_${accountId}`}
                name="payment_day"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                step={1}
                placeholder="e.g. 1"
                value={paymentDay}
                onChange={(event) => setPaymentDay(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                In the month after the statement closes.
              </p>
            </div>
          </div>

          {billingAccounts && billingAccounts.length ? (
            <div className="space-y-2">
              <Label htmlFor={`billing_account_${accountId}`}>
                Usually paid from
              </Label>
              <select
                id={`billing_account_${accountId}`}
                name="billing_account_id"
                defaultValue={defaultBillingAccountId ?? ''}
                className={nativeSelectCls}
              >
                <option value="">Not set</option>
                {billingAccounts.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* A day of 31 lands on the 28th in February; the preview shows the
              real clamped dates rather than promising a day that doesn't exist. */}
          {preview ? (
            <dl className="space-y-2 rounded-lg bg-muted/40 p-3 text-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <dt className="text-muted-foreground">Balance payable</dt>
                <dd className="tabular-nums">
                  {formatIsoDate(preview.closedPeriodStart, locale, dayOptions)}
                  {' – '}
                  {formatIsoDate(preview.closedPeriodEnd, locale, dayOptions)}
                  {' · pay '}
                  {formatIsoDate(preview.closedPaymentDue, locale, dueOptions)}
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <dt className="text-muted-foreground">Outstanding balance</dt>
                <dd className="tabular-nums">
                  {formatIsoDate(preview.openPeriodStart, locale, dayOptions)}
                  {' – '}
                  {formatIsoDate(preview.openPeriodEnd, locale, dayOptions)}
                  {' · pay '}
                  {formatIsoDate(preview.openPaymentDue, locale, dueOptions)}
                </dd>
              </div>
            </dl>
          ) : null}
        </fieldset>
      ) : null}
    </>
  )
}
