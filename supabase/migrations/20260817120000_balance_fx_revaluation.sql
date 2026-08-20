-- ============================================================
-- App Finanzas — Balance FX revaluation
-- Target: Supabase / PostgreSQL
-- ------------------------------------------------------------
-- A foreign-currency account's balance in base currency was
-- `sum(transaction_entries.amount_base_currency)` — every movement frozen at
-- the rate it was booked at. That is a **cost basis**, not what the account is
-- worth, and the two diverge without limit as rates move. A COP account holding
-- 29 262 996 COP read as ≈ 9 647 CAD (the blended rate of four years of
-- history) while the same pesos were worth ≈ 13 278 CAD that morning.
--
-- The distinction this migration draws:
--   * A **stock** (an account balance, at a point in time) is revalued at the
--     rate in effect on that date: balance_account_currency × rate.
--   * A **flow** (income, expense, a budget line) keeps the rate of its own
--     transaction date. Last year's groceries are not restated at today's rate.
-- So only the balance functions change. `transaction_entries` and
-- `transaction_allocations` are untouched, and every report and budget built on
-- allocations reads exactly as before.
--
-- Rates come from the household's `exchange_rates` table via the BR-002 lookup
-- contract, which was built for precisely this ("future ... net-worth FX policy
-- can build on the same lookup contract") and until now had no reader.
--
-- FALLBACK: when the household has no usable rate for a pair at or before the
-- date, the base-currency columns fall back to the historical sum — the exact
-- behaviour of today. A household that never enters a rate sees no change.
--
-- Adds `base_conversion_rate` / `base_conversion_rate_date` to both overloads so
-- the UI can say which rate a figure used, and flag the ones that fell back.
--
-- NOTE (function overload trap): both overloads gain columns, so each is
-- DROPped before being recreated — `create or replace` cannot change a
-- `returns table` shape.
--
-- Depends on: public.accounts, public.transaction_entries, public.transactions,
-- public.households, public.exchange_rates, public.is_household_member(uuid).
-- ============================================================

-- ── 1. Rate lookup that also reports the rate's date ────────────────────────
-- Same lookup order as get_exchange_rate (exact-or-latest-prior on the direct
-- pair, then the inverse of the reverse pair), but it returns the rate_date too
-- so a caller can tell a live rate from a stale one. get_exchange_rate is
-- rewritten below as a thin wrapper over this, so there is one implementation.
create or replace function public.get_exchange_rate_as_of(
  p_household_id uuid,
  p_from_currency varchar(3),
  p_to_currency varchar(3),
  p_rate_date date
)
returns table (
  rate numeric(18,8),
  rate_date date
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_from_currency varchar(3);
  v_to_currency varchar(3);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if p_rate_date is null then
    raise exception 'rate_date is required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized to read exchange rates for this household';
  end if;

  v_from_currency := upper(nullif(trim(coalesce(p_from_currency, '')), ''));
  v_to_currency := upper(nullif(trim(coalesce(p_to_currency, '')), ''));

  if v_from_currency is null or length(v_from_currency) <> 3 then
    raise exception 'from_currency is required';
  end if;

  if v_to_currency is null or length(v_to_currency) <> 3 then
    raise exception 'to_currency is required';
  end if;

  -- Same currency: rate 1, dated the day asked about (never a stale reading).
  if v_from_currency = v_to_currency then
    return query select 1::numeric(18,8), p_rate_date;
    return;
  end if;

  return query
  select er.rate, er.rate_date
  from public.exchange_rates er
  where er.household_id = p_household_id
    and er.from_currency_code = v_from_currency
    and er.to_currency_code = v_to_currency
    and er.rate_date <= p_rate_date
  order by er.rate_date desc, er.created_at desc
  limit 1;

  if found then
    return;
  end if;

  return query
  select (1 / er.rate)::numeric(18,8), er.rate_date
  from public.exchange_rates er
  where er.household_id = p_household_id
    and er.from_currency_code = v_to_currency
    and er.to_currency_code = v_from_currency
    and er.rate_date <= p_rate_date
  order by er.rate_date desc, er.created_at desc
  limit 1;
end;
$$;

grant execute on function public.get_exchange_rate_as_of(uuid, varchar, varchar, date)
to authenticated;

-- get_exchange_rate keeps its exact signature and contract (null when no usable
-- rate exists); it now delegates so the lookup lives in one place.
create or replace function public.get_exchange_rate(
  p_household_id uuid,
  p_from_currency varchar(3),
  p_to_currency varchar(3),
  p_rate_date date
)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select r.rate
  from public.get_exchange_rate_as_of(
    p_household_id, p_from_currency, p_to_currency, p_rate_date
  ) r;
$$;

grant execute on function public.get_exchange_rate(uuid, varchar, varchar, date)
to authenticated;

-- ── 2. As-of balances, revalued ─────────────────────────────────────────────
drop function if exists public.get_account_balances(uuid, date);

create or replace function public.get_account_balances(
  p_household_id uuid,
  p_as_of_date date
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

grant execute on function public.get_account_balances(uuid, date)
to authenticated;

-- ── 3. "Right now" balances, revalued at today's rate ───────────────────────
-- The one-argument overload (the Accounts screen) is the original from
-- 20260601000500 and still live; it gets the same treatment, as of current_date,
-- and keeps including archived accounts the way it always has.
drop function if exists public.get_account_balances(uuid);

create or replace function public.get_account_balances(
  p_household_id uuid
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

grant execute on function public.get_account_balances(uuid)
to authenticated;
