-- ============================================================
-- App Finanzas — BR-019 Goals & funds correctness checks
-- Purpose: read-only SQL assertions for manual post-migration verification.
-- ============================================================
--
-- How to use:
-- 1. Apply migrations with `npx supabase db push`.
-- 2. Replace __HOUSEHOLD_ID__ with a real household UUID.
-- 3. Run as an authenticated member of that household.
-- 4. Every `passed` value should be true.
--
-- Section A below is read-only and safe to run against real data. Section B
-- exercises the apply_goal_adjustment RPC (the fix for the contribute/
-- withdraw race condition) inside a transaction that is always rolled back,
-- so it never leaves test data behind.

-- ------------------------------------------------------------
-- Section A — read-only invariants
-- ------------------------------------------------------------

with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'BR-019 goal amounts are non-negative and target is positive' as check_name,
  not exists (
    select 1
    from public.goals g
    where g.household_id = (select household_id from params)
      and (g.target_amount <= 0 or g.current_amount < 0)
  ) as passed;

with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'BR-019 completed goals have reached their target' as check_name,
  not exists (
    select 1
    from public.goals g
    where g.household_id = (select household_id from params)
      and g.status = 'completed'
      and g.current_amount < g.target_amount
  ) as passed;

with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'BR-019 linked accounts belong to the same household as the goal' as check_name,
  not exists (
    select 1
    from public.goals g
    join public.accounts a on a.id = g.linked_account_id
    where g.household_id = (select household_id from params)
      and g.linked_account_id is not null
      and a.household_id <> g.household_id
  ) as passed;

with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'BR-019 goal currency codes reference an existing currency' as check_name,
  not exists (
    select 1
    from public.goals g
    left join public.currencies c on c.code = g.currency_code
    where g.household_id = (select household_id from params)
      and c.code is null
  ) as passed;

-- ------------------------------------------------------------
-- Section B — apply_goal_adjustment RPC behavior
-- ------------------------------------------------------------
-- Run this whole block as one statement (psql) or one transaction in your
-- SQL client. It creates a throwaway goal, exercises contribute/withdraw via
-- the RPC, asserts the expected outcomes, then rolls back — nothing is
-- persisted.

begin;

do $$
declare
  v_household_id uuid := '__HOUSEHOLD_ID__'::uuid;
  v_goal_id uuid;
  v_result record;
  v_threw boolean;
begin
  insert into public.goals (household_id, name, goal_type, target_amount, current_amount, currency_code, status, created_by)
  values (v_household_id, 'BR-019 test goal', 'custom', 100, 0, (select base_currency from public.households where id = v_household_id), 'active', auth.uid())
  returning id into v_goal_id;

  -- Contribute 60 -> current_amount = 60, still active.
  select * into v_result from public.apply_goal_adjustment(v_goal_id, v_household_id, 60);
  assert v_result.current_amount = 60, 'expected current_amount = 60 after contributing 60';
  assert v_result.status = 'active', 'expected status to remain active below target';

  -- Contribute 40 more -> current_amount = 100, reaches target -> completed.
  select * into v_result from public.apply_goal_adjustment(v_goal_id, v_household_id, 40);
  assert v_result.current_amount = 100, 'expected current_amount = 100 after reaching target';
  assert v_result.status = 'completed', 'expected status = completed once target is reached';

  -- Withdraw 10 -> current_amount = 90, drops back to active.
  select * into v_result from public.apply_goal_adjustment(v_goal_id, v_household_id, -10);
  assert v_result.current_amount = 90, 'expected current_amount = 90 after withdrawing 10';
  assert v_result.status = 'active', 'expected status to flip back to active once under target';

  -- Withdrawing more than the current balance must raise, not go negative.
  v_threw := false;
  begin
    perform public.apply_goal_adjustment(v_goal_id, v_household_id, -1000);
  exception when others then
    v_threw := true;
  end;
  assert v_threw, 'expected an exception when withdrawing more than the current balance';

  -- Archiving the goal, then contributing to it, must raise.
  update public.goals set status = 'archived' where id = v_goal_id;
  v_threw := false;
  begin
    perform public.apply_goal_adjustment(v_goal_id, v_household_id, 5);
  exception when others then
    v_threw := true;
  end;
  assert v_threw, 'expected an exception when contributing to an archived goal';

  raise notice 'BR-019 apply_goal_adjustment checks passed';
end $$;

rollback;
