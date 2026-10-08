-- ============================================================
-- Rumbo — HH-000: membership hardening (phase HH-0 of household sharing)
-- Spec: docs/features/household-sharing.md  (section 4 data model,
--       section 5 requirements S2 and S8, section 7 phase HH-0)
-- ------------------------------------------------------------
-- Why. Household sharing (several real people in one household, later with
-- private accounts) is only as safe as the membership table. Today a client
-- can write to it directly, and that is the whole problem:
--
--   * `household_members_insert_owner_or_admin` lets any owner/admin INSERT a
--     membership row for ANY user_id with ANY role/status. There is no consent
--     step: an admin can make a stranger an active member (S3 forbids it), or
--     insert an owner.
--   * `household_members_update_admin` lets any admin UPDATE any membership
--     row, including promoting themselves to 'owner' or demoting the owner.
--   * `households_select_member_or_creator` keeps `created_by = auth.uid()`
--     readable forever: a creator who was later removed from the household can
--     still read it. Once removal exists (HH-5) that is a leak.
--   * `households_insert_creator` plus the client-side onboarding made
--     "create a household" five separate client writes with no transaction
--     (profile upsert, household, membership, default categories, default
--     household on the profile).
--
-- This migration is the groundwork: it closes those doors and adds the
-- server-side pieces that replace them. It changes no screen by itself; the
-- onboarding server action must be switched to create_household_with_owner
-- in the SAME release (see "Apply order" below).
--
-- Sections
--   1. household_members: removal columns + "at most one active owner" index.
--   2. S2: remove client write policies on membership; drop the creator
--      clause from households SELECT.
--   3. household_audit_log: append-only, owner/admin read, no client writes.
--   4. create_household_with_owner(): atomic onboarding.
--   5. get_household_members(): member list, emails only for owner/admin.
--   6. S8 advisor fixes: no SECURITY DEFINER function executable by anon,
--      fixed search_path on set_updated_at, no {public} policies.
--
-- Apply order. Section 2 drops `households_insert_creator` and the
-- household_members INSERT policy, so the CURRENT onboarding action (direct
-- inserts) stops working for brand-new sign-ups the moment this runs. Existing
-- users are unaffected (every other write goes through RPCs or other tables).
-- Apply this migration and deploy the app change that calls
-- create_household_with_owner back to back.
--
-- Data. Live check done before writing this file: every household has exactly
-- one active owner and every household_members row is active, so the unique
-- index in section 1 builds cleanly and no backfill is needed.
-- ============================================================

-- ------------------------------------------------------------
-- 1. household_members: removal columns + one active owner per household
-- ------------------------------------------------------------
-- removed_at / removed_by: who ended a membership and when (S24: removal is a
-- status change, never a physical delete). Both stay NULL for every existing
-- row. No CHECK ties them to status = 'removed' on purpose: the RPCs that
-- write them (HH-5) are the single enforcement point.

alter table public.household_members
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references auth.users(id);

-- "At most one" active owner per household, enforced by the database.
-- "At least one" cannot be a constraint (a household is momentarily ownerless
-- inside an ownership transfer); S26 enforces it in the leave / remove /
-- demote / transfer RPCs (HH-5).
create unique index if not exists household_members_one_active_owner_idx
  on public.household_members (household_id)
  where role = 'owner' and status = 'active';

-- ------------------------------------------------------------
-- 2. S2: no client writes on membership; no creator clause on households
-- ------------------------------------------------------------
-- After this section authenticated has NO INSERT and NO UPDATE policy on
-- household_members (RLS is enabled, so the default is deny), and no INSERT
-- policy on households. There were never DELETE policies on either table.
-- Onboarding now goes through create_household_with_owner (section 4) and
-- every later membership change goes through RPCs only (invitations, role
-- changes, removal, leaving, ownership transfer: HH-4 and HH-5).
--
-- Left untouched on purpose: households_update_admin (renaming the household,
-- month_start_day, timezone are admin edits that stay client-side) and
-- household_members_select_member (the member list is read through RLS and
-- through get_household_members).

drop policy if exists "household_members_insert_owner_or_admin" on public.household_members;
drop policy if exists "household_members_update_admin" on public.household_members;
drop policy if exists "households_insert_creator" on public.households;

-- households SELECT: members only. The old policy also let `created_by` read
-- the row, which outlives membership.
--
-- This one keeps the SECURITY DEFINER helper deliberately. households is read
-- one row at a time by id (not the ledger hot path RUM-004 optimised), and an
-- inlined subquery on household_members here would be evaluated under
-- household_members' own RLS policy, chaining one policy into another. The
-- RUM-004 inlined-subquery pattern is for the ledger tables.
drop policy if exists "households_select_member_or_creator" on public.households;
drop policy if exists "households_select_member" on public.households;

create policy "households_select_member"
on public.households
for select
to authenticated
using (public.is_household_member(id));

-- ------------------------------------------------------------
-- 3. household_audit_log
-- ------------------------------------------------------------
-- Append-only record of membership events (who did what to whom). Written
-- ONLY by SECURITY DEFINER RPCs, which run as the table owner and so need no
-- write policy. Clients get: SELECT for owners/admins of the household, and
-- nothing else. The `action` format check is a typo guard, not an allow-list:
-- new actions arrive with the RPCs that emit them.
--
-- PRIVACY: never store a private account's name (or any private data) in
-- `metadata`. Members who cannot see a private account must not learn about it
-- from the audit trail.

create table if not exists public.household_audit_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  target_user_id uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint household_audit_log_action_format_chk
    check (action ~ '^[a-z][a-z_]*$')
);

comment on table public.household_audit_log is
  'HH-0: append-only membership audit trail. Written only by SECURITY DEFINER '
  'RPCs; readable by household owners/admins. Never store a private account '
  'name or other private data in metadata.';

create index if not exists idx_household_audit_log_household_created
  on public.household_audit_log (household_id, created_at desc);

alter table public.household_audit_log enable row level security;

-- RUM-004 style: inlined subquery with (select auth.uid()), same semantics as
-- is_household_admin(household_id): an active owner/admin row for the caller.
drop policy if exists "household_audit_log_select_admin" on public.household_audit_log;

create policy "household_audit_log_select_admin"
on public.household_audit_log
for select
to authenticated
using (
  household_id in (
    select hm.household_id
    from public.household_members hm
    where hm.user_id = (select auth.uid())
      and hm.status = 'active'
      and hm.role in ('owner', 'admin')
  )
);

-- No INSERT/UPDATE/DELETE policies exist, so RLS already denies client writes.
-- The revokes are the second lock (Supabase grants ALL on new public tables to
-- anon and authenticated by default): append-only even if someone later adds a
-- permissive policy by mistake. anon gets no privilege at all.
revoke all on public.household_audit_log from anon;
revoke insert, update, delete, truncate, references, trigger on public.household_audit_log from authenticated;

-- ------------------------------------------------------------
-- 4. create_household_with_owner(p_name, p_base_currency) -> household id
-- ------------------------------------------------------------
-- Atomic onboarding. The onboarding action used to make five client writes in
-- a row (profile, household, membership, default categories, default
-- household on the profile); a failure midway left an orphan household behind.
-- Here it is ONE function call, hence one transaction: any failure rolls back
-- everything and leaves nothing behind.
--
-- SECURITY DEFINER because clients no longer have INSERT policies on
-- households / household_members (section 2). Auth check comes first; the
-- caller can only ever create a household owned by themselves. The profile
-- upsert stays in the app (the profile row must already exist).
--
-- New function, new name: there is no previous signature to DROP.

create or replace function public.create_household_with_owner(
  p_name text,
  p_base_currency text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_name text;
  v_currency text;
  v_household_id uuid;
begin
  v_user := auth.uid();

  if v_user is null then
    raise exception 'Not authorized';
  end if;

  v_name := btrim(coalesce(p_name, ''));

  if v_name = '' then
    raise exception 'Household name is required';
  end if;

  v_currency := upper(btrim(coalesce(p_base_currency, '')));

  if not exists (
    select 1
    from public.currencies c
    where c.code = v_currency
      and c.is_active
  ) then
    raise exception 'Invalid base currency';
  end if;

  insert into public.households (name, base_currency, created_by)
  values (v_name, v_currency, v_user)
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role, status, joined_at)
  values (v_household_id, v_user, 'owner', 'active', now());

  -- SECURITY INVOKER, checks is_household_admin(p_household_id) via
  -- auth.uid(): passes because the owner row above already exists.
  perform public.create_default_categories_for_household(v_household_id);

  update public.profiles
  set default_household_id = v_household_id
  where id = v_user;

  insert into public.household_audit_log (household_id, actor_id, action, target_user_id)
  values (v_household_id, v_user, 'household_created', v_user);

  return v_household_id;
end;
$$;

revoke all on function public.create_household_with_owner(text, text) from public, anon;
grant execute on function public.create_household_with_owner(text, text) to authenticated;

-- ------------------------------------------------------------
-- 5. get_household_members(p_household_id)
-- ------------------------------------------------------------
-- Member list for the household screens. A function (not a direct read of
-- household_members) because it joins profiles, whose RLS only lets a user
-- read their own row.
--
--   * Emails only for owner/admin (MEM-1); everyone else gets NULL.
--   * Removed members are included and flagged is_former = true (MEM-5), so
--     history that names them still resolves. Invited rows are excluded:
--     invitations get their own table in HH-4.
--   * Emails come from profiles.email (public schema), never auth.users.
--
-- Every column reference below is qualified with its table alias because
-- user_id, display_name, email, role, status and joined_at are also OUT
-- parameter names of this function; a bare reference raises
-- `column reference "..." is ambiguous` (the RUM-006 lesson, see AGENTS.md).
--
-- New function, new name: there is no previous signature to DROP.

create or replace function public.get_household_members(p_household_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  role text,
  status text,
  joined_at timestamptz,
  is_former boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_can_see_email boolean;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception 'Not authorized to read this household''s members';
  end if;

  v_can_see_email := public.is_household_admin(p_household_id);

  return query
  select
    m.user_id,
    p.display_name,
    case when v_can_see_email then p.email end,
    m.role,
    m.status,
    m.joined_at,
    (m.status = 'removed')
  from public.household_members m
  left join public.profiles p on p.id = m.user_id
  where m.household_id = p_household_id
    and m.status in ('active', 'removed')
  order by
    (m.status = 'removed'),
    case m.role
      when 'owner' then 0
      when 'admin' then 1
      when 'member' then 2
      else 3
    end,
    m.joined_at nulls last,
    p.display_name;
end;
$$;

revoke all on function public.get_household_members(uuid) from public, anon;
grant execute on function public.get_household_members(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. S8 advisor fixes
-- ------------------------------------------------------------

-- 6a. RLS helper functions: stay callable by signed-in users (policies and
-- RPC bodies use them) but not by anon. Supabase grants EXECUTE on new public
-- functions to anon explicitly, so revoking from PUBLIC alone is not enough.
revoke execute on function public.is_household_member(uuid) from public, anon;
revoke execute on function public.has_household_role(uuid, text[]) from public, anon;
revoke execute on function public.is_household_admin(uuid) from public, anon;
revoke execute on function public.is_household_editor(uuid) from public, anon;
revoke execute on function public.is_household_creator(uuid) from public, anon;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.has_household_role(uuid, text[]) to authenticated;
grant execute on function public.is_household_admin(uuid) to authenticated;
grant execute on function public.is_household_editor(uuid) to authenticated;
grant execute on function public.is_household_creator(uuid) to authenticated;

-- 6b. Trigger-only functions: nobody needs EXECUTE. A trigger fires
-- regardless of EXECUTE grants (the privilege is checked when the trigger is
-- created, not when it fires), so on_auth_user_created keeps working.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- rls_auto_enable() is an event-trigger function that exists ONLY on the live
-- project (created outside migrations), so a fresh `db reset` has no such
-- function. Guard it.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- 6c. Fixed search_path on the shared updated_at trigger function (it only
-- calls now(), which lives in pg_catalog and is always resolved).
alter function public.set_updated_at() set search_path = public;

-- 6d. Policies created without a TO clause apply to {public} (anon included).
-- The helpers they call are no longer executable by anon, and these tables are
-- household data anyway. Same predicates, authenticated only.
alter policy "categorization_rules_select" on public.categorization_rules to authenticated;
alter policy "categorization_rules_insert" on public.categorization_rules to authenticated;
alter policy "categorization_rules_update" on public.categorization_rules to authenticated;
alter policy "categorization_rules_delete" on public.categorization_rules to authenticated;
alter policy "recurring_autopost_log_select" on public.recurring_autopost_log to authenticated;

-- ============================================================
-- What this migration deliberately does NOT do
-- ------------------------------------------------------------
--   * No private_owner_id on any table and no private-account policy clause
--     (HH-1).
--   * No household_invitations table and no invitation RPCs (HH-4); until then
--     nobody can become a second member through the app.
--   * No role-change / remove / leave / transfer RPCs (HH-5); the S26
--     "last owner" rule is therefore not enforced anywhere yet beyond the
--     at-most-one index.
--   * No change to any ledger RPC, reporting RPC or ledger-table policy
--     (no p_scope parameters, no RUM-004 rewrites).
--   * No change to households_update_admin or household_members_select_member.
--   * No table-level REVOKE on households / household_members (RLS is the
--     boundary there, S1).
-- ============================================================

-- ------------------------------------------------------------
-- Rollback (manual; run in this order, top to bottom)
-- ------------------------------------------------------------
-- -- 6d. policies back to {public}
-- -- alter policy "categorization_rules_select" on public.categorization_rules to public;
-- -- alter policy "categorization_rules_insert" on public.categorization_rules to public;
-- -- alter policy "categorization_rules_update" on public.categorization_rules to public;
-- -- alter policy "categorization_rules_delete" on public.categorization_rules to public;
-- -- alter policy "recurring_autopost_log_select" on public.recurring_autopost_log to public;
-- -- 6c
-- -- alter function public.set_updated_at() reset search_path;
-- -- 6b / 6a (restores the pre-migration anon exposure; do not do this in production)
-- -- grant execute on function public.handle_new_user() to anon, authenticated;
-- -- grant execute on function public.is_household_member(uuid) to anon;
-- -- grant execute on function public.has_household_role(uuid, text[]) to anon;
-- -- grant execute on function public.is_household_admin(uuid) to anon;
-- -- grant execute on function public.is_household_editor(uuid) to anon;
-- -- grant execute on function public.is_household_creator(uuid) to anon;
-- -- 5, 4, 3
-- -- drop function if exists public.get_household_members(uuid);
-- -- drop function if exists public.create_household_with_owner(text, text);
-- -- drop table if exists public.household_audit_log;
-- -- 2 (recreates the dropped policies exactly as 20260531000100 defined them)
-- -- drop policy if exists "households_select_member" on public.households;
-- -- create policy "households_select_member_or_creator" on public.households
-- --   for select to authenticated
-- --   using (public.is_household_member(id) or created_by = auth.uid());
-- -- create policy "households_insert_creator" on public.households
-- --   for insert to authenticated
-- --   with check (created_by = auth.uid());
-- -- create policy "household_members_insert_owner_or_admin" on public.household_members
-- --   for insert to authenticated
-- --   with check (
-- --     (user_id = auth.uid() and role = 'owner' and status = 'active'
-- --      and public.is_household_creator(household_id))
-- --     or public.is_household_admin(household_id)
-- --   );
-- -- create policy "household_members_update_admin" on public.household_members
-- --   for update to authenticated
-- --   using (public.is_household_admin(household_id))
-- --   with check (public.is_household_admin(household_id));
-- -- 1
-- -- drop index if exists public.household_members_one_active_owner_idx;
-- -- alter table public.household_members
-- --   drop column if exists removed_by,
-- --   drop column if exists removed_at;
