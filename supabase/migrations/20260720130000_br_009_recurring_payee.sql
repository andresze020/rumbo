-- ============================================================
-- App Finanzas — br_009_recurring_payee.sql
-- BR-009 (residual): let recurring templates carry a payee.
-- Target: Supabase / PostgreSQL
--
-- Adds a nullable payee_id to recurring_transactions mirroring the
-- transactions.payee_id FK (on delete set null). The template's payee is
-- resolved/stored by the create/update recurring actions via
-- get_or_create_payee, and carried onto each posted occurrence.
-- No RLS change: the column inherits the table's existing household policies.
-- ============================================================

alter table public.recurring_transactions
  add column if not exists payee_id uuid references public.payees(id) on delete set null;

create index if not exists idx_recurring_transactions_payee_id
  on public.recurring_transactions(payee_id)
  where payee_id is not null;
