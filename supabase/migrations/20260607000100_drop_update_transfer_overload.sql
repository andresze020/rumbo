-- ============================================================
-- App Finanzas — drop_update_transfer_overload.sql
-- Fix BF-021: drop the legacy 8-param update_transfer_transaction
-- that coexisted with the 9-param version added in Sprint 12.7
-- (20260604000100_transfer_exchange_rate.sql).
--
-- PostgreSQL treats functions with different signatures as separate
-- overloads. CREATE OR REPLACE with a new parameter does not replace
-- the old function — it creates a second overload. PostgREST cannot
-- resolve the ambiguity and throws an error on every edit transfer call.
--
-- The correct version (9 params, with p_exchange_rate_to_base) was
-- created in the BF-020 migration. This migration removes the stale
-- 8-param version so only one overload remains.
-- ============================================================

DROP FUNCTION IF EXISTS public.update_transfer_transaction(
  uuid,   -- p_transaction_id
  uuid,   -- p_from_account_id
  uuid,   -- p_to_account_id
  numeric, -- p_amount
  date,   -- p_transaction_date
  text,   -- p_description
  text,   -- p_notes
  text    -- p_status
);
