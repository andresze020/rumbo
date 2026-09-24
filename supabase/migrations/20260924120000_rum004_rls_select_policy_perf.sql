-- ============================================================
-- Rumbo — RUM-004: stop evaluating is_household_member() per row in the
-- hot-path SELECT policies
-- ------------------------------------------------------------
-- Root cause, found running EXPLAIN (ANALYZE, BUFFERS) against production
-- for RUM-004 (docs/performance-ux-execution-status.md has the full plans):
--
-- `is_household_member(p_household_id uuid)` is `language sql stable
-- security definer`. PostgreSQL never inlines a SECURITY DEFINER function
-- (inlining would run it with the caller's privileges instead of the
-- definer's, which would defeat the point of SECURITY DEFINER), so every
-- call is a real, separate function invocation — not a folded-in predicate
-- the planner can reason about or push down.
--
-- Five SELECT policies call it as `using (is_household_member(household_id))`:
-- transactions, transaction_entries, transaction_allocations,
-- transaction_tags, accounts. Every row-level policy check on those tables
-- pays a full function call, even though — inside a single query — the
-- caller only ever has ONE household in scope, so the same boolean is
-- computed over and over for the same household_id.
--
-- Measured on search_household_transactions (all-time, household with 4,664
-- transactions / 5,524 entries): the planner picks a Nested Loop for the
-- entries join specifically because of this per-row function call, running
-- the index scan on transaction_entries 4,664 times (once per outer row)
-- instead of joining it in bulk. That nested loop alone is ~24k of the
-- ~34.8k buffers the RPC call was measured at. Without RLS (as `postgres`,
-- for comparison only — never how the app runs) the same query plans a
-- single Hash Join and finishes in ~27 ms instead of ~196 ms.
-- get_account_balances joins the same tables the same way, which is why
-- RUM-001/RUM-006 independently found it the single most expensive call in
-- the app (192 ms / 36,778 buffers for 22 rows).
--
-- Fix (the pattern Supabase's own RLS performance guide recommends): rewrite
-- each policy so the membership check is an inlined subquery instead of a
-- function call. `household_id in (select … where user_id = (select
-- auth.uid()) and status = 'active')` returns the same boolean as
-- `is_household_member`, but the planner can hash the (tiny — normally 1-2
-- rows per user) subquery once and reuse it for every outer row, instead of
-- re-invoking a SECURITY DEFINER function per row. `(select auth.uid())`
-- (not bare `auth.uid()`) lets Postgres treat it as an InitPlan evaluated
-- once per query rather than once per row too — the second half of the same
-- pattern.
--
-- Authorization semantics are unchanged: both forms answer "is there an
-- active household_members row for this household_id and the caller's
-- auth.uid()?". idx_household_members_user_household(user_id, household_id)
-- already covers the subquery's own lookup.
--
-- Deliberately NOT touched: is_household_member/is_household_editor/
-- is_household_admin themselves (still used correctly as one-shot
-- authorization checks inside RPC bodies, where the per-call cost is O(1)
-- against the whole request, not O(rows)); the INSERT/UPDATE/DELETE
-- policies on these five tables (editor-gated, low row-count writes, not
-- the measured hot path); and every other table's policies (not in the
-- query plans measured for RUM-004).
-- ============================================================

drop policy if exists "transactions_select_member" on public.transactions;
create policy "transactions_select_member"
on public.transactions
for select
to authenticated
using (
  household_id in (
    select hm.household_id
    from public.household_members hm
    where hm.user_id = (select auth.uid())
      and hm.status = 'active'
  )
);

drop policy if exists "transaction_entries_select_member" on public.transaction_entries;
create policy "transaction_entries_select_member"
on public.transaction_entries
for select
to authenticated
using (
  household_id in (
    select hm.household_id
    from public.household_members hm
    where hm.user_id = (select auth.uid())
      and hm.status = 'active'
  )
);

drop policy if exists "transaction_allocations_select_member" on public.transaction_allocations;
create policy "transaction_allocations_select_member"
on public.transaction_allocations
for select
to authenticated
using (
  household_id in (
    select hm.household_id
    from public.household_members hm
    where hm.user_id = (select auth.uid())
      and hm.status = 'active'
  )
);

drop policy if exists "transaction_tags_select_member" on public.transaction_tags;
create policy "transaction_tags_select_member"
on public.transaction_tags for select to authenticated
using (
  household_id in (
    select hm.household_id
    from public.household_members hm
    where hm.user_id = (select auth.uid())
      and hm.status = 'active'
  )
);

drop policy if exists "accounts_select_member" on public.accounts;
create policy "accounts_select_member"
on public.accounts
for select
to authenticated
using (
  deleted_at is null
  and household_id in (
    select hm.household_id
    from public.household_members hm
    where hm.user_id = (select auth.uid())
      and hm.status = 'active'
  )
);
