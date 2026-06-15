-- ============================================================
-- App Finanzas — sprint_4_transaction_review_status.sql
-- Sprint 4: Transaction review workflow
-- Adds a review status (To review / Reviewed / Flagged) to transactions.
-- Target: Supabase / PostgreSQL
--
-- ADDITIVE ONLY. Safe to run on existing data:
--   * Existing rows default to 'unreviewed' (shown as "To review").
--   * No RPC, RLS, or balance/reporting logic changes.
--   * Review status is independent from posting `status`
--     (pending/posted/voided/deleted_soft) — it is a workflow flag only
--     and never affects balances or reports.
-- ============================================================

alter table public.transactions
  add column if not exists review_status text not null default 'unreviewed';

alter table public.transactions
  drop constraint if exists transactions_review_status_chk;

alter table public.transactions
  add constraint transactions_review_status_chk
    check (review_status in ('unreviewed', 'reviewed', 'flagged'));

create index if not exists idx_transactions_household_review_status
  on public.transactions(household_id, review_status);
