'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createAccountAction } from '@/app/dashboard/accounts/actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/submit-button'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsiblePanel,
} from '@/components/ui/collapsible'
import { nativeSelectCls } from '@/lib/form-styles'
import { cn } from '@/lib/utils'

type Currency = {
  code: string
  name: string
}

export type OnboardingAccount = {
  id: string
  name: string
  account_type: string
  currency_code: string
}

const typeTiles = [
  {
    value: 'checking',
    icon: '🏦',
    label: 'Checking / Savings',
    description: 'Your everyday bank accounts',
  },
  {
    value: 'credit_card',
    icon: '💳',
    label: 'Credit card',
    description: 'Spend now, pay later — counts as a liability',
  },
  {
    value: 'cash',
    icon: '💵',
    label: 'Cash',
    description: 'Physical money you carry in your wallet',
  },
  {
    value: 'investment',
    icon: '📈',
    label: 'Investment',
    description: 'Stocks, ETFs, pension funds, and brokerage accounts',
  },
] as const

const typeIconByValue: Record<string, string> = {
  checking: '🏦',
  savings: '🏦',
  credit_card: '💳',
  cash: '💵',
  investment: '📈',
  debt: '💳',
  other: '🏷️',
}

const accountTypeOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'debt', label: 'Debt' },
  { value: 'investment', label: 'Investment' },
  { value: 'other', label: 'Other' },
]

function NewAccountFields({
  currencies,
  defaultCurrency,
  accountType,
  setAccountType,
}: {
  currencies: Currency[]
  defaultCurrency: string
  accountType: string
  setAccountType: (value: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {typeTiles.map((tile) => (
          <button
            key={tile.value}
            type="button"
            onClick={() => setAccountType(tile.value)}
            aria-pressed={accountType === tile.value}
            className={cn(
              'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
              accountType === tile.value
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'hover:border-primary/40 hover:bg-muted/50'
            )}
          >
            <span className="text-xl leading-none" aria-hidden="true">
              {tile.icon}
            </span>
            <span className="min-w-0 space-y-0.5">
              <span className="block text-sm font-bold">{tile.label}</span>
              <span className="block text-xs leading-snug text-muted-foreground">
                {tile.description}
              </span>
            </span>
          </button>
        ))}
      </div>

      <form action={createAccountAction} className="space-y-4">
        <input type="hidden" name="return_to" value="onboarding" />
        <input type="hidden" name="include_in_net_worth" value="on" />

        <div className="space-y-2">
          <Label htmlFor="name">Account name</Label>
          <Input
            id="name"
            name="name"
            placeholder="e.g. Main checking"
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="account_type">Account type</Label>
            <select
              id="account_type"
              name="account_type"
              value={accountType}
              onChange={(event) => setAccountType(event.target.value)}
              className={nativeSelectCls}
            >
              {accountTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency_code">Currency</Label>
            <select
              id="currency_code"
              name="currency_code"
              defaultValue={defaultCurrency}
              className={nativeSelectCls}
            >
              {currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code} - {currency.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <SubmitButton
          type="submit"
          className="h-11 w-full rounded-xl"
          pendingText="Saving account"
        >
          Save account →
        </SubmitButton>
      </form>
    </div>
  )
}

export function AccountStepForm({
  existingAccounts,
  currencies,
  defaultCurrency,
}: {
  existingAccounts: OnboardingAccount[]
  currencies: Currency[]
  defaultCurrency: string
}) {
  const [accountType, setAccountType] = useState('checking')
  const hasAccounts = existingAccounts.length > 0

  return (
    <div className="space-y-5">
      {hasAccounts ? (
        <ul className="divide-y rounded-xl border">
          {existingAccounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <span className="text-lg leading-none" aria-hidden="true">
                {typeIconByValue[account.account_type] ?? '🏷️'}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {account.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {account.currency_code}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {hasAccounts ? (
        <Collapsible>
          <CollapsibleTrigger className="px-0">
            <Plus className="size-3.5" aria-hidden="true" />
            Add another account
          </CollapsibleTrigger>
          <CollapsiblePanel>
            <div className="pt-3">
              <NewAccountFields
                currencies={currencies}
                defaultCurrency={defaultCurrency}
                accountType={accountType}
                setAccountType={setAccountType}
              />
            </div>
          </CollapsiblePanel>
        </Collapsible>
      ) : (
        <NewAccountFields
          currencies={currencies}
          defaultCurrency={defaultCurrency}
          accountType={accountType}
          setAccountType={setAccountType}
        />
      )}

      <div className="flex flex-col gap-2 border-t pt-4">
        <Link
          href="/onboarding/categories"
          className={cn(buttonVariants(), 'h-11 w-full rounded-xl')}
        >
          {hasAccounts ? 'Continue →' : 'Skip for now →'}
        </Link>
      </div>
    </div>
  )
}
