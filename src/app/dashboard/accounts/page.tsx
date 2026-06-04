import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  archiveAccountAction,
  createAccountAction,
  updateAccountAction,
} from './actions'
import { OpeningBalanceForm } from './opening-balance-form'
import { FormDialog } from '@/components/form-dialog'
import { GlobalAddTransactionButton } from '@/components/global-add-transaction-button'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/empty-state'
import { MetricCard } from '@/components/metric-card'
import { SubmitButton } from '@/components/submit-button'

type AccountsPageProps = {
  searchParams: Promise<{
    created?: string
    updated?: string
    archived?: string
    unarchived?: string
    openingBalanceSet?: string
    showArchived?: string
    mode?: string
    edit?: string
    openingBalance?: string
    info?: string
    error?: string
  }>
}

type AccountBalance = {
  account_id: string
  account_name: string
  account_type: string
  account_class: string
  currency_code: string
  include_in_net_worth: boolean
  posted_balance_account_currency: number | string
  pending_balance_account_currency: number | string
  projected_balance_account_currency: number | string
  posted_balance_base_currency: number | string
  pending_balance_base_currency: number | string
  projected_balance_base_currency: number | string
}

type Currency = {
  code: string
  name: string
}

type AccountMetadata = {
  id: string
  name: string
  account_type: string
  account_class: string
  currency_code: string
  institution_name: string | null
  last_four: string | null
  color: string | null
  icon: string | null
  opening_balance_date: string
  is_archived: boolean
  include_in_net_worth: boolean
  sort_order: number | null
  notes: string | null
}

type AccountRow = {
  balance: AccountBalance
  hasOpeningBalance: boolean
  metadata: AccountMetadata
}

type OpeningBalanceEntry = {
  account_id: string
}

type TransactionEntryBalance = {
  account_id: string
  amount_account_currency: number | string
  amount_base_currency: number | string
  transactions:
    | {
        status: string
      }
    | {
        status: string
      }[]
}

const accountTypes = [
  { value: 'cash', label: 'Cash' },
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'debt', label: 'Debt' },
  { value: 'investment', label: 'Investment' },
  { value: 'other', label: 'Other' },
]

const accountClasses = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
]

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function accountsPath({
  showArchived,
  mode,
  edit,
  openingBalance,
}: {
  showArchived?: boolean
  mode?: 'create'
  edit?: string
  openingBalance?: string
} = {}) {
  const params = new URLSearchParams()

  if (showArchived) {
    params.set('showArchived', 'true')
  }

  if (mode) {
    params.set('mode', mode)
  }

  if (edit) {
    params.set('edit', edit)
  }

  if (openingBalance) {
    params.set('openingBalance', openingBalance)
  }

  const queryString = params.toString()

  return `/dashboard/accounts${queryString ? `?${queryString}` : ''}`
}

function formatLabel(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatCurrency(value: number | string, currencyCode: string) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currencyCode,
  }).format(Number(value))
}

function liabilityDisplay(value: number | string) {
  return Math.abs(Number(value))
}

function emptyBalance(account: AccountMetadata): AccountBalance {
  return {
    account_id: account.id,
    account_name: account.name,
    account_type: account.account_type,
    account_class: account.account_class,
    currency_code: account.currency_code,
    include_in_net_worth: account.include_in_net_worth,
    posted_balance_account_currency: 0,
    pending_balance_account_currency: 0,
    projected_balance_account_currency: 0,
    posted_balance_base_currency: 0,
    pending_balance_base_currency: 0,
    projected_balance_base_currency: 0,
  }
}

function deriveBalance(
  account: AccountMetadata,
  entries: TransactionEntryBalance[]
) {
  const balance = emptyBalance(account)

  for (const entry of entries) {
    const amountAccountCurrency = Number(entry.amount_account_currency)
    const amountBaseCurrency = Number(entry.amount_base_currency)
    const transaction = Array.isArray(entry.transactions)
      ? entry.transactions[0]
      : entry.transactions

    if (transaction?.status === 'posted') {
      balance.posted_balance_account_currency =
        Number(balance.posted_balance_account_currency) + amountAccountCurrency
      balance.posted_balance_base_currency =
        Number(balance.posted_balance_base_currency) + amountBaseCurrency
    }

    if (transaction?.status === 'pending') {
      balance.pending_balance_account_currency =
        Number(balance.pending_balance_account_currency) + amountAccountCurrency
      balance.pending_balance_base_currency =
        Number(balance.pending_balance_base_currency) + amountBaseCurrency
    }
  }

  balance.projected_balance_account_currency =
    Number(balance.posted_balance_account_currency) +
    Number(balance.pending_balance_account_currency)
  balance.projected_balance_base_currency =
    Number(balance.posted_balance_base_currency) +
    Number(balance.pending_balance_base_currency)

  return balance
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function sumIncludedSignedBase(rows: AccountRow[], accountClass: string) {
  return rows
    .filter(
      (row) =>
        row.metadata.include_in_net_worth &&
        row.metadata.account_class === accountClass
    )
    .reduce(
      (total, row) =>
        total + Number(row.balance.posted_balance_base_currency),
      0
    )
}

function sumIncludedDisplayedLiabilities(rows: AccountRow[]) {
  return rows
    .filter(
      (row) =>
        row.metadata.include_in_net_worth &&
        row.metadata.account_class === 'liability'
    )
    .reduce((total, row) => {
      const signedBalance = Number(row.balance.posted_balance_base_currency)

      return total + Math.max(0, -signedBalance)
    }, 0)
}

function CreateAccountForm({
  activeCurrencies,
  defaultCurrency,
  showArchived,
}: {
  activeCurrencies: Currency[]
  defaultCurrency: string
  showArchived: boolean
}) {
  return (
    <form action={createAccountAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="account_type">Type</Label>
          <select
            id="account_type"
            name="account_type"
            defaultValue="checking"
            className={selectClassName}
          >
            {accountTypes.map((accountType) => (
              <option key={accountType.value} value={accountType.value}>
                {accountType.label}
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
            className={selectClassName}
          >
            {activeCurrencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} - {currency.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="institution_name">Institution</Label>
          <Input id="institution_name" name="institution_name" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="last_four">Last four</Label>
          <Input
            id="last_four"
            name="last_four"
            inputMode="numeric"
            maxLength={4}
            pattern="[0-9]{1,4}"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" />
      </div>

      <Label className="items-start gap-3 rounded-lg border p-3">
        <input
          type="checkbox"
          name="include_in_net_worth"
          defaultChecked
          className="mt-0.5 size-4"
        />
        <span className="space-y-1">
          <span className="block">Include in net worth</span>
          <span className="block text-sm font-normal text-muted-foreground">
            Counts this account in household totals.
          </span>
        </span>
      </Label>

      <div className="flex flex-wrap gap-2">
        <SubmitButton type="submit" pendingText="Creating account">
          Create account
        </SubmitButton>
        <Link
          href={accountsPath({ showArchived })}
          className={buttonVariants({ variant: 'outline' })}
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}

function EditAccountForm({
  row,
  showArchived,
}: {
  row: AccountRow
  showArchived: boolean
}) {
  const account = row.metadata

  return (
    <form action={updateAccountAction} className="space-y-4">
      <input type="hidden" name="account_id" value={account.id} />
      <input
        type="hidden"
        name="show_archived"
        value={showArchived ? 'true' : 'false'}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`name_${account.id}`}>Name</Label>
          <Input
            id={`name_${account.id}`}
            name="name"
            defaultValue={account.name}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`institution_${account.id}`}>Institution</Label>
          <Input
            id={`institution_${account.id}`}
            name="institution_name"
            defaultValue={account.institution_name ?? ''}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`account_type_${account.id}`}>Type</Label>
          <select
            id={`account_type_${account.id}`}
            name="account_type"
            defaultValue={account.account_type}
            className={selectClassName}
          >
            {accountTypes.map((accountType) => (
              <option key={accountType.value} value={accountType.value}>
                {accountType.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`account_class_${account.id}`}>Class</Label>
          <select
            id={`account_class_${account.id}`}
            name="account_class"
            defaultValue={account.account_class}
            className={selectClassName}
          >
            {accountClasses.map((accountClass) => (
              <option key={accountClass.value} value={accountClass.value}>
                {accountClass.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`last_four_${account.id}`}>Last four</Label>
          <Input
            id={`last_four_${account.id}`}
            name="last_four"
            inputMode="numeric"
            maxLength={4}
            pattern="[0-9]{1,4}"
            defaultValue={account.last_four ?? ''}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`sort_order_${account.id}`}>Sort order</Label>
          <Input
            id={`sort_order_${account.id}`}
            name="sort_order"
            type="number"
            step="1"
            defaultValue={account.sort_order ?? ''}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`color_${account.id}`}>Color</Label>
          <Input
            id={`color_${account.id}`}
            name="color"
            placeholder="#3b82f6"
            defaultValue={account.color ?? ''}
          />
          <p className="text-xs text-muted-foreground">
            Any CSS color — hex, rgb, oklch, etc.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`icon_${account.id}`}>Icon</Label>
          <Input
            id={`icon_${account.id}`}
            name="icon"
            placeholder="e.g. 💰 💳 🏦 📈"
            defaultValue={account.icon ?? ''}
          />
          <p className="text-xs text-muted-foreground">
            Paste any emoji — shown next to the account name.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`account_notes_${account.id}`}>Notes</Label>
        <Textarea
          id={`account_notes_${account.id}`}
          name="notes"
          defaultValue={account.notes ?? ''}
        />
      </div>

      <Label className="items-start gap-3 rounded-lg border p-3">
        <input
          type="checkbox"
          name="include_in_net_worth"
          defaultChecked={account.include_in_net_worth}
          className="mt-0.5 size-4"
        />
        <span className="space-y-1">
          <span className="block">Include in net worth</span>
          <span className="block text-sm font-normal text-muted-foreground">
            Currency and balances stay controlled by the ledger.
          </span>
        </span>
      </Label>

      <div className="flex flex-wrap gap-2">
        <SubmitButton type="submit" pendingText="Saving account">
          Save account
        </SubmitButton>
        <Link
          href={accountsPath({ showArchived })}
          className={buttonVariants({ variant: 'outline' })}
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}


export default async function AccountsPage({ searchParams }: AccountsPageProps) {
  const params = await searchParams
  const errorMessage = typeof params.error === 'string' ? params.error : null
  const infoMessage = typeof params.info === 'string' ? params.info : null
  const created = params.created === '1'
  const updated = params.updated === '1'
  const archived = params.archived === '1'
  const unarchived = params.unarchived === '1'
  const openingBalanceSet = params.openingBalanceSet === '1'
  const showArchived = params.showArchived === 'true'
  const isCreating = params.mode === 'create'
  const editAccountId = typeof params.edit === 'string' ? params.edit : null
  const openingBalanceAccountId =
    typeof params.openingBalance === 'string' ? params.openingBalance : null
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.default_household_id) {
    redirect('/onboarding')
  }

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('id, name, base_currency')
    .eq('id', profile.default_household_id)
    .single()

  if (householdError || !household) {
    redirect('/onboarding')
  }

  const { data: currencies, error: currenciesError } = await supabase
    .from('currencies')
    .select('code, name')
    .eq('is_active', true)
    .order('code', { ascending: true })

  if (currenciesError) {
    throw new Error('Could not load active currencies.')
  }

  const { data: accountBalances, error: accountBalancesError } =
    await supabase.rpc('get_account_balances', {
      p_household_id: household.id,
    })

  const { data: accountMetadata, error: accountMetadataError } = await supabase
    .from('accounts')
    .select(
      'id, name, account_type, account_class, currency_code, institution_name, last_four, color, icon, opening_balance_date, is_archived, include_in_net_worth, sort_order, notes'
    )
    .eq('household_id', household.id)
    .is('deleted_at', null)
    .order('is_archived', { ascending: true })
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  const { data: openingBalanceEntries, error: openingBalanceEntriesError } =
    await supabase
      .from('transaction_entries')
      .select(
        'account_id, transactions!inner(transaction_type, deleted_at, status)'
      )
      .eq('household_id', household.id)
      .eq('transactions.transaction_type', 'opening_balance')
      .is('transactions.deleted_at', null)
      .in('transactions.status', ['pending', 'posted'])

  const allAccounts = (accountMetadata ?? []) as AccountMetadata[]
  const accountIds = allAccounts.map((account) => account.id)
  let accountEntries: TransactionEntryBalance[] = []
  let accountEntriesError = false

  if (accountIds.length) {
    const { data: entries, error: entriesError } = await supabase
      .from('transaction_entries')
      .select(
        'account_id, amount_account_currency, amount_base_currency, transactions!inner(status, deleted_at)'
      )
      .eq('household_id', household.id)
      .in('account_id', accountIds)
      .is('transactions.deleted_at', null)
      .in('transactions.status', ['posted', 'pending'])

    accountEntries = (entries ?? []) as unknown as TransactionEntryBalance[]
    accountEntriesError = Boolean(entriesError)
  }

  const accountBalancesById = new Map(
    ((accountBalances ?? []) as AccountBalance[]).map((balance) => [
      balance.account_id,
      balance,
    ])
  )
  const accountEntriesById = new Map<string, TransactionEntryBalance[]>()

  for (const entry of accountEntries) {
    const entries = accountEntriesById.get(entry.account_id)

    if (entries) {
      entries.push(entry)
    } else {
      accountEntriesById.set(entry.account_id, [entry])
    }
  }

  const accountsWithOpeningBalance = new Set(
    ((openingBalanceEntries ?? []) as OpeningBalanceEntry[]).map(
      (entry) => entry.account_id
    )
  )
  const accountRows: AccountRow[] = allAccounts.map((metadata) => ({
    metadata,
    balance:
      accountBalancesById.get(metadata.id) ??
      deriveBalance(metadata, accountEntriesById.get(metadata.id) ?? []),
    hasOpeningBalance: accountsWithOpeningBalance.has(metadata.id),
  }))
  const activeRows = accountRows.filter((row) => !row.metadata.is_archived)
  const archivedRows = accountRows.filter((row) => row.metadata.is_archived)
  const displayRows = showArchived ? archivedRows : activeRows
  const selectedEditRow = displayRows.find(
    (row) => row.metadata.id === editAccountId
  )
  const selectedOpeningBalanceRow = displayRows.find(
    (row) =>
      row.metadata.id === openingBalanceAccountId &&
      !row.metadata.is_archived &&
      !row.hasOpeningBalance
  )
  const activeCurrencies = (currencies ?? []) as Currency[]
  const defaultCurrency =
    activeCurrencies.find((currency) => currency.code === household.base_currency)
      ?.code ??
    activeCurrencies[0]?.code ??
    'CAD'
  const includedAccountCount = activeRows.filter(
    (row) => row.metadata.include_in_net_worth
  ).length
  const totalAssets = sumIncludedSignedBase(activeRows, 'asset')
  const signedLiabilities = sumIncludedSignedBase(activeRows, 'liability')
  const totalLiabilities = sumIncludedDisplayedLiabilities(activeRows)
  const netWorthImpact = totalAssets + signedLiabilities
  const hasLoadError =
    accountBalancesError ||
    accountMetadataError ||
    openingBalanceEntriesError ||
    accountEntriesError
  const summaryCards = [
    {
      label: 'Total assets',
      value: formatCurrency(totalAssets, household.base_currency),
      description: 'Included active asset accounts',
    },
    {
      label: 'Total liabilities',
      value: formatCurrency(totalLiabilities, household.base_currency),
      description: 'Included active liability accounts',
    },
    {
      label: 'Net worth impact',
      value: formatCurrency(netWorthImpact, household.base_currency),
      description: `${includedAccountCount} included accounts`,
    },
    {
      label: showArchived ? 'Archived accounts' : 'Active accounts',
      value: String(showArchived ? archivedRows.length : activeRows.length),
      description: showArchived
        ? `${activeRows.length} active accounts`
        : `${archivedRows.length} archived accounts`,
    },
  ]

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{household.name}</p>
          <h1 className="text-2xl font-semibold tracking-normal">Accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage household accounts and balances.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={accountsPath({ showArchived, mode: 'create' })}
            className={buttonVariants()}
          >
            Create account
          </Link>
          <Link
            href={accountsPath({ showArchived: !showArchived })}
            className={buttonVariants({ variant: 'outline' })}
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Link>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      {created ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Account created.
        </div>
      ) : null}

      {updated ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Account updated.
        </div>
      ) : null}

      {archived ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Account archived.
        </div>
      ) : null}

      {unarchived ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Account restored.
        </div>
      ) : null}

      {infoMessage ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          {infoMessage}
        </div>
      ) : null}

      {openingBalanceSet ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Opening balance set.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            description={card.description}
          />
        ))}
      </div>

      {isCreating ? (
        <FormDialog
          title="Create account"
          description="Add a basic household account."
          cancelHref={accountsPath({ showArchived })}
          wide
        >
          <CreateAccountForm
            activeCurrencies={activeCurrencies}
            defaultCurrency={defaultCurrency}
            showArchived={showArchived}
          />
        </FormDialog>
      ) : null}

      {selectedEditRow ? (
        <FormDialog
          title="Edit account"
          description={`Update metadata for ${selectedEditRow.metadata.name}. Balances stay controlled by ledger entries.`}
          cancelHref={accountsPath({ showArchived })}
          wide
        >
          <EditAccountForm row={selectedEditRow} showArchived={showArchived} />
        </FormDialog>
      ) : null}

      {selectedOpeningBalanceRow ? (
        <FormDialog
          title="Opening balance"
          description={`Set the starting ledger balance for ${selectedOpeningBalanceRow.metadata.name}.`}
          cancelHref={accountsPath({ showArchived })}
        >
          <OpeningBalanceForm
            accountId={selectedOpeningBalanceRow.metadata.id}
            accountClass={selectedOpeningBalanceRow.metadata.account_class}
            accountCurrency={selectedOpeningBalanceRow.metadata.currency_code}
            defaultDate={selectedOpeningBalanceRow.metadata.opening_balance_date ?? todayIsoDate()}
            showArchived={showArchived}
            baseCurrency={household.base_currency}
          />
        </FormDialog>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>
                {showArchived ? 'Archived accounts' : 'Active accounts'}
              </CardTitle>
              <CardDescription>
                {showArchived
                  ? 'Archived accounts remain available for history.'
                  : 'Accounts connected to your active household.'}
              </CardDescription>
            </div>

          </div>
        </CardHeader>
        <CardContent>
          {hasLoadError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              Could not load account balances.
            </p>
          ) : displayRows.length ? (
            <div className="divide-y rounded-lg border">
              {displayRows.map((row) => {
                const { balance, metadata } = row

                return (
                  <div
                    key={metadata.id}
                    className={`space-y-3 p-4 ${
                      metadata.is_archived
                        ? 'bg-muted/30 text-muted-foreground'
                        : ''
                    }`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {metadata.color ? (
                            <span
                              className="size-3 shrink-0 rounded-full border"
                              style={{ backgroundColor: metadata.color }}
                              aria-hidden="true"
                            />
                          ) : null}
                          {metadata.icon ? (
                            <span className="text-base leading-none" aria-hidden="true">
                              {metadata.icon}
                            </span>
                          ) : null}
                          <h2 className="font-medium">{metadata.name}</h2>
                          <Badge variant="secondary">
                            {formatLabel(metadata.account_type)}
                          </Badge>
                          <Badge variant="outline">
                            {formatLabel(metadata.account_class)}
                          </Badge>
                          <Badge variant="outline">
                            {metadata.currency_code}
                          </Badge>
                          {metadata.is_archived ? (
                            <Badge variant="outline">Archived</Badge>
                          ) : null}
                          {row.hasOpeningBalance ? (
                            <Badge variant="outline">Opening balance set</Badge>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                          {metadata.institution_name ? (
                            <span>{metadata.institution_name}</span>
                          ) : null}
                          {metadata.last_four ? (
                            <span>**** {metadata.last_four}</span>
                          ) : null}
                          <span>
                            {metadata.include_in_net_worth
                              ? 'Included in net worth'
                              : 'Excluded from net worth'}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1 md:text-right">
                        <p className="text-lg font-semibold">
                          {formatCurrency(
                            metadata.account_class === 'liability'
                              ? liabilityDisplay(balance.posted_balance_account_currency)
                              : balance.posted_balance_account_currency,
                            metadata.currency_code
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {metadata.account_class === 'liability'
                            ? 'balance owed'
                            : 'posted balance'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(
                            metadata.account_class === 'liability'
                              ? liabilityDisplay(balance.posted_balance_account_currency)
                              : balance.posted_balance_account_currency,
                            metadata.currency_code
                          )}
                        </span>
                        {' '}
                        {metadata.account_class === 'liability' ? 'posted (owed)' : 'posted'}
                      </span>
                      <span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(
                            metadata.account_class === 'liability'
                              ? liabilityDisplay(balance.pending_balance_account_currency)
                              : balance.pending_balance_account_currency,
                            metadata.currency_code
                          )}
                        </span>
                        {' pending'}
                      </span>
                      <span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(
                            metadata.account_class === 'liability'
                              ? liabilityDisplay(balance.projected_balance_account_currency)
                              : balance.projected_balance_account_currency,
                            metadata.currency_code
                          )}
                        </span>
                        {' projected'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={accountsPath({
                          showArchived,
                          edit: metadata.id,
                        })}
                        className={buttonVariants({
                          variant: 'outline',
                          size: 'sm',
                        })}
                      >
                        Edit
                      </Link>

                      {!metadata.is_archived ? (
                        <GlobalAddTransactionButton
                          className={buttonVariants({
                            variant: 'outline',
                            size: 'sm',
                          })}
                          defaultAccountId={metadata.id}
                        >
                          Add transaction
                        </GlobalAddTransactionButton>
                      ) : null}

                      {!metadata.is_archived && !row.hasOpeningBalance ? (
                        <Link
                          href={accountsPath({
                            showArchived,
                            openingBalance: metadata.id,
                          })}
                          className={buttonVariants({
                            variant: 'outline',
                            size: 'sm',
                          })}
                        >
                          Set opening balance
                        </Link>
                      ) : null}

                      <form action={archiveAccountAction}>
                        <input
                          type="hidden"
                          name="account_id"
                          value={metadata.id}
                        />
                        <input
                          type="hidden"
                          name="is_archived"
                          value={metadata.is_archived ? 'false' : 'true'}
                        />
                        <input
                          type="hidden"
                          name="show_archived"
                          value={showArchived ? 'true' : 'false'}
                        />
                        <SubmitButton
                          type="submit"
                          size="sm"
                          variant={
                            metadata.is_archived ? 'outline' : 'secondary'
                          }
                          pendingText={
                            metadata.is_archived ? 'Restoring' : 'Archiving'
                          }
                        >
                          {metadata.is_archived
                            ? 'Restore account'
                            : 'Archive account'}
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState
              title={
                showArchived
                  ? 'No archived accounts yet'
                  : 'No active accounts yet'
              }
              description={
                showArchived
                  ? 'Archived accounts will appear here after you archive one.'
                  : 'Create your first account to start tracking balances.'
              }
              actionHref={
                showArchived
                  ? undefined
                  : accountsPath({ showArchived, mode: 'create' })
              }
              actionLabel={showArchived ? undefined : 'Create account'}
            />
          )}
        </CardContent>
      </Card>
    </main>
  )
}
