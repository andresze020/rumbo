-- ============================================================
-- Rumbo — HH-5: members and leaving
-- Spec: docs/features/household-sharing.md section 2 (roles), MEM-1…MEM-7,
--       LIF-1…LIF-4, S24…S26.
-- ------------------------------------------------------------
-- HH-0 took every client write away from household_members (S2). This
-- migration adds the server-side doors that replace them, each enforcing the
-- section-2 matrix:
--
--   set_household_member_role     owner: anyone but themselves, to admin,
--                                 member or viewer; admin: member <-> viewer.
--   remove_household_member       owner: anyone but themselves; admin:
--                                 members and viewers.
--   leave_household               anyone but the owner (S26: transfer first).
--   transfer_household_ownership  owner only, to another active member; the
--                                 old owner stays on as admin.
--
-- Nobody becomes owner except through transfer, and nobody stops being the
-- owner except through transfer, so the last owner can never leave, be
-- removed or be demoted (S26). HH-0's unique index keeps it to at most one.
--
-- Ending a membership (remove or leave) is a status change, never a delete
-- (S24): status 'removed', removed_at, removed_by, and the person's
-- default_household_id moves to another active membership or to null (the
-- app's MEM-7 fallback then sends them to onboarding). RLS checks
-- status = 'active', so access ends on the next request (MEM-4). HH-4's S13
-- trigger revokes the pending invitations of an owner/admin who is removed,
-- leaves or is demoted below admin.
--
-- Former members (LIF-2, LIF-3): for 30 days after leaving or removal a person
-- can export their own private data from that household
-- (export_my_private_data; get_my_former_households lists where they still
-- can). After 30 days purge_departed_private_accounts soft-deletes those
-- private accounts and their private transactions. Rejoining inside the
-- window needs nothing: the accounts were never touched and become visible
-- again with the active membership.
--
-- The database-side switch (app_feature_flags.household_sharing) does NOT
-- gate these functions, like HH-4's list and revoke: with sharing turned off a
-- household must still be able to remove a member or let one leave. (The app
-- hides its screens behind RUMBO_HOUSEHOLD_SHARING; that is the app's choice,
-- not a database rule.)
--
-- Invitations: a guard on household_invitations INSERT re-checks, at insert
-- time, that the inviter is still an active owner (or an admin, for a
-- non-admin invitation). create_household_invitation (HH-4) reads the
-- caller's role before it takes the household lock, so without the guard an
-- admin removed while their create waited on that lock could still insert a
-- link.
--
-- Every function: SECURITY DEFINER, fixed search_path, auth check first,
-- revoked from public and anon. The member functions first check that the
-- caller is an active member (so nobody else can take the lock), then lock
-- the household row (NO KEY UPDATE, the same lock and order as the invitation
-- functions) and only then read the roles they decide on, so two concurrent
-- membership changes in one household run one after the other and each sees
-- the other's result.
--
-- PRIVACY (D2): nothing here writes an audit event that exists only because
-- someone had private accounts, and no audit metadata carries a private
-- account's name, id or count.
--
-- New functions, new names: there is no previous signature to DROP.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Internal: end one membership (remove or leave)
-- ------------------------------------------------------------
-- Caller-agnostic on purpose: remove_household_member and leave_household
-- check who may do it, this only does it. Never executable by a client.
create or replace function public.hh_end_membership(
  p_household_id uuid,
  p_user_id uuid,
  p_actor uuid,
  p_action text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  update public.household_members m
  set status = 'removed',
      removed_at = now(),
      removed_by = p_actor
  where m.household_id = p_household_id
    and m.user_id = p_user_id
    and m.status = 'active'
  returning m.role into v_role;

  if v_role is null then
    raise exception 'That person is not an active member of this household';
  end if;

  -- S24: the household they are no longer in stops being their default.
  update public.profiles p
  set default_household_id = (
    select m.household_id
    from public.household_members m
    where m.user_id = p_user_id
      and m.status = 'active'
      and m.household_id <> p_household_id
    order by m.joined_at nulls last, m.household_id
    limit 1
  )
  where p.id = p_user_id
    and p.default_household_id = p_household_id;

  insert into public.household_audit_log (household_id, actor_id, action, target_user_id, metadata)
  values (p_household_id, p_actor, p_action, p_user_id, jsonb_build_object('role', v_role));
end;
$$;

revoke all on function public.hh_end_membership(uuid, uuid, uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. set_household_member_role (section 2, MEM-2)
-- ------------------------------------------------------------
create or replace function public.set_household_member_role(
  p_household_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_caller_role text;
  v_target_role text;
begin
  if v_user is null then
    raise exception 'Not authorized';
  end if;

  if not public.is_household_admin(p_household_id) then
    raise exception 'Not authorized to manage this household''s members';
  end if;

  perform 1 from public.households h where h.id = p_household_id for no key update;

  -- Re-read under the lock: a concurrent change may have just demoted us.
  select m.role into v_caller_role
  from public.household_members m
  where m.household_id = p_household_id and m.user_id = v_user and m.status = 'active';

  if v_caller_role is null or v_caller_role not in ('owner', 'admin') then
    raise exception 'Not authorized to manage this household''s members';
  end if;

  if coalesce(p_role, '') = 'owner' then
    raise exception 'Transfer ownership to make someone the owner';
  end if;

  if coalesce(p_role, '') not in ('admin', 'member', 'viewer') then
    raise exception 'Choose a valid role';
  end if;

  if p_user_id = v_user then
    raise exception 'You cannot change your own role';
  end if;

  select m.role into v_target_role
  from public.household_members m
  where m.household_id = p_household_id and m.user_id = p_user_id and m.status = 'active';

  if v_target_role is null then
    raise exception 'That person is not an active member of this household';
  end if;

  -- The owner changes anyone else (S26: the owner is never the target here,
  -- since the owner is the only one who passes this check and cannot target
  -- themselves). An admin only switches a member and a viewer.
  if v_caller_role = 'admin'
    and (v_target_role not in ('member', 'viewer') or p_role not in ('member', 'viewer')) then
    raise exception 'You cannot change this member''s role';
  end if;

  if v_target_role = p_role then
    return;
  end if;

  -- HH-4's trigger revokes the target's pending invitations when this takes
  -- them below admin (S13).
  update public.household_members m
  set role = p_role
  where m.household_id = p_household_id and m.user_id = p_user_id and m.status = 'active';

  insert into public.household_audit_log (household_id, actor_id, action, target_user_id, metadata)
  values (
    p_household_id, v_user, 'member_role_changed', p_user_id,
    jsonb_build_object('from_role', v_target_role, 'role', p_role)
  );
end;
$$;

revoke all on function public.set_household_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_household_member_role(uuid, uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 3. remove_household_member (section 2, MEM-2, MEM-4, S24, S26)
-- ------------------------------------------------------------
create or replace function public.remove_household_member(
  p_household_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_caller_role text;
  v_target_role text;
begin
  if v_user is null then
    raise exception 'Not authorized';
  end if;

  if not public.is_household_admin(p_household_id) then
    raise exception 'Not authorized to manage this household''s members';
  end if;

  perform 1 from public.households h where h.id = p_household_id for no key update;

  -- Re-read under the lock: a concurrent change may have just demoted us.
  select m.role into v_caller_role
  from public.household_members m
  where m.household_id = p_household_id and m.user_id = v_user and m.status = 'active';

  if v_caller_role is null or v_caller_role not in ('owner', 'admin') then
    raise exception 'Not authorized to manage this household''s members';
  end if;

  if p_user_id = v_user then
    raise exception 'You cannot remove yourself. Leave the household instead';
  end if;

  select m.role into v_target_role
  from public.household_members m
  where m.household_id = p_household_id and m.user_id = p_user_id and m.status = 'active';

  if v_target_role is null then
    raise exception 'That person is not an active member of this household';
  end if;

  -- S26: the owner is never removable (only the owner could try, and the
  -- owner cannot target themselves). An admin removes members and viewers.
  if v_target_role = 'owner'
    or (v_caller_role = 'admin' and v_target_role not in ('member', 'viewer')) then
    raise exception 'You cannot remove this member';
  end if;

  perform public.hh_end_membership(p_household_id, p_user_id, v_user, 'member_removed');
end;
$$;

revoke all on function public.remove_household_member(uuid, uuid) from public, anon;
grant execute on function public.remove_household_member(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. leave_household (MEM-3, S26)
-- ------------------------------------------------------------
create or replace function public.leave_household(p_household_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
begin
  if v_user is null then
    raise exception 'Not authorized';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'You are not a member of this household';
  end if;

  perform 1 from public.households h where h.id = p_household_id for no key update;

  -- Re-read under the lock: a concurrent change may have just removed us.
  select m.role into v_role
  from public.household_members m
  where m.household_id = p_household_id and m.user_id = v_user and m.status = 'active';

  if v_role is null then
    raise exception 'You are not a member of this household';
  end if;

  if v_role = 'owner' then
    raise exception 'The owner must transfer ownership before leaving';
  end if;

  perform public.hh_end_membership(p_household_id, v_user, v_user, 'member_left');
end;
$$;

revoke all on function public.leave_household(uuid) from public, anon;
grant execute on function public.leave_household(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. transfer_household_ownership (section 2, MEM-2, S26)
-- ------------------------------------------------------------
-- The old owner becomes an admin, the new one the owner, in that order (the
-- one-active-owner index refuses the other order). Pending admin invitations
-- the old owner created are revoked: only an owner may invite an admin
-- (INV-1), and the old owner no longer is one. Their other pending links stay,
-- since an admin may still invite members and viewers.
create or replace function public.transfer_household_ownership(
  p_household_id uuid,
  p_new_owner_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_caller_role text;
  v_target_role text;
begin
  if v_user is null then
    raise exception 'Not authorized';
  end if;

  if not public.has_household_role(p_household_id, array['owner']) then
    raise exception 'Only the owner can transfer ownership';
  end if;

  perform 1 from public.households h where h.id = p_household_id for no key update;

  -- Re-read under the lock: only one transfer can win.
  select m.role into v_caller_role
  from public.household_members m
  where m.household_id = p_household_id and m.user_id = v_user and m.status = 'active';

  if v_caller_role is distinct from 'owner' then
    raise exception 'Only the owner can transfer ownership';
  end if;

  if p_new_owner_id is null or p_new_owner_id = v_user then
    raise exception 'Choose another active member as the new owner';
  end if;

  select m.role into v_target_role
  from public.household_members m
  where m.household_id = p_household_id and m.user_id = p_new_owner_id and m.status = 'active';

  if v_target_role is null then
    raise exception 'That person is not an active member of this household';
  end if;

  update public.household_members m
  set role = 'admin'
  where m.household_id = p_household_id and m.user_id = v_user and m.status = 'active';

  update public.household_members m
  set role = 'owner'
  where m.household_id = p_household_id and m.user_id = p_new_owner_id and m.status = 'active';

  update public.household_invitations i
  set revoked_at = now(), revoked_by = v_user
  where i.household_id = p_household_id
    and i.invited_by = v_user
    and i.role = 'admin'
    and i.accepted_at is null
    and i.revoked_at is null;

  insert into public.household_audit_log (household_id, actor_id, action, target_user_id, metadata)
  values (
    p_household_id, v_user, 'ownership_transferred', p_new_owner_id,
    jsonb_build_object('from_role', v_target_role)
  );
end;
$$;

revoke all on function public.transfer_household_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_household_ownership(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. get_my_former_households (LIF-2)
-- ------------------------------------------------------------
-- The households the caller left or was removed from less than 30 days ago
-- and still holds private accounts in: where Settings (and onboarding, for
-- someone with no household left) offers the private-data export. Only the
-- caller's own rows; nothing about the household beyond its name.
create or replace function public.get_my_former_households()
returns table (
  household_id uuid,
  household_name text,
  removed_at timestamptz,
  export_until timestamptz,
  private_accounts integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authorized';
  end if;

  -- Every OUT column is qualified (they share names with table columns).
  return query
  select
    m.household_id,
    h.name,
    m.removed_at,
    m.removed_at + interval '30 days',
    (
      select count(*)::integer
      from public.accounts a
      where a.household_id = m.household_id
        and a.private_owner_id = v_user
        and a.deleted_at is null
    )
  from public.household_members m
  join public.households h on h.id = m.household_id
  where m.user_id = v_user
    and m.status = 'removed'
    and m.removed_at > now() - interval '30 days'
    and exists (
      select 1 from public.accounts a
      where a.household_id = m.household_id
        and a.private_owner_id = v_user
        and a.deleted_at is null
    )
  order by m.removed_at desc;
end;
$$;

revoke all on function public.get_my_former_households() from public, anon;
grant execute on function public.get_my_former_households() to authenticated;

-- ------------------------------------------------------------
-- 7. export_my_private_data (LIF-1, LIF-2)
-- ------------------------------------------------------------
-- One row per ledger entry on the caller's own private accounts in one
-- household: every movement, opening balances included. Voided and deleted
-- transactions are left out, as on the transactions screen; pending ones are
-- in, with their status in the status column.
--
-- Callable by an active member (LIF-1: export before leaving) and by someone
-- whose membership ended less than 30 days ago (LIF-2). Rows are filtered on
-- the entry's private_owner_id = the caller, never by RLS alone: this runs as
-- the table owner. Another member's private data, and the shared side of a
-- mixed transfer, are never returned. A removed member sees the names of the
-- shared categories and payees on their own transactions, which they already
-- saw when they recorded them.
create or replace function public.export_my_private_data(p_household_id uuid)
returns table (
  transaction_date date,
  account_name text,
  currency_code text,
  amount numeric,
  transaction_type text,
  status text,
  description text,
  payee_name text,
  category_names text,
  notes text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authorized';
  end if;

  if not exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id
      and m.user_id = v_user
      and (
        m.status = 'active'
        or (m.status = 'removed' and m.removed_at > now() - interval '30 days')
      )
  ) then
    raise exception 'This export is no longer available';
  end if;

  -- Every OUT column is qualified (several share names with table columns).
  return query
  select
    t.transaction_date,
    a.name,
    e.currency_code::text,
    e.amount_account_currency,
    t.transaction_type,
    t.status,
    t.description,
    p.name,
    (
      select string_agg(c.name, '; ' order by c.name)
      from public.transaction_allocations al
      join public.categories c on c.id = al.category_id
      where al.transaction_id = t.id
    ),
    t.notes
  from public.transaction_entries e
  join public.transactions t on t.id = e.transaction_id
  join public.accounts a on a.id = e.account_id
  left join public.payees p on p.id = t.payee_id
  where e.household_id = p_household_id
    and e.private_owner_id = v_user
    and a.private_owner_id = v_user
    and a.deleted_at is null
    and t.deleted_at is null
    and t.voided_at is null
  order by t.transaction_date, a.name, t.created_at, e.id;
end;
$$;

revoke all on function public.export_my_private_data(uuid) from public, anon;
grant execute on function public.export_my_private_data(uuid) to authenticated;

-- ------------------------------------------------------------
-- 8. purge_departed_private_accounts (LIF-3) — for pg_cron only
-- ------------------------------------------------------------
-- For everyone whose membership ended 30 days ago or more, soft-deletes
-- (deleted_at, deleted_by = the departed owner) their private accounts in
-- that household and their private transactions there, so a later rejoin
-- does not bring back figures (scope mine/all reads allocations, not
-- accounts) that no account explains. Mixed transfers stay: their shared leg
-- is part of a shared account's balance. Nothing is physically deleted.
--
-- Returns how many accounts it soft-deleted. No audit event (D2): an event
-- that exists only because someone had private accounts would tell the
-- owner/admin who read the trail that they had them.
--
-- Not executable by any client; schedule it with pg_cron (see the manual
-- snippet at the bottom).
create or replace function public.purge_departed_private_accounts()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_accounts integer;
begin
  -- Data-modifying CTEs all run, referenced or not, against one snapshot.
  with expired as (
    select m.household_id, m.user_id
    from public.household_members m
    where m.status = 'removed'
      and m.removed_at <= now() - interval '30 days'
  ),
  purged_transactions as (
    update public.transactions t
    set deleted_at = now(),
        deleted_by = t.private_owner_id
    from expired x
    where t.household_id = x.household_id
      and t.private_owner_id = x.user_id
      and t.visibility = 'private'
      and t.deleted_at is null
    returning t.id
  ),
  purged_accounts as (
    update public.accounts a
    set deleted_at = now(),
        deleted_by = a.private_owner_id
    from expired x
    where a.household_id = x.household_id
      and a.private_owner_id = x.user_id
      and a.deleted_at is null
    returning a.id
  )
  select count(*)::integer into v_accounts from purged_accounts;

  return v_accounts;
end;
$$;

revoke all on function public.purge_departed_private_accounts() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 9. household_invitations: the inviter must still be allowed, at insert time
-- ------------------------------------------------------------
-- Closes the race described in the header: create_household_invitation reads
-- the caller's role before its household lock, so a create that waited on a
-- removal (or a demotion) would otherwise insert with the role it read
-- before. This trigger reads the committed state at the INSERT itself. Same
-- sentence as create's own check, so the app maps it the same way.
create or replace function public.hh_invitation_inviter_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.household_members m
    where m.household_id = new.household_id
      and m.user_id = new.invited_by
      and m.status = 'active'
      and (m.role = 'owner' or (m.role = 'admin' and new.role <> 'admin'))
  ) then
    raise exception 'Not authorized to invite to this household';
  end if;
  return new;
end;
$$;

revoke all on function public.hh_invitation_inviter_guard() from public, anon, authenticated;

create trigger trg_household_invitations_inviter_guard
before insert on public.household_invitations
for each row execute function public.hh_invitation_inviter_guard();

-- ============================================================
-- Scheduling (MANUAL — pg_cron, like run_recurring_autopost)
-- ------------------------------------------------------------
-- Run once in the Supabase SQL editor after applying this migration:
--
--   select cron.schedule(
--     'purge-departed-private-accounts',
--     '20 6 * * *',
--     $$select public.purge_departed_private_accounts()$$
--   );
--
-- To remove it later:  select cron.unschedule('purge-departed-private-accounts');
-- ============================================================

-- ------------------------------------------------------------
-- Rollback (manual; run top to bottom)
-- ------------------------------------------------------------
-- -- select cron.unschedule('purge-departed-private-accounts');
-- -- drop trigger if exists trg_household_invitations_inviter_guard on public.household_invitations;
-- -- drop function if exists public.hh_invitation_inviter_guard();
-- -- drop function if exists public.purge_departed_private_accounts();
-- -- drop function if exists public.export_my_private_data(uuid);
-- -- drop function if exists public.get_my_former_households();
-- -- drop function if exists public.transfer_household_ownership(uuid, uuid);
-- -- drop function if exists public.leave_household(uuid);
-- -- drop function if exists public.remove_household_member(uuid, uuid);
-- -- drop function if exists public.set_household_member_role(uuid, uuid, text);
-- -- drop function if exists public.hh_end_membership(uuid, uuid, uuid, text);
