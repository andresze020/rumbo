'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createGoalAction, updateGoalAction } from './actions'
import { AmountInput } from '@/components/amount-input'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/submit-button'
import { GOAL_TYPES, canLinkAccountToGoal } from '@/lib/goals/shared'
import { useLanguage } from '@/components/language-provider'
import { nativeSelectCls, formActionsCls, formBtnCls } from '@/lib/form-styles'
import { cn } from '@/lib/utils'

export type GoalFormAccount = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
  /** 'asset' | 'liability' — decides which goal types may link it (MQ-006). */
  account_class: string
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

const selectClassName = nativeSelectCls

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
  const { t } = useLanguage()
  const [goalType, setGoalType] = useState<string>(template?.goal_type ?? 'custom')
  // MQ-006: a savings goal links to an asset account, `debt_payoff` to the
  // liability it pays off. A stale link from before that rule is dropped here,
  // so the select shows what will be saved.
  const [linkedAccountId, setLinkedAccountId] = useState(() => {
    const initial = accounts.find((a) => a.id === template?.linked_account_id)
    return initial && canLinkAccountToGoal(template?.goal_type ?? 'custom', initial.account_class)
      ? initial.id
      : ''
  })
  const linkedAccount = accounts.find((a) => a.id === linkedAccountId)
  const linkableAccounts = accounts.filter((a) => canLinkAccountToGoal(goalType, a.account_class))
  const [currencyCode, setCurrencyCode] = useState(
    template?.currency_code ?? linkedAccount?.currency_code ?? baseCurrency
  )

  const formAction = mode === 'create' ? createGoalAction : updateGoalAction

  function handleTypeChange(value: string) {
    setGoalType(value)
    if (linkedAccount && !canLinkAccountToGoal(value, linkedAccount.account_class)) {
      setLinkedAccountId('')
    }
  }

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
            value={goalType}
            onChange={(e) => handleTypeChange(e.target.value)}
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
            {linkableAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountLabel(account)}
              </option>
            ))}
          </select>
          <input type="hidden" name="linked_account_id" value={linkedAccountId} />
          <p className="text-xs text-muted-foreground">{t('goals.progressSourceHint')}</p>
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

      <div className={formActionsCls}>
        <SubmitButton type="submit" className={formBtnCls} pendingText={mode === 'create' ? 'Creating…' : 'Saving…'}>
          {mode === 'create' ? 'Create goal' : 'Save changes'}
        </SubmitButton>
        <Link href="/dashboard/goals" className={cn(buttonVariants({ variant: 'outline' }), formBtnCls)}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
