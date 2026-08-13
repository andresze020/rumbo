'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { createInstallmentPlanAction } from './actions'
import { AmountInput } from '@/components/amount-input'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/submit-button'
import { PayeePicker, type PayeeOption } from '../transactions/payee-picker'
import { nativeSelectCls, formActionsCls, formBtnCls } from '@/lib/form-styles'
import { formatCurrency, formatIsoDate, todayIsoDateLocal } from '@/lib/format'
import { useLanguage } from '@/components/language-provider'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'
import { splitInstallments, installmentDate } from '@/lib/installments/shared'
import { cn } from '@/lib/utils'

export type InstallmentFormAccount = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
}

export type InstallmentFormCategory = {
  id: string
  name: string
  parent_category_id: string | null
  icon: string | null
}

function accountLabel(account: InstallmentFormAccount) {
  return [account.name, account.institution_name, account.currency_code]
    .filter(Boolean)
    .join(' · ')
}

function categoryLabel(
  category: InstallmentFormCategory,
  byId: Map<string, InstallmentFormCategory>
) {
  const parent = category.parent_category_id ? byId.get(category.parent_category_id) : null
  const name = parent ? `${parent.name} / ${category.name}` : category.name
  return category.icon ? `${category.icon} ${name}` : name
}

/**
 * BR-035 — create an installment plan.
 *
 * The form's job is to make the split visible *before* saving, because saving
 * writes N real transactions and that should never be a surprise. The preview is
 * derived from the same helper the schedule is generated from, so what the user
 * sees is what gets written — including the remainder landing on the last
 * installment.
 */
export function InstallmentForm({
  accounts,
  categories,
  payees,
  baseCurrency,
  cancelHref,
}: {
  accounts: InstallmentFormAccount[]
  categories: InstallmentFormCategory[]
  payees: PayeeOption[]
  baseCurrency: string
  cancelHref: string
}) {
  const { locale } = useLanguage()
  const ui = useUiTranslation()
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [totalInput, setTotalInput] = useState('')
  const [countInput, setCountInput] = useState('12')
  const [startDate, setStartDate] = useState(() => todayIsoDateLocal())
  const [rate, setRate] = useState('')

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  )

  const selectedAccount = accounts.find((account) => account.id === accountId)
  const currencyCode = selectedAccount?.currency_code ?? ''
  const isMultiCurrency = Boolean(currencyCode) && currencyCode !== baseCurrency

  const total = Number(totalInput)
  const count = Number(countInput)
  const split =
    Number.isFinite(total) && total > 0 && Number.isInteger(count) && count >= 2 && count <= 60
      ? splitInstallments(total, count)
      : null

  return (
    <form action={createInstallmentPlanAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="installment_description">What did you buy?</Label>
        <Input
          id="installment_description"
          name="description"
          maxLength={200}
          placeholder="Fridge, laptop, flight…"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="installment_account">Charged to</Label>
          <select
            id="installment_account"
            name="account_id"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className={nativeSelectCls}
            required
          >
            <option value="" disabled>
              Select account
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountLabel(account)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="installment_category">Category</Label>
          <select
            id="installment_category"
            name="category_id"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className={nativeSelectCls}
            required
            disabled={!categories.length}
          >
            <option value="" disabled>
              Select category
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {categoryLabel(category, categoriesById)}
              </option>
            ))}
          </select>
          {!categories.length ? (
            <p className="text-xs text-muted-foreground">
              No expense categories available.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="installment_total">Total price</Label>
          <AmountInput
            id="installment_total"
            name="total_amount"
            currencyCode={currencyCode || baseCurrency}
            value={totalInput}
            onValueChange={setTotalInput}
            required
          />
          <p className="text-xs text-muted-foreground">
            The full price, not the monthly payment.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="installment_count">Number of payments</Label>
          <Input
            id="installment_count"
            name="installment_count"
            type="number"
            inputMode="numeric"
            min={2}
            max={60}
            step={1}
            value={countInput}
            onChange={(event) => setCountInput(event.target.value)}
            required
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="installment_start">First payment date</Label>
          <Input
            id="installment_start"
            name="start_date"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            required
          />
        </div>
      </div>

      {isMultiCurrency ? (
        <div className="space-y-2">
          <Label htmlFor="installment_rate">
            Exchange rate: 1 {baseCurrency} = ? {currencyCode}
          </Label>
          <Input
            id="installment_rate"
            type="text"
            inputMode="decimal"
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            placeholder={`e.g. how many ${currencyCode} make up 1 ${baseCurrency}`}
            required
          />
          <input type="hidden" name="rate_base_to_account" value={rate} />
          <p className="text-xs text-muted-foreground">
            Applied to every installment, so the whole plan is valued at one rate.
          </p>
        </div>
      ) : null}

      <PayeePicker
        payees={payees}
        label="Payee (optional)"
        helpText="Search an existing payee or type a new name to create one."
      />

      <div className="space-y-2">
        <Label htmlFor="installment_notes">Notes (optional)</Label>
        <Textarea id="installment_notes" name="notes" rows={2} />
      </div>

      {/* The split, before anything is written. Saving creates N real
          transactions — the user should see exactly what they are.

          Each line below is ONE template literal, so it reaches the translation
          catalog as a whole sentence with {n} placeholders. Splitting it into
          fragments around the values would translate into nonsense word order
          for es/fr. */}
      {split ? (
        <div className="space-y-1.5 rounded-lg bg-muted/40 p-3 text-xs">
          <p className="font-medium text-foreground">
            {ui(
              `${count} payments of ${formatCurrency(
                split.perInstallment,
                currencyCode || baseCurrency,
                locale
              )}`
            )}
          </p>
          {split.lastInstallment !== split.perInstallment ? (
            <p className="text-muted-foreground">
              {ui(
                `The last payment is ${formatCurrency(
                  split.lastInstallment,
                  currencyCode || baseCurrency,
                  locale
                )}, so the payments add up to the total exactly.`
              )}
            </p>
          ) : null}
          <p className="text-muted-foreground">
            {ui(
              `First payment ${formatIsoDate(
                startDate,
                locale
              )}, last payment ${formatIsoDate(
                installmentDate(startDate, count),
                locale
              )}.`
            )}
          </p>
          <p className="text-muted-foreground">
            Each payment is saved as its own expense on its own date. There is no
            separate charge for the total, so your reports never count it twice.
          </p>
        </div>
      ) : null}

      <div className={formActionsCls}>
        <SubmitButton type="submit" className={formBtnCls} pendingText="Creating…">
          Create plan
        </SubmitButton>
        <Link
          href={cancelHref}
          className={cn(buttonVariants({ variant: 'outline' }), formBtnCls)}
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
