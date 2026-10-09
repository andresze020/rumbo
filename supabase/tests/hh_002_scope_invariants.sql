-- ============================================================
-- Rumbo — HH-2 scope invariants (docs/features/household-sharing.md D3,
-- SCP-2, §7 HH-2, S18).
--
-- Runs as one member (no directive): locally as each fixture household's
-- owner, live with --user. "household is identical for every member" needs a
-- second member and lives in hh_002_scope_members.sql (run-as=co-member).
--
-- 1. household + mine = all, for every summable output of every reporting
--    RPC: the account / allocation / payee sets split exactly in two and the
--    amounts add up.
-- 2. Budgets count shared rows only: a private expense in a budgeted category
--    and month changes nothing in the four budget RPCs; a shared one does.
-- 3. An unknown scope is refused, not read as some default.
--
-- Months span 2025-01 … 2026-12: the fixtures' private rows are dated 2025,
-- the shared history 2026.
-- ============================================================

-- ── 1. household + mine = all ────────────────────────────────────────────

-- check: HH-2 balances split exactly into household + mine (get_account_balances, both overloads, as_of_many)
with params as (select '__HOUSEHOLD_ID__'::uuid as hh),
h as (select * from public.get_account_balances((select hh from params), 'household')),
m as (select * from public.get_account_balances((select hh from params), 'mine')),
a as (select * from public.get_account_balances((select hh from params), 'all')),
hd as (select * from public.get_account_balances((select hh from params), date '2026-09-30', 'household')),
md as (select * from public.get_account_balances((select hh from params), date '2026-09-30', 'mine')),
ad as (select * from public.get_account_balances((select hh from params), date '2026-09-30', 'all')),
dates as (select array[date '2025-03-31', date '2025-12-31', date '2026-09-30'] as ds),
hm as (select * from public.get_account_balances_as_of_many((select hh from params), (select ds from dates), true, 'household')),
mm as (select * from public.get_account_balances_as_of_many((select hh from params), (select ds from dates), true, 'mine')),
am as (select * from public.get_account_balances_as_of_many((select hh from params), (select ds from dates), true, 'all'))
select
  'HH-2 balances split exactly into household + mine (get_account_balances, both overloads, as_of_many)' as check_name,
  -- mine is empty exactly when the caller owns no private account (household B;
  -- household A's members both do, so the split is exercised there)
  exists (select 1 from m) = exists (select 1 from public.accounts x where x.household_id = (select hh from params) and x.private_owner_id = (select auth.uid()))
  -- one-argument overload
  and (select count(*) from h) + (select count(*) from m) = (select count(*) from a)
  and not exists (select account_id from a except (select account_id from h union all select account_id from m))
  and not exists (select account_id from h intersect select account_id from m)
  and (select coalesce(sum(posted_balance_base_currency), 0) from h)
    + (select coalesce(sum(posted_balance_base_currency), 0) from m)
    = (select coalesce(sum(posted_balance_base_currency), 0) from a)
  -- dated overload
  and (select count(*) from hd) + (select count(*) from md) = (select count(*) from ad)
  and not exists (select account_id from ad except (select account_id from hd union all select account_id from md))
  and (select coalesce(sum(posted_balance_base_currency), 0) from hd)
    + (select coalesce(sum(posted_balance_base_currency), 0) from md)
    = (select coalesce(sum(posted_balance_base_currency), 0) from ad)
  -- multi-date
  and (select count(*) from hm) + (select count(*) from mm) = (select count(*) from am)
  and not exists (
    select as_of_date, account_id from am
    except (select as_of_date, account_id from hm union all select as_of_date, account_id from mm)
  )
  and (select coalesce(sum(posted_balance_base_currency), 0) from hm)
    + (select coalesce(sum(posted_balance_base_currency), 0) from mm)
    = (select coalesce(sum(posted_balance_base_currency), 0) from am)
  as passed;

-- check: HH-2 monthly income, expenses and every category split into household + mine
with params as (select '__HOUSEHOLD_ID__'::uuid as hh),
months as (
  select g::date as m
  from generate_series(date '2025-01-01', date '2026-12-01', interval '1 month') g
),
s as (
  select months.m, sc.scope, sm.monthly_income, sm.monthly_expenses
  from months
  cross join (values ('household'), ('mine'), ('all')) sc(scope)
  cross join lateral public.get_monthly_dashboard_summary((select hh from params), months.m, sc.scope) sm
),
c as (
  select months.m, sc.scope, e.category_id, e.amount_base_currency
  from months
  cross join (values ('household'), ('mine'), ('all')) sc(scope)
  cross join lateral public.get_monthly_expenses_by_category((select hh from params), months.m, sc.scope) e
),
c_sum as (
  select m, category_id,
    coalesce(sum(amount_base_currency) filter (where scope = 'household'), 0)
      + coalesce(sum(amount_base_currency) filter (where scope = 'mine'), 0) as parts,
    coalesce(sum(amount_base_currency) filter (where scope = 'all'), 0) as whole
  from c
  group by m, category_id
)
select
  'HH-2 monthly income, expenses and every category split into household + mine' as check_name,
  -- some month has private income or expense exactly when the caller owns a
  -- private account (both members of household A do)
  exists (select 1 from s where scope = 'mine' and (monthly_income <> 0 or monthly_expenses <> 0))
    = exists (select 1 from public.accounts x where x.household_id = (select hh from params) and x.private_owner_id = (select auth.uid()))
  and not exists (
    select 1
    from (
      select m,
        sum(monthly_income) filter (where scope in ('household', 'mine')) as parts_in,
        sum(monthly_income) filter (where scope = 'all') as whole_in,
        sum(monthly_expenses) filter (where scope in ('household', 'mine')) as parts_out,
        sum(monthly_expenses) filter (where scope = 'all') as whole_out
      from s group by m
    ) x
    where x.parts_in <> x.whole_in or x.parts_out <> x.whole_out
  )
  and not exists (select 1 from c_sum where parts <> whole)
  as passed;

-- check: HH-2 card cycles, payees and transaction totals split into household + mine
with params as (select '__HOUSEHOLD_ID__'::uuid as hh),
ch as (select account_id from public.get_card_cycle_summaries((select hh from params), date '2026-09-30', 'household')),
cm as (select account_id from public.get_card_cycle_summaries((select hh from params), date '2026-09-30', 'mine')),
ca as (select account_id from public.get_card_cycle_summaries((select hh from params), date '2026-09-30', 'all')),
ph as (select id from public.get_payees_with_stats((select hh from params), 'household')),
pm as (select id from public.get_payees_with_stats((select hh from params), 'mine')),
pa as (select id from public.get_payees_with_stats((select hh from params), 'all')),
t as (
  select sc.scope, r.total_income_base, r.total_expense_base
  from (values ('household'), ('mine'), ('all')) sc(scope)
  cross join lateral (
    select * from public.search_household_transactions(
      (select hh from params), null, null, null, null, null, null, null, null, null, null, 1, 0, sc.scope
    )
  ) r
)
select
  'HH-2 card cycles, payees and transaction totals split into household + mine' as check_name,
  -- a private card and payee exist exactly when the caller owns a private
  -- account (both members of household A do)
  (exists (select 1 from cm) and exists (select 1 from pm)) = exists (select 1 from public.accounts x where x.household_id = (select hh from params) and x.private_owner_id = (select auth.uid()))
  and (select count(*) from ch) + (select count(*) from cm) = (select count(*) from ca)
  and not exists (select account_id from ca except (select account_id from ch union all select account_id from cm))
  -- payees: household ∪ mine = all (a shared payee the caller's private
  -- transactions use is in both; its counts are checked below)
  and not exists (select id from pa except (select id from ph union select id from pm))
  and not exists ((select id from ph union select id from pm) except select id from pa)
  -- income and expense transactions have one entry, so they are never mixed:
  -- their totals add up even though a mixed transfer is listed in both scopes
  and (select sum(total_income_base) filter (where scope in ('household', 'mine')) from t)
    = (select total_income_base from t where scope = 'all')
  and (select sum(total_expense_base) filter (where scope in ('household', 'mine')) from t)
    = (select total_expense_base from t where scope = 'all')
  and ((select total_income_base from t where scope = 'mine') <> 0) = exists (select 1 from public.accounts x where x.household_id = (select hh from params) and x.private_owner_id = (select auth.uid()))
  as passed;

-- A private expense may reuse an existing shared payee (PRV-7: a private
-- context reuses rather than shadows a shared name). That payee then shows in
-- mine as well, and its counts still add up: household + mine = all, less the
-- caller's mixed transfers, which both count.
-- check: HH-2 a shared payee used by the caller's private expense counts in mine, and per-payee counts add up
begin;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  me constant uuid := (select auth.uid());
  ccy text := (select h.base_currency from public.households h where h.id = hh);
  v_cat uuid;
  v_private uuid;
  v_payee record;
  v_tx uuid;
  v_bad text;
begin
  select c.id into v_cat from public.categories c
  where c.household_id = hh and c.category_type = 'expense' and c.deleted_at is null and not c.is_archived
  order by c.sort_order limit 1;
  select p.id, p.name into v_payee from public.payees p
  where p.household_id = hh and p.private_owner_id is null and not p.is_archived
    and not exists (
      select 1 from public.payees q
      where q.household_id = hh and q.private_owner_id = me and lower(q.name) = lower(p.name)
    )
  order by p.name limit 1;
  if v_cat is null or v_payee.id is null then
    raise exception 'setup: no expense category or shared payee';
  end if;

  insert into public.accounts (household_id, name, account_type, account_class, currency_code, private_owner_id, created_by)
  values (hh, 'HH-2 payee probe', 'cash', 'asset', ccy, me, me)
  returning id into v_private;
  v_tx := public.create_manual_transaction(hh, 'expense', current_date, v_private, v_cat, 5,
    'HH-2 payee probe', null, null, 'posted', 1, v_payee.name);
  if (select payee_id from public.transactions where id = v_tx) <> v_payee.id then
    raise exception 'setup: the private expense did not reuse the shared payee';
  end if;

  if not exists (select 1 from public.get_payees_with_stats(hh, 'mine') m where m.id = v_payee.id and m.txn_count >= 1) then
    raise exception 'a shared payee used by the caller''s private expense is missing from mine';
  end if;

  select string_agg(a.name, ', ') into v_bad
  from public.get_payees_with_stats(hh, 'all') a
  left join public.get_payees_with_stats(hh, 'household') h on h.id = a.id
  left join public.get_payees_with_stats(hh, 'mine') m on m.id = a.id
  where a.txn_count <> coalesce(h.txn_count, 0) + coalesce(m.txn_count, 0) - (
    select count(*) from public.transactions t
    where t.payee_id = a.id and t.deleted_at is null
      and t.visibility = 'mixed' and t.private_owner_id = me
  );
  if v_bad is not null then
    raise exception 'per-payee counts do not add up (household + mine = all) for: %', v_bad;
  end if;
end $$;
rollback;

-- A mixed transfer is listed in every scope its viewer may see: household
-- (it touches a shared account) and mine (its private side is the caller's).
-- check: HH-2 the caller's mixed transfers are listed in household, mine and all
with params as (select '__HOUSEHOLD_ID__'::uuid as hh),
mixed as (
  select t.id from public.transactions t
  where t.household_id = (select hh from params)
    and t.visibility = 'mixed' and t.private_owner_id = (select auth.uid())
    and t.deleted_at is null
),
listed as (
  select sc.scope, r.id
  from (values ('household'), ('mine'), ('all')) sc(scope)
  cross join lateral public.search_household_transactions(
    (select hh from params), null, null, null, null, null, null, null, null, null, null, 1000000, 0, sc.scope
  ) r
)
select
  'HH-2 the caller''s mixed transfers are listed in household, mine and all' as check_name,
  exists (select 1 from mixed) = exists (select 1 from public.accounts x where x.household_id = (select hh from params) and x.private_owner_id = (select auth.uid()))
  and not exists (
    select 1 from mixed x
    cross join (values ('household'), ('mine'), ('all')) sc(scope)
    where not exists (select 1 from listed l where l.scope = sc.scope and l.id = x.id)
  )
  -- and nothing private shows in household
  and not exists (
    select 1 from listed l
    join public.transactions t on t.id = l.id
    where l.scope = 'household' and t.visibility = 'private'
  )
  as passed;

-- ── 2. Budgets count shared rows only ────────────────────────────────────

-- In a budgeted month and category: a private expense of the caller changes
-- nothing in any budget RPC (this month's details and payment split, next
-- month's carryover and "previous month" actuals); a shared one does.
-- check: HH-2 budgets ignore the caller's private expenses (details, carryovers, previous actuals, payment split)
begin;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  me constant uuid := (select auth.uid());
  ccy text := (select h.base_currency from public.households h where h.id = hh);
  v_month date;
  v_next date;
  v_cat uuid;
  v_shared uuid;
  v_private uuid;
  v_before jsonb;
  v_after jsonb;
begin
  select b.budget_month, bl.category_id into v_month, v_cat
  from public.budgets b
  join public.budget_lines bl on bl.budget_id = b.id and bl.deleted_at is null
  join public.categories c on c.id = bl.category_id and c.category_type = 'expense'
  where b.household_id = hh and b.deleted_at is null
  -- prefer a month followed by another budget, so next month's carryover and
  -- previous actuals are not empty
  order by
    exists (
      select 1 from public.budgets b2
      where b2.household_id = hh and b2.deleted_at is null
        and b2.budget_month = (b.budget_month + interval '1 month')::date
    ) desc,
    b.budget_month desc, bl.category_id
  limit 1;
  if v_month is null then
    raise exception 'setup: no budgeted expense category in the household';
  end if;
  v_next := (v_month + interval '1 month')::date;

  select a.id into v_shared from public.accounts a
  where a.household_id = hh and a.private_owner_id is null and a.deleted_at is null
    and not a.is_archived and a.currency_code = ccy and a.account_class = 'asset'
  order by a.created_at limit 1;

  insert into public.accounts (household_id, name, account_type, account_class, currency_code, private_owner_id, created_by)
  values (hh, 'HH-2 budget probe', 'cash', 'asset', ccy, me, me)
  returning id into v_private;

  -- One snapshot of everything the four budget RPCs return.
  v_before := jsonb_build_object(
    'details', (select jsonb_agg(to_jsonb(d) order by d.category_id) from public.get_monthly_budget_details(hh, v_month) d),
    'split', (select jsonb_agg(to_jsonb(s) order by s.payment_group) from public.get_budget_payment_split(hh, v_month) s),
    'carry', (select jsonb_agg(to_jsonb(c) order by c.category_id) from public.get_budget_line_carryovers(hh, v_next) c),
    'prev', (select jsonb_agg(to_jsonb(p) order by p.category_id) from public.get_budget_previous_actuals(hh, v_next) p)
  );

  perform public.create_manual_transaction(hh, 'expense', v_month + 9, v_private, v_cat, 77,
    'HH-2 private expense', null, null, 'posted', 1, null);

  v_after := jsonb_build_object(
    'details', (select jsonb_agg(to_jsonb(d) order by d.category_id) from public.get_monthly_budget_details(hh, v_month) d),
    'split', (select jsonb_agg(to_jsonb(s) order by s.payment_group) from public.get_budget_payment_split(hh, v_month) s),
    'carry', (select jsonb_agg(to_jsonb(c) order by c.category_id) from public.get_budget_line_carryovers(hh, v_next) c),
    'prev', (select jsonb_agg(to_jsonb(p) order by p.category_id) from public.get_budget_previous_actuals(hh, v_next) p)
  );
  if v_after is distinct from v_before then
    raise exception 'LEAK: a private expense changed the household budget: % -> %', v_before, v_after;
  end if;

  -- Non-vacuous: the same expense on a shared account does count.
  if v_shared is null then
    raise exception 'setup: no shared asset account in the household currency';
  end if;
  perform public.create_manual_transaction(hh, 'expense', v_month + 9, v_shared, v_cat, 77,
    'HH-2 shared expense', null, null, 'posted', 1, null);
  if (select jsonb_agg(to_jsonb(d) order by d.category_id) from public.get_monthly_budget_details(hh, v_month) d)
     = v_before -> 'details' then
    raise exception 'setup: a shared expense did not change the budget either';
  end if;
end $$;
rollback;

-- ── 3. An unknown scope is refused ───────────────────────────────────────

-- check: HH-2 every reporting RPC refuses an unknown scope
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  attempt text;
begin
  foreach attempt in array array[
    format('select count(*) from public.get_account_balances(%L, %L)', hh, 'everyone'),
    format('select count(*) from public.get_account_balances(%L, current_date, %L)', hh, 'everyone'),
    format('select count(*) from public.get_account_balances_as_of_many(%L, array[current_date], false, %L)', hh, 'everyone'),
    format('select count(*) from public.get_monthly_dashboard_summary(%L, date_trunc(''month'', current_date)::date, %L)', hh, 'everyone'),
    format('select count(*) from public.get_monthly_expenses_by_category(%L, date_trunc(''month'', current_date)::date, %L)', hh, 'everyone'),
    format('select count(*) from public.get_card_cycle_summaries(%L, current_date, %L)', hh, 'everyone'),
    format('select count(*) from public.search_household_transactions(%L, null, null, null, null, null, null, null, null, null, null, 1, 0, %L)', hh, 'everyone'),
    format('select count(*) from public.get_payees_with_stats(%L, %L)', hh, 'everyone'),
    format('select count(*) from public.get_tags_with_stats(%L, %L)', hh, 'everyone'),
    format('select count(*) from public.get_account_balances(%L, null::text)', hh)
  ] loop
    begin
      execute attempt;
      raise exception 'accepted an unknown scope: %', attempt;
    exception when others then
      if sqlerrm <> 'scope must be household, mine or all' then
        raise exception '% failed for the wrong reason: %', attempt, sqlerrm;
      end if;
    end;
  end loop;
end $$;
