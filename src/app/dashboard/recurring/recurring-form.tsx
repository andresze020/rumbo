'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createRecurringAction, updateRecurringAction } from './actions'
import { AmountInput } from '@/components/amount-input'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/submit-button'
import { RECURRING_FREQUENCIES, type RecurringType } from '@/lib/recurring/shared'
import { nativeSelectCls, formActionsCls, formBtnCls } from '@/lib/form-styles'
import { cn } from '@/lib/utils'
import { PayeePicker, type PayeeOption } from '../transactions/payee-picker'

export type RecurringFormCategory = {
  id: string
  name: string
  category_type: string
  parent_category_id: string | null
  icon: string | null
}

export type RecurringFormAccount = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
}

export type RecurringTemplate = {
  id: string
  name: string
  transaction_type: string
  account_id: string | null
  /** UC-9: destination account on a transfer template; null otherwise. */
  to_account_id?: string | null
  category_id: string | null
  amount: number | string
  frequency: string
  start_date: string
  end_date: string | null
  /** BR-009: resolved payee name for the edit prefill (empty when none). */
  payee_name?: string
  /** Sprint B / BR-014: post automatically on schedule (vs. manual "Post"). */
  auto_post?: boolean
}

const selectClassName = nativeSelectCls

function accountLabel(account: RecurringFormAccount) {
  return [account.name, account.institution_name, account.currency_code]
    .filter(Boolean)
    .join(' · ')
}

function categoryLabel(
  category: RecurringFormCategory,
  byId: Map<string, RecurringFormCategory>
) {
  const parent = category.parent_category_id ? byId.get(category.parent_category_id) : null
  const name = parent ? `${parent.name} / ${category.name}` : category.name
  return category.icon ? `${category.icon} ${name}` : name
}

export function RecurringForm({
  mode,
  template,
  accounts,
  categories,
  payees,
}: {
  mode: 'create' | 'edit'
  template?: RecurringTemplate
  accounts: RecurringFormAccount[]
  categories: RecurringFormCategory[]
  payees: PayeeOption[]
}) {
  const today = new Date().toISOString().slice(0, 10)

  const [transactionType, setTransactionType] = useState<RecurringType>(
    (template?.transaction_type as RecurringType) ?? 'expense'
  )
  const [accountId, setAccountId] = useState(template?.account_id ?? '')
  const [toAccountId, setToAccountId] = useState(template?.to_account_id ?? '')
  const [categoryId, setCategoryId] = useState(template?.category_id ?? '')
  const [autoPost, setAutoPost] = useState(template?.auto_post ?? false)

  const isTransfer = transactionType === 'transfer'

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  )

  const compatibleCategories = useMemo(
    () => categories.filter((c) => c.category_type === transactionType),
    [categories, transactionType]
  )

  const selectedAccount = accounts.find((a) => a.id === accountId)
  const currencyCode = selectedAccount?.currency_code ?? ''
  const selectedToAccount = accounts.find((a) => a.id === toAccountId)

  // UC-9: a template cannot carry the amount that *arrives* in a different
  // currency — it changes with every month's rate, and only the user knows it.
  // Such a template is still useful by hand (the post form asks for the received
  // amount), so it is allowed; auto-post is what gets refused.
  const isCrossCurrencyTransfer =
    isTransfer &&
    Boolean(selectedAccount && selectedToAccount) &&
    selectedAccount!.currency_code !== selectedToAccount!.currency_code

  // Derived, not stored — an effect writing this back into state is what the
  // repo's react-hooks/set-state-in-effect rule rejects, and deriving keeps the
  // user's own choice intact while the pairing is temporarily cross-currency.
  const effectiveAutoPost = autoPost && !isCrossCurrencyTransfer

  const formAction = mode === 'create' ? createRecurringAction : updateRecurringAction

  function handleTypeChange(value: string) {
    setTransactionType(value as RecurringType)
    if (value === 'transfer') {
      // A transfer has no reporting category (the DB shape constraint enforces
      // this), so drop any category the user had picked.
      setCategoryId('')
      return
    }
    // Leaving transfer: the destination account stops being meaningful.
    setToAccountId('')
    // Clear the category if it no longer matches the new type.
    const stillValid = categories.some(
      (c) => c.id === categoryId && c.category_type === value
    )
    if (!stillValid) setCategoryId('')
  }

  return (
    <form action={formAction} className="space-y-4">
      {template ? (
        <input type="hidden" name="recurring_id" value={template.id} />
      ) : null}
      <input type="hidden" name="transaction_type" value={transactionType} />
      <input type="hidden" name="currency_code" value={currencyCode} />

      <div className="space-y-2">
        <Label htmlFor={`name_${mode}`}>Name</Label>
        <Input
          id={`name_${mode}`}
          name="name"
          maxLength={120}
          defaultValue={template?.name ?? ''}
          placeholder="Rent, Spotify, Salary…"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`type_${mode}`}>Type</Label>
          <select
            id={`type_${mode}`}
            value={transactionType}
            onChange={(e) => handleTypeChange(e.target.value)}
            className={selectClassName}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`frequency_${mode}`}>Frequency</Label>
          <select
            id={`frequency_${mode}`}
            name="frequency"
            defaultValue={template?.frequency ?? 'monthly'}
            className={selectClassName}
          >
            {RECURRING_FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`account_${mode}`}>
            {isTransfer ? 'From account' : 'Account'}
          </Label>
          <select
            id={`account_${mode}`}
            name="account_id"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className={selectClassName}
            required
          >
            <option value="" disabled>
              {isTransfer ? 'Select source' : 'Select account'}
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountLabel(account)}
              </option>
            ))}
          </select>
        </div>

        {/* UC-9: a transfer's second half replaces the category — the two are
            mutually exclusive by schema, so they occupy the same slot. */}
        {isTransfer ? (
          <div className="space-y-2">
            <Label htmlFor={`to_account_${mode}`}>To account</Label>
            <select
              id={`to_account_${mode}`}
              name="to_account_id"
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
              className={selectClassName}
              required
            >
              <option value="" disabled>
                Select destination
              </option>
              {accounts
                .filter((account) => account.id !== accountId)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {accountLabel(account)}
                  </option>
                ))}
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor={`category_${mode}`}>Category</Label>
            <select
              id={`category_${mode}`}
              name="category_id"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={selectClassName}
              required
              disabled={!compatibleCategories.length}
            >
              <option value="" disabled>
                Select category
              </option>
              {compatibleCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {categoryLabel(category, categoriesById)}
                </option>
              ))}
            </select>
            {!compatibleCategories.length ? (
              <p className="text-xs text-muted-foreground">
                No {transactionType} categories available.
              </p>
            ) : null}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor={`amount_${mode}`}>Amount</Label>
          <AmountInput
            id={`amount_${mode}`}
            name="amount"
            currencyCode={currencyCode || 'USD'}
            defaultValue={template ? Number(template.amount).toFixed(2) : ''}
            required
          />
          {currencyCode ? (
            isCrossCurrencyTransfer ? (
              <p className="text-xs text-muted-foreground">
                The amount leaving, in {currencyCode}. You enter what arrives in{' '}
                {selectedToAccount?.currency_code} each time you post.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">In {currencyCode}.</p>
            )
          ) : (
            <p className="text-xs text-muted-foreground">
              Select an account to set the currency.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`start_${mode}`}>Start date</Label>
          <Input
            id={`start_${mode}`}
            name="start_date"
            type="date"
            defaultValue={template?.start_date ?? today}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`end_${mode}`}>End date (optional)</Label>
          <Input
            id={`end_${mode}`}
            name="end_date"
            type="date"
            defaultValue={template?.end_date ?? ''}
          />
          <p className="text-xs text-muted-foreground">
            Leave empty for no end date.
          </p>
        </div>
      </div>

      {/* A transfer moves money between the household's own accounts, so there
          is nobody being paid — the payee field would have no meaning. */}
      {isTransfer ? null : (
        <PayeePicker
          payees={payees}
          defaultValue={template?.payee_name ?? ''}
          // Same wording split as the transaction form: who paid you vs. whom you paid.
          label={transactionType === 'income' ? 'Payer (optional)' : 'Payee (optional)'}
          helpText="Search an existing payee or type a new name to create one."
        />
      )}

      {/* Sprint B / BR-014: auto-post toggle. UC-9 refuses it on a
          cross-currency transfer, whose received amount only the user knows —
          derived rather than stored, so switching the accounts back re-enables
          the choice the user already made instead of silently losing it. */}
      <input
        type="hidden"
        name="auto_post"
        value={effectiveAutoPost ? 'true' : 'false'}
      />
      <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
        <input
          type="checkbox"
          checked={effectiveAutoPost}
          disabled={isCrossCurrencyTransfer}
          onChange={(e) => setAutoPost(e.target.checked)}
          className="mt-0.5 size-4 rounded border-input"
        />
        <span>
          <span className="font-medium">Post automatically</span>
          {isCrossCurrencyTransfer ? (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Not available for a transfer between two currencies: the amount
              that arrives changes with the rate, so it has to be entered when
              you post. Post this one from the list each time.
            </span>
          ) : (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              A daily job posts this on its due date using the last known
              exchange rate. Leave off to post it yourself from the list.
            </span>
          )}
        </span>
      </label>

      <div className={formActionsCls}>
        <SubmitButton
          type="submit"
          className={formBtnCls}
          pendingText={mode === 'create' ? 'Creating…' : 'Saving…'}
        >
          {mode === 'create' ? 'Create recurring' : 'Save changes'}
        </SubmitButton>
        <Link
          href="/dashboard/recurring"
          className={cn(buttonVariants({ variant: 'outline' }), formBtnCls)}
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
