'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createGoalAction, updateGoalAction } from './actions'
import { AmountInput } from '@/components/amount-input'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/submit-button'
import { GOAL_TYPES } from '@/lib/goals/shared'

export type GoalFormAccount = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
}

export type GoalTemplate = {
  id: string
  name: string
  goal_type: string
  target_amount: number | string
  currency_code: string
  target_date: string | null
  linked_account_id: string | null
}

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function accountLabel(account: GoalFormAccount) {
  return [account.name, account.institution_name, account.currency_code]
    .filter(Boolean)
    .join(' · ')
}

export function GoalForm({
  mode,
  template,
  accounts,
  baseCurrency,
}: {
  mode: 'create' | 'edit'
  template?: GoalTemplate
  accounts: GoalFormAccount[]
  baseCurrency: string
}) {
  const [linkedAccountId, setLinkedAccountId] = useState(template?.linked_account_id ?? '')
  const linkedAccount = accounts.find((a) => a.id === linkedAccountId)
  const [currencyCode, setCurrencyCode] = useState(
    template?.currency_code ?? linkedAccount?.currency_code ?? baseCurrency
  )

  const formAction = mode === 'create' ? createGoalAction : updateGoalAction

  function handleAccountChange(value: string) {
    setLinkedAccountId(value)
    const account = accounts.find((a) => a.id === value)
    if (account) setCurrencyCode(account.currency_code)
  }

  return (
    <form action={formAction} className="space-y-4">
      {template ? <input type="hidden" name="goal_id" value={template.id} /> : null}
      <input type="hidden" name="currency_code" value={currencyCode} />

      <div className="space-y-2">
        <Label htmlFor={`name_${mode}`}>Name</Label>
        <Input
          id={`name_${mode}`}
          name="name"
          maxLength={120}
          defaultValue={template?.name ?? ''}
          placeholder="Emergency fund, Trip to Cartagena…"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`type_${mode}`}>Type</Label>
          <select
            id={`type_${mode}`}
            name="goal_type"
            defaultValue={template?.goal_type ?? 'custom'}
            className={selectClassName}
          >
            {GOAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`account_${mode}`}>Linked account (optional)</Label>
          <select
            id={`account_${mode}`}
            value={linkedAccountId}
            onChange={(e) => handleAccountChange(e.target.value)}
            className={selectClassName}
          >
            <option value="">No linked account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountLabel(account)}
              </option>
            ))}
          </select>
          <input type="hidden" name="linked_account_id" value={linkedAccountId} />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`target_amount_${mode}`}>Target amount</Label>
          <AmountInput
            id={`target_amount_${mode}`}
            name="target_amount"
            currencyCode={currencyCode}
            defaultValue={template ? Number(template.target_amount).toFixed(2) : ''}
            required
          />
          <p className="text-xs text-muted-foreground">In {currencyCode}.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`target_date_${mode}`}>Target date (optional)</Label>
          <Input
            id={`target_date_${mode}`}
            name="target_date"
            type="date"
            defaultValue={template?.target_date ?? ''}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <SubmitButton type="submit" pendingText={mode === 'create' ? 'Creating…' : 'Saving…'}>
          {mode === 'create' ? 'Create goal' : 'Save changes'}
        </SubmitButton>
        <Link href="/dashboard/goals" className={buttonVariants({ variant: 'outline' })}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
