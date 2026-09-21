-- ============================================================
-- Rumbo — Multi-date account balances (RUM-006)
-- Target: Supabase / PostgreSQL
-- ------------------------------------------------------------
-- RUM-001's baseline found `get_account_balances(household, as_of_date)`
-- costs the same no matter how narrow `as_of_date` is — it has no lower date
-- bound, so it re-aggregates the household's ENTIRE ledger on every call
-- (measured: 36 778 buffers / 192 ms for one date, on a 4 688-transaction
-- household; 71% of all database time on the project). Net worth calls it
-- 7 times per load (the selected month + 6 evolution months), Dashboard 2,
-- Accounts 2 — each call redoing the same full-ledger scan from scratch.
--
-- This adds `get_account_balances_as_of_many`, which takes an ARRAY of as-of
-- dates and returns one row per (date, account). The ledger is aggregated
-- into a per-account running total ONCE, in one pass ordered by date; each
-- requested date is then a lookup into that same running series rather than
-- a fresh scan. Measured against the same household: 7 dates in 207-247 ms
-- and ~34 800 buffers total — the cost of roughly ONE single-date call, not
-- seven. See docs/performance-ux-execution-status.md for the full before/after
-- and docs/performance-baseline.md for the method.
--
-- `p_include_archived` unifies the two existing overloads' differing
-- archived-account behaviour (the 2-arg overload excludes them; the 1-arg
-- "today" overload — Accounts' primary balance read — includes them) behind
-- one parameter, so Accounts' two calls (today, include archived + previous
-- month-end, exclude archived) can also become one.
--
-- Every account gets an explicit zero-balance row dated at the epoch
-- ('0001-01-01'), UNIONed in before the real entries. Without it, an as-of
-- date before an account's first entry (a new account, or evolution months
-- that predate it) would match NO row and the account would silently vanish
-- from that date's results instead of reading zero — caught by testing an
-- as-of date before this repository's own test household existed.
--
-- ADDITIVE ONLY. `get_account_balances(uuid, date)` and
-- `get_account_balances(uuid)` are untouched: every other caller
-- (plan, debts, debt-planner, export, trend-actions, the AI assistant tool)
-- keeps working exactly as before. Only the three call sites this ticket
-- targets — Dashboard, Net worth, Accounts — move to the new function.
--
-- Depends on: public.accounts, public.transaction_entries, public.transactions,
-- public.households, public.exchange_rates, public.is_household_member(uuid),
-- public.get_exchange_rate_as_of(uuid, varchar, varchar, date) (from
-- 20260817120000_balance_fx_revaluation.sql).
--
-- Rollback: `drop function if exists public.get_account_balances_as_of_many(uuid, date[], boolean);`
-- Nothing else references this function, so dropping it is safe and reverts
-- the app to needing its call sites rolled back to the per-date overloads
-- (this migration does not touch app code).
-- ============================================================

create or replace function public.get_account_balances_as_of_many(
  p_household_id uuid,
  p_as_of_dates date[],
  p_include_archived boolean default false
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

grant execute on function public.get_account_balances_as_of_many(uuid, date[], boolean)
to authenticated;
