-- ============================================================
-- Rumbo — HH-2: scope in reporting
-- Spec: docs/features/household-sharing.md D3, §3 Scope (SCP-2), §4
-- "Functions", §7 HH-2, S18.
-- ------------------------------------------------------------
-- Every reporting RPC takes `p_scope text default 'household'`:
--   household = shared rows only — the same numbers for every member (D3);
--   mine      = the caller's private rows only;
--   all       = both (what RLS already lets the caller see).
-- RLS still decides what is visible; the scope only narrows it, so no scope
-- can reveal another member's private row.
--
-- What "shared" means depends on what is being counted (§7 HH-2):
--   * balances, card cycles: the account's private_owner_id;
--   * income / expense / category figures: the allocation's private_owner_id
--     (an allocation is private only when its transaction is private);
--   * transaction lists and per-payee / per-tag counts: the transaction's
--     visibility — a mixed transfer shows in every scope its viewer may see
--     (household: visibility <> 'private'; mine: private_owner_id = caller).
-- Summable outputs therefore satisfy household + mine = all.
--
-- Each function is a verbatim copy of its latest definition plus the scope:
-- the new parameter goes LAST (positional callers keep working), the old
-- signature is dropped first so no ambiguous overload remains (§9.5), and an
-- unknown scope raises. get_payees_with_stats / get_tags_with_stats move from
-- LANGUAGE sql to plpgsql only to raise on an unknown scope.
--
-- Budgets (get_monthly_budget_details, get_budget_line_carryovers,
-- get_budget_previous_actuals, get_budget_payment_split) take no scope: they
-- count shared allocations only, explicitly, whatever the caller can see
-- (S18). copy_budget_from_previous_month copies planned lines and reads no
-- ledger row, so it is unchanged.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Balances: the account's owner
-- ------------------------------------------------------------
drop function if exists public.get_account_balances(uuid);
drop function if exists public.get_account_balances(uuid, date);
drop function if exists public.get_account_balances_as_of_many(uuid, date[], boolean);

create or replace function public.get_account_balances(
  p_household_id uuid,
  p_scope text default 'household'
)
returns table (
  account_id uuid,
  account_name text,
  account_type text,
  account_class text,
  currency_code varchar(3),
  include_in_net_worth boolean,
  posted_balance_account_currency numeric(18,4),
  pending_balance_account_currency numeric(18,4),
  projected_balance_account_currency numeric(18,4),
  posted_balance_base_currency numeric(18,4),
  pending_balance_base_currency numeric(18,4),
  projected_balance_base_currency numeric(18,4),
  base_conversion_rate numeric(18,8),
  base_conversion_rate_date date
)
language plpgsql
security invoker
set search_path = public
-- HH-2: plan each call with its actual scope; the generic plan (from the
-- 6th call in a session) cannot drop the scope branches and is ~4x slower.
set plan_cache_mode = force_custom_plan
as $$
declare
  v_base_currency varchar(3);
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized to read balances for this household';
  end if;

  if p_scope is null or p_scope not in ('household', 'mine', 'all') then
    raise exception 'scope must be household, mine or all';
  end if;

  select h.base_currency into v_base_currency
  from public.households h
  where h.id = p_household_id;

  return query
  with balances as (
    select
      a.id as account_id,
      a.name as account_name,
      a.account_type,
      a.account_class,
      a.currency_code,
      a.include_in_net_worth,
      a.sort_order,
      a.created_at,

      coalesce(sum(te.amount_account_currency) filter (
        where t.status = 'posted'
      ), 0)::numeric(18,4) as posted_account,

      coalesce(sum(te.amount_account_currency) filter (
        where t.status = 'pending'
      ), 0)::numeric(18,4) as pending_account,

      coalesce(sum(te.amount_account_currency) filter (
        where t.status in ('posted', 'pending')
      ), 0)::numeric(18,4) as projected_account,

      coalesce(sum(te.amount_base_currency) filter (
        where t.status = 'posted'
      ), 0)::numeric(18,4) as posted_base_historical,

      coalesce(sum(te.amount_base_currency) filter (
        where t.status = 'pending'
      ), 0)::numeric(18,4) as pending_base_historical,

      coalesce(sum(te.amount_base_currency) filter (
        where t.status in ('posted', 'pending')
      ), 0)::numeric(18,4) as projected_base_historical

    from public.accounts a
    left join public.transaction_entries te
      on te.account_id = a.id
      and te.household_id = a.household_id
    left join public.transactions t
      on t.id = te.transaction_id
      and t.household_id = a.household_id
      and t.deleted_at is null
      and t.status in ('posted', 'pending')
    where a.household_id = p_household_id
      and a.deleted_at is null
      and (
        p_scope = 'all'
        or (p_scope = 'household' and a.private_owner_id is null)
        or (p_scope = 'mine' and a.private_owner_id = (select auth.uid()))
      )
    group by
      a.id, a.name, a.account_type, a.account_class, a.currency_code,
      a.include_in_net_worth, a.sort_order, a.created_at
  ),
  rates as (
    select
      currencies_in_use.currency_code,
      fx.rate,
      fx.rate_date
    from (select distinct b.currency_code from balances b) as currencies_in_use
    left join lateral public.get_exchange_rate_as_of(
      p_household_id,
      currencies_in_use.currency_code,
      v_base_currency,
      current_date
    ) fx on true
  )
  select
    b.account_id,
    b.account_name,
    b.account_type,
    b.account_class,
    b.currency_code,
    b.include_in_net_worth,
    b.posted_account,
    b.pending_account,
    b.projected_account,
    case when r.rate is null then b.posted_base_historical
         else (b.posted_account * r.rate)::numeric(18,4) end,
    case when r.rate is null then b.pending_base_historical
         else (b.pending_account * r.rate)::numeric(18,4) end,
    case when r.rate is null then b.projected_base_historical
         else (b.projected_account * r.rate)::numeric(18,4) end,
    r.rate,
    r.rate_date
  from balances b
  left join rates r on r.currency_code = b.currency_code
  order by b.sort_order nulls last, b.created_at asc;
end;
$$;

revoke all on function public.get_account_balances(uuid, text) from public, anon;
grant execute on function public.get_account_balances(uuid, text) to authenticated;

create or replace function public.get_account_balances(
  p_household_id uuid,
  p_as_of_date date,
  p_scope text default 'household'
)
returns table (
  account_id uuid,
  account_name text,
  account_type text,
  account_class text,
  currency_code varchar(3),
  include_in_net_worth boolean,
  is_archived boolean,
  posted_balance_account_currency numeric(18,4),
  pending_balance_account_currency numeric(18,4),
  projected_balance_account_currency numeric(18,4),
  posted_balance_base_currency numeric(18,4),
  pending_balance_base_currency numeric(18,4),
  projected_balance_base_currency numeric(18,4),
  base_conversion_rate numeric(18,8),
  base_conversion_rate_date date
)
language plpgsql
security invoker
set search_path = public
-- HH-2: plan each call with its actual scope; the generic plan (from the
-- 6th call in a session) cannot drop the scope branches and is ~4x slower.
set plan_cache_mode = force_custom_plan
as $$
declare
  v_base_currency varchar(3);
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if p_as_of_date is null then
    raise exception 'as_of_date is required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized to read balances for this household';
  end if;

  if p_scope is null or p_scope not in ('household', 'mine', 'all') then
    raise exception 'scope must be household, mine or all';
  end if;

  select h.base_currency into v_base_currency
  from public.households h
  where h.id = p_household_id;

  return query
  with balances as (
    select
      a.id as account_id,
      a.name as account_name,
      a.account_type,
      a.account_class,
      a.currency_code,
      a.include_in_net_worth,
      a.is_archived,
      a.sort_order,
      a.created_at,

      coalesce(sum(te.amount_account_currency) filter (
        where t.status = 'posted'
      ), 0)::numeric(18,4) as posted_account,

      coalesce(sum(te.amount_account_currency) filter (
        where t.status = 'pending'
      ), 0)::numeric(18,4) as pending_account,

      coalesce(sum(te.amount_account_currency) filter (
        where t.status in ('posted', 'pending')
      ), 0)::numeric(18,4) as projected_account,

      -- Kept as the fallback for a household with no rate on file.
      coalesce(sum(te.amount_base_currency) filter (
        where t.status = 'posted'
      ), 0)::numeric(18,4) as posted_base_historical,

      coalesce(sum(te.amount_base_currency) filter (
        where t.status = 'pending'
      ), 0)::numeric(18,4) as pending_base_historical,

      coalesce(sum(te.amount_base_currency) filter (
        where t.status in ('posted', 'pending')
      ), 0)::numeric(18,4) as projected_base_historical

    from public.accounts a
    left join public.transaction_entries te
      on te.account_id = a.id
      and te.household_id = a.household_id
    left join public.transactions t
      on t.id = te.transaction_id
      and t.household_id = a.household_id
      and t.deleted_at is null
      and t.status in ('posted', 'pending')
      and t.transaction_date <= p_as_of_date
    where a.household_id = p_household_id
      and a.deleted_at is null
      and a.is_archived = false
      and (
        p_scope = 'all'
        or (p_scope = 'household' and a.private_owner_id is null)
        or (p_scope = 'mine' and a.private_owner_id = (select auth.uid()))
      )
    group by
      a.id, a.name, a.account_type, a.account_class, a.currency_code,
      a.include_in_net_worth, a.is_archived, a.sort_order, a.created_at
  ),
  -- One lookup per distinct currency rather than per account.
  rates as (
    select
      currencies_in_use.currency_code,
      fx.rate,
      fx.rate_date
    from (select distinct b.currency_code from balances b) as currencies_in_use
    left join lateral public.get_exchange_rate_as_of(
      p_household_id,
      currencies_in_use.currency_code,
      v_base_currency,
      p_as_of_date
    ) fx on true
  )
  select
    b.account_id,
    b.account_name,
    b.account_type,
    b.account_class,
    b.currency_code,
    b.include_in_net_worth,
    b.is_archived,
    b.posted_account,
    b.pending_account,
    b.projected_account,
    case when r.rate is null then b.posted_base_historical
         else (b.posted_account * r.rate)::numeric(18,4) end,
    case when r.rate is null then b.pending_base_historical
         else (b.pending_account * r.rate)::numeric(18,4) end,
    case when r.rate is null then b.projected_base_historical
         else (b.projected_account * r.rate)::numeric(18,4) end,
    r.rate,
    r.rate_date
  from balances b
  left join rates r on r.currency_code = b.currency_code
  order by b.sort_order nulls last, b.created_at asc;
end;
$$;

revoke all on function public.get_account_balances(uuid, date, text) from public, anon;
grant execute on function public.get_account_balances(uuid, date, text) to authenticated;

create or replace function public.get_account_balances_as_of_many(
  p_household_id uuid,
  p_as_of_dates date[],
  p_include_archived boolean default false,
  p_scope text default 'household'
)
returns table (
  as_of_date date,
  account_id uuid,
  account_name text,
  account_type text,
  account_class text,
  currency_code varchar(3),
  include_in_net_worth boolean,
  is_archived boolean,
  posted_balance_account_currency numeric(18,4),
  pending_balance_account_currency numeric(18,4),
  projected_balance_account_currency numeric(18,4),
  posted_balance_base_currency numeric(18,4),
  pending_balance_base_currency numeric(18,4),
  projected_balance_base_currency numeric(18,4),
  base_conversion_rate numeric(18,8),
  base_conversion_rate_date date
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_base_currency varchar(3);
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if p_as_of_dates is null or array_length(p_as_of_dates, 1) is null then
    raise exception 'as_of_dates must be a non-empty array';
  end if;

  if array_position(p_as_of_dates, null) is not null then
    raise exception 'as_of_dates may not contain null';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized to read balances for this household';
  end if;

  if p_scope is null or p_scope not in ('household', 'mine', 'all') then
    raise exception 'scope must be household, mine or all';
  end if;

  select h.base_currency into v_base_currency
  from public.households h
  where h.id = p_household_id;

  return query
  with
  -- Every account gets an explicit zero-balance row dated at the epoch, so an
  -- as-of date before the account's first entry (or an account with no
  -- entries at all) still matches a row instead of being silently dropped
  -- from the result. Without this a brand-new account would simply be
  -- missing from an early month of Net worth's evolution, not zero in it.
  entry_days as materialized (
    select
      a.id as account_id,
      '0001-01-01'::date as transaction_date,
      0::numeric as posted_account,
      0::numeric as pending_account,
      0::numeric as posted_base_historical,
      0::numeric as pending_base_historical
    from public.accounts a
    where a.household_id = p_household_id
      and a.deleted_at is null
      and (p_include_archived or a.is_archived = false)
      and (
        p_scope = 'all'
        or (p_scope = 'household' and a.private_owner_id is null)
        or (p_scope = 'mine' and a.private_owner_id = (select auth.uid()))
      )

    union all

    -- One row per account per calendar day it moved, summed once — not once
    -- per requested date. This is the whole optimisation: the ledger is
    -- read and aggregated a single time no matter how many as-of dates are
    -- asked for.
    select
      te.account_id,
      t.transaction_date,
      sum(te.amount_account_currency) filter (where t.status = 'posted'),
      sum(te.amount_account_currency) filter (where t.status = 'pending'),
      sum(te.amount_base_currency) filter (where t.status = 'posted'),
      sum(te.amount_base_currency) filter (where t.status = 'pending')
    from public.transaction_entries te
    join public.transactions t
      on t.id = te.transaction_id
      and t.household_id = te.household_id
      and t.deleted_at is null
      and t.status in ('posted', 'pending')
    join public.accounts a
      on a.id = te.account_id
      and a.household_id = te.household_id
      and a.deleted_at is null
      and (p_include_archived or a.is_archived = false)
      and (
        p_scope = 'all'
        or (p_scope = 'household' and a.private_owner_id is null)
        or (p_scope = 'mine' and a.private_owner_id = (select auth.uid()))
      )
    where te.household_id = p_household_id
    group by te.account_id, t.transaction_date
  ),
  -- A running total per account, one pass, in transaction_date order. This
  -- is what makes N as-of dates cost one scan instead of N: every date's
  -- answer is a lookup into the same cumulative series.
  running as materialized (
    select
      ed.account_id,
      ed.transaction_date,
      sum(coalesce(ed.posted_account, 0)) over w as cum_posted_account,
      sum(coalesce(ed.pending_account, 0)) over w as cum_pending_account,
      sum(coalesce(ed.posted_base_historical, 0)) over w as cum_posted_base_historical,
      sum(coalesce(ed.pending_base_historical, 0)) over w as cum_pending_base_historical
    from entry_days ed
    -- Bare `account_id` here would be ambiguous: `returns table (…,
    -- account_id uuid, …)` makes it a PL/pgSQL variable in scope through the
    -- whole function body, and plpgsql.variable_conflict defaults to `error`
    -- rather than silently guessing which one a bare reference means. Every
    -- reference in this function is qualified with its CTE's alias for
    -- exactly this reason — caught only once this ran as a real function,
    -- not as the loose SQL it was validated against beforehand.
    window w as (
      partition by ed.account_id order by ed.transaction_date
      rows between unbounded preceding and current row
    )
  ),
  requested_dates as (
    select distinct unnest(p_as_of_dates) as as_of_date
  ),
  -- For each (account, requested date), the latest running row at or before
  -- that date is the balance as of that date.
  matched as (
    select
      d.as_of_date,
      r.account_id,
      r.cum_posted_account,
      r.cum_pending_account,
      r.cum_posted_base_historical,
      r.cum_pending_base_historical,
      row_number() over (
        partition by d.as_of_date, r.account_id
        order by r.transaction_date desc
      ) as rn
    from requested_dates d
    join running r on r.transaction_date <= d.as_of_date
  ),
  picked as (
    select
      m.as_of_date,
      m.account_id,
      m.cum_posted_account as posted_account,
      m.cum_pending_account as pending_account,
      m.cum_posted_account + m.cum_pending_account as projected_account,
      m.cum_posted_base_historical as posted_base_historical,
      m.cum_pending_base_historical as pending_base_historical,
      m.cum_posted_base_historical + m.cum_pending_base_historical as projected_base_historical
    from matched m
    where m.rn = 1
  ),
  -- One rate lookup per (currency, requested date) actually in use, not per
  -- account — the same de-duplication the single-date function already does.
  rates as materialized (
    select
      p.as_of_date,
      a.currency_code,
      fx.rate,
      fx.rate_date
    from (select distinct p2.as_of_date, p2.account_id from picked p2) p
    join public.accounts a on a.id = p.account_id
    left join lateral public.get_exchange_rate_as_of(
      p_household_id, a.currency_code, v_base_currency, p.as_of_date
    ) fx on true
    group by p.as_of_date, a.currency_code, fx.rate, fx.rate_date
  )
  select
    p.as_of_date,
    a.id,
    a.name,
    a.account_type,
    a.account_class,
    a.currency_code,
    a.include_in_net_worth,
    a.is_archived,
    p.posted_account,
    p.pending_account,
    p.projected_account,
    case when r.rate is null then p.posted_base_historical
         else (p.posted_account * r.rate)::numeric(18,4) end,
    case when r.rate is null then p.pending_base_historical
         else (p.pending_account * r.rate)::numeric(18,4) end,
    case when r.rate is null then p.projected_base_historical
         else (p.projected_account * r.rate)::numeric(18,4) end,
    r.rate,
    r.rate_date
  from picked p
  join public.accounts a on a.id = p.account_id
  left join rates r on r.as_of_date = p.as_of_date and r.currency_code = a.currency_code
  order by p.as_of_date, a.sort_order nulls last, a.created_at asc;
end;
$$;

revoke all on function public.get_account_balances_as_of_many(uuid, date[], boolean, text) from public, anon;
grant execute on function public.get_account_balances_as_of_many(uuid, date[], boolean, text) to authenticated;

-- ------------------------------------------------------------
-- 2. Income and expense: the allocation's owner
-- ------------------------------------------------------------
drop function if exists public.get_monthly_dashboard_summary(uuid, date);
drop function if exists public.get_monthly_expenses_by_category(uuid, date);

create or replace function public.get_monthly_dashboard_summary(
  p_household_id uuid,
  p_month date,
  p_scope text default 'household'
)
returns table (
  household_id uuid,
  month_start date,
  month_end date,
  base_currency varchar(3),
  monthly_income numeric(18,4),
  monthly_expenses numeric(18,4),
  monthly_savings numeric(18,4),
  savings_rate numeric(9,6),
  income_transaction_count bigint,
  expense_transaction_count bigint
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_month_start date;
  v_month_end date;
  v_next_month date;
  v_base_currency varchar(3);
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if p_month is null then
    raise exception 'month is required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized to read dashboard metrics for this household';
  end if;

  if p_scope is null or p_scope not in ('household', 'mine', 'all') then
    raise exception 'scope must be household, mine or all';
  end if;

  select h.base_currency
  into v_base_currency
  from public.households h
  where h.id = p_household_id
    and h.deleted_at is null;

  if v_base_currency is null then
    raise exception 'household not found';
  end if;

  v_month_start := date_trunc('month', p_month)::date;
  v_next_month := (v_month_start + interval '1 month')::date;
  v_month_end := (v_next_month - interval '1 day')::date;

  return query
  with monthly_allocations as (
    select
      t.id as transaction_id,
      ta.allocation_type,
      ta.amount_base_currency
    from public.transactions t
    join public.transaction_allocations ta
      on ta.transaction_id = t.id
      and ta.household_id = t.household_id
    join public.categories c
      on c.id = ta.category_id
      and c.household_id = ta.household_id
      and c.deleted_at is null
    left join public.categories parent_c
      on parent_c.id = c.parent_category_id
      and parent_c.household_id = c.household_id
      and parent_c.deleted_at is null
    where t.household_id = p_household_id
      and t.status = 'posted'
      and t.deleted_at is null
      and t.transaction_date >= v_month_start
      and t.transaction_date < v_next_month
      and ta.household_id = p_household_id
      and (
        p_scope = 'all'
        or (p_scope = 'household' and ta.private_owner_id is null)
        or (p_scope = 'mine' and ta.private_owner_id = (select auth.uid()))
      )
      and ta.allocation_type in ('income', 'expense')
      and c.exclude_from_reports = false
      and coalesce(parent_c.exclude_from_reports, false) = false
  ),
  totals as (
    select
      coalesce(sum(ma.amount_base_currency) filter (
        where ma.allocation_type = 'income'
      ), 0)::numeric(18,4) as income_total,
      coalesce(sum(ma.amount_base_currency) filter (
        where ma.allocation_type = 'expense'
      ), 0)::numeric(18,4) as expense_total,
      count(distinct ma.transaction_id) filter (
        where ma.allocation_type = 'income'
      ) as income_count,
      count(distinct ma.transaction_id) filter (
        where ma.allocation_type = 'expense'
      ) as expense_count
    from monthly_allocations ma
  )
  select
    p_household_id as household_id,
    v_month_start as month_start,
    v_month_end as month_end,
    v_base_currency as base_currency,
    totals.income_total as monthly_income,
    totals.expense_total as monthly_expenses,
    (totals.income_total - totals.expense_total)::numeric(18,4) as monthly_savings,
    case
      when totals.income_total > 0 then
        ((totals.income_total - totals.expense_total) / totals.income_total)::numeric(9,6)
      else null
    end as savings_rate,
    totals.income_count as income_transaction_count,
    totals.expense_count as expense_transaction_count
  from totals;
end;
$$;

revoke all on function public.get_monthly_dashboard_summary(uuid, date, text) from public, anon;
grant execute on function public.get_monthly_dashboard_summary(uuid, date, text) to authenticated;

create or replace function public.get_monthly_expenses_by_category(
  p_household_id uuid,
  p_month date,
  p_scope text default 'household'
)
returns table (
  category_id uuid,
  category_name text,
  parent_category_id uuid,
  amount_base_currency numeric(18,4),
  transaction_count bigint
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_month_start date;
  v_next_month date;
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if p_month is null then
    raise exception 'month is required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized to read dashboard metrics for this household';
  end if;

  if p_scope is null or p_scope not in ('household', 'mine', 'all') then
    raise exception 'scope must be household, mine or all';
  end if;

  v_month_start := date_trunc('month', p_month)::date;
  v_next_month := (v_month_start + interval '1 month')::date;

  return query
  select
    c.id as category_id,
    c.name as category_name,
    c.parent_category_id,
    sum(ta.amount_base_currency)::numeric(18,4) as amount_base_currency,
    count(distinct t.id) as transaction_count
  from public.transactions t
  join public.transaction_allocations ta
    on ta.transaction_id = t.id
    and ta.household_id = t.household_id
  join public.categories c
    on c.id = ta.category_id
    and c.household_id = ta.household_id
    and c.deleted_at is null
  left join public.categories parent_c
    on parent_c.id = c.parent_category_id
    and parent_c.household_id = c.household_id
    and parent_c.deleted_at is null
  where t.household_id = p_household_id
    and t.status = 'posted'
    and t.deleted_at is null
    and t.transaction_date >= v_month_start
    and t.transaction_date < v_next_month
    and ta.household_id = p_household_id
    and (
      p_scope = 'all'
      or (p_scope = 'household' and ta.private_owner_id is null)
      or (p_scope = 'mine' and ta.private_owner_id = (select auth.uid()))
    )
    and ta.allocation_type = 'expense'
    and c.exclude_from_reports = false
    and coalesce(parent_c.exclude_from_reports, false) = false
  group by
    c.id,
    c.name,
    c.parent_category_id
  order by
    sum(ta.amount_base_currency) desc,
    c.name asc;
end;
$$;

revoke all on function public.get_monthly_expenses_by_category(uuid, date, text) from public, anon;
grant execute on function public.get_monthly_expenses_by_category(uuid, date, text) to authenticated;

-- ------------------------------------------------------------
-- 3. Card cycles: the card's owner
-- ------------------------------------------------------------
drop function if exists public.get_card_cycle_summaries(uuid, date);

create or replace function public.get_card_cycle_summaries(
  p_household_id uuid,
  p_as_of date default current_date,
  p_scope text default 'household'
)
returns table (
  account_id uuid,
  account_name text,
  currency_code varchar(3),
  statement_day smallint,
  payment_day smallint,
  billing_account_id uuid,
  billing_account_name text,
  closed_period_start date,
  closed_period_end date,
  closed_payment_due date,
  open_period_start date,
  open_period_end date,
  open_payment_due date,
  statement_balance numeric(18,4),
  paid_since_close numeric(18,4),
  payable numeric(18,4),
  outstanding numeric(18,4),
  is_overdue boolean
)
language plpgsql
security invoker
stable
set search_path = public
as $$
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized to read card cycles for this household';
  end if;

  if p_scope is null or p_scope not in ('household', 'mine', 'all') then
    raise exception 'scope must be household, mine or all';
  end if;

  return query
  with cards as (
    select
      a.id,
      a.name,
      a.currency_code,
      a.statement_day,
      a.payment_day,
      a.billing_account_id,
      b.name as billing_account_name
    from public.accounts a
    left join public.accounts b
      on b.id = a.billing_account_id
      and b.household_id = a.household_id
      and b.deleted_at is null
    where a.household_id = p_household_id
      and a.deleted_at is null
      and a.is_archived = false
      and (
        p_scope = 'all'
        or (p_scope = 'household' and a.private_owner_id is null)
        or (p_scope = 'mine' and a.private_owner_id = (select auth.uid()))
      )
      and a.statement_day is not null
      and a.payment_day is not null
  ),
  windows as (
    select
      c.*,
      -- The close date in p_as_of's own month. If that day has not arrived yet,
      -- the statement that closed most recently is the previous month's.
      case
        when public.card_cycle_day_in_month(p_as_of, c.statement_day) <= p_as_of
          then public.card_cycle_day_in_month(p_as_of, c.statement_day)
        else public.card_cycle_day_in_month(
          (date_trunc('month', p_as_of) - interval '1 month')::date, c.statement_day
        )
      end as closed_end
    from cards c
  ),
  periods as (
    select
      w.*,
      (public.card_cycle_day_in_month(
        (date_trunc('month', w.closed_end) - interval '1 month')::date, w.statement_day
      ) + interval '1 day')::date as closed_start,
      (w.closed_end + interval '1 day')::date as open_start,
      public.card_cycle_day_in_month(
        (date_trunc('month', w.closed_end) + interval '1 month')::date, w.statement_day
      ) as open_end,
      public.card_cycle_day_in_month(
        (date_trunc('month', w.closed_end) + interval '1 month')::date, w.payment_day
      ) as closed_due,
      public.card_cycle_day_in_month(
        (date_trunc('month', w.closed_end) + interval '2 months')::date, w.payment_day
      ) as open_due
    from windows w
  ),
  raw as (
    select
      p.*,
      -- Balance at close, flipped so "owed" is positive. Pending rows are
      -- excluded: a statement bills what actually posted.
      coalesce(-(
        select sum(te.amount_account_currency)
        from public.transaction_entries te
        join public.transactions t
          on t.id = te.transaction_id
          and t.household_id = te.household_id
        where te.account_id = p.id
          and te.household_id = p_household_id
          and t.status = 'posted'
          and t.deleted_at is null
          and t.transaction_date <= p.closed_end
      ), 0)::numeric(18,4) as statement_balance_calc,
      -- After the close, split three ways: payments, refunds, new charges.
      -- Kept as separate subqueries on purpose: each one is bounded by
      -- idx_transactions_household_date to the post-close window (a handful
      -- of rows), while the statement pass above reads the card's whole
      -- history. Folding all four into one conditional-aggregate pass forces
      -- the post-close figures through that full scan: measured 2026-09-30
      -- on the live project (one card, 2,532 entries, 100 interleaved calls)
      -- at 180.9 ms per call, against 165.8 ms for this shape and 163.4 ms
      -- for the previous three-subquery function.
      coalesce((
        select sum(te.amount_account_currency)
        from public.transaction_entries te
        join public.transactions t
          on t.id = te.transaction_id
          and t.household_id = te.household_id
        where te.account_id = p.id
          and te.household_id = p_household_id
          and t.status = 'posted'
          and t.deleted_at is null
          and t.transaction_date > p.closed_end
          and t.transaction_date <= p_as_of
          and te.amount_account_currency > 0
          and t.transaction_type <> 'refund'
      ), 0)::numeric(18,4) as payments_calc,
      coalesce((
        select sum(te.amount_account_currency)
        from public.transaction_entries te
        join public.transactions t
          on t.id = te.transaction_id
          and t.household_id = te.household_id
        where te.account_id = p.id
          and te.household_id = p_household_id
          and t.status = 'posted'
          and t.deleted_at is null
          and t.transaction_date > p.closed_end
          and t.transaction_date <= p_as_of
          and te.amount_account_currency > 0
          and t.transaction_type = 'refund'
      ), 0)::numeric(18,4) as refunds_calc,
      coalesce(-(
        select sum(te.amount_account_currency)
        from public.transaction_entries te
        join public.transactions t
          on t.id = te.transaction_id
          and t.household_id = te.household_id
        where te.account_id = p.id
          and te.household_id = p_household_id
          and t.status = 'posted'
          and t.deleted_at is null
          and t.transaction_date > p.closed_end
          and t.transaction_date <= p_as_of
          and te.amount_account_currency < 0
      ), 0)::numeric(18,4) as charges_calc
    from periods p
  ),
  figures as (
    select
      r.*,
      -- A refund offsets this cycle's charges first; only the excess reaches
      -- the closed statement.
      (r.payments_calc + greatest(r.refunds_calc - r.charges_calc, 0))::numeric(18,4)
        as paid_since_close_calc,
      greatest(r.charges_calc - r.refunds_calc, 0)::numeric(18,4) as outstanding_calc
    from raw r
  )
  select
    f.id,
    f.name,
    f.currency_code,
    f.statement_day,
    f.payment_day,
    f.billing_account_id,
    f.billing_account_name,
    f.closed_start,
    f.closed_end,
    f.closed_due,
    f.open_start,
    f.open_end,
    f.open_due,
    greatest(f.statement_balance_calc, 0)::numeric(18,4) as statement_balance,
    f.paid_since_close_calc as paid_since_close,
    greatest(
      greatest(f.statement_balance_calc, 0) - f.paid_since_close_calc, 0
    )::numeric(18,4) as payable,
    f.outstanding_calc as outstanding,
    (
      greatest(greatest(f.statement_balance_calc, 0) - f.paid_since_close_calc, 0) > 0
      and f.closed_due < p_as_of
    ) as is_overdue
  from figures f
  order by f.name asc;
end;
$$;

revoke all on function public.get_card_cycle_summaries(uuid, date, text) from public, anon;
grant execute on function public.get_card_cycle_summaries(uuid, date, text) to authenticated;

-- ------------------------------------------------------------
-- 4. Transaction lists: the transaction's visibility
-- ------------------------------------------------------------
drop function if exists public.search_household_transactions(
  uuid, date, date, text[], text[], text, text, uuid[], uuid[], uuid[], uuid[], integer, integer
);
drop function if exists public.get_payees_with_stats(uuid);
drop function if exists public.get_tags_with_stats(uuid);

CREATE OR REPLACE FUNCTION public.search_household_transactions(p_household_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_types text[] DEFAULT NULL::text[], p_statuses text[] DEFAULT NULL::text[], p_review text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_payee_ids uuid[] DEFAULT NULL::uuid[], p_account_ids uuid[] DEFAULT NULL::uuid[], p_category_ids uuid[] DEFAULT NULL::uuid[], p_tag_ids uuid[] DEFAULT NULL::uuid[], p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_scope text DEFAULT 'household'::text)
 RETURNS TABLE(id uuid, transaction_date date, transaction_time time without time zone, created_at timestamp with time zone, transaction_type text, status text, review_status text, description text, merchant_name text, notes text, source text, void_reason text, total_count bigint, total_income_base numeric, total_expense_base numeric, total_pending bigint, total_imported bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_search text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized for this household';
  end if;

  if p_scope is null or p_scope not in ('household', 'mine', 'all') then
    raise exception 'scope must be household, mine or all';
  end if;

  -- Escape LIKE wildcards in the free-text search (mirrors the former app-side
  -- escaping) so a literal % / _ typed by the user is matched, not treated as a
  -- wildcard.
  v_search := case
    when p_search is null or btrim(p_search) = '' then null
    else '%' || replace(replace(btrim(p_search), '%', '\%'), '_', '\_') || '%'
  end;

  return query
  with filtered as (
    select
      t.id,
      t.transaction_date,
      t.transaction_time,
      t.created_at,
      t.transaction_type,
      t.status,
      t.review_status,
      t.description,
      t.merchant_name,
      t.notes,
      t.source,
      t.void_reason
    from public.transactions t
    where t.household_id = p_household_id
      and t.deleted_at is null
      -- HH-2: a mixed transfer shows in every scope its viewer may see.
      and (
        p_scope = 'all'
        or (p_scope = 'household' and t.visibility <> 'private')
        or (p_scope = 'mine' and t.private_owner_id = (select auth.uid()))
      )
      and (p_date_from is null or t.transaction_date >= p_date_from)
      and (p_date_to is null or t.transaction_date <= p_date_to)
      and (
        p_types is null
        or array_length(p_types, 1) is null
        or t.transaction_type = any (p_types)
      )
      and (
        p_statuses is null
        or array_length(p_statuses, 1) is null
        or t.status = any (p_statuses)
      )
      and (p_review is null or t.review_status = p_review)
      and (
        p_payee_ids is null
        or array_length(p_payee_ids, 1) is null
        or t.payee_id = any (p_payee_ids)
      )
      and (
        v_search is null
        or t.description ilike v_search escape '\'
        or t.merchant_name ilike v_search escape '\'
        or t.notes ilike v_search escape '\'
      )
      and (
        p_account_ids is null
        or array_length(p_account_ids, 1) is null
        or exists (
          select 1
          from public.transaction_entries te
          where te.transaction_id = t.id
            and te.account_id = any (p_account_ids)
        )
      )
      and (
        p_category_ids is null
        or array_length(p_category_ids, 1) is null
        or exists (
          select 1
          from public.transaction_allocations ta
          where ta.transaction_id = t.id
            and ta.category_id = any (p_category_ids)
        )
      )
      and (
        p_tag_ids is null
        or array_length(p_tag_ids, 1) is null
        or exists (
          select 1
          from public.transaction_tags tt
          where tt.transaction_id = t.id
            and tt.tag_id = any (p_tag_ids)
        )
      )
  ),
  totals as (
    select
      count(*)::bigint as total_count,
      coalesce(sum(
        case
          when f.transaction_type = 'income' and f.status <> 'voided'
            then te.amount_base_currency
          else 0
        end
      ), 0)::numeric as total_income_base,
      -- B-8: a refund (BR-040, positive entry) reduces expenses, exactly as
      -- the Dashboard nets it through its negative expense allocation. Signed
      -- on purpose: a filter showing only refunds reads as a negative
      -- expense, not as a positive one.
      coalesce(-sum(
        case
          when f.transaction_type in ('expense', 'refund') and f.status <> 'voided'
            then te.amount_base_currency
          else 0
        end
      ), 0)::numeric as total_expense_base,
      (count(*) filter (where f.status = 'pending'))::bigint as total_pending,
      (count(*) filter (where f.source = 'csv_import'))::bigint as total_imported
    from filtered f
    left join public.transaction_entries te
      on te.transaction_id = f.id
      and f.transaction_type in ('income', 'expense', 'refund')
  )
  select
    f.id,
    f.transaction_date,
    f.transaction_time,
    f.created_at,
    f.transaction_type,
    f.status,
    f.review_status,
    f.description,
    f.merchant_name,
    f.notes,
    f.source,
    f.void_reason,
    tt.total_count,
    tt.total_income_base,
    tt.total_expense_base,
    tt.total_pending,
    tt.total_imported
  from filtered f
  cross join totals tt
  order by
    f.transaction_date desc,
    f.transaction_time desc nulls last,
    f.created_at desc
  limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

revoke all on function public.search_household_transactions(
  uuid, date, date, text[], text[], text, text, uuid[], uuid[], uuid[], uuid[], integer, integer, text
) from public, anon;
grant execute on function public.search_household_transactions(
  uuid, date, date, text[], text[], text, text, uuid[], uuid[], uuid[], uuid[], integer, integer, text
) to authenticated;

create or replace function public.get_payees_with_stats(
  p_household_id uuid,
  p_scope text default 'household'
)
returns table (
  id uuid,
  name text,
  is_archived boolean,
  txn_count bigint,
  last_txn_date date,
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_scope is null or p_scope not in ('household', 'mine', 'all') then
    raise exception 'scope must be household, mine or all';
  end if;

  return query
  select
    p.id,
    p.name,
    p.is_archived,
    count(t.id) as txn_count,
    max(t.transaction_date) as last_txn_date,
    p.created_at
  from public.payees p
  left join public.transactions t
    on t.payee_id = p.id
    and t.household_id = p.household_id
    and t.deleted_at is null
    and (
      p_scope = 'all'
      or (p_scope = 'household' and t.visibility <> 'private')
      or (p_scope = 'mine' and t.private_owner_id = (select auth.uid()))
    )
  where p.household_id = p_household_id
    and (
      p_scope = 'all'
      or (p_scope = 'household' and p.private_owner_id is null)
      -- mine: the caller's private payees, and any shared payee their own
      -- transactions use (a private context reuses an existing shared payee
      -- rather than shadow it, PRV-7)
      or (
        p_scope = 'mine'
        and (
          p.private_owner_id = (select auth.uid())
          or exists (
            select 1 from public.transactions tm
            where tm.payee_id = p.id
              and tm.household_id = p.household_id
              and tm.deleted_at is null
              and tm.private_owner_id = (select auth.uid())
          )
        )
      )
    )
  group by p.id, p.name, p.is_archived, p.created_at;
end;
$$;

revoke all on function public.get_payees_with_stats(uuid, text) from public, anon;
grant execute on function public.get_payees_with_stats(uuid, text) to authenticated;

create or replace function public.get_tags_with_stats(
  p_household_id uuid,
  p_scope text default 'household'
)
returns table (
  id uuid,
  name text,
  color text,
  is_archived boolean,
  txn_count bigint,
  last_txn_date date,
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_scope is null or p_scope not in ('household', 'mine', 'all') then
    raise exception 'scope must be household, mine or all';
  end if;

  return query
  select
    tg.id,
    tg.name,
    tg.color,
    tg.is_archived,
    count(t.id) as txn_count,
    max(t.transaction_date) as last_txn_date,
    tg.created_at
  from public.tags tg
  left join public.transaction_tags tt
    on tt.tag_id = tg.id
    and tt.household_id = tg.household_id
  left join public.transactions t
    on t.id = tt.transaction_id
    and t.household_id = tg.household_id
    and t.deleted_at is null
    and (
      p_scope = 'all'
      or (p_scope = 'household' and t.visibility <> 'private')
      or (p_scope = 'mine' and t.private_owner_id = (select auth.uid()))
    )
  where tg.household_id = p_household_id
  group by tg.id, tg.name, tg.color, tg.is_archived, tg.created_at;
end;
$$;

revoke all on function public.get_tags_with_stats(uuid, text) from public, anon;
grant execute on function public.get_tags_with_stats(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 5. Budgets: shared rows only, whatever the caller can see (S18)
-- ------------------------------------------------------------
-- Same signatures (create or replace keeps their grants).
-- copy_budget_from_previous_month reads no ledger row (it copies planned
-- lines), so it needs no change.

create or replace function public.get_monthly_budget_details(
  p_household_id uuid,
  p_budget_month date
)
returns table (
  budget_id uuid,
  household_id uuid,
  budget_month date,
  budget_status text,
  currency_code varchar(3),
  line_id uuid,
  category_id uuid,
  category_name text,
  parent_category_id uuid,
  category_is_archived boolean,
  category_exclude_from_budget boolean,
  category_exclude_from_reports boolean,
  planned_amount numeric(18,4),
  actual_amount numeric(18,4),
  transaction_count bigint
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_budget_month date;
  v_next_month date;
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if p_budget_month is null then
    raise exception 'budget_month is required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized to read budgets for this household';
  end if;

  v_budget_month := date_trunc('month', p_budget_month)::date;
  v_next_month := (v_budget_month + interval '1 month')::date;

  return query
  select
    b.id as budget_id,
    b.household_id,
    b.budget_month,
    b.status as budget_status,
    b.currency_code,
    bl.id as line_id,
    c.id as category_id,
    c.name as category_name,
    c.parent_category_id,
    c.is_archived as category_is_archived,
    c.exclude_from_budget as category_exclude_from_budget,
    c.exclude_from_reports as category_exclude_from_reports,
    bl.planned_amount::numeric(18,4) as planned_amount,
    coalesce(actuals.actual_amount, 0)::numeric(18,4) as actual_amount,
    coalesce(actuals.transaction_count, 0)::bigint as transaction_count
  from public.budgets b
  left join public.budget_lines bl
    on bl.budget_id = b.id
    and bl.household_id = b.household_id
    and bl.deleted_at is null
  left join public.categories c
    on c.id = bl.category_id
    and c.household_id = bl.household_id
    and c.deleted_at is null
  left join lateral (
    select
      sum(ta.amount_base_currency)::numeric(18,4) as actual_amount,
      count(distinct t.id)::bigint as transaction_count
    from public.transaction_allocations ta
    join public.transactions t
      on t.id = ta.transaction_id
      and t.household_id = ta.household_id
    join public.categories allocation_category
      on allocation_category.id = ta.category_id
      and allocation_category.household_id = ta.household_id
      and allocation_category.deleted_at is null
    left join public.categories parent_category
      on parent_category.id = allocation_category.parent_category_id
      and parent_category.household_id = allocation_category.household_id
      and parent_category.deleted_at is null
    where bl.id is not null
      and ta.household_id = p_household_id
      -- HH-2 (S18): budgets count shared rows only, for every member.
      and ta.private_owner_id is null
      and ta.category_id = bl.category_id
      and ta.allocation_type = 'expense'
      and t.status = 'posted'
      and t.deleted_at is null
      and t.transaction_date >= v_budget_month
      and t.transaction_date < v_next_month
      and allocation_category.exclude_from_reports = false
      and coalesce(parent_category.exclude_from_reports, false) = false
  ) actuals on true
  where b.household_id = p_household_id
    and b.budget_month = v_budget_month
    and b.deleted_at is null
  order by
    c.sort_order nulls last,
    c.name asc,
    bl.created_at asc;
end;
$$;

create or replace function public.get_budget_line_carryovers(
  p_household_id uuid,
  p_budget_month date
)
returns table (
  category_id uuid,
  carryover_amount numeric(18,4)
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_budget_month date;
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if p_budget_month is null then
    raise exception 'budget_month is required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized to read budgets for this household';
  end if;

  v_budget_month := date_trunc('month', p_budget_month)::date;

  return query
  with rollover_lines as (
    select
      bl.category_id,
      b.budget_month,
      (b.budget_month + interval '1 month')::date as next_month,
      bl.planned_amount
    from public.budget_lines bl
    join public.budgets b
      on b.id = bl.budget_id
      and b.household_id = bl.household_id
      and b.deleted_at is null
    where bl.household_id = p_household_id
      and bl.deleted_at is null
      and bl.rollover_enabled = true
      and b.budget_month < v_budget_month
  ),
  monthly as (
    select
      rl.category_id,
      rl.planned_amount,
      coalesce((
        select sum(ta.amount_base_currency)
        from public.transaction_allocations ta
        join public.transactions t
          on t.id = ta.transaction_id
          and t.household_id = ta.household_id
        join public.categories ac
          on ac.id = ta.category_id
          and ac.household_id = ta.household_id
          and ac.deleted_at is null
        left join public.categories pc
          on pc.id = ac.parent_category_id
          and pc.household_id = ac.household_id
          and pc.deleted_at is null
        where ta.household_id = p_household_id
          -- HH-2 (S18): budgets count shared rows only, for every member.
          and ta.private_owner_id is null
          and ta.category_id = rl.category_id
          and ta.allocation_type = 'expense'
          and t.status = 'posted'
          and t.deleted_at is null
          and t.transaction_date >= rl.budget_month
          and t.transaction_date < rl.next_month
          and ac.exclude_from_reports = false
          and coalesce(pc.exclude_from_reports, false) = false
      ), 0)::numeric(18,4) as actual_amount
    from rollover_lines rl
  )
  select
    m.category_id,
    sum(m.planned_amount - m.actual_amount)::numeric(18,4) as carryover_amount
  from monthly m
  group by m.category_id;
end;
$$;

create or replace function public.get_budget_previous_actuals(
  p_household_id uuid,
  p_budget_month date
)
returns table (
  category_id uuid,
  actual_amount numeric(18,4),
  transaction_count bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_budget_month date;
  v_previous_month date;
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if p_budget_month is null then
    raise exception 'budget_month is required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized to read budgets for this household';
  end if;

  v_budget_month := date_trunc('month', p_budget_month)::date;
  v_previous_month := (v_budget_month - interval '1 month')::date;

  return query
  with budgeted_categories as (
    select distinct bl.category_id
    from public.budget_lines bl
    join public.budgets b
      on b.id = bl.budget_id
      and b.household_id = bl.household_id
      and b.deleted_at is null
    where bl.household_id = p_household_id
      and bl.deleted_at is null
      and bl.category_id is not null
      and b.budget_month = v_budget_month
  ),
  previous as (
    select
      ta.category_id,
      sum(ta.amount_base_currency) as actual_amount,
      count(distinct t.id) as transaction_count
    from public.transaction_allocations ta
    join public.transactions t
      on t.id = ta.transaction_id
      and t.household_id = ta.household_id
    join public.categories ac
      on ac.id = ta.category_id
      and ac.household_id = ta.household_id
      and ac.deleted_at is null
    left join public.categories pc
      on pc.id = ac.parent_category_id
      and pc.household_id = ac.household_id
      and pc.deleted_at is null
    where ta.household_id = p_household_id
      -- HH-2 (S18): budgets count shared rows only, for every member.
      and ta.private_owner_id is null
      and ta.allocation_type = 'expense'
      and t.status = 'posted'
      and t.deleted_at is null
      and t.transaction_date >= v_previous_month
      and t.transaction_date < v_budget_month
      and ac.exclude_from_reports = false
      and coalesce(pc.exclude_from_reports, false) = false
    group by ta.category_id
  )
  select
    bc.category_id,
    coalesce(p.actual_amount, 0)::numeric(18,4) as actual_amount,
    coalesce(p.transaction_count, 0)::bigint as transaction_count
  from budgeted_categories bc
  left join previous p
    on p.category_id = bc.category_id;
end;
$$;

create or replace function public.get_budget_payment_split(
  p_household_id uuid,
  p_budget_month date
)
returns table (
  payment_group text,
  actual_amount numeric(18,4),
  transaction_count bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_budget_month date;
  v_next_month date;
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if p_budget_month is null then
    raise exception 'budget_month is required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized to read budgets for this household';
  end if;

  v_budget_month := date_trunc('month', p_budget_month)::date;
  v_next_month := (v_budget_month + interval '1 month')::date;

  return query
  with budgeted_categories as (
    select distinct bl.category_id
    from public.budget_lines bl
    join public.budgets b
      on b.id = bl.budget_id
      and b.household_id = bl.household_id
      and b.deleted_at is null
    where bl.household_id = p_household_id
      and bl.deleted_at is null
      and bl.category_id is not null
      and b.budget_month = v_budget_month
  ),
  actuals as (
    select
      ta.transaction_id,
      ta.amount_base_currency
    from public.transaction_allocations ta
    join budgeted_categories bc
      on bc.category_id = ta.category_id
    join public.transactions t
      on t.id = ta.transaction_id
      and t.household_id = ta.household_id
    join public.categories ac
      on ac.id = ta.category_id
      and ac.household_id = ta.household_id
      and ac.deleted_at is null
    left join public.categories pc
      on pc.id = ac.parent_category_id
      and pc.household_id = ac.household_id
      and pc.deleted_at is null
    where ta.household_id = p_household_id
      -- HH-2 (S18): budgets count shared rows only, for every member.
      and ta.private_owner_id is null
      and ta.allocation_type = 'expense'
      and t.status = 'posted'
      and t.deleted_at is null
      and t.transaction_date >= v_budget_month
      and t.transaction_date < v_next_month
      and ac.exclude_from_reports = false
      and coalesce(pc.exclude_from_reports, false) = false
  ),
  attributed as (
    select
      a.transaction_id,
      a.amount_base_currency,
      case
        when acc.account_type in ('cash', 'checking', 'savings') then 'cash'
        when acc.account_type in ('credit_card', 'debt') then 'card'
        else 'other'
      end as payment_group
    from actuals a
    left join lateral (
      -- Negative entries first (the account the money left), largest outflow
      -- first; a refund has none, so its own credited account is chosen.
      select te.account_id
      from public.transaction_entries te
      where te.transaction_id = a.transaction_id
        and te.household_id = p_household_id
        -- the paying leg must be one every member sees (a mixed transfer's
        -- private leg would give its owner a different group)
        and te.private_owner_id is null
      order by
        (te.amount_account_currency < 0) desc,
        abs(te.amount_account_currency) desc,
        te.id
      limit 1
    ) paying on true
    left join public.accounts acc
      on acc.id = paying.account_id
      and acc.household_id = p_household_id
  )
  select
    bucket.payment_group,
    coalesce(sum(attr.amount_base_currency), 0)::numeric(18,4) as actual_amount,
    count(distinct attr.transaction_id)::bigint as transaction_count
  from (values ('cash'), ('card'), ('other')) as bucket(payment_group)
  left join attributed attr
    on attr.payment_group = bucket.payment_group
  group by bucket.payment_group;
end;
$$;
