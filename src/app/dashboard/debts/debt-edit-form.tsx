import { updateDebtAction } from './actions'
import { AdvancedFields } from '@/components/advanced-fields'
import { AmountInput } from '@/components/amount-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/submit-button'

type Debt = {
  id: string
  name: string
  lender_name: string | null
  original_principal: number | string | null
  interest_rate: number | string | null
  interest_rate_period: string | null
  minimum_payment: number | string | null
  payment_due_day: number | string | null
  status: string
  notes: string | null
}

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function nullableNumber(value: number | string | null) {
  return value === null ? '' : String(value)
}

function nullableMoney(value: number | string | null) {
  return value === null ? '' : Number(value).toFixed(2)
}

export function DebtEditForm({ debt, currencyCode }: { debt: Debt; currencyCode: string }) {
  return (
    <form action={updateDebtAction} className="space-y-4">
      <input type="hidden" name="debt_id" value={debt.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="edit_name">Name</Label>
          <Input id="edit_name" name="name" defaultValue={debt.name} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit_status">Status</Label>
          <select
            id="edit_status"
            name="status"
            defaultValue={debt.status}
            className={selectClassName}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit_lender_name">Lender</Label>
          <Input
            id="edit_lender_name"
            name="lender_name"
            defaultValue={debt.lender_name ?? ''}
          />
        </div>
      </div>

      <AdvancedFields label="Loan details (optional)">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="edit_original_principal">Original principal</Label>
            <AmountInput
              id="edit_original_principal"
              name="original_principal"
              currencyCode={currencyCode}
              defaultValue={nullableMoney(debt.original_principal)}
            />
            <p className="text-xs text-muted-foreground">
              Optional. Used for paydown progress tracking.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit_interest_rate">Interest rate</Label>
            <div className="relative">
              <Input
                id="edit_interest_rate"
                name="interest_rate"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                defaultValue={nullableNumber(debt.interest_rate)}
                className="pr-7"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit_interest_rate_period">Interest period</Label>
            <select
              id="edit_interest_rate_period"
              name="interest_rate_period"
              defaultValue={debt.interest_rate_period ?? ''}
              className={selectClassName}
            >
              <option value="">Not set</option>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit_minimum_payment">Minimum payment</Label>
            <AmountInput
              id="edit_minimum_payment"
              name="minimum_payment"
              currencyCode={currencyCode}
              defaultValue={nullableMoney(debt.minimum_payment)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit_payment_due_day">Due day</Label>
            <Input
              id="edit_payment_due_day"
              name="payment_due_day"
              type="number"
              min="1"
              max="31"
              step="1"
              defaultValue={nullableNumber(debt.payment_due_day)}
            />
          </div>
        </div>
      </AdvancedFields>

      <div className="space-y-2">
        <Label htmlFor="edit_notes">Notes</Label>
        <Textarea
          id="edit_notes"
          name="notes"
          defaultValue={debt.notes ?? ''}
        />
      </div>

      <SubmitButton type="submit" variant="outline" pendingText="Saving…">
        Save debt
      </SubmitButton>
    </form>
  )
}
