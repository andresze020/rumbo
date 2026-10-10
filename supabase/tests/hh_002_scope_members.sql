-- rumbo-test: run-as=co-member
-- ============================================================
-- Rumbo — HH-2 household numbers are the same for every member
-- (docs/features/household-sharing.md D3, SCP-2, S18).
--
-- Runs as one active member (the caller) and repeats each read as another
-- (__SUBJECT_USER_ID__) by switching the request's JWT claims, as
-- hh_001_private_isolation.sql does for balances. Locally: in household A, as
-- A2 about A1 and as A1 about A2 — both own private accounts, private income
-- and expenses, and mixed transfers (fixture-expectations.sql), so a leak in
-- either direction changes one side. Live: with --co-member and --subject.
--
-- 1. Scope household returns exactly the same rows to both members, in every
--    reporting RPC with a scope, across 2025-01 … 2026-12. The fixtures give
--    A1 and A2 private rows of equal amounts in unbudgeted months, so the
--    check first plants a distinctive private expense and income of the
--    subject's in a budgeted month (rolled back): a leak of either member's
--    private side then shows as a difference.
-- 2. The budget RPCs (no scope) return the same rows to both members.
-- 3. Non-vacuous: scope all differs between the two (each sees their own
--    private side), so the identity in 1 is not an accident of empty data.
-- ============================================================

-- check: HH-2 scope household returns the same rows to every member, in every reporting RPC
begin;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  me constant text := (select auth.uid())::text;
  ccy text := (select h.base_currency from public.households h where h.id = hh);
  q text;
  mine jsonb;
  theirs jsonb;
  v_month date;
  v_expense_cat uuid;
  v_income_cat uuid;
  v_account uuid;
begin
  select b.budget_month, bl.category_id into v_month, v_expense_cat
  from public.budgets b
  join public.budget_lines bl on bl.budget_id = b.id and bl.deleted_at is null
  join public.categories c on c.id = bl.category_id and c.category_type = 'expense'
  where b.household_id = hh and b.deleted_at is null
  order by b.budget_month desc, bl.category_id
  limit 1;
  select c.id into v_income_cat from public.categories c
  where c.household_id = hh and c.category_type = 'income' and c.deleted_at is null and not c.is_archived
  order by c.sort_order limit 1;

  if v_month is not null and v_income_cat is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', '__SUBJECT_USER_ID__', 'role', 'authenticated')::text, true);
    insert into public.accounts (household_id, name, account_type, account_class, currency_code, private_owner_id, created_by)
    values (hh, 'HH-2 subject probe', 'cash', 'asset', ccy, '__SUBJECT_USER_ID__', '__SUBJECT_USER_ID__')
    returning id into v_account;
    perform public.create_manual_transaction(hh, 'expense', v_month + 11, v_account, v_expense_cat, 123.45,
      'HH-2 subject private expense', null, null, 'posted', 1, null);
    perform public.create_manual_transaction(hh, 'income', v_month + 12, v_account, v_income_cat, 67.89,
      'HH-2 subject private income', null, null, 'posted', 1, null);
    perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  end if;

  foreach q in array array[
    'select jsonb_agg(to_jsonb(b) order by b.account_id) from public.get_account_balances($1, ''household'') b',
    'select jsonb_agg(to_jsonb(b) order by b.account_id) from public.get_account_balances($1, date ''2026-09-30'', ''household'') b',
    'select jsonb_agg(to_jsonb(b) order by b.as_of_date, b.account_id)
       from public.get_account_balances_as_of_many($1, array[date ''2025-03-31'', date ''2025-12-31'', date ''2026-09-30''], true, ''household'') b',
    'select jsonb_agg(to_jsonb(s) order by g) from generate_series(date ''2025-01-01'', date ''2026-12-01'', interval ''1 month'') g
       cross join lateral public.get_monthly_dashboard_summary($1, g::date, ''household'') s',
    'select jsonb_agg(to_jsonb(e) order by g, e.category_id) from generate_series(date ''2025-01-01'', date ''2026-12-01'', interval ''1 month'') g
       cross join lateral public.get_monthly_expenses_by_category($1, g::date, ''household'') e',
    'select jsonb_agg(to_jsonb(c) order by c.account_id) from public.get_card_cycle_summaries($1, date ''2026-09-30'', ''household'') c',
    'select jsonb_agg(to_jsonb(r) order by r.id)
       from public.search_household_transactions($1, null, null, null, null, null, null, null, null, null, null, 1000000, 0, ''household'') r',
    'select jsonb_agg(to_jsonb(p) order by p.id) from public.get_payees_with_stats($1, ''household'') p',
    'select jsonb_agg(to_jsonb(t) order by t.id) from public.get_tags_with_stats($1, ''household'') t',
    -- budgets take no scope: shared rows only, for everyone (S18)
    'select jsonb_agg(to_jsonb(d) order by g, d.category_id) from generate_series(date ''2025-01-01'', date ''2026-12-01'', interval ''1 month'') g
       cross join lateral public.get_monthly_budget_details($1, g::date) d',
    'select jsonb_agg(to_jsonb(c) order by g, c.category_id) from generate_series(date ''2025-01-01'', date ''2026-12-01'', interval ''1 month'') g
       cross join lateral public.get_budget_line_carryovers($1, g::date) c',
    'select jsonb_agg(to_jsonb(p) order by g, p.category_id) from generate_series(date ''2025-01-01'', date ''2026-12-01'', interval ''1 month'') g
       cross join lateral public.get_budget_previous_actuals($1, g::date) p',
    'select jsonb_agg(to_jsonb(s) order by g, s.payment_group) from generate_series(date ''2025-01-01'', date ''2026-12-01'', interval ''1 month'') g
       cross join lateral public.get_budget_payment_split($1, g::date) s'
  ] loop
    execute q into mine using hh;

    perform set_config('request.jwt.claims',
      json_build_object('sub', '__SUBJECT_USER_ID__', 'role', 'authenticated')::text, true);
    execute q into theirs using hh;
    perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);

    if mine is distinct from theirs then
      raise exception 'household differs between members for: %', q;
    end if;
  end loop;
end $$;
rollback;

-- Non-vacuous: with scope all each member also sees their own private side,
-- so the two differ. If they did not, the identity above would prove nothing.
-- check: HH-2 scope all differs between members (each sees their own private side)
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  me constant text := (select auth.uid())::text;
  q text;
  mine jsonb;
  theirs jsonb;
begin
  -- Live, a member may own nothing private; locally both do (fixture-expectations).
  if not exists (
    select 1 from public.accounts a where a.household_id = hh and a.private_owner_id = (select auth.uid())
  ) then
    return;
  end if;

  foreach q in array array[
    -- ids, not totals: the fixtures give A1 and A2 private rows of equal amounts
    'select jsonb_agg(b.account_id order by b.account_id) from public.get_account_balances($1, ''all'') b',
    'select jsonb_agg(p.id order by p.id) from public.get_payees_with_stats($1, ''all'') p',
    'select jsonb_agg(r.id order by r.id)
       from public.search_household_transactions($1, null, null, null, null, null, null, null, null, null, null, 1000000, 0, ''all'') r'
  ] loop
    execute q into mine using hh;
    perform set_config('request.jwt.claims',
      json_build_object('sub', '__SUBJECT_USER_ID__', 'role', 'authenticated')::text, true);
    execute q into theirs using hh;
    perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);

    if mine is not distinct from theirs then
      raise exception 'setup: scope all is the same for both members (no private data to tell them apart): %', q;
    end if;
  end loop;
end $$;
