-- ============================================================
-- Rumbo — HH-6: performance advisor clean-up (auth_rls_initplan)
-- Spec: docs/features/household-sharing.md, phase HH-6 ("security and
--       performance advisors clean").
-- ------------------------------------------------------------
-- The Supabase performance advisor flags eight older policies that call
-- auth.uid() bare, so Postgres re-evaluates it for every row instead of once
-- per statement (lint 0003_auth_rls_initplan). RUM-004 fixed the ledger
-- tables the same way; these eight were outside its scope.
--
-- Each ALTER POLICY below restates the policy's predicate EXACTLY as it is
-- live (read from pg_policies on 2026-10-11), with auth.uid() written as
-- (select auth.uid()). Same rows allowed, same commands, same roles: only
-- the plan changes. The is_household_editor(...) helper calls are left as
-- they are (the advisor does not flag them, and RUM-004 kept them here).
-- ============================================================

-- profiles: own row only.
alter policy "profiles_select_own" on public.profiles
  using (id = (select auth.uid()));

alter policy "profiles_insert_own" on public.profiles
  with check (id = (select auth.uid()));

alter policy "profiles_update_own" on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- budgets / budget_lines: editors, recorded as themselves.
alter policy "budgets_insert_editor" on public.budgets
  with check (
    public.is_household_editor(household_id)
    and created_by = (select auth.uid())
  );

alter policy "budget_lines_insert_editor" on public.budget_lines
  with check (
    public.is_household_editor(household_id)
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.budgets b
      where b.id = budget_lines.budget_id
        and b.household_id = budget_lines.household_id
        and b.deleted_at is null
    )
    and exists (
      select 1 from public.categories c
      where c.id = budget_lines.category_id
        and c.household_id = budget_lines.household_id
        and c.deleted_at is null
    )
  );

-- exchange_rates: editors; the actor columns may be null or the caller.
alter policy "exchange_rates_insert_editor" on public.exchange_rates
  with check (
    public.is_household_editor(household_id)
    and (created_by is null or created_by = (select auth.uid()))
  );

alter policy "exchange_rates_update_editor" on public.exchange_rates
  using (public.is_household_editor(household_id))
  with check (
    public.is_household_editor(household_id)
    and (updated_by is null or updated_by = (select auth.uid()))
  );

-- month_closures: editors, closed as themselves.
alter policy "month_closures_insert_editor" on public.month_closures
  with check (
    public.is_household_editor(household_id)
    and closed_by = (select auth.uid())
  );

-- ------------------------------------------------------------
-- Rollback (manual): the same statements with (select auth.uid()) written
-- back as auth.uid(). Behaviour is identical either way.
-- ------------------------------------------------------------
