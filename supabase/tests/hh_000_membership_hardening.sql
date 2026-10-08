-- rumbo-test: run-as=co-member
-- ============================================================
-- Rumbo — HH-0 membership hardening (docs/features/household-sharing.md §7)
--
-- The directive on line 1 makes the runner execute this file as one ACTIVE
-- member of __HOUSEHOLD_ID__ (the "co-member"), with ANOTHER active member's
-- id in __SUBJECT_USER_ID__:
--   * locally (npm run db:local): twice in fixture household A — as A2 (a
--     plain member) about A1, then as A1 (the owner, so also an admin by
--     is_household_admin) about A2. The owner run is the one that proves the
--     admin clauses are gone: under the old policies it could insert and
--     update membership rows;
--   * against the live project: only with --co-member=<uuid> --subject=<uuid>,
--     otherwise skipped with a notice.
--
-- What it pins (S2):
--   1. no member — owner and admin included — can insert or update a
--      household_members row, or write the audit log;
--   2. a household's creator who is not an active member cannot read it;
--   3. a second active owner is refused by the unique index;
--   4. get_household_members lists the members, emails for owner/admin only.
-- The checks that need no second member — the policy shapes, one active owner
-- in every household, and S8 (anon cannot execute any SECURITY DEFINER
-- function) — are in hh_000_owner_and_definer_invariants.sql, so the live
-- runner checks them on every run, with or without --co-member.
--
-- Nothing persists. A write probe that succeeds raises, which aborts its
-- statement's transaction; the begin … rollback blocks create a throwaway
-- "probe" household through create_household_with_owner and undo it. Two of
-- them `reset role` (back to the connection's own role, as
-- br_014_recurring_catchup_invariants.sql does) for exactly one statement that
-- no client can run — retiring the creator's membership, or adding a second
-- owner — and only ever on the probe household made in the same transaction.
-- ============================================================

-- ── 1. Membership rows have no client write path ──────────────────────────

-- RLS itself refuses (42501) before any constraint is looked at. Under the old
-- owner/admin INSERT policy the owner's run got past RLS and failed on the
-- unique (household_id, user_id) instead, which this does not accept.
-- check: HH-0 a member (owner and admin included) cannot insert a membership row
do $$
begin
  begin
    insert into public.household_members (household_id, user_id, role, status, joined_at)
    values ('__HOUSEHOLD_ID__'::uuid, '__SUBJECT_USER_ID__'::uuid, 'admin', 'active', now());
  exception
    when insufficient_privilege then
      return; -- row-level security refused it: the only acceptable outcome
    when others then
      raise exception 'expected an RLS refusal (42501), got % (%)', sqlstate, sqlerrm;
  end;
  raise exception 'LEAK: a member inserted a household_members row';
end $$;

-- With no UPDATE policy an UPDATE matches nothing: the proof is zero rows.
-- check: HH-0 a member (owner and admin included) cannot update any membership row
do $$
declare
  n bigint;
begin
  -- Promote oneself.
  update public.household_members set role = 'owner'
  where household_id = '__HOUSEHOLD_ID__'::uuid and user_id = (select auth.uid()) and role <> 'owner';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'LEAK: a member changed their own role'; end if;

  -- Demote or retire another member.
  update public.household_members set role = 'viewer', status = 'removed'
  where household_id = '__HOUSEHOLD_ID__'::uuid and user_id = '__SUBJECT_USER_ID__'::uuid;
  get diagnostics n = row_count;
  if n > 0 then raise exception 'LEAK: a member changed another member''s row'; end if;
end $$;

-- check: HH-0 a member cannot write the membership audit log
do $$
declare
  n bigint;
begin
  begin
    insert into public.household_audit_log (household_id, actor_id, action, target_user_id)
    values ('__HOUSEHOLD_ID__'::uuid, (select auth.uid()), 'member_role_changed', '__SUBJECT_USER_ID__'::uuid);
    raise exception 'LEAK: a member wrote an audit row';
  exception
    when insufficient_privilege then null; -- refused: expected
  end;
  begin
    update public.household_audit_log set action = 'tampered' where household_id = '__HOUSEHOLD_ID__'::uuid;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'LEAK: a member rewrote % audit row(s)', n; end if;
  exception
    when insufficient_privilege then null;
  end;
  begin
    delete from public.household_audit_log where household_id = '__HOUSEHOLD_ID__'::uuid;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'LEAK: a member deleted % audit row(s)', n; end if;
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- ── 2. The creator clause is gone ─────────────────────────────────────────

-- The caller creates a probe household (so they are its creator and owner),
-- then their membership is retired — by the table owner, since no client can.
-- Under the old households_select_member_or_creator they would still read it.
-- check: HH-0 a creator who is no longer a member cannot read the household
begin;
select set_config('hh0.probe', public.create_household_with_owner(
  'HH-0 probe', (select h.base_currency from public.households h where h.id = '__HOUSEHOLD_ID__'::uuid))::text, true);
reset role;
do $$
begin
  if not exists (select 1 from public.households
                 where id = current_setting('hh0.probe')::uuid and created_by = (select auth.uid())) then
    raise exception 'setup: the probe household was not created by the caller';
  end if;
end $$;
update public.household_members set status = 'removed', removed_at = now()
where household_id = current_setting('hh0.probe')::uuid;
set local role authenticated;
do $$
begin
  if exists (select 1 from public.households where id = current_setting('hh0.probe')::uuid) then
    raise exception 'LEAK: the creator still reads a household they are no longer a member of';
  end if;
end $$;
rollback;

-- ── 3. One active owner per household (the index) ─────────────────────────

-- The index refuses a second active owner, whoever writes it — even the table
-- owner, here, on the probe household. (Every household having exactly one is
-- hh_000_owner_and_definer_invariants.sql, which needs no second member.)
-- check: HH-0 a second active owner is refused by the unique index
begin;
select set_config('hh0.probe', public.create_household_with_owner(
  'HH-0 probe', (select h.base_currency from public.households h where h.id = '__HOUSEHOLD_ID__'::uuid))::text, true);
reset role;
do $$
begin
  begin
    insert into public.household_members (household_id, user_id, role, status, joined_at)
    values (current_setting('hh0.probe')::uuid, '__SUBJECT_USER_ID__'::uuid, 'owner', 'active', now());
  exception
    when unique_violation then
      null; -- household_members_one_active_owner_idx: expected
    when others then
      raise exception 'expected a unique violation, got % (%)', sqlstate, sqlerrm;
  end;
  if (select count(*) from public.household_members
      where household_id = current_setting('hh0.probe')::uuid and role = 'owner' and status = 'active') <> 1 then
    raise exception 'LEAK: the probe household has two active owners';
  end if;
end $$;
rollback;

-- ── 4. get_household_members ──────────────────────────────────────────────

-- From both sides: as the plain member (A2) no email is returned, as the owner
-- (A1) every one is. Same rows either way, matching the membership table.
-- check: HH-0 get_household_members lists both members, with emails for owner/admin only
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  can_see_email boolean := public.is_household_admin(hh);
  n_rows bigint;
  n_emails bigint;
  n_me bigint;
  n_subject bigint;
  n_owners bigint;
begin
  select count(*),
         count(*) filter (where gm.email is not null),
         count(*) filter (where gm.user_id = (select auth.uid()) and not gm.is_former),
         count(*) filter (where gm.user_id = '__SUBJECT_USER_ID__'::uuid and not gm.is_former),
         count(*) filter (where gm.role = 'owner' and gm.status = 'active')
    into n_rows, n_emails, n_me, n_subject, n_owners
  from public.get_household_members(hh) gm;

  if n_me <> 1 or n_subject <> 1 then
    raise exception 'expected the caller and the subject once each, got % and %', n_me, n_subject;
  end if;
  if n_owners <> 1 then
    raise exception 'expected exactly one active owner in the list, got %', n_owners;
  end if;
  if n_rows <> (select count(*) from public.household_members m
                where m.household_id = hh and m.status in ('active', 'removed')) then
    raise exception 'the list (% rows) does not match the membership table', n_rows;
  end if;
  if can_see_email and n_emails <> n_rows then
    raise exception 'owner/admin should see every email, saw % of %', n_emails, n_rows;
  end if;
  if not can_see_email and n_emails <> 0 then
    raise exception 'LEAK: a non-admin member saw % email(s)', n_emails;
  end if;
end $$;

-- The audit log is owner/admin only: a plain member reads none of it, and the
-- owner of a just-created household reads its one creation event.
-- check: HH-0 audit log: members read nothing, the owner reads the household_created event
begin;
select set_config('hh0.probe', public.create_household_with_owner(
  'HH-0 probe', (select h.base_currency from public.households h where h.id = '__HOUSEHOLD_ID__'::uuid))::text, true);
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
begin
  if not public.is_household_admin(hh)
     and exists (select 1 from public.household_audit_log where household_id = hh) then
    raise exception 'LEAK: a non-admin member can read the audit log';
  end if;
  if (select count(*) from public.household_audit_log l
      where l.household_id = current_setting('hh0.probe')::uuid
        and l.action = 'household_created' and l.actor_id = (select auth.uid())) <> 1 then
    raise exception 'expected one household_created event for the new household';
  end if;
end $$;
rollback;
