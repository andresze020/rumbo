-- ============================================================
-- Rumbo — MQ-001 household timezone invariants
-- ------------------------------------------------------------
-- Same style as `uc_009_recurring_transfer_invariants.sql`: replace
-- `__HOUSEHOLD_ID__` with a real household id and run via `npm run db:test`.
-- Every row must report `passed = true`. Read-only.
--
-- MQ-001 is groundwork: the column is validated on write by a trigger, which
-- only fires on INSERT / UPDATE OF timezone, so rows that predate the trigger
-- (or were written with it disabled) are the ones worth checking against data.
-- ============================================================

-- 1. The household's stored zone is a real IANA zone name.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'MQ-001 household timezone is a valid zone name' as check_name,
  exists (
    select 1
    from public.households h
    join pg_catalog.pg_timezone_names z on z.name = h.timezone
    where h.id = (select household_id from params)
  ) as passed;
