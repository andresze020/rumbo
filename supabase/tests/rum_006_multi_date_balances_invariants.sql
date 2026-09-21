-- ============================================================
-- Rumbo — RUM-006 multi-date account balances invariants
-- ------------------------------------------------------------
-- Lightweight checks in the same style as `br_003_006_money_invariants.sql`:
-- replace `__HOUSEHOLD_ID__` with a real household id and run in the Supabase
-- SQL editor, or via `npm run db:test`. Every row must report `passed = true`.
--
-- `get_account_balances_as_of_many` (20260921120000_multi_date_account_
-- balances.sql) aggregates the ledger once and answers N as-of dates from
-- that single pass, instead of the N independent full-ledger scans the old
-- per-date RPC needed. These checks assert it is not just faster but
-- IDENTICAL to the two functions it replaces at Dashboard, Net worth and
-- Accounts' call sites — not close, not "close enough for a chart", exact
-- agreement on every account's posted/pending/projected balance, in both
-- account and base currency.
-- ============================================================

-- 1. Exact agreement with get_account_balances(household, date) — the
--    exclude-archived overload Dashboard and Net worth call. Checked at
--    today and 30 days ago: two different as-of dates, in one multi-date
--    call, each compared against its own single-date call.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
multi as (
  select *
  from public.get_account_balances_as_of_many(
    (select household_id from params),
    array[current_date, current_date - 30]
  )
),
single_today as (
  select *, current_date as as_of_date
  from public.get_account_balances((select household_id from params), current_date)
),
single_30d as (
  select *, current_date - 30 as as_of_date
  from public.get_account_balances((select household_id from params), current_date - 30)
),
single as (
  select * from single_today
  union all
  select * from single_30d
)
select
  'RUM-006 multi-date matches get_account_balances(household, date) exactly' as check_name,
  not exists (
    select 1
    from single s
    full outer join multi m
      on m.as_of_date = s.as_of_date and m.account_id = s.account_id
    where m.account_id is null
       or s.account_id is null
       or m.posted_balance_account_currency is distinct from s.posted_balance_account_currency
       or m.pending_balance_account_currency is distinct from s.pending_balance_account_currency
       or m.projected_balance_account_currency is distinct from s.projected_balance_account_currency
       or m.posted_balance_base_currency is distinct from s.posted_balance_base_currency
       or m.pending_balance_base_currency is distinct from s.pending_balance_base_currency
       or m.projected_balance_base_currency is distinct from s.projected_balance_base_currency
  ) as passed;

-- 2. Exact agreement with get_account_balances(household) — the
--    include-archived, current_date-only overload Accounts calls for its
--    primary balance list.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
multi as (
  select *
  from public.get_account_balances_as_of_many(
    (select household_id from params), array[current_date], true
  )
),
single as (
  select *
  from public.get_account_balances((select household_id from params))
)
select
  'RUM-006 multi-date (include_archived) matches get_account_balances(household) exactly' as check_name,
  not exists (
    select 1
    from single s
    full outer join multi m on m.account_id = s.account_id
    where m.account_id is null
       or s.account_id is null
       or m.posted_balance_account_currency is distinct from s.posted_balance_account_currency
       or m.pending_balance_account_currency is distinct from s.pending_balance_account_currency
       or m.projected_balance_account_currency is distinct from s.projected_balance_account_currency
       or m.posted_balance_base_currency is distinct from s.posted_balance_base_currency
       or m.pending_balance_base_currency is distinct from s.pending_balance_base_currency
       or m.projected_balance_base_currency is distinct from s.projected_balance_base_currency
  ) as passed;

-- 3. Every account reads zero for an as-of date before any activity could
--    exist, rather than being missing from the result. Caught during
--    development: without an explicit zero-floor row per account, an as-of
--    date before an account's first transaction matched no row at all and
--    the account silently vanished from that date instead of reading zero —
--    which Net worth's evolution chart would have shown as a household with
--    fewer accounts in earlier months, not as a smaller balance.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
active_accounts as (
  select count(*) as n from public.accounts
  where household_id = (select household_id from params)
    and deleted_at is null and is_archived = false
),
early as (
  select *
  from public.get_account_balances_as_of_many(
    (select household_id from params), array['0001-01-02'::date]
  )
)
select
  'RUM-006 a pre-history as-of date returns every account at zero, not missing' as check_name,
  (select count(*) from early) = (select n from active_accounts)
  and not exists (
    select 1 from early
    where posted_balance_account_currency <> 0
       or pending_balance_account_currency <> 0
       or projected_balance_account_currency <> 0
  ) as passed;

-- 4. p_include_archived actually toggles archived-account inclusion, rather
--    than being ignored. The two calls below differ only in that flag; the
--    difference in row count must be exactly the household's archived,
--    non-deleted account count.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
archived_accounts as (
  select count(*) as n from public.accounts
  where household_id = (select household_id from params)
    and deleted_at is null and is_archived = true
),
with_archived as (
  select count(*) as n
  from public.get_account_balances_as_of_many(
    (select household_id from params), array[current_date], true
  )
),
without_archived as (
  select count(*) as n
  from public.get_account_balances_as_of_many(
    (select household_id from params), array[current_date], false
  )
)
select
  'RUM-006 p_include_archived adds exactly the archived accounts' as check_name,
  (select n from with_archived) - (select n from without_archived) = (select n from archived_accounts)
  as passed;

-- 5. Bad input is rejected, not silently coerced into an empty or wrong
--    result. A null/empty dates array and a null element both raise.
do $$
declare
  v_household uuid := '__HOUSEHOLD_ID__'::uuid;
  v_raised_on_empty boolean := false;
  v_raised_on_null_element boolean := false;
begin
  begin
    perform * from public.get_account_balances_as_of_many(v_household, array[]::date[]);
  exception when others then
    v_raised_on_empty := true;
  end;

  begin
    perform * from public.get_account_balances_as_of_many(v_household, array[current_date, null]::date[]);
  exception when others then
    v_raised_on_null_element := true;
  end;

  if not (v_raised_on_empty and v_raised_on_null_element) then
    raise exception 'RUM-006 guard clauses did not reject bad input (empty=%, null element=%)',
      v_raised_on_empty, v_raised_on_null_element;
  end if;
end $$;

select 'RUM-006 guard clauses reject empty/null-containing date arrays' as check_name, true as passed;
