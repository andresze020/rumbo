-- HH-5 members and leaving (docs/features/household-sharing.md section 2,
-- MEM-2…MEM-4, LIF-1…LIF-3, S24…S26).
--
-- Runs as the household's owner (A1 in A, B1 in B; on the live project, the
-- --user). Every probe is a `begin; … rollback;` block: the throwaway users,
-- memberships, accounts and invitations it creates never survive. Inside a
-- probe the checks run as the table owner and impersonate users through
-- request.jwt.claims (the member functions are SECURITY DEFINER and read only
-- auth.uid()); what a removed member can still read is checked as
-- `authenticated`, under RLS.
--
-- Each probe defines the same four pg_temp helpers (they vanish with the
-- rollback):
--   hh5_user(label)       a confirmed auth user with no household
--   hh5_join(hh, role)    a new active member of hh, hh as their default
--   hh5_as(user)          act as that user for the rest of the transaction
--   hh5_refused(sql, msg) the statement must fail with exactly that message

-- ── 1. Who may call what ─────────────────────────────────────────────────

-- check: HH-5 member functions are for signed-in users only; the purge and the internal helper for nobody
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.set_household_member_role(uuid, uuid, text)',
    'public.remove_household_member(uuid, uuid)',
    'public.leave_household(uuid)',
    'public.transfer_household_ownership(uuid, uuid)',
    'public.get_my_former_households()',
    'public.export_my_private_data(uuid)'
  ] loop
    if has_function_privilege('anon', fn, 'execute') then
      raise exception 'LEAK: anon can execute %', fn;
    end if;
    if not has_function_privilege('authenticated', fn, 'execute') then
      raise exception '% is not executable by authenticated', fn;
    end if;
  end loop;

  foreach fn in array array[
    'public.hh_end_membership(uuid, uuid, uuid, text)',
    'public.purge_departed_private_accounts()'
  ] loop
    if has_function_privilege('authenticated', fn, 'execute') or has_function_privilege('anon', fn, 'execute') then
      raise exception 'LEAK: internal % is executable by a client', fn;
    end if;
  end loop;

  -- The two reads must not write (they are called while rendering pages).
  if exists (
    select 1 from pg_proc p
    where p.oid in ('public.get_my_former_households()'::regprocedure, 'public.export_my_private_data(uuid)'::regprocedure)
      and p.provolatile <> 's'
  ) then
    raise exception 'get_my_former_households and export_my_private_data must be STABLE';
  end if;
end $$;

-- ── 2. Role changes ──────────────────────────────────────────────────────

-- check: HH-5 role changes follow the section-2 matrix (owner: anyone else; admin: member <-> viewer; nobody else)
begin;
reset role;
create function pg_temp.hh5_user(p_label text) returns uuid language plpgsql as $f$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, email_confirmed_at) values (v, 'hh5-' || p_label || '-' || v || '@example.test', now());
  return v;
end $f$;
create function pg_temp.hh5_join(p_hh uuid, p_role text) returns uuid language plpgsql as $f$
declare v uuid := pg_temp.hh5_user(p_role);
begin
  insert into public.household_members (household_id, user_id, role, status, joined_at) values (p_hh, v, p_role, 'active', now());
  update public.profiles set default_household_id = p_hh where id = v;
  return v;
end $f$;
create function pg_temp.hh5_as(p_user uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $f$;
create function pg_temp.hh5_refused(p_sql text, p_message text) returns void language plpgsql as $f$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm <> p_message then
      raise exception '%: expected "%", got "%"', p_sql, p_message, sqlerrm;
    end if;
    return;
  end;
  raise exception 'LEAK: % was allowed', p_sql;
end $f$;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  c constant text := 'select public.set_household_member_role(%L, %L, %L)';
  v_owner uuid := auth.uid();
  v_admin uuid;
  v_admin2 uuid;
  v_member uuid;
  v_viewer uuid;
  v_outsider uuid;
  v_actor uuid;
begin
  if (select m.role from public.household_members m
      where m.household_id = hh and m.user_id = v_owner and m.status = 'active') is distinct from 'owner' then
    raise exception 'setup: the caller is not the household owner';
  end if;

  v_admin := pg_temp.hh5_join(hh, 'admin');
  v_admin2 := pg_temp.hh5_join(hh, 'admin');
  v_member := pg_temp.hh5_join(hh, 'member');
  v_viewer := pg_temp.hh5_join(hh, 'viewer');
  v_outsider := pg_temp.hh5_user('outsider');

  -- The owner: anyone else, to admin, member or viewer.
  perform public.set_household_member_role(hh, v_member, 'admin');
  perform public.set_household_member_role(hh, v_member, 'viewer');
  perform public.set_household_member_role(hh, v_member, 'member');
  perform public.set_household_member_role(hh, v_admin2, 'member');
  perform public.set_household_member_role(hh, v_admin2, 'admin');
  perform pg_temp.hh5_refused(format(c, hh, v_owner, 'admin'), 'You cannot change your own role');
  perform pg_temp.hh5_refused(format(c, hh, v_admin, 'owner'), 'Transfer ownership to make someone the owner');
  perform pg_temp.hh5_refused(format(c, hh, v_admin, 'boss'), 'Choose a valid role');
  perform pg_temp.hh5_refused(format(c, hh, v_outsider, 'member'), 'That person is not an active member of this household');

  if not exists (
    select 1 from public.household_audit_log l
    where l.household_id = hh and l.action = 'member_role_changed' and l.actor_id = v_owner
      and l.target_user_id = v_member and l.metadata = '{"from_role": "viewer", "role": "member"}'::jsonb
  ) then
    raise exception 'no member_role_changed audit event for viewer -> member';
  end if;

  -- An admin: a member or a viewer, to member or viewer, and nothing else.
  perform pg_temp.hh5_as(v_admin);
  perform public.set_household_member_role(hh, v_member, 'viewer');
  perform public.set_household_member_role(hh, v_member, 'member');
  perform public.set_household_member_role(hh, v_viewer, 'member');
  perform public.set_household_member_role(hh, v_viewer, 'viewer');
  perform pg_temp.hh5_refused(format(c, hh, v_member, 'admin'), 'You cannot change this member''s role');
  perform pg_temp.hh5_refused(format(c, hh, v_admin2, 'member'), 'You cannot change this member''s role');
  perform pg_temp.hh5_refused(format(c, hh, v_owner, 'admin'), 'You cannot change this member''s role');
  perform pg_temp.hh5_refused(format(c, hh, v_admin, 'member'), 'You cannot change your own role');

  -- A member, a viewer and someone outside the household: nothing.
  foreach v_actor in array array[v_member, v_viewer, v_outsider] loop
    perform pg_temp.hh5_as(v_actor);
    perform pg_temp.hh5_refused(format(c, hh, v_viewer, 'member'), 'Not authorized to manage this household''s members');
    perform pg_temp.hh5_refused(format(c, hh, v_admin, 'viewer'), 'Not authorized to manage this household''s members');
  end loop;

  if (select array_agg(m.role order by m.role) from public.household_members m
      where m.household_id = hh and m.user_id in (v_admin, v_admin2, v_member, v_viewer) and m.status = 'active')
     <> array['admin', 'admin', 'member', 'viewer'] then
    raise exception 'unexpected roles after the matrix';
  end if;

  -- S26: still exactly one active owner, the same one.
  if (select array_agg(m.user_id) from public.household_members m
      where m.household_id = hh and m.role = 'owner' and m.status = 'active') <> array[v_owner] then
    raise exception 'the household owner changed';
  end if;
end $$;
rollback;

-- ── 3. Removal ───────────────────────────────────────────────────────────

-- check: HH-5 removal follows the section-2 matrix, is a status change and moves the default household (S24, S26)
begin;
reset role;
create function pg_temp.hh5_user(p_label text) returns uuid language plpgsql as $f$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, email_confirmed_at) values (v, 'hh5-' || p_label || '-' || v || '@example.test', now());
  return v;
end $f$;
create function pg_temp.hh5_join(p_hh uuid, p_role text) returns uuid language plpgsql as $f$
declare v uuid := pg_temp.hh5_user(p_role);
begin
  insert into public.household_members (household_id, user_id, role, status, joined_at) values (p_hh, v, p_role, 'active', now());
  update public.profiles set default_household_id = p_hh where id = v;
  return v;
end $f$;
create function pg_temp.hh5_as(p_user uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $f$;
create function pg_temp.hh5_refused(p_sql text, p_message text) returns void language plpgsql as $f$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm <> p_message then
      raise exception '%: expected "%", got "%"', p_sql, p_message, sqlerrm;
    end if;
    return;
  end;
  raise exception 'LEAK: % was allowed', p_sql;
end $f$;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  c constant text := 'select public.remove_household_member(%L, %L)';
  v_owner uuid := auth.uid();
  v_admin uuid;
  v_admin2 uuid;
  v_member uuid;
  v_member2 uuid;
  v_viewer uuid;
  v_other uuid;
begin
  v_admin := pg_temp.hh5_join(hh, 'admin');
  v_admin2 := pg_temp.hh5_join(hh, 'admin');
  v_member := pg_temp.hh5_join(hh, 'member');
  v_member2 := pg_temp.hh5_join(hh, 'member');
  v_viewer := pg_temp.hh5_join(hh, 'viewer');

  -- v_member2 also owns another household, but has this one as default.
  perform pg_temp.hh5_as(v_member2);
  v_other := public.create_household_with_owner('HH-5 other home',
    (select h.base_currency from public.households h where h.id = hh));
  update public.profiles set default_household_id = hh where id = v_member2;

  -- The owner never removes themselves (S26).
  perform pg_temp.hh5_as(v_owner);
  perform pg_temp.hh5_refused(format(c, hh, v_owner), 'You cannot remove yourself. Leave the household instead');

  -- An admin removes members and viewers, not the owner or another admin.
  perform pg_temp.hh5_as(v_admin);
  perform pg_temp.hh5_refused(format(c, hh, v_owner), 'You cannot remove this member');
  perform pg_temp.hh5_refused(format(c, hh, v_admin2), 'You cannot remove this member');
  perform pg_temp.hh5_refused(format(c, hh, v_admin), 'You cannot remove yourself. Leave the household instead');
  perform public.remove_household_member(hh, v_viewer);
  perform public.remove_household_member(hh, v_member2);

  -- A member cannot remove anyone; a removed viewer can do nothing at all.
  perform pg_temp.hh5_as(v_member);
  perform pg_temp.hh5_refused(format(c, hh, v_admin2), 'Not authorized to manage this household''s members');
  perform pg_temp.hh5_as(v_viewer);
  perform pg_temp.hh5_refused(format(c, hh, v_member), 'Not authorized to manage this household''s members');

  -- The owner removes an admin; nobody is removed twice.
  perform pg_temp.hh5_as(v_owner);
  perform public.remove_household_member(hh, v_admin);
  perform pg_temp.hh5_refused(format(c, hh, v_admin), 'That person is not an active member of this household');

  -- S24: one row each, still there, marked removed by whoever removed them.
  if (select count(*) from public.household_members m
      where m.household_id = hh and m.user_id in (v_viewer, v_member2, v_admin)) <> 3 then
    raise exception 'a removed membership row was deleted or duplicated';
  end if;
  if exists (
    select 1 from public.household_members m
    where m.household_id = hh
      and m.user_id in (v_viewer, v_member2, v_admin)
      and (m.status <> 'removed' or m.removed_at is null
           or m.removed_by is distinct from case when m.user_id = v_admin then v_owner else v_admin end)
  ) then
    raise exception 'a removed membership is not marked removed (status, removed_at, removed_by)';
  end if;

  -- S24: the default household moves to another membership, or to none.
  if (select p.default_household_id from public.profiles p where p.id = v_viewer) is not null
    or (select p.default_household_id from public.profiles p where p.id = v_admin) is not null then
    raise exception 'a removed member with no other household still has it as default';
  end if;
  if (select p.default_household_id from public.profiles p where p.id = v_member2) is distinct from v_other then
    raise exception 'a removed member''s default did not move to their other household';
  end if;

  if (select count(*) from public.household_audit_log l
      where l.household_id = hh and l.action = 'member_removed'
        and l.target_user_id in (v_viewer, v_member2, v_admin)) <> 3 then
    raise exception 'expected one member_removed audit event per removal';
  end if;

  -- The owner is untouched (S26).
  if (select array_agg(m.user_id) from public.household_members m
      where m.household_id = hh and m.role = 'owner' and m.status = 'active') <> array[v_owner] then
    raise exception 'the household owner changed';
  end if;

  perform set_config('hh5.removed', v_viewer::text, true);
end $$;
-- MEM-4: under RLS, the removed member reads nothing of the household.
set local role authenticated;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('hh5.removed'), 'role', 'authenticated')::text, true);
  if exists (select 1 from public.households h where h.id = hh)
    or exists (select 1 from public.household_members m where m.household_id = hh)
    or exists (select 1 from public.accounts a where a.household_id = hh)
    or exists (select 1 from public.transactions t where t.household_id = hh) then
    raise exception 'LEAK: a removed member still reads the household';
  end if;
end $$;
rollback;

-- ── 4. Leaving ───────────────────────────────────────────────────────────

-- check: HH-5 anyone but the owner can leave; leaving is a status change (MEM-3, S24, S26)
begin;
reset role;
create function pg_temp.hh5_user(p_label text) returns uuid language plpgsql as $f$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, email_confirmed_at) values (v, 'hh5-' || p_label || '-' || v || '@example.test', now());
  return v;
end $f$;
create function pg_temp.hh5_join(p_hh uuid, p_role text) returns uuid language plpgsql as $f$
declare v uuid := pg_temp.hh5_user(p_role);
begin
  insert into public.household_members (household_id, user_id, role, status, joined_at) values (p_hh, v, p_role, 'active', now());
  update public.profiles set default_household_id = p_hh where id = v;
  return v;
end $f$;
create function pg_temp.hh5_as(p_user uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $f$;
create function pg_temp.hh5_refused(p_sql text, p_message text) returns void language plpgsql as $f$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm <> p_message then
      raise exception '%: expected "%", got "%"', p_sql, p_message, sqlerrm;
    end if;
    return;
  end;
  raise exception 'LEAK: % was allowed', p_sql;
end $f$;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  c constant text := 'select public.leave_household(%L)';
  v_owner uuid := auth.uid();
  v_actor uuid;
  v_leavers uuid[] := array[]::uuid[];
begin
  perform pg_temp.hh5_refused(format(c, hh), 'The owner must transfer ownership before leaving');

  v_leavers := array[pg_temp.hh5_join(hh, 'admin'), pg_temp.hh5_join(hh, 'member'), pg_temp.hh5_join(hh, 'viewer')];
  foreach v_actor in array v_leavers loop
    perform pg_temp.hh5_as(v_actor);
    perform public.leave_household(hh);
    perform pg_temp.hh5_refused(format(c, hh), 'You are not a member of this household');
  end loop;

  if exists (
    select 1 from public.household_members m
    where m.household_id = hh and m.user_id = any (v_leavers)
      and (m.status <> 'removed' or m.removed_at is null or m.removed_by is distinct from m.user_id)
  ) or (select count(*) from public.household_members m
        where m.household_id = hh and m.user_id = any (v_leavers)) <> 3 then
    raise exception 'leaving is not recorded as a removal by the member themselves';
  end if;
  if exists (select 1 from public.profiles p where p.id = any (v_leavers) and p.default_household_id is not null) then
    raise exception 'someone who left still has the household as default';
  end if;
  if (select count(*) from public.household_audit_log l
      where l.household_id = hh and l.action = 'member_left' and l.actor_id = l.target_user_id
        and l.target_user_id = any (v_leavers)) <> 3 then
    raise exception 'expected one member_left audit event per member who left';
  end if;

  perform pg_temp.hh5_as(pg_temp.hh5_user('outsider'));
  perform pg_temp.hh5_refused(format(c, hh), 'You are not a member of this household');

  if (select array_agg(m.user_id) from public.household_members m
      where m.household_id = hh and m.role = 'owner' and m.status = 'active') <> array[v_owner] then
    raise exception 'the household owner changed';
  end if;
end $$;
rollback;

-- ── 5. Ownership transfer ────────────────────────────────────────────────

-- check: HH-5 only the owner transfers ownership, to an active member, and then may leave (S26)
begin;
reset role;
-- On for the probe (the live project ships it off); rolled back with it.
update public.app_feature_flags set enabled = true where name = 'household_sharing';
create function pg_temp.hh5_user(p_label text) returns uuid language plpgsql as $f$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, email_confirmed_at) values (v, 'hh5-' || p_label || '-' || v || '@example.test', now());
  return v;
end $f$;
create function pg_temp.hh5_join(p_hh uuid, p_role text) returns uuid language plpgsql as $f$
declare v uuid := pg_temp.hh5_user(p_role);
begin
  insert into public.household_members (household_id, user_id, role, status, joined_at) values (p_hh, v, p_role, 'active', now());
  update public.profiles set default_household_id = p_hh where id = v;
  return v;
end $f$;
create function pg_temp.hh5_as(p_user uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $f$;
create function pg_temp.hh5_refused(p_sql text, p_message text) returns void language plpgsql as $f$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm <> p_message then
      raise exception '%: expected "%", got "%"', p_sql, p_message, sqlerrm;
    end if;
    return;
  end;
  raise exception 'LEAK: % was allowed', p_sql;
end $f$;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  c constant text := 'select public.transfer_household_ownership(%L, %L)';
  v_owner uuid := auth.uid();
  v_admin uuid;
  v_member uuid;
  v_former uuid;
  v_admin_email text := 'hh5-admin-invite-' || gen_random_uuid() || '@example.test';
  v_member_email text := 'hh5-member-invite-' || gen_random_uuid() || '@example.test';
begin
  update public.household_invitations set revoked_at = coalesce(revoked_at, now())
  where household_id = hh and accepted_at is null;

  v_admin := pg_temp.hh5_join(hh, 'admin');
  v_member := pg_temp.hh5_join(hh, 'member');
  v_former := pg_temp.hh5_join(hh, 'member');
  perform public.remove_household_member(hh, v_former);

  perform pg_temp.hh5_as(v_admin);
  perform pg_temp.hh5_refused(format(c, hh, v_member), 'Only the owner can transfer ownership');
  perform pg_temp.hh5_as(v_member);
  perform pg_temp.hh5_refused(format(c, hh, v_member), 'Only the owner can transfer ownership');

  perform pg_temp.hh5_as(v_owner);
  perform pg_temp.hh5_refused(format(c, hh, v_owner), 'Choose another active member as the new owner');
  perform pg_temp.hh5_refused(format(c, hh, null), 'Choose another active member as the new owner');
  perform pg_temp.hh5_refused(format(c, hh, v_former), 'That person is not an active member of this household');
  perform pg_temp.hh5_refused(format(c, hh, pg_temp.hh5_user('outsider')), 'That person is not an active member of this household');

  -- The owner's pending links: an admin invitation dies with the ownership
  -- (only an owner invites an admin, INV-1); a member invitation survives.
  perform public.create_household_invitation(hh, v_admin_email, 'admin');
  perform public.create_household_invitation(hh, v_member_email, 'member');

  perform public.transfer_household_ownership(hh, v_member);

  if (select array_agg(m.user_id) from public.household_members m
      where m.household_id = hh and m.role = 'owner' and m.status = 'active') <> array[v_member] then
    raise exception 'the new owner is not the one active owner';
  end if;
  if (select m.role from public.household_members m
      where m.household_id = hh and m.user_id = v_owner and m.status = 'active') is distinct from 'admin' then
    raise exception 'the old owner did not stay on as admin';
  end if;
  if not exists (select 1 from public.household_invitations i
                 where i.household_id = hh and i.email = v_admin_email and i.revoked_at is not null)
    or not exists (select 1 from public.household_invitations i
                   where i.household_id = hh and i.email = v_member_email
                     and i.revoked_at is null and i.accepted_at is null) then
    raise exception 'the old owner''s admin invitation must be revoked and the member one kept';
  end if;
  if not exists (
    select 1 from public.household_audit_log l
    where l.household_id = hh and l.action = 'ownership_transferred'
      and l.actor_id = v_owner and l.target_user_id = v_member
  ) then
    raise exception 'no ownership_transferred audit event';
  end if;

  -- The old owner is an admin now: no power over the new owner.
  perform pg_temp.hh5_refused(format(c, hh, v_admin), 'Only the owner can transfer ownership');
  perform pg_temp.hh5_refused(format('select public.remove_household_member(%L, %L)', hh, v_member),
    'You cannot remove this member');
  perform pg_temp.hh5_refused(format('select public.set_household_member_role(%L, %L, %L)', hh, v_member, 'member'),
    'You cannot change this member''s role');

  -- S26: the new owner cannot leave; the old one can now.
  perform pg_temp.hh5_as(v_member);
  perform pg_temp.hh5_refused(format('select public.leave_household(%L)', hh),
    'The owner must transfer ownership before leaving');
  perform pg_temp.hh5_as(v_owner);
  perform public.leave_household(hh);
  if exists (select 1 from public.household_members m
             where m.household_id = hh and m.user_id = v_owner and m.status = 'active') then
    raise exception 'the old owner could not leave after the transfer';
  end if;
end $$;
rollback;

-- ── 6. Exporting your own private data (LIF-1, LIF-2) ──────────────────────

-- check: HH-5 a member exports only their own private data, and a former member can for 30 days
begin;
reset role;
create function pg_temp.hh5_user(p_label text) returns uuid language plpgsql as $f$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, email_confirmed_at) values (v, 'hh5-' || p_label || '-' || v || '@example.test', now());
  return v;
end $f$;
create function pg_temp.hh5_join(p_hh uuid, p_role text) returns uuid language plpgsql as $f$
declare v uuid := pg_temp.hh5_user(p_role);
begin
  insert into public.household_members (household_id, user_id, role, status, joined_at) values (p_hh, v, p_role, 'active', now());
  update public.profiles set default_household_id = p_hh where id = v;
  return v;
end $f$;
create function pg_temp.hh5_as(p_user uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $f$;
create function pg_temp.hh5_refused(p_sql text, p_message text) returns void language plpgsql as $f$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm <> p_message then
      raise exception '%: expected "%", got "%"', p_sql, p_message, sqlerrm;
    end if;
    return;
  end;
  raise exception 'LEAK: % was allowed', p_sql;
end $f$;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  c constant text := 'select * from public.export_my_private_data(%L)';
  v_owner uuid := auth.uid();
  v_member uuid;
  v_member_account uuid := gen_random_uuid();
  v_owner_account uuid := gen_random_uuid();
  v_currency text := (select h.base_currency from public.households h where h.id = hh);
  v_category uuid;
  v_rows int;
  v_sum numeric;
  v_names text[];
  v_former record;
begin
  v_member := pg_temp.hh5_join(hh, 'member');
  v_category := (
    select ca.id from public.categories ca
    where ca.household_id = hh and ca.category_type = 'expense' and ca.deleted_at is null and not ca.is_archived
      and not exists (select 1 from public.categories ch where ch.parent_category_id = ca.id)
    order by ca.name limit 1
  );

  insert into public.accounts
    (id, household_id, name, account_type, account_class, currency_code,
     opening_balance_date, include_in_net_worth, private_owner_id, created_by)
  values
    (v_member_account, hh, 'HH-5 member private', 'checking', 'asset', v_currency, date '2025-01-01', true, v_member, v_member),
    (v_owner_account, hh, 'HH-5 owner private', 'checking', 'asset', v_currency, date '2025-01-01', true, v_owner, v_owner);

  perform pg_temp.hh5_as(v_member);
  perform public.create_opening_balance(hh, v_member_account, 1000, date '2025-01-01', 1, 'hh5');
  perform public.create_manual_transaction(hh, 'expense', date '2025-02-01', v_member_account, v_category, 40,
    'HH-5 private lunch', null, null, 'posted', 1, 'HH-5 private cafe');
  perform pg_temp.hh5_as(v_owner);
  perform public.create_opening_balance(hh, v_owner_account, 500, date '2025-01-01', 1, 'hh5');

  -- LIF-1: an active member exports their own private side, all of it.
  perform pg_temp.hh5_as(v_member);
  select count(*), sum(x.amount), array_agg(distinct x.account_name)
  into v_rows, v_sum, v_names
  from public.export_my_private_data(hh) x;
  if v_rows <> 2 or v_sum <> 960 or v_names <> array['HH-5 member private'] then
    raise exception 'member export: % rows, sum %, accounts % (expected 2 rows, 960, only their account)', v_rows, v_sum, v_names;
  end if;
  if not exists (
    select 1 from public.export_my_private_data(hh) x
    where x.payee_name = 'HH-5 private cafe' and x.category_names is not null and x.amount = -40
  ) then
    raise exception 'the expense row lost its payee, category or sign';
  end if;

  -- Never anyone else's: the owner gets their own and not the member's.
  perform pg_temp.hh5_as(v_owner);
  if exists (select 1 from public.export_my_private_data(hh) x where x.account_name = 'HH-5 member private')
    or not exists (select 1 from public.export_my_private_data(hh) x where x.account_name = 'HH-5 owner private') then
    raise exception 'LEAK: the owner''s export holds another member''s private rows, or misses their own';
  end if;

  perform pg_temp.hh5_as(pg_temp.hh5_user('outsider'));
  perform pg_temp.hh5_refused(format(c, hh), 'This export is no longer available');

  -- LIF-2: after leaving, the export stays for 30 days and the household is listed.
  perform pg_temp.hh5_as(v_member);
  perform public.leave_household(hh);
  select * into v_former from public.get_my_former_households() f where f.household_id = hh;
  if v_former.household_id is null or v_former.private_accounts <> 1
    or v_former.export_until <> v_former.removed_at + interval '30 days' then
    raise exception 'former households: %', v_former;
  end if;
  if (select count(*) from public.export_my_private_data(hh)) <> 2 then
    raise exception 'a former member inside the window lost their export';
  end if;

  update public.household_members set removed_at = now() - interval '31 days'
  where household_id = hh and user_id = v_member;
  perform pg_temp.hh5_refused(format(c, hh), 'This export is no longer available');
  if exists (select 1 from public.get_my_former_households() f where f.household_id = hh) then
    raise exception 'a household left 31 days ago is still offered for export';
  end if;
end $$;
rollback;

-- ── 7. After 30 days (LIF-3) ─────────────────────────────────────────────

-- check: HH-5 the purge soft-deletes only the private accounts of members gone 30 days; rejoining before keeps them
begin;
reset role;
-- On for the probe (the live project ships it off); rolled back with it.
update public.app_feature_flags set enabled = true where name = 'household_sharing';
create function pg_temp.hh5_user(p_label text) returns uuid language plpgsql as $f$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, email_confirmed_at) values (v, 'hh5-' || p_label || '-' || v || '@example.test', now());
  return v;
end $f$;
create function pg_temp.hh5_join(p_hh uuid, p_role text) returns uuid language plpgsql as $f$
declare v uuid := pg_temp.hh5_user(p_role);
begin
  insert into public.household_members (household_id, user_id, role, status, joined_at) values (p_hh, v, p_role, 'active', now());
  update public.profiles set default_household_id = p_hh where id = v;
  return v;
end $f$;
create function pg_temp.hh5_as(p_user uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $f$;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  v_owner uuid := auth.uid();
  v_gone uuid;
  v_recent uuid;
  v_gone_account uuid := gen_random_uuid();
  v_recent_account uuid := gen_random_uuid();
  v_owner_account uuid := gen_random_uuid();
  v_currency text := (select h.base_currency from public.households h where h.id = hh);
  v_shared_deleted int;
  v_token text;
begin
  update public.household_invitations set revoked_at = coalesce(revoked_at, now())
  where household_id = hh and accepted_at is null;

  v_gone := pg_temp.hh5_join(hh, 'member');
  v_recent := pg_temp.hh5_join(hh, 'member');
  insert into public.accounts
    (id, household_id, name, account_type, account_class, currency_code,
     opening_balance_date, include_in_net_worth, private_owner_id, created_by)
  values
    (v_gone_account, hh, 'HH-5 gone private', 'checking', 'asset', v_currency, date '2025-01-01', true, v_gone, v_gone),
    (v_recent_account, hh, 'HH-5 recent private', 'checking', 'asset', v_currency, date '2025-01-01', true, v_recent, v_recent),
    (v_owner_account, hh, 'HH-5 owner private', 'checking', 'asset', v_currency, date '2025-01-01', true, v_owner, v_owner);

  perform pg_temp.hh5_as(v_gone);
  perform public.leave_household(hh);
  perform pg_temp.hh5_as(v_recent);
  perform public.leave_household(hh);
  update public.household_members set removed_at = now() - interval '31 days' where household_id = hh and user_id = v_gone;
  update public.household_members set removed_at = now() - interval '10 days' where household_id = hh and user_id = v_recent;

  v_shared_deleted := (select count(*) from public.accounts a
                       where a.household_id = hh and a.private_owner_id is null and a.deleted_at is not null);

  if public.purge_departed_private_accounts() < 1 then
    raise exception 'the purge soft-deleted nothing';
  end if;

  if not exists (select 1 from public.accounts a
                 where a.id = v_gone_account and a.deleted_at is not null and a.deleted_by = v_gone) then
    raise exception 'the private account of a member gone 31 days was not soft-deleted';
  end if;
  if exists (select 1 from public.accounts a
             where a.id in (v_recent_account, v_owner_account) and a.deleted_at is not null) then
    raise exception 'the purge touched a member inside the window, or an active member';
  end if;
  if (select count(*) from public.accounts a
      where a.household_id = hh and a.private_owner_id is null and a.deleted_at is not null) <> v_shared_deleted then
    raise exception 'the purge touched a shared account';
  end if;
  if (select array_agg(l.metadata) from public.household_audit_log l
      where l.household_id = hh and l.action = 'private_data_expired' and l.target_user_id = v_gone)
     <> array['{"accounts": 1}'::jsonb] then
    raise exception 'expected one private_data_expired event carrying only the count';
  end if;

  -- Idempotent: a second run finds nothing left to do.
  if public.purge_departed_private_accounts() <> 0 then
    raise exception 'a second purge soft-deleted again';
  end if;

  -- Rejoining inside the window (through a real invitation) keeps the accounts.
  perform pg_temp.hh5_as(v_owner);
  v_token := public.create_household_invitation(hh, (select u.email from auth.users u where u.id = v_recent), 'member');
  perform pg_temp.hh5_as(v_recent);
  perform public.accept_household_invitation(v_token);
  perform public.purge_departed_private_accounts();
  if exists (select 1 from public.accounts a where a.id = v_recent_account and a.deleted_at is not null) then
    raise exception 'a member who rejoined inside the window lost their private account';
  end if;

  perform set_config('hh5.rejoined', v_recent::text, true);
  perform set_config('hh5.rejoined_account', v_recent_account::text, true);
end $$;
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('hh5.rejoined'), 'role', 'authenticated')::text, true);
  if not exists (select 1 from public.accounts a where a.id = current_setting('hh5.rejoined_account')::uuid) then
    raise exception 'a member who rejoined does not see their private account again';
  end if;
end $$;
rollback;
