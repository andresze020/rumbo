-- ============================================================
-- App Finanzas — BR-036: configurable month start day (slice 1)
-- Target: Supabase / PostgreSQL
-- ------------------------------------------------------------
-- The month is always the calendar month, so a household paid on the 25th cannot
-- align budgets or reports to its actual pay period.
--
-- ── SCOPE — READ THIS BEFORE EXTENDING ──────────────────────────────────────
-- The BR-036 row is explicit: *"Scope carefully — high blast radius. Every
-- monthly RPC (create_monthly_dashboard_functions, budgets, month closures,
-- reports) assumes calendar months. Slice 1 is a household setting plus a single
-- shared period-resolver used by ONE screen; migrate the rest only once that is
-- proven."*
--
-- This migration therefore adds **only the setting**. It deliberately does NOT
-- touch a single RPC. There is exactly one consumer in slice 1,
-- `/dashboard/reports`, and it resolves its period in TypeScript
-- (`src/lib/periods/month.ts`) — that screen already works from an explicit
-- date_from/date_to pair, so honouring a different period boundary there costs
-- no change to shared financial SQL at all.
--
-- Everything else — the dashboard summary, budgets, month closures, trends,
-- cash flow, month review, and BR-043's two budget functions — still keys on
-- `date_trunc('month', ...)` and is untouched and unaffected. That is a *known,
-- intended* inconsistency for this slice: proving the resolver on one screen is
-- the whole point of doing it this way, and the app says so on screen rather than
-- letting the user discover it.
--
-- Whoever picks up slice 2: the resolver's contract is that a period labelled
-- `YYYY-MM` starts on `month_start_day` of that month and ends the day before the
-- next occurrence. Port that, not a re-derivation.
--
-- With the default of 1, every period is exactly the calendar month, so an
-- untouched household sees no change whatsoever — the row's first verification.
-- ============================================================

alter table public.households
  add column if not exists month_start_day smallint not null default 1;

comment on column public.households.month_start_day is
  'BR-036: day of month a financial period begins (1-31, clamped to the month''s '
  'last day). 1 = the calendar month, which is the default and the pre-BR-036 '
  'behaviour. Slice 1 is honoured by /dashboard/reports only; every monthly RPC '
  'still uses the calendar month.';

alter table public.households
  drop constraint if exists households_month_start_day_chk;

alter table public.households
  add constraint households_month_start_day_chk
  check (month_start_day between 1 and 31);
