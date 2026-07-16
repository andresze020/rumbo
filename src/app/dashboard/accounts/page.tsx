import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import {
  archiveAccountAction,
  createAccountAction,
  updateAccountAction,
} from './actions'
import { OpeningBalanceForm } from './opening-balance-form'
import {
  SortableAccountsList,
  type AccountRowVM,
} from './sortable-accounts-list'
import { FormDialog } from '@/components/form-dialog'
import { AccountsViewToggle } from '@/components/accounts-view-toggle'
import { getAccountsView } from '@/lib/accounts-view/server'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatLabel } from '@/lib/format'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { BalanceAmount } from '@/components/balance-amount'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { SectionHeading } from '@/components/section-heading'
import { Callout } from '@/components/callout'
import { SubmitButton } from '@/components/submit-button'
import { getLocale } from '@/lib/i18n/server'
import { translate } from '@/lib/i18n/translate'
import type { Locale } from '@/lib/i18n/dictionaries'
import { nativeSelectCls, formActionsCls, formBtnCls } from '@/lib/form-styles'
import { cn } from '@/lib/utils'

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

function getAccountTypes(locale: Locale) {
  return [
    { value: 'cash', label: translate(locale, 'accounts.typeCash') },
    { value: 'checking', label: translate(locale, 'accounts.typeChecking') },
    { value: 'savings', label: translate(locale, 'accounts.typeSavings') },
    { value: 'credit_card', label: translate(locale, 'accounts.typeCreditCard') },
    { value: 'debt', label: translate(locale, 'accounts.typeDebt') },
    { value: 'investment', label: translate(locale, 'accounts.typeInvestment') },
    { value: 'other', label: translate(locale, 'accounts.typeOther') },
  ]
}

function getAccountClasses(locale: Locale) {
  return [
    { value: 'asset', label: translate(locale, 'accounts.classAsset') },
    { value: 'liability', label: translate(locale, 'accounts.classLiability') },
  ]
}

const selectClassName = nativeSelectCls

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

function CreateAccountForm({
  activeCurrencies,
  defaultCurrency,
  showArchived,
  locale,
}: {
  activeCurrencies: Currency[]
  defaultCurrency: string
  showArchived: boolean
  locale: Locale
}) {
  const accountTypes = getAccountTypes(locale)
  return (
    <form action={createAccountAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">{translate(locale, 'accounts.name')}</Label>
          <Input id="name" name="name" required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="account_type">{translate(locale, 'accounts.type')}</Label>
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
          <Label htmlFor="currency_code">{translate(locale, 'accounts.currency')}</Label>
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
          <Label htmlFor="institution_name">{translate(locale, 'accounts.institution')}</Label>
          <Input id="institution_name" name="institution_name" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="last_four">{translate(locale, 'accounts.lastFour')}</Label>
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
        <Label htmlFor="notes">{translate(locale, 'accounts.notes')}</Label>
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
          <span className="block">{translate(locale, 'accounts.includeInNetWorth')}</span>
          <span className="block text-sm font-normal text-muted-foreground">
            {translate(locale, 'accounts.includeInNetWorthDesc')}
          </span>
        </span>
      </Label>

      <div className={formActionsCls}>
        <SubmitButton type="submit" className={formBtnCls} pendingText={translate(locale, 'accounts.creatingAccount')}>
          {translate(locale, 'accounts.createAccount')}
        </SubmitButton>
        <Link
          href={accountsPath({ showArchived })}
          className={cn(buttonVariants({ variant: 'outline' }), formBtnCls)}
        >
          {translate(locale, 'common.cancel')}
        </Link>
      </div>
    </form>
  )
}

function EditAccountForm({
  row,
  showArchived,
  hasOpeningBalance,
  openingBalanceHref,
  locale,
}: {
  row: AccountRow
  showArchived: boolean
  hasOpeningBalance: boolean
  openingBalanceHref: string
  locale: Locale
}) {
  const account = row.metadata
  const accountTypes = getAccountTypes(locale)
  const accountClasses = getAccountClasses(locale)

  return (
    <>
    <form action={updateAccountAction} className="space-y-4">
      <input type="hidden" name="account_id" value={account.id} />
      <input
        type="hidden"
        name="show_archived"
        value={showArchived ? 'true' : 'false'}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`name_${account.id}`}>{translate(locale, 'accounts.name')}</Label>
          <Input
            id={`name_${account.id}`}
            name="name"
            defaultValue={account.name}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`institution_${account.id}`}>{translate(locale, 'accounts.institution')}</Label>
          <Input
            id={`institution_${account.id}`}
            name="institution_name"
            defaultValue={account.institution_name ?? ''}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`account_type_${account.id}`}>{translate(locale, 'accounts.type')}</Label>
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
          <Label htmlFor={`account_class_${account.id}`}>{translate(locale, 'accounts.class')}</Label>
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
          <Label htmlFor={`last_four_${account.id}`}>{translate(locale, 'accounts.lastFour')}</Label>
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
          <Label htmlFor={`sort_order_${account.id}`}>{translate(locale, 'accounts.sortOrder')}</Label>
          <Input
            id={`sort_order_${account.id}`}
            name="sort_order"
            type="number"
            step="1"
            defaultValue={account.sort_order ?? ''}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`color_${account.id}`}>{translate(locale, 'accounts.color')}</Label>
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
          <Label htmlFor={`icon_${account.id}`}>{translate(locale, 'accounts.icon')}</Label>
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
        <Label htmlFor={`account_notes_${account.id}`}>{translate(locale, 'accounts.notes')}</Label>
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
          <span className="block">{translate(locale, 'accounts.includeInNetWorth')}</span>
          <span className="block text-sm font-normal text-muted-foreground">
            {translate(locale, 'accounts.includeInNetWorthEditDesc')}
          </span>
        </span>
      </Label>

      <div className={formActionsCls}>
        <SubmitButton type="submit" className={formBtnCls} pendingText={translate(locale, 'accounts.savingAccount')}>
          {translate(locale, 'accounts.saveAccount')}
        </SubmitButton>
        <Link
          href={accountsPath({ showArchived })}
          className={cn(buttonVariants({ variant: 'outline' }), formBtnCls)}
        >
          {translate(locale, 'common.cancel')}
        </Link>
      </div>
    </form>
    <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
      {!account.is_archived && !hasOpeningBalance ? (
        <Link href={openingBalanceHref} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          {translate(locale, 'accounts.setOpeningBalance')}
        </Link>
      ) : null}
      <form action={archiveAccountAction}>
        <input type="hidden" name="account_id" value={account.id} />
        <input type="hidden" name="is_archived" value={account.is_archived ? 'false' : 'true'} />
        <input type="hidden" name="show_archived" value={showArchived ? 'true' : 'false'} />
        <SubmitButton
          type="submit"
          size="sm"
          variant={account.is_archived ? 'outline' : 'secondary'}
          pendingText={account.is_archived ? translate(locale, 'accounts.restoringAccount') : translate(locale, 'accounts.archivingAccount')}
        >
          {account.is_archived ? translate(locale, 'accounts.restoreAccount') : translate(locale, 'accounts.archiveAccount')}
        </SubmitButton>
      </form>
    </div>
    </>
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
  const view = await getAccountsView()
  const locale = await getLocale()
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

  const activeAccountIds = allAccounts.filter((a) => !a.is_archived).map((a) => a.id)
  let prevMonthBalance: number | null = null

  if (activeAccountIds.length) {
    const prevMonthEnd = (() => {
      const d = new Date()
      d.setDate(0)
      return d.toISOString().slice(0, 10)
    })()
    const { data: prevEntries } = await supabase
      .from('transaction_entries')
      .select('amount_base_currency, transactions!inner(status, deleted_at, transaction_date)')
      .eq('household_id', household.id)
      .in('account_id', activeAccountIds)
      .is('transactions.deleted_at', null)
      .eq('transactions.status', 'posted')
      .lte('transactions.transaction_date', prevMonthEnd)

    if (prevEntries && prevEntries.length > 0) {
      prevMonthBalance = (prevEntries as { amount_base_currency: number | string }[])
        .reduce((sum, e) => sum + Number(e.amount_base_currency), 0)
    }
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
  const accountTypeLabelMap = new Map(getAccountTypes(locale).map((at) => [at.value, at.label]))

  const accountRowVMs: AccountRowVM[] = displayRows.map((row) => {
    const { balance, metadata } = row
    const isLiability = metadata.account_class === 'liability'
    const displayAmount = (value: number | string) =>
      isLiability ? liabilityDisplay(value) : Number(value)
    // Summary balance + group subtotals show the raw signed value: liabilities
    // are stored negative when owed, so they render as e.g. −US$10.00 (rose chip).
    const signedPosted = Number(balance.posted_balance_account_currency)
    const baseAmount = Number(balance.posted_balance_base_currency)

    return {
      id: metadata.id,
      name: metadata.name,
      accountType: metadata.account_type,
      accountTypeLabel: accountTypeLabelMap.get(metadata.account_type) ?? formatLabel(metadata.account_type),
      accountClass: isLiability ? 'liability' : 'asset',
      currencyCode: metadata.currency_code,
      isArchived: metadata.is_archived,
      includeInNetWorth: metadata.include_in_net_worth,
      hasOpeningBalance: row.hasOpeningBalance,
      institutionName: metadata.institution_name ?? null,
      lastFour: metadata.last_four ?? null,
      icon: metadata.icon ?? null,
      color: metadata.color ?? null,
      balanceLabel: formatCurrency(signedPosted, metadata.currency_code),
      balanceAmount: signedPosted,
      postedLabel: formatCurrency(
        displayAmount(balance.posted_balance_account_currency),
        metadata.currency_code
      ),
      pendingLabel: formatCurrency(
        displayAmount(balance.pending_balance_account_currency),
        metadata.currency_code
      ),
      projectedLabel: formatCurrency(
        displayAmount(balance.projected_balance_account_currency),
        metadata.currency_code
      ),
      balanceType: isLiability ? 'owed' : 'posted',
      baseAmount,
      editHref: accountsPath({ showArchived, edit: metadata.id }),
      openingBalanceHref: accountsPath({ showArchived, openingBalance: metadata.id }),
      baseCurrencyLabel: metadata.currency_code !== household.base_currency
        ? formatCurrency(baseAmount, household.base_currency)
        : null,
    }
  })
  const totalBalance = accountRowVMs.reduce((sum, row) => sum + row.baseAmount, 0)
  const prevMonthDelta =
    prevMonthBalance !== null && prevMonthBalance !== 0
      ? ((totalBalance - prevMonthBalance) / Math.abs(prevMonthBalance)) * 100
      : null
  const monthLabel = new Date().toLocaleDateString(locale, { month: 'short', year: 'numeric' })
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
  const hasLoadError =
    accountBalancesError ||
    accountMetadataError ||
    openingBalanceEntriesError ||
    accountEntriesError

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        eyebrow={household.name}
        title={translate(locale, 'nav.accounts')}
        description={translate(locale, 'accounts.pageDescription')}
        actions={
          <>
            <Link
              href={accountsPath({ showArchived, mode: 'create' })}
              className={buttonVariants({ size: 'sm' })}
            >
              <Plus aria-hidden="true" />
              {translate(locale, 'accounts.createAccount')}
            </Link>
            <Link
              href={accountsPath({ showArchived: !showArchived })}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {showArchived ? translate(locale, 'accounts.hideArchived') : translate(locale, 'accounts.showArchived')}
            </Link>
          </>
        }
      />

      {errorMessage ? <Callout variant="error">{errorMessage}</Callout> : null}
      {created ? <Callout variant="success">{translate(locale, 'accounts.accountCreated')}</Callout> : null}
      {updated ? <Callout variant="success">{translate(locale, 'accounts.accountUpdated')}</Callout> : null}
      {archived ? <Callout variant="info">{translate(locale, 'accounts.accountArchived')}</Callout> : null}
      {unarchived ? <Callout variant="success">{translate(locale, 'accounts.accountRestored')}</Callout> : null}
      {infoMessage ? <Callout variant="info">{infoMessage}</Callout> : null}
      {openingBalanceSet ? (
        <Callout variant="success">{translate(locale, 'accounts.openingBalanceSet')}</Callout>
      ) : null}

      <div className="rounded-2xl border bg-card p-5 shadow-sm shadow-black/[0.03]">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {showArchived ? translate(locale, 'accounts.archivedBalance') : `${translate(locale, 'accounts.totalBalance')} · ${monthLabel}`}
        </p>
        <div className="mt-1">
          <BalanceAmount
            label={formatCurrency(totalBalance, household.base_currency)}
            amount={totalBalance}
            className="text-3xl tracking-tight sm:text-4xl"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {!showArchived && prevMonthDelta !== null ? (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                prevMonthDelta >= 0
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                  : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
              }`}
            >
              {prevMonthDelta >= 0 ? '↑' : '↓'}{' '}
              {Math.abs(prevMonthDelta).toFixed(1)}% {translate(locale, 'accounts.vsPrevMonth')}
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {activeRows.length} {activeRows.length === 1 ? translate(locale, 'accounts.activeAccount') : translate(locale, 'accounts.activeAccounts')}
          </span>
        </div>
      </div>

      {isCreating ? (
        <FormDialog
          title={translate(locale, 'accounts.createAccount')}
          description={translate(locale, 'accounts.createDialogDesc')}
          cancelHref={accountsPath({ showArchived })}
          wide
        >
          <CreateAccountForm
            activeCurrencies={activeCurrencies}
            defaultCurrency={defaultCurrency}
            showArchived={showArchived}
            locale={locale}
          />
        </FormDialog>
      ) : null}

      {selectedEditRow ? (
        <FormDialog
          title={translate(locale, 'accounts.editAccount')}
          description={translate(locale, 'accounts.editDialogDesc', { name: selectedEditRow.metadata.name })}
          cancelHref={accountsPath({ showArchived })}
          wide
        >
          <EditAccountForm
            row={selectedEditRow}
            showArchived={showArchived}
            hasOpeningBalance={selectedEditRow.hasOpeningBalance}
            openingBalanceHref={accountsPath({ showArchived, openingBalance: selectedEditRow.metadata.id })}
            locale={locale}
          />
        </FormDialog>
      ) : null}

      {selectedOpeningBalanceRow ? (
        <FormDialog
          title={translate(locale, 'accounts.openingBalanceLabel')}
          description={translate(locale, 'accounts.openingBalanceDialogDesc', { name: selectedOpeningBalanceRow.metadata.name })}
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

      <section className="space-y-3">
        <SectionHeading
          title={translate(locale, showArchived ? 'accounts.archivedSection' : 'accounts.activeSection')}
          description={translate(locale, showArchived ? 'accounts.archivedSectionDesc' : 'accounts.sectionDesc')}
          action={<AccountsViewToggle view={view} />}
        />

        {hasLoadError ? (
          <Callout variant="error">{translate(locale, 'accounts.loadError')}</Callout>
        ) : accountRowVMs.length ? (
          <SortableAccountsList
            rows={accountRowVMs}
            view={view}
            showArchived={showArchived}
            baseCurrency={household.base_currency}
          />
        ) : (
          <EmptyState
            title={translate(locale, showArchived ? 'accounts.noArchivedTitle' : 'accounts.noActiveTitle')}
            description={translate(locale, showArchived ? 'accounts.noArchivedDesc' : 'accounts.noActiveDesc')}
            actionHref={
              showArchived
                ? undefined
                : accountsPath({ showArchived, mode: 'create' })
            }
            actionLabel={showArchived ? undefined : translate(locale, 'accounts.createAccount')}
          />
        )}
      </section>
    </main>
  )
}
