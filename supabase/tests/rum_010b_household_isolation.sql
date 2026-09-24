-- rumbo-test: run-as=non-member
-- ============================================================
-- Rumbo — RUM-010b household isolation ("every aggregate is scoped to exactly
-- one household"; no cross-household leakage).
--
-- The directive on line 1 tells scripts/db-test.mjs to run this file as a user
-- who is NOT a member of __HOUSEHOLD_ID__:
--   * against the live project: a fresh random uuid (a signed-in stranger);
--   * locally (npm run db:local): a real member of the OTHER fixture
--     household, the stronger case — a user with data of their own.
-- Everything below must be invisible or refused to that user.
--
-- Plain selects report `passed`. The `do` blocks are named by their
-- `-- check:` line and pass by finishing without an error; each one either
-- expects a refusal or verifies an empty result. The write probe can never
-- persist anything: a successful insert raises, which aborts its transaction.
-- ============================================================

select
  'RUM-010b non-member: is_household_member() is false' as check_name,
  not public.is_household_member('__HOUSEHOLD_ID__'::uuid) as passed;

select
  'RUM-010b non-member sees no row of the household in any household-scoped table' as check_name,
  (
    (select count(*) from public.households where id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.household_members where household_id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.accounts where household_id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.categories where household_id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.transactions where household_id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.transaction_entries where household_id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.transaction_allocations where household_id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.transaction_tags where household_id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.budgets where household_id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.budget_lines where household_id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.debts where household_id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.goals where household_id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.recurring_transactions where household_id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.exchange_rates where household_id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.payees where household_id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.tags where household_id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.notes where household_id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.month_closures where household_id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.installment_plans where household_id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.import_batches where household_id = '__HOUSEHOLD_ID__'::uuid)
    + (select count(*) from public.categorization_rules where household_id = '__HOUSEHOLD_ID__'::uuid)
  ) = 0 as passed;

-- The reporting RPCs the Dashboard, Accounts, Net worth and Transactions pages
-- call. Each must refuse (raise) or return nothing for a non-member.
-- check: RUM-010b non-member: every reporting RPC refuses or returns nothing
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  n bigint;
  fn text;
begin
  foreach fn in array array[
    'select count(*) from public.get_account_balances($1)',
    'select count(*) from public.get_account_balances($1, current_date)',
    'select count(*) from public.get_account_balances_as_of_many($1, array[current_date], true)',
    'select count(*) from public.get_monthly_dashboard_summary($1, current_date)',
    'select count(*) from public.get_monthly_expenses_by_category($1, current_date)',
    'select count(*) from public.get_monthly_budget_details($1, current_date)',
    'select count(*) from public.search_household_transactions($1, null, null, null, null, null, null, null, null, null, null, 50, 0)'
  ] loop
    begin
      execute fn into n using hh;
    exception when others then
      continue; -- refused: that is a pass for this RPC
    end;
    if n <> 0 then
      raise exception 'LEAK: % returned % row(s) to a non-member', fn, n;
    end if;
  end loop;
end $$;

-- check: RUM-010b non-member cannot write a transaction into the household
do $$
begin
  begin
    perform public.create_manual_transaction(
      '__HOUSEHOLD_ID__'::uuid, 'expense', current_date,
      (select id from public.accounts where household_id = '__HOUSEHOLD_ID__'::uuid limit 1),
      null, 1, 'isolation probe', null, null, 'posted', 1, null);
  exception when others then
    return; -- refused, as it must be
  end;
  raise exception 'LEAK: a non-member created a transaction in another household';
end $$;

-- check: RUM-010b non-member insert into transactions is rejected by RLS itself (42501)
do $$
begin
  begin
    insert into public.transactions (household_id, transaction_date, transaction_type, status, created_by)
    values ('__HOUSEHOLD_ID__'::uuid, current_date, 'expense', 'posted', auth.uid());
  exception
    when insufficient_privilege then
      return; -- row-level security refused it: the only acceptable outcome
    when others then
      raise exception 'expected an RLS refusal (42501), got % (%)', sqlstate, sqlerrm;
  end;
  raise exception 'LEAK: a non-member inserted a transaction row into another household';
end $$;
