'use client'

import Link from 'next/link'
import { ArrowRight, Pencil } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/submit-button'
import { ConfirmActionButton } from '@/components/confirm-action-button'
import { cn } from '@/lib/utils'
import { toggleRuleAction, deleteRuleAction } from './actions'
import type { RuleMatchField, RuleOperator } from '@/lib/rules/match'

export type RuleVM = {
  id: string
  name: string | null
  matchField: RuleMatchField
  operator: RuleOperator
  matchValue: string
  categoryLabel: string
  priority: number
  isActive: boolean
  editHref: string
}

const FIELD_LABEL: Record<RuleMatchField, string> = {
  description: 'Description',
  merchant_name: 'Merchant',
  account_name: 'Account',
  amount: 'Amount',
}

const OPERATOR_LABEL: Record<RuleOperator, string> = {
  contains: 'contains',
  equals: 'equals',
  starts_with: 'starts with',
  ends_with: 'ends with',
  regex: 'matches',
  gt: '>',
  lt: '<',
}

export function RuleRow({ rule }: { rule: RuleVM }) {
  const condition = `${FIELD_LABEL[rule.matchField]} ${OPERATOR_LABEL[rule.operator]} “${rule.matchValue}”`

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/30',
        !rule.isActive && 'bg-muted/20'
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">
            {rule.name || condition}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            <ArrowRight className="size-3" aria-hidden="true" />
            {rule.categoryLabel}
          </span>
          {!rule.isActive ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Inactive
            </span>
          ) : null}
        </div>
        <span className="mt-1 block text-[11px] text-muted-foreground">
          {rule.name ? `${condition} · ` : ''}Priority {rule.priority}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Link
          href={rule.editHref}
          className={buttonVariants({ variant: 'outline', size: 'icon-sm' })}
          aria-label="Edit rule"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </Link>

        <form action={toggleRuleAction}>
          <input type="hidden" name="rule_id" value={rule.id} />
          <input
            type="hidden"
            name="is_active"
            value={rule.isActive ? 'false' : 'true'}
          />
          <SubmitButton
            type="submit"
            size="sm"
            variant="outline"
            pendingText="…"
          >
            {rule.isActive ? 'Disable' : 'Enable'}
          </SubmitButton>
        </form>

        <ConfirmActionButton
          action={deleteRuleAction}
          hiddenFields={{ rule_id: rule.id }}
          triggerLabel="Delete"
          pendingLabel="Deleting…"
          title="Delete this rule?"
          description="The rule stops applying to future imports. Transactions it already categorized keep their category."
          cancelLabel="Cancel"
          confirmLabel="Delete"
        />
      </div>
    </div>
  )
}
