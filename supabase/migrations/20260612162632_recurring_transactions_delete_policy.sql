-- ============================================================
-- recurring_transactions: add DELETE RLS policy (admin only)
-- ------------------------------------------------------------
-- The initial schema shipped SELECT (member), INSERT (admin), and UPDATE
-- (admin) policies for recurring_transactions but no DELETE policy, so
-- UC-7 (hard-delete a recurring template) is blocked by RLS. This adds an
-- admin-scoped DELETE policy consistent with the existing insert/update
-- policies. No schema change.
-- ============================================================

drop policy if exists "recurring_transactions_delete_admin"
  on public.recurring_transactions;

create policy "recurring_transactions_delete_admin"
on public.recurring_transactions for delete to authenticated
using (public.is_household_admin(household_id));
