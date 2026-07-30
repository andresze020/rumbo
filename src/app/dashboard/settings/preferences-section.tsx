import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/submit-button'
import { updateUiPreferencesAction } from './settings-actions'
import { nativeSelectCls } from '@/lib/form-styles'
import type { TransactionFormField, UiPreferences } from '@/lib/preferences/shared'

type AccountOption = { id: string; name: string }

/**
 * BR-032 (which optional fields the add-transaction form shows) and BR-038
 * (how the transaction list opens and renders), sharing one settings card
 * because they share one stored object.
 *
 * Deliberately a plain server-rendered form: every control is a checkbox or a
 * select, so there is nothing here that needs client state.
 */

const FORM_FIELD_LABELS: Record<TransactionFormField, { label: string; description: string }> = {
  payee: {
    label: 'Payee',
    description: 'Who you paid, or who paid you.',
  },
  tags: {
    label: 'Tags',
    description: 'Free-form labels alongside the category.',
  },
  notes: {
    label: 'Notes',
    description: 'A longer note attached to the transaction.',
  },
  repeat: {
    label: 'Repeat',
    description: 'Turn the entry into a recurring template as you save it.',
  },
  status: {
    label: 'Status',
    description: 'Posted or pending. Hiding it always saves as posted.',
  },
  time: {
    label: 'Time of day',
    description:
      'Orders same-day entries. Off by default, and it never changes which month a transaction belongs to.',
  },
}

const PERIOD_LABELS: Record<UiPreferences['transactions']['defaultPeriod'], string> = {
  current_month: 'Current month',
  last_30_days: 'Last 30 days',
  all_time: 'All time',
}

function CheckboxRow({
  name,
  defaultChecked,
  label,
  description,
}: {
  name: string
  defaultChecked: boolean
  label: string
  description: string
}) {
  return (
    <Label className="items-start gap-3 rounded-lg border p-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4" />
      <span className="space-y-1">
        <span className="block">{label}</span>
        <span className="block text-sm font-normal text-muted-foreground">{description}</span>
      </span>
    </Label>
  )
}

export function PreferencesSection({
  preferences,
  accounts,
}: {
  preferences: UiPreferences
  accounts: AccountOption[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>
          How the transaction form and transaction list behave for you. These are
          yours alone — they do not change anything for the rest of the household.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={updateUiPreferencesAction} className="space-y-6">
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Transaction form fields</legend>
            <p className="text-xs text-muted-foreground">
              Hidden fields are only hidden on the add form. Nothing already saved is
              removed, and editing a transaction always shows every field.
            </p>
            <div className="space-y-2">
              {(Object.keys(FORM_FIELD_LABELS) as TransactionFormField[]).map((field) => (
                <CheckboxRow
                  key={field}
                  name={`field_${field}`}
                  defaultChecked={preferences.formFields[field]}
                  label={FORM_FIELD_LABELS[field].label}
                  description={FORM_FIELD_LABELS[field].description}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t pt-6">
            <legend className="text-sm font-medium">Transaction list</legend>

            <div className="space-y-1.5">
              <Label htmlFor="default_period">Default period</Label>
              <select
                id="default_period"
                name="default_period"
                defaultValue={preferences.transactions.defaultPeriod}
                className={nativeSelectCls}
              >
                {(Object.keys(PERIOD_LABELS) as Array<keyof typeof PERIOD_LABELS>).map(
                  (period) => (
                    <option key={period} value={period}>
                      {PERIOD_LABELS[period]}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Default accounts</Label>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-1">
                {accounts.length === 0 ? (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">
                    No active accounts yet.
                  </p>
                ) : (
                  accounts.map((account) => (
                    <Label
                      key={account.id}
                      className="cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 font-normal hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        name="default_account_id"
                        value={account.id}
                        defaultChecked={preferences.transactions.defaultAccountIds.includes(
                          account.id
                        )}
                        className="size-4 shrink-0 accent-primary"
                      />
                      <span className="min-w-0 truncate">{account.name}</span>
                    </Label>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Applied when you open the transaction list without filters. Leave all
                unchecked for every account. A link that carries its own filters always
                wins.
              </p>
            </div>

            <CheckboxRow
              name="compact_list"
              defaultChecked={preferences.transactions.compactList}
              label="Compact rows"
              description="Tighter spacing, so more transactions fit on screen."
            />
            <CheckboxRow
              name="show_balance_adjustments"
              defaultChecked={preferences.transactions.showBalanceAdjustments}
              label="Show balance adjustments"
              description="Corrections that move an account to a target balance. Hiding them changes nothing in your totals."
            />
          </fieldset>

          <SubmitButton type="submit" size="sm" pendingText="Saving…">
            Save preferences
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  )
}
