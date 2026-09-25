-- ============================================================
-- Rumbo — fixture expectations (RUM-010b). LOCAL ONLY.
--
-- Run by scripts/db-local.mjs after supabase/local/fixtures.sql. Unlike
-- supabase/tests/ (portable: any household, including production), these
-- checks know the fixture's fixed ids and dates. They prove two things:
--   * the edge cases the backlog asks for really exist in the dataset (so a
--     fixture edit cannot silently hollow the suite out), and
--   * each one behaves: overpaid card, missing FX, zero-income month,
--     archived accounts, pending rows, a second member, and the one known
--     divergence between the Transactions list and the Dashboard.
--
-- Each `do` block is named by its `-- check:` line and passes by finishing.
-- Household A is __HOUSEHOLD_ID__ (substituted by the runner); B is fixed.
-- Balances are read as of 2026-09-30 so nothing depends on today's date.
-- ============================================================

-- check: fixtures contain the dataset RUM-010b asks for
do $$
declare
  a constant uuid := '__HOUSEHOLD_ID__';
  b constant uuid := '10000000-0000-4000-a000-00000000000b';
begin
  assert (select count(*) from public.households) = 2, 'expected 2 households';
  assert (select count(*) from public.transactions where household_id = a) >= 2500, 'A: expected ≥2500 transactions';
  assert (select count(*) from public.transactions where household_id = b) >= 700, 'B: expected ≥700 transactions';
  assert (select count(*) from public.accounts where household_id = a) between 20 and 30, 'A: expected 20–30 accounts';
  assert (select max(transaction_date) - min(transaction_date) from public.transactions where household_id = a) >= 3 * 365, 'A: expected ≥3 years of history';
  assert exists (select 1 from public.transactions where household_id = a and status = 'voided'), 'A: no voided transactions';
  assert exists (select 1 from public.transactions where household_id = a and status = 'pending'), 'A: no pending transactions';
  assert exists (select 1 from public.transactions where household_id = a and transaction_type = 'refund'), 'A: no refunds';
  assert exists (select 1 from public.transactions where household_id = a and transaction_type = 'opening_balance'), 'A: no opening balances';
  assert exists (
    select 1 from public.transactions t
    join public.transaction_entries e on e.transaction_id = t.id
    where t.household_id = a and t.transaction_type = 'transfer'
    group by t.id having count(distinct e.currency_code) > 1
  ), 'A: no cross-currency transfer';
  assert exists (select 1 from public.accounts where household_id = a and is_archived), 'A: no archived account';
  assert exists (select 1 from public.accounts where household_id = a and not include_in_net_worth), 'A: no net-worth-excluded account';
  assert exists (select 1 from public.accounts where household_id = a and currency_code = 'COP'), 'A: no COP account';
  assert exists (select 1 from public.debts where household_id = a), 'A: no debt';
  assert exists (select 1 from public.budgets where household_id = a), 'A: no budget';
end $$;

-- Every household-scoped table (any public table with a household_id column)
-- has at least one row in BOTH households, so "a non-member sees zero rows" in
-- rum_010b_household_isolation.sql is never trivially true. A new
-- household-scoped table fails this until the fixtures seed it — and should
-- then be added to the isolation check too.
-- check: every household-scoped table has rows in both fixture households
do $$
declare
  t text;
  n_a bigint;
  n_b bigint;
  empty text[] := '{}';
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'household_id' and tb.table_type = 'BASE TABLE'
    order by 1
  loop
    execute format('select count(*) filter (where household_id = %L), count(*) filter (where household_id = %L) from public.%I',
      '__HOUSEHOLD_ID__', '10000000-0000-4000-a000-00000000000b', t) into n_a, n_b;
    if n_a = 0 or n_b = 0 then empty := empty || format('%s (A=%s, B=%s)', t, n_a, n_b); end if;
  end loop;
  assert cardinality(empty) = 0, 'household-scoped tables with no fixture rows: ' || array_to_string(empty, ', ');
end $$;

-- check: overpaid credit card holds a positive (favourable) balance
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
  assert (
    select posted_balance_account_currency > 0 and account_class = 'liability'
    from public.get_account_balances('__HOUSEHOLD_ID__'::uuid, date '2026-09-30')
    where account_id = '20000000-0000-4000-a000-000000000007'
  ), 'Mastercard (overpaid) should be a liability with a positive balance';
  assert (
    select posted_balance_account_currency < 0
    from public.get_account_balances('__HOUSEHOLD_ID__'::uuid, date '2026-09-30')
    where account_id = '20000000-0000-4000-a000-000000000006'
  ), 'Visa should owe money (negative balance)';
end $$;

-- check: missing FX (EUR, no rate on file) falls back to the historical entry sum
do $$
declare
  v_base numeric;
  v_entries numeric;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
  assert not exists (
    select 1 from public.exchange_rates
    where household_id = '__HOUSEHOLD_ID__'::uuid and from_currency_code = 'EUR'
  ), 'the EUR missing-FX case needs NO EUR rate on file';
  select posted_balance_base_currency into v_base
  from public.get_account_balances('__HOUSEHOLD_ID__'::uuid, date '2026-09-30')
  where account_id = '20000000-0000-4000-a000-000000000014';
  select sum(e.amount_base_currency) into v_entries
  from public.transaction_entries e
  join public.transactions t on t.id = e.transaction_id
  where e.account_id = '20000000-0000-4000-a000-000000000014'
    and t.status = 'posted' and t.deleted_at is null and t.transaction_date <= date '2026-09-30';
  assert abs(v_base - v_entries) < 0.01, format('EUR base %s should equal the entry sum %s', v_base, v_entries);
end $$;

-- check: a COP balance revalues at the COP→CAD rate on file for the snapshot date
do $$
declare
  v_account numeric;
  v_base numeric;
  v_rate numeric;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
  select posted_balance_account_currency, posted_balance_base_currency into v_account, v_base
  from public.get_account_balances('__HOUSEHOLD_ID__'::uuid, date '2026-09-30')
  where account_id = '20000000-0000-4000-a000-000000000010';
  select rate into v_rate
  from public.exchange_rates
  where household_id = '__HOUSEHOLD_ID__'::uuid and from_currency_code = 'COP' and to_currency_code = 'CAD'
    and rate_date <= date '2026-09-30'
  order by rate_date desc limit 1;
  assert abs(v_base - v_account * v_rate) < 0.01,
    format('Bancolombia base %s should be %s COP × %s', v_base, v_account, v_rate);
end $$;

-- check: household B's zero-income month has savings rate null, not 0 or an error
do $$
declare
  s record;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000b1","role":"authenticated"}', true);
  select * into s from public.get_monthly_dashboard_summary('10000000-0000-4000-a000-00000000000b', date '2025-02-01');
  assert s.monthly_income = 0, format('expected zero income in 2025-02, got %s', s.monthly_income);
  assert s.monthly_expenses > 0, 'expected expenses in 2025-02';
  assert s.savings_rate is null, format('savings rate must be null with zero income, got %s', s.savings_rate);
  assert s.monthly_savings = -s.monthly_expenses, 'savings must be −expenses when income is zero';
end $$;

-- check: archived accounts leave the as-of balances unless explicitly included
do $$
declare
  archived uuid[] := array['20000000-0000-4000-a000-000000000009', '20000000-0000-4000-a000-000000000018']::uuid[];
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
  assert not exists (
    select 1 from public.get_account_balances_as_of_many('__HOUSEHOLD_ID__'::uuid, array[date '2026-09-30'], false)
    where account_id = any (archived)
  ), 'archived accounts must not appear when include_archived is false';
  assert (
    select count(distinct account_id) from public.get_account_balances_as_of_many('__HOUSEHOLD_ID__'::uuid, array[date '2026-09-30'], true)
    where account_id = any (archived)
  ) = 2, 'archived accounts must appear when include_archived is true';
end $$;

-- check: pending rows stay out of the dashboard but are counted by the list
do $$
declare
  v_dashboard numeric;
  v_posted numeric;
  v_pending bigint;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
  select monthly_income into v_dashboard
  from public.get_monthly_dashboard_summary('__HOUSEHOLD_ID__'::uuid, date '2026-09-01');
  select sum(ta.amount_base_currency) into v_posted
  from public.transactions t join public.transaction_allocations ta on ta.transaction_id = t.id
  where t.household_id = '__HOUSEHOLD_ID__'::uuid and t.status = 'posted' and ta.allocation_type = 'income'
    and t.transaction_date between date '2026-09-01' and date '2026-09-30';
  assert v_dashboard = v_posted, format('dashboard income %s should equal posted income %s', v_dashboard, v_posted);
  select max(total_pending) into v_pending
  from public.search_household_transactions('__HOUSEHOLD_ID__'::uuid, date '2026-09-01', date '2026-09-30',
    null, null, null, null, null, null, null, null, 50, 0);
  assert v_pending >= 2, format('the list should count the 2 pending rows, got %s', v_pending);
end $$;

-- check: a second member sees exactly what the owner sees
do $$
declare
  owner_view record;
  member_view record;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
  select monthly_income, monthly_expenses into owner_view
  from public.get_monthly_dashboard_summary('__HOUSEHOLD_ID__'::uuid, date '2026-08-01');
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a2","role":"authenticated"}', true);
  select monthly_income, monthly_expenses into member_view
  from public.get_monthly_dashboard_summary('__HOUSEHOLD_ID__'::uuid, date '2026-08-01');
  assert owner_view = member_view, format('owner %s vs member %s', owner_view, member_view);
end $$;

-- B-8 (decided 2026-09-25): the Transactions page's "Expenses" total nets
-- BR-040 refunds, like the Dashboard. Restricted to posted rows (the list also
-- counts pending, deliberately), the two now agree to the cent every month —
-- the fixtures have refunds in a third of the months, so this is not vacuous.
-- check: Transactions list expenses (posted) = Dashboard expenses, every month (refunds netted)
do $$
declare
  m date;
  v_list numeric;
  v_dashboard numeric;
  v_refund_months int := 0;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
  for m in select g::date from generate_series(date '2022-10-01', date '2026-09-01', interval '1 month') g loop
    select coalesce(max(total_expense_base), 0) into v_list
    from public.search_household_transactions('__HOUSEHOLD_ID__'::uuid, m, (m + interval '1 month - 1 day')::date,
      null, array['posted'], null, null, null, null, null, null, 1, 0);
    select monthly_expenses into v_dashboard
    from public.get_monthly_dashboard_summary('__HOUSEHOLD_ID__'::uuid, m);
    assert round(v_list, 4) = round(v_dashboard, 4),
      format('%s: list expenses %s ≠ dashboard expenses %s', m, v_list, v_dashboard);
    if exists (
      select 1 from public.transactions
      where household_id = '__HOUSEHOLD_ID__'::uuid and transaction_type = 'refund' and status = 'posted'
        and transaction_date >= m and transaction_date < (m + interval '1 month')::date
    ) then v_refund_months := v_refund_months + 1; end if;
  end loop;
  assert v_refund_months >= 10, format('expected refunds in ≥10 months, found %s', v_refund_months);
end $$;
