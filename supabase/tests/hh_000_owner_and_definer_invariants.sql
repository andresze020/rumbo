-- ============================================================
-- Rumbo — HH-0 owner and definer invariants (docs/features/household-sharing.md §7)
--
-- The half of the HH-0 checks that needs no second member, split out of
-- hh_000_membership_hardening.sql (run-as=co-member) so that `npm run db:test`
-- runs them against the live project on every run, flags or not — the S8
-- exit criterion ("no SECURITY DEFINER function executable by anon") is only
-- meaningful there, where functions exist that no migration created
-- (rls_auto_enable). Read-only: the one block that leaves the caller's role
-- (`reset role`, to count owners in households the caller cannot see) only
-- reads, inside a transaction it rolls back.
-- ============================================================

-- ── Policy shapes (S2) ────────────────────────────────────────────────────

select
  'HH-0 household_members has no client INSERT, UPDATE or DELETE policy' as check_name,
  not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'household_members'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) as passed;

select
  'HH-0 households has no client INSERT policy and no creator clause' as check_name,
  not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'households'
      and (cmd in ('INSERT', 'ALL') or (cmd = 'SELECT' and qual ilike '%created_by%'))
  ) as passed;

-- ── One active owner per household ────────────────────────────────────────

select
  'HH-0 the household has exactly one active owner' as check_name,
  (select count(*) from public.household_members m
   where m.household_id = '__HOUSEHOLD_ID__'::uuid and m.role = 'owner' and m.status = 'active') = 1 as passed;

-- As the connection's own role, every household in the database — not only
-- the ones the caller belongs to. The unique index guarantees "at most one";
-- this is the "at least one" half, which only the RPCs keep (S26, HH-5).
-- check: HH-0 every household has exactly one active owner
begin;
reset role;
do $$
declare
  n bigint;
begin
  select count(*) into n
  from public.households h
  where (select count(*) from public.household_members m
         where m.household_id = h.id and m.role = 'owner' and m.status = 'active') <> 1;
  if n > 0 then
    raise exception '% household(s) without exactly one active owner', n;
  end if;
end $$;
rollback;

-- ── S8: definer functions and anon ────────────────────────────────────────

select
  'HH-0 anon cannot execute any SECURITY DEFINER function in public' as check_name,
  not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ) as passed;

select
  'HH-0 trigger-only SECURITY DEFINER functions are not callable by signed-in users' as check_name,
  not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and p.prorettype in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) as passed;

select
  'HH-0 membership helpers and RPCs stay callable by signed-in users' as check_name,
  has_function_privilege('authenticated', 'public.is_household_member(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.is_household_editor(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.is_household_admin(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.create_household_with_owner(text, text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_household_members(uuid)', 'EXECUTE') as passed;

select
  'HH-0 set_updated_at has a fixed search_path' as check_name,
  exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.set_updated_at()'::regprocedure
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  ) as passed;

select
  'HH-0 no policy in public is granted to PUBLIC (anon included)' as check_name,
  not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and 'public' = any (roles)
  ) as passed;
