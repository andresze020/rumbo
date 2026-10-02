-- ============================================================
-- App Finanzas — MQ-001: households.timezone (groundwork only)
-- Target: Supabase / PostgreSQL
-- ------------------------------------------------------------
-- "Today" was computed in UTC, so from 20:00 EDT (19:00 EST) in Montreal a
-- household saw tomorrow's date. The request-side fix reads a `rumbo-tz` cookie. The pg_cron
-- job `recurring-autopost` has no request: it calls
-- `public.run_recurring_autopost(p_run_date date default current_date)` at
-- '0 6 * * *' and `current_date` is the database's (UTC) date for every
-- household alike. That needs a per-household answer to "what zone is this
-- household in?", which is what this column stores.
--
-- ── SCOPE — READ THIS BEFORE EXTENDING ──────────────────────────────────────
-- This migration is GROUNDWORK. It adds the column and a validity guard and
-- NOTHING READS IT YET. In particular it does NOT touch
-- `run_recurring_autopost` or the cron schedule, so applying it changes no
-- behaviour: every existing row backfills to 'UTC', which is exactly what
-- `current_date` already means.
--
-- Follow-up (separate migration + app change, in this order):
--   1. Make `run_recurring_autopost` post per household, resolving the run date
--      as `(now() at time zone h.timezone)::date` instead of one global
--      `p_run_date`. Because households sit in different zones, "6 AM UTC" is
--      no longer a good moment for all of them, so the job likely needs to run
--      hourly and only act on households whose local date has just advanced
--      (the `recurring_autopost_log` unique key keeps a re-run idempotent).
--      Changing parameters means DROP FUNCTION of the old `(date)` signature
--      first, or an overload is left behind.
--   2. Write the column from the client's `Intl.DateTimeFormat().resolvedOptions()
--      .timeZone` (household settings / onboarding). Until then every
--      household stays on 'UTC'.
--
-- Not to be confused with `profiles.timezone` (per user, nullable, default
-- 'America/Montreal', never validated). Financial "today" belongs to the
-- household, like `base_currency` and `month_start_day`, so it lives here.
--
-- ── WHY A TRIGGER AND NOT A CHECK ───────────────────────────────────────────
-- A CHECK cannot query `pg_timezone_names` (no subqueries in CHECK), and
-- wrapping the lookup in a function to smuggle it in would claim immutability
-- the zone database does not have. A BEFORE INSERT OR UPDATE OF timezone
-- trigger validates exactly when the value is written. Existing rows are not
-- re-validated (they take the default 'UTC', which is always present), so the
-- migration cannot fail on existing data.
--
-- Matching is exact against `pg_timezone_names.name` (e.g. 'America/Montreal'),
-- so lower-case spellings and POSIX strings that `AT TIME ZONE` would tolerate
-- are rejected on purpose: the value is meant to be an IANA name the client's
-- Intl API also understands.
--
-- RLS: unchanged and sufficient. `households_update_admin` (UPDATE using and
-- with check `is_household_admin(id)`) is row-level, so it covers every column
-- including this one; `households_select_member_or_creator` covers reads.
-- There are no column-level grants on `households`, so nothing to add.
-- ============================================================

alter table public.households
  add column if not exists timezone text not null default 'UTC';

comment on column public.households.timezone is
  'MQ-001: IANA time zone name (e.g. America/Montreal) that defines this '
  'household''s local "today". Validated against pg_timezone_names by '
  'trg_households_validate_timezone. Default UTC = the pre-MQ-001 behaviour. '
  'Groundwork: nothing reads it yet (run_recurring_autopost still uses '
  'current_date).';

create or replace function public.validate_household_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_timezone_names z
    where z.name = new.timezone
  ) then
    raise exception 'Invalid time zone for household: %', new.timezone
      using errcode = '22023', -- invalid_parameter_value
            hint = 'Use an IANA zone name such as America/Montreal or UTC.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_households_validate_timezone on public.households;

create trigger trg_households_validate_timezone
before insert or update of timezone on public.households
for each row execute function public.validate_household_timezone();

-- ------------------------------------------------------------
-- Rollback (manual, reversible; nothing depends on the column yet)
-- ------------------------------------------------------------
-- drop trigger if exists trg_households_validate_timezone on public.households;
-- drop function if exists public.validate_household_timezone();
-- alter table public.households drop column if exists timezone;
