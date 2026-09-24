-- ============================================================
-- Rumbo — RUM-010b release invariants (backlog §2, "Invariantes financieros")
--
-- Read-only. Same contract as every file here: each statement returns
-- `check_name` + `passed`, and every `passed` must be true.
--   npm run db:test -- --household=<uuid> --user=<member uuid>   (live project)
--   npm run db:local                                              (fixtures)
--
-- These complement, not repeat, the checks that already exist:
--   transfers carry no reporting allocation      → br_003_006 (BR-006)
--   balances = posted/pending entries only       → br_003_006 (BR-006)
--   FX balance revaluation / fallback            → br_003_006
--   multi-date balances = single-date balances   → rum_006
--   Net worth = assets + signed liabilities      → src/lib/net-worth/valuation.test.ts
--
-- Every check iterates every month from the household's first to last
-- transaction, so a boundary bug in any month fails it, not just "this month".
-- ============================================================

-- Savings = Income − Expenses, every month.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
months as (
  select generate_series(
    date_trunc('month', min(t.transaction_date)),
    date_trunc('month', max(t.transaction_date)),
    interval '1 month'
  )::date as m
  from public.transactions t
  where t.household_id = (select household_id from params)
),
s as (
  select sm.*
  from months
  cross join lateral public.get_monthly_dashboard_summary((select household_id from params), months.m) sm
)
select
  'RUM-010b savings = income − expenses in every month' as check_name,
  coalesce(bool_and(s.monthly_savings = s.monthly_income - s.monthly_expenses), true) as passed
from s;

-- Savings rate = Savings / Income when Income > 0, and null (never 0, never
-- a division error) when there is no income.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
months as (
  select generate_series(
    date_trunc('month', min(t.transaction_date)),
    date_trunc('month', max(t.transaction_date)),
    interval '1 month'
  )::date as m
  from public.transactions t
  where t.household_id = (select household_id from params)
),
s as (
  select sm.*
  from months
  cross join lateral public.get_monthly_dashboard_summary((select household_id from params), months.m) sm
)
select
  'RUM-010b savings rate = savings / income, null when income is zero' as check_name,
  coalesce(bool_and(
    case
      when s.monthly_income > 0 then
        s.savings_rate is not null
        and abs(s.savings_rate - s.monthly_savings / s.monthly_income) < 0.000001
      else s.savings_rate is null
    end
  ), true) as passed
from s;

-- Month boundaries + voids + pending: summed over every month, the dashboard
-- counts each POSTED allocation exactly once, in the month of its own
-- transaction_date — no gap or overlap at a month edge, and nothing voided,
-- pending or soft-deleted. Recomputed straight from the ledger, not from the
-- same function.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
months as (
  select generate_series(
    date_trunc('month', min(t.transaction_date)),
    date_trunc('month', max(t.transaction_date)),
    interval '1 month'
  )::date as m
  from public.transactions t
  where t.household_id = (select household_id from params)
),
dashboard as (
  select sm.month_start, sm.monthly_income, sm.monthly_expenses
  from months
  cross join lateral public.get_monthly_dashboard_summary((select household_id from params), months.m) sm
),
ledger as (
  select
    date_trunc('month', t.transaction_date)::date as month_start,
    coalesce(sum(ta.amount_base_currency) filter (where ta.allocation_type = 'income'), 0) as income,
    coalesce(sum(ta.amount_base_currency) filter (where ta.allocation_type = 'expense'), 0) as expenses
  from public.transactions t
  join public.transaction_allocations ta on ta.transaction_id = t.id
  join public.categories c on c.id = ta.category_id
  left join public.categories p on p.id = c.parent_category_id
  where t.household_id = (select household_id from params)
    and t.status = 'posted'
    and t.deleted_at is null
    and c.deleted_at is null
    and c.exclude_from_reports = false
    and coalesce(p.exclude_from_reports, false) = false
  group by 1
)
select
  'RUM-010b each posted allocation counts once, in its own month (no voided/pending)' as check_name,
  not exists (
    select 1
    from dashboard d
    full join ledger l on l.month_start = d.month_start
    where round(coalesce(d.monthly_income, 0), 4) <> round(coalesce(l.income, 0), 4)
       or round(coalesce(d.monthly_expenses, 0), 4) <> round(coalesce(l.expenses, 0), 4)
  ) as passed;

-- Dashboard ↔ category breakdown: the donut and the "Monthly expenses" card
-- come from two different RPCs and must show the same total.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
months as (
  select generate_series(
    date_trunc('month', min(t.transaction_date)),
    date_trunc('month', max(t.transaction_date)),
    interval '1 month'
  )::date as m
  from public.transactions t
  where t.household_id = (select household_id from params)
)
select
  'RUM-010b category breakdown total = dashboard monthly expenses, every month' as check_name,
  coalesce(bool_and(
    round(sm.monthly_expenses, 4) = round(coalesce((
      select sum(c.amount_base_currency)
      from public.get_monthly_expenses_by_category((select household_id from params), months.m) c
    ), 0), 4)
  ), true) as passed
from months
cross join lateral public.get_monthly_dashboard_summary((select household_id from params), months.m) sm;

-- Transfers never create income. (Their principal carries no reporting
-- allocation at all — BR-006 — so income is the half that must never appear.)
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'RUM-010b transfers never carry an income allocation' as check_name,
  not exists (
    select 1
    from public.transactions t
    join public.transaction_allocations ta on ta.transaction_id = t.id
    where t.household_id = (select household_id from params)
      and t.transaction_type = 'transfer'
      and ta.allocation_type = 'income'
  ) as passed;

-- Transactions list ↔ its own count: the "N transactions" header, the rows,
-- and the pending badge describe the same set, month by month.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
months as (
  select generate_series(
    date_trunc('month', min(t.transaction_date)),
    date_trunc('month', max(t.transaction_date)),
    interval '1 month'
  )::date as m
  from public.transactions t
  where t.household_id = (select household_id from params)
),
per_month as (
  select
    months.m,
    count(r.id) as rows_returned,
    max(r.total_count) as total_count,
    count(r.id) filter (where r.status = 'pending') as pending_rows,
    max(r.total_pending) as total_pending
  from months
  left join lateral public.search_household_transactions(
    (select household_id from params),
    months.m,
    (months.m + interval '1 month - 1 day')::date,
    null, null, null, null, null, null, null, null,
    1000000, 0
  ) r on true
  group by months.m
)
select
  'RUM-010b transactions list rows = total_count = ledger, and pending badge matches, every month' as check_name,
  coalesce(bool_and(
    coalesce(p.total_count, 0) = p.rows_returned
    and coalesce(p.total_pending, 0) = p.pending_rows
    and p.rows_returned = (
      select count(*)
      from public.transactions t
      where t.household_id = (select household_id from params)
        and t.deleted_at is null
        and t.transaction_date >= p.m
        and t.transaction_date < (p.m + interval '1 month')::date
    )
  ), true) as passed
from per_month p;

-- Historical FX is reproducible: every stored base amount is its own amount ×
-- its own stored rate — nothing recomputes history at today's rate. Tolerance
-- is the provable rounding bound, not a fudge: base amounts are computed from
-- the unrounded rate, then the rate is stored at numeric(18,8). For a small
-- rate like COP→CAD (~0.0003) that keeps only ~4 significant digits, so the
-- product can drift by up to |amount| × 0.5e-8, plus half a unit of the base
-- column's 4 decimals. (On the live household: 0 rows beyond this bound, ~670
-- COP rows beyond an exact match, max 0.19 CAD — see docs/release-checklist.md.)
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'RUM-010b base amounts = amount × the row''s own stored rate, within rate rounding (entries and allocations)' as check_name,
  not exists (
    select 1 from public.transaction_entries e
    where e.household_id = (select household_id from params)
      and abs(e.amount_base_currency - e.amount_account_currency * e.exchange_rate_to_base)
          > abs(e.amount_account_currency) * 0.000000005 + 0.00005
  )
  and not exists (
    select 1 from public.transaction_allocations a
    where a.household_id = (select household_id from params)
      and abs(a.amount_base_currency - a.amount_original_currency * a.exchange_rate_to_base)
          > abs(a.amount_original_currency) * 0.000000005 + 0.00005
  ) as passed;

-- Every child row belongs to its parent's household (no cross-household
-- entry, allocation or category reference hiding inside a transaction).
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'RUM-010b entries, allocations and their accounts/categories share the transaction''s household' as check_name,
  not exists (
    select 1
    from public.transactions t
    join public.transaction_entries e on e.transaction_id = t.id
    join public.accounts a on a.id = e.account_id
    where t.household_id = (select household_id from params)
      and (e.household_id <> t.household_id or a.household_id <> t.household_id)
  )
  and not exists (
    select 1
    from public.transactions t
    join public.transaction_allocations ta on ta.transaction_id = t.id
    join public.categories c on c.id = ta.category_id
    where t.household_id = (select household_id from params)
      and (ta.household_id <> t.household_id or c.household_id <> t.household_id)
  ) as passed;

-- Accounts ↔ Dashboard/Net worth reconciliation. Accounts shows the
-- unbounded balance (booked future-dated entries included, by design — see
-- accounts/page.tsx); Dashboard and Net worth snapshot "as of today". The two
-- may differ, but only by exactly the entries dated after today — nothing
-- else, per account, posted and projected, in account currency.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
unbounded as (
  select account_id, posted_balance_account_currency as posted, projected_balance_account_currency as projected
  from public.get_account_balances((select household_id from params))
),
as_of_today as (
  select account_id, posted_balance_account_currency as posted, projected_balance_account_currency as projected
  from public.get_account_balances_as_of_many((select household_id from params), array[current_date], true)
),
future_dated as (
  select
    te.account_id,
    coalesce(sum(te.amount_account_currency) filter (where t.status = 'posted'), 0) as posted,
    coalesce(sum(te.amount_account_currency) filter (where t.status in ('posted', 'pending')), 0) as projected
  from public.transaction_entries te
  join public.transactions t on t.id = te.transaction_id
  where t.household_id = (select household_id from params)
    and t.deleted_at is null
    and t.transaction_date > current_date
  group by te.account_id
)
select
  'RUM-010b Accounts balance − as-of-today balance = exactly the future-dated entries' as check_name,
  not exists (
    select 1
    from unbounded u
    full join as_of_today d on d.account_id = u.account_id
    left join future_dated f on f.account_id = coalesce(u.account_id, d.account_id)
    where round(coalesce(u.posted, 0) - coalesce(d.posted, 0), 4) <> round(coalesce(f.posted, 0), 4)
       or round(coalesce(u.projected, 0) - coalesce(d.projected, 0), 4) <> round(coalesce(f.projected, 0), 4)
  ) as passed;
