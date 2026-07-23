'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createRuleAction, updateRuleAction } from './actions'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/submit-button'
import { formActionsCls, formBtnCls, nativeSelectCls } from '@/lib/form-styles'
import { cn } from '@/lib/utils'
import type { RuleMatchField, RuleOperator } from '@/lib/rules/match'

export type RuleFormValues = {
  id: string
  name: string | null
  matchField: RuleMatchField
  operator: RuleOperator
  matchValue: string
  categoryId: string
  priority: number
  isActive: boolean
}

type CategoryOption = { id: string; label: string }

const FIELD_OPTIONS: Array<{ value: RuleMatchField; label: string }> = [
  { value: 'description', label: 'Description' },
  { value: 'merchant_name', label: 'Merchant / payee' },
  { value: 'account_name', label: 'Account name' },
  { value: 'amount', label: 'Amount' },
]

const TEXT_OPERATORS: Array<{ value: RuleOperator; label: string }> = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'regex', label: 'matches regex' },
]

const AMOUNT_OPERATORS: Array<{ value: RuleOperator; label: string }> = [
  { value: 'equals', label: 'equals' },
  { value: 'gt', label: 'greater than' },
  { value: 'lt', label: 'less than' },
]

export function RuleForm({
  rule,
  mode,
  categories,
  cancelHref,
}: {
  rule?: RuleFormValues
  mode: 'create' | 'edit'
  categories: CategoryOption[]
  cancelHref: string
}) {
  const formAction = mode === 'create' ? createRuleAction : updateRuleAction
  const [matchField, setMatchField] = useState<RuleMatchField>(
    rule?.matchField ?? 'description'
  )
  const [operator, setOperator] = useState<RuleOperator>(
    rule?.operator ?? 'contains'
  )
  const [isActive, setIsActive] = useState(rule?.isActive ?? true)

  const isAmount = matchField === 'amount'
  const operators = isAmount ? AMOUNT_OPERATORS : TEXT_OPERATORS

  function onFieldChange(next: RuleMatchField) {
    setMatchField(next)
    // Keep the operator valid for the new field type.
    const allowed = (next === 'amount' ? AMOUNT_OPERATORS : TEXT_OPERATORS).map(
      (o) => o.value
    )
    if (!allowed.includes(operator)) {
      setOperator(next === 'amount' ? 'gt' : 'contains')
    }
  }

  return (
    <form action={formAction} className="space-y-4">
      {rule ? <input type="hidden" name="rule_id" value={rule.id} /> : null}
      <input type="hidden" name="is_active" value={isActive ? 'true' : 'false'} />

      <div className="space-y-2">
        <Label htmlFor={`name_${mode}`}>Name (optional)</Label>
        <Input
          id={`name_${mode}`}
          name="name"
          defaultValue={rule?.name ?? ''}
          placeholder="e.g. Groceries, Netflix subscription"
          maxLength={80}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`match_field_${mode}`}>When</Label>
          <select
            id={`match_field_${mode}`}
            name="match_field"
            value={matchField}
            onChange={(e) => onFieldChange(e.target.value as RuleMatchField)}
            className={nativeSelectCls}
          >
            {FIELD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`operator_${mode}`}>Condition</Label>
          <select
            id={`operator_${mode}`}
            name="operator"
            value={operator}
            onChange={(e) => setOperator(e.target.value as RuleOperator)}
            className={nativeSelectCls}
          >
            {operators.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`match_value_${mode}`}>Value</Label>
        <Input
          id={`match_value_${mode}`}
          name="match_value"
          defaultValue={rule?.matchValue ?? ''}
          inputMode={isAmount ? 'decimal' : 'text'}
          placeholder={
            isAmount
              ? 'e.g. 100'
              : operator === 'regex'
                ? 'e.g. ^AMZN'
                : 'e.g. Starbucks'
          }
          maxLength={200}
          required
        />
        {isAmount ? (
          <p className="text-xs text-muted-foreground">
            Compared against the transaction amount&rsquo;s absolute value.
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`category_${mode}`}>Apply category</Label>
          <select
            id={`category_${mode}`}
            name="category_id"
            defaultValue={rule?.categoryId ?? ''}
            className={nativeSelectCls}
            required
          >
            <option value="" disabled>
              Select a category…
            </option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`priority_${mode}`}>Priority</Label>
          <Input
            id={`priority_${mode}`}
            name="priority"
            type="number"
            min={0}
            step={1}
            defaultValue={rule?.priority ?? 100}
          />
          <p className="text-xs text-muted-foreground">
            Lower runs first when several rules match.
          </p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="size-4 rounded border-input"
        />
        Active
      </label>

      <div className={formActionsCls}>
        <SubmitButton
          type="submit"
          className={formBtnCls}
          pendingText={mode === 'create' ? 'Creating rule' : 'Saving rule'}
        >
          {mode === 'create' ? 'Create rule' : 'Save rule'}
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
