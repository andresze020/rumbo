-- ============================================================
-- App Finanzas — BR-003..BR-006 financial correctness checks
-- Purpose: read-only SQL assertions for manual post-migration verification.
-- ============================================================
--
-- How to use:
-- 1. Apply migrations with `npx supabase db push`.
-- 2. Replace __HOUSEHOLD_ID__ with a real household UUID.
-- 3. Run as an authenticated member of that household.
-- 4. Every `passed` value should be true.

with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'BR-002 same-currency FX returns 1' as check_name,
  public.get_exchange_rate(params.household_id, 'CAD', 'CAD', current_date) = 1 as passed
from params;

with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'BR-002 missing FX returns null' as check_name,
  public.get_exchange_rate(params.household_id, 'USD', 'COP', date '1900-01-01') is null as passed
from params;

with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
archived_accounts as (
  select a.id
  from public.accounts a
  where a.household_id = (select household_id from params)
    and a.is_archived = true
    and a.deleted_at is null
),
as_of_balances as (
  select b.account_id
  from public.get_account_balances(
    (select household_id from params),
    current_date
  ) b
)
select
  'BR-004 as-of balances exclude archived accounts' as check_name,
  not exists (
    select 1
    from archived_accounts aa
    join as_of_balances b on b.account_id = aa.id
  ) as passed;

with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'BR-006 transfers have no reporting allocations' as check_name,
  not exists (
    select 1
    from public.transactions t
    join public.transaction_allocations ta
      on ta.transaction_id = t.id
      and ta.household_id = t.household_id
    where t.household_id = (select household_id from params)
      and t.transaction_type = 'transfer'
      and t.status in ('posted', 'pending')
      and t.deleted_at is null
      and ta.allocation_type in ('income', 'expense')
  ) as passed;

with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
same_currency_transfers as (
  select
    t.id,
    count(distinct te.currency_code) as currency_count,
    coalesce(sum(te.amount_base_currency), 0) as net_base_amount
  from public.transactions t
  join public.transaction_entries te
    on te.transaction_id = t.id
    and te.household_id = t.household_id
  where t.household_id = (select household_id from params)
    and t.transaction_type = 'transfer'
    and t.status = 'posted'
    and t.deleted_at is null
  group by t.id
)
select
  'BR-006 same-currency posted transfers net to zero in base currency' as check_name,
  not exists (
    select 1
    from same_currency_transfers
    where currency_count = 1
      and net_base_amount <> 0
  ) as passed;

with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
household as (
  select h.base_currency
  from public.households h
  where h.id = (select household_id from params)
),
non_base_csv_rows as (
  select
    t.id,
    te.currency_code,
    te.exchange_rate_to_base as entry_rate,
    ta.exchange_rate_to_base as allocation_rate
  from public.transactions t
  join public.transaction_entries te
    on te.transaction_id = t.id
    and te.household_id = t.household_id
  join public.transaction_allocations ta
    on ta.transaction_id = t.id
    and ta.household_id = t.household_id
  where t.household_id = (select household_id from params)
    and t.source = 'csv_import'
    and t.status = 'posted'
    and t.deleted_at is null
    and te.currency_code <> (select base_currency from household)
)
select
  'BR-006 non-base CSV rows use the same non-1 FX rate on entries and allocations' as check_name,
  not exists (
    select 1
    from non_base_csv_rows
    where entry_rate = 1
      or allocation_rate = 1
      or entry_rate <> allocation_rate
  ) as passed;

with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
official_balances as (
  select
    b.account_id,
    b.projected_balance_base_currency
  from public.get_account_balances((select household_id from params)) b
),
manual_balances as (
  select
    a.id as account_id,
    coalesce(sum(te.amount_base_currency), 0)::numeric(18,4) as projected_balance_base_currency
  from public.accounts a
  left join public.transaction_entries te
    on te.account_id = a.id
    and te.household_id = a.household_id
  left join public.transactions t
    on t.id = te.transaction_id
    and t.household_id = a.household_id
    and t.deleted_at is null
    and t.status in ('posted', 'pending')
  where a.household_id = (select household_id from params)
    and a.deleted_at is null
    and a.is_archived = false
  group by a.id
)
select
  'BR-006 official balances match posted/pending entries only' as check_name,
  not exists (
    select 1
    from official_balances ob
    join manual_balances mb on mb.account_id = ob.account_id
    where ob.projected_balance_base_currency <> mb.projected_balance_base_currency
  ) as passed;

with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
allocation_actuals as (
  select coalesce(sum(ta.amount_base_currency), 0) as amount
  from public.transaction_allocations ta
  join public.transactions t
    on t.id = ta.transaction_id
    and t.household_id = ta.household_id
  where ta.household_id = (select household_id from params)
    and t.status = 'posted'
    and t.deleted_at is null
    and ta.allocation_type in ('income', 'expense')
),
entry_movements as (
  select coalesce(sum(abs(te.amount_base_currency)), 0) as amount
  from public.transaction_entries te
  join public.transactions t
    on t.id = te.transaction_id
    and t.household_id = te.household_id
  where te.household_id = (select household_id from params)
    and t.status = 'posted'
    and t.deleted_at is null
)
select
  'BR-006 reporting actuals are allocation-based' as check_name,
  (select amount from allocation_actuals) <= (select amount from entry_movements) as passed;
