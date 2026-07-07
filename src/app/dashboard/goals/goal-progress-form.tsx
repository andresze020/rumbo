'use client'

import Link from 'next/link'
import { contributeGoalAction, withdrawGoalAction } from './actions'
import { AmountInput } from '@/components/amount-input'
import { buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/submit-button'
import { formatCurrency } from '@/lib/format'
import { formActionsCls, formBtnCls } from '@/lib/form-styles'
import { cn } from '@/lib/utils'

export function GoalProgressForm({
  mode,
  goalId,
  currencyCode,
  currentAmount,
  targetAmount,
}: {
  mode: 'contribute' | 'withdraw'
  goalId: string
  currencyCode: string
  currentAmount: number
  targetAmount: number
}) {
  const action = mode === 'contribute' ? contributeGoalAction : withdrawGoalAction

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="goal_id" value={goalId} />

      <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
        Saved {formatCurrency(currentAmount, currencyCode)} of {formatCurrency(targetAmount, currencyCode)}.
      </p>

      <div className="space-y-2">
        <Label htmlFor={`progress_amount_${goalId}`}>Amount</Label>
        <AmountInput id={`progress_amount_${goalId}`} name="amount" currencyCode={currencyCode} required />
      </div>

      <div className={formActionsCls}>
        <SubmitButton type="submit" className={formBtnCls} pendingText={mode === 'contribute' ? 'Adding…' : 'Withdrawing…'}>
          {mode === 'contribute' ? 'Add funds' : 'Withdraw'}
        </SubmitButton>
        <Link href="/dashboard/goals" className={cn(buttonVariants({ variant: 'outline' }), formBtnCls)}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
