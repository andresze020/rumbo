import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Scale, Sparkles, TrendingUp, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { MetricCard } from '@/components/metric-card'
import { MonthNav } from '@/components/month-nav'
import { PageHeader } from '@/components/page-header'
import { InfoTooltip } from '@/components/info-tooltip'
import { SectionHeading } from '@/components/section-heading'
import { Callout } from '@/components/callout'
import { BalanceAmount } from '@/components/balance-amount'
import { AccountAvatar } from '@/components/account-avatar'
import { AccountGroup } from '@/components/account-group'
import { AccountsViewToggle } from '@/components/accounts-view-toggle'
import { getAccountsView, type AccountsView } from '@/lib/accounts-view/server'
import { groupAccountsByType } from '@/lib/accounts-view/group'
import { createClient } from '@/lib/supabase/server'
import { getLocale } from '@/lib/i18n/server'
import { translate } from '@/lib/i18n/translate'

const ACCENT = {
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
  primary: 'bg-primary/10 text-primary',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
}

type NetWorthPageProps = {
  searchParams: Promise<{
    month?: string
  }>
}

type AccountBalance = {
  account_id: string
  account_name: string
  account_type: string
  account_class: string
  currency_code: string
  include_in_net_worth: boolean
  is_archived: boolean
  posted_balance_account_currency: number | string
  pending_balance_account_currency: number | string
  projected_balance_account_currency: number | string
  posted_balance_base_currency: number | string
  pending_balance_base_currency: number | string
  projected_balance_base_currency: number | string
}

type NetWorthSummary = {
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  projectedAssets: number
  projectedLiabilities: number
  projectedNetWorth: number
}

type EvolutionPoint = NetWorthSummary & {
  month: string
  monthEndDate: string
  hasError: boolean
}

function currentMonthParam() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function parseMonth(month: string | undefined) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return currentMonthParam()
  const parsedDate = new Date(`${month}-01T00:00:00.000Z`)
  if (Number.isNaN(parsedDate.getTime())) return currentMonthParam()
  return month
}

function getMonthEndDate(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10)
}

function getPreviousMonths(selectedMonth: string, count: number) {
  const [year, monthNumber] = selectedMonth.split('-').map(Number)
  const months: string[] = []
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const monthDate = new Date(Date.UTC(year, monthNumber - 1 - offset, 1))
    const monthYear = monthDate.getUTCFullYear()
    const month = String(monthDate.getUTCMonth() + 1).padStart(2, '0')
    months.push(`${monthYear}-${month}`)
  }
  return months
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric' }).format(
    new Date(year, monthNumber - 1, 1)
  )
}

function formatCurrency(value: number | string, currencyCode: string) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currencyCode,
  }).format(Number(value))
}

function formatValue(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

function getDisplayedLiabilityBalance(value: number | string) {
  return Math.max(0, -Number(value))
}

function summarizeBalances(balances: AccountBalance[]): NetWorthSummary {
  const included = balances.filter((a) => a.include_in_net_worth)
  const totalAssets = included
    .filter((a) => a.account_class === 'asset')
    .reduce((sum, a) => sum + Number(a.posted_balance_base_currency), 0)
  const totalLiabilities = included
    .filter((a) => a.account_class === 'liability')
    .reduce((sum, a) => sum + getDisplayedLiabilityBalance(a.posted_balance_base_currency), 0)
  const signedLiabilities = included
    .filter((a) => a.account_class === 'liability')
    .reduce((sum, a) => sum + Number(a.posted_balance_base_currency), 0)
  const projectedAssets = included
    .filter((a) => a.account_class === 'asset')
    .reduce((sum, a) => sum + Number(a.projected_balance_base_currency), 0)
  const projectedLiabilities = included
    .filter((a) => a.account_class === 'liability')
    .reduce((sum, a) => sum + getDisplayedLiabilityBalance(a.projected_balance_base_currency), 0)
  const signedProjectedLiabilities = included
    .filter((a) => a.account_class === 'liability')
    .reduce((sum, a) => sum + Number(a.projected_balance_base_currency), 0)

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets + signedLiabilities,
    projectedAssets,
    projectedLiabilities,
    projectedNetWorth: projectedAssets + signedProjectedLiabilities,
  }
}

function AccountRow({
  account,
  baseCurrency,
  showInclusionBadge,
  showTypeBadge,
}: {
  account: AccountBalance
  baseCurrency: string
  showInclusionBadge?: boolean
  showTypeBadge: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <AccountAvatar
          accountType={account.account_type}
          className={account.is_archived ? 'opacity-60 grayscale' : undefined}
        />
        <div className="min-w-0">
          <p className={`truncate text-sm font-medium ${account.is_archived ? 'text-muted-foreground' : ''}`}>
            {account.account_name}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {showTypeBadge ? (
              <Badge variant="secondary" className="text-[11px]">
                {formatValue(account.account_type)}
              </Badge>
            ) : null}
            <Badge variant="outline" className="text-[11px]">
              {account.currency_code}
            </Badge>
            {showInclusionBadge ? (
              <Badge variant="outline" className="text-[11px]">
                {account.include_in_net_worth ? 'Included' : 'Excluded'}
              </Badge>
            ) : null}
            {account.is_archived ? (
              <Badge variant="outline" className="text-[11px] text-muted-foreground">
                Archived
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <BalanceAmount
          label={formatCurrency(
            Number(account.posted_balance_account_currency),
            account.currency_code
          )}
          amount={Number(account.posted_balance_account_currency)}
          className="text-sm"
        />
        {account.currency_code !== baseCurrency ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatCurrency(
              Number(account.posted_balance_base_currency),
              baseCurrency
            )}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function AccountList({
  accounts,
  baseCurrency,
  emptyMessage,
  showInclusionBadge,
  view,
}: {
  accounts: AccountBalance[]
  baseCurrency: string
  emptyMessage: string
  showInclusionBadge?: boolean
  view: AccountsView
}) {
  if (!accounts.length) {
    return (
      <Callout variant="info" className="border-dashed text-muted-foreground">
        {emptyMessage}
      </Callout>
    )
  }

  if (view === 'group') {
    const groups = groupAccountsByType(accounts, {
      getType: (account) => account.account_type,
      getBaseAmount: (account) => Number(account.posted_balance_base_currency),
    })

    return (
      <div className="divide-y rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
        {groups.map((group) => (
          <AccountGroup
            key={group.type}
            label={group.label}
            count={group.count}
            subtotalLabel={formatCurrency(group.subtotalBase, baseCurrency)}
            subtotalAmount={group.subtotalBase}
          >
            {group.rows.map((account) => (
              <AccountRow
                key={account.account_id}
                account={account}
                baseCurrency={baseCurrency}
                showInclusionBadge={showInclusionBadge}
                showTypeBadge={false}
              />
            ))}
          </AccountGroup>
        ))}
      </div>
    )
  }

  return (
    <div className="divide-y rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
      {accounts.map((account) => (
        <AccountRow
          key={account.account_id}
          account={account}
          baseCurrency={baseCurrency}
          showInclusionBadge={showInclusionBadge}
          showTypeBadge
        />
      ))}
    </div>
  )
}

export default async function NetWorthPage({ searchParams }: NetWorthPageProps) {
  const params = await searchParams
  const locale = await getLocale()
  const accountsView = await getAccountsView()
  const selectedMonth = parseMonth(params.month)
  const selectedMonthEndDate = getMonthEndDate(selectedMonth)
  const evolutionMonths = getPreviousMonths(selectedMonth, 6)
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.default_household_id) redirect('/onboarding')

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('id, name, base_currency')
    .eq('id', profile.default_household_id)
    .single()
  if (householdError || !household) redirect('/onboarding')

  const { data: selectedBalances, error: selectedBalancesError } = await supabase.rpc(
    'get_account_balances',
    { p_household_id: household.id, p_as_of_date: selectedMonthEndDate }
  )

  const evolutionResults = await Promise.all(
    evolutionMonths.map(async (month) => {
      const { data, error } = await supabase.rpc('get_account_balances', {
        p_household_id: household.id,
        p_as_of_date: getMonthEndDate(month),
      })
      const summary = summarizeBalances((data ?? []) as AccountBalance[])
      return { month, monthEndDate: getMonthEndDate(month), hasError: Boolean(error), ...summary }
    })
  )

  const balances = (selectedBalances ?? []) as AccountBalance[]
  const summary = summarizeBalances(balances)
  const includedAssets = balances.filter(
    (a) => a.include_in_net_worth && a.account_class === 'asset'
  )
  const includedLiabilities = balances.filter(
    (a) => a.include_in_net_worth && a.account_class === 'liability'
  )
  const excludedAccounts = balances.filter((a) => !a.include_in_net_worth)
  const evolution = evolutionResults as EvolutionPoint[]
  const maxEvolutionMagnitude = Math.max(
    ...evolution.map((p) => Math.abs(p.netWorth)),
    1
  )
  const hasEvolutionError = evolution.some((p) => p.hasError)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <PageHeader
        eyebrow={household.name}
        title={
          <span className="flex items-center gap-1.5">
            Net Worth
            <InfoTooltip term="netWorth" label="Net worth" />
          </span>
        }
        description={formatMonthLabel(selectedMonth)}
        actions={
          <>
            <Link
              href="/dashboard/debts"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Debts
            </Link>
            <MonthNav
              month={selectedMonth}
              basePath="/dashboard/net-worth"
              previousLabel={translate(locale, 'common.previousMonth')}
              nextLabel={translate(locale, 'common.nextMonth')}
            />
            <AccountsViewToggle view={accountsView} />
          </>
        }
      />

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {selectedBalancesError ? (
        <Callout variant="error">Could not load net worth balances.</Callout>
      ) : null}
      {hasEvolutionError ? (
        <Callout variant="error">Could not load every monthly evolution point.</Callout>
      ) : null}

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total assets"
          value={formatCurrency(summary.totalAssets, household.base_currency)}
          description="Posted included asset balances"
          icon={<Wallet />}
          accent={ACCENT.emerald}
        />
        <MetricCard
          label="Total liabilities"
          value={formatCurrency(summary.totalLiabilities, household.base_currency)}
          description="Posted included liability balances"
          icon={<Scale />}
          accent={ACCENT.rose}
          tooltip={<InfoTooltip term="liabilities" label="Total liabilities" />}
        />
        <MetricCard
          label="Net worth"
          value={formatCurrency(summary.netWorth, household.base_currency)}
          description="Assets minus liabilities"
          icon={<TrendingUp />}
          accent={ACCENT.primary}
          valueClassName={summary.netWorth < 0 ? 'text-red-600 dark:text-red-400' : undefined}
          tooltip={<InfoTooltip term="netWorth" label="Net worth" />}
        />
        <MetricCard
          label="Projected net worth"
          value={formatCurrency(summary.projectedNetWorth, household.base_currency)}
          description="Posted plus pending balances"
          icon={<Sparkles />}
          accent={ACCENT.violet}
          valueClassName={summary.projectedNetWorth < 0 ? 'text-red-600 dark:text-red-400' : undefined}
          tooltip={<InfoTooltip term="projectedNetWorth" label="Projected net worth" />}
        />
      </div>

      {/* ── Monthly evolution ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading
          title="Monthly evolution"
          description="Net worth over the last six months."
        />
        <div className="divide-y rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
          {evolution.map((point) => {
            const barWidth = Math.round(
              (Math.abs(point.netWorth) / maxEvolutionMagnitude) * 100
            )
            return (
              <div
                key={point.month}
                className="grid gap-3 px-4 py-3 sm:grid-cols-[10rem_1fr_auto]"
              >
                <div>
                  <p className="text-sm font-medium">{formatMonthLabel(point.month)}</p>
                  <p className="text-xs text-muted-foreground">{point.monthEndDate}</p>
                </div>
                <div className="flex min-w-0 items-center">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-0.5 sm:text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {formatCurrency(point.netWorth, household.base_currency)}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatCurrency(point.totalAssets, household.base_currency)} assets /{' '}
                    {formatCurrency(point.totalLiabilities, household.base_currency)} liabilities
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Assets ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading title="Assets" description="Included asset accounts." />
        <AccountList
          accounts={includedAssets}
          baseCurrency={household.base_currency}
          emptyMessage="No included asset accounts."
          view={accountsView}
        />
      </section>

      {/* ── Liabilities ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading title="Liabilities" description="Included liability accounts." />
        <AccountList
          accounts={includedLiabilities}
          baseCurrency={household.base_currency}
          emptyMessage="No included liability accounts."
          view={accountsView}
        />
      </section>

      {/* ── Excluded ───────────────────────────────────────────────────── */}
      {excludedAccounts.length > 0 ? (
        <section className="space-y-3">
          <SectionHeading
            title="Excluded from net worth"
            description="Accounts not counted in household totals."
          />
          <AccountList
            accounts={excludedAccounts}
            baseCurrency={household.base_currency}
            emptyMessage="No accounts are excluded from net worth."
            showInclusionBadge
            view={accountsView}
          />
        </section>
      ) : null}
    </main>
  )
}
