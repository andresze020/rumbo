'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createAccountAction } from '@/app/dashboard/accounts/actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/submit-button'
import { nativeSelectCls } from '@/lib/form-styles'
import { cn } from '@/lib/utils'

type Currency = {
  code: string
  name: string
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

const accountTypeOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'debt', label: 'Debt' },
  { value: 'investment', label: 'Investment' },
  { value: 'other', label: 'Other' },
]

export function AccountStepForm({
  currencies,
  defaultCurrency,
}: {
  currencies: Currency[]
  defaultCurrency: string
}) {
  const [accountType, setAccountType] = useState('checking')

  return (
    <div className="space-y-5">
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

        <div className="flex flex-col gap-2 pt-1">
          <SubmitButton
            type="submit"
            className="h-11 w-full rounded-xl"
            pendingText="Saving account"
          >
            Save account →
          </SubmitButton>
          <Link
            href="/onboarding/categories"
            className={cn(
              buttonVariants({ variant: 'ghost' }),
              'h-11 w-full rounded-xl'
            )}
          >
            Skip for now →
          </Link>
        </div>
      </form>
    </div>
  )
}
