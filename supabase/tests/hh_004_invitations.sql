-- HH-4 invitations (docs/features/household-sharing.md INV-1…INV-10, S9…S16, D6).
--
-- Runs as the household's owner (A1 in A, B1 in B; on the live project, the
-- --user). Every probe that writes is a `begin; … rollback;` block, so nothing
-- it creates survives — not the throwaway users, not the invitations. Inside a
-- probe the checks run as the table owner and impersonate users through
-- request.jwt.claims: the invitation functions are SECURITY DEFINER and read
-- only auth.uid(), so that is exactly what a signed-in caller looks like to
-- them. Direct table access is checked as `authenticated` (the first check).
--
-- Each probe first retires the household's existing invitations (revoked, and
-- moved out of the daily window, inside the rolled-back transaction) so the
-- caps start from zero whatever the household already holds.

-- ── 1. No client reads or writes household_invitations (S9) ──────────────

-- check: HH-4 no client can read or write household_invitations, token_hash included
do $$
begin
  begin
    perform i.token_hash from public.household_invitations i limit 1;
  exception
    when insufficient_privilege then
      null; -- no grant: the only acceptable outcome
    when others then
      raise exception 'expected 42501 on read, got % (%)', sqlstate, sqlerrm;
  end;
  if found then
    raise exception 'LEAK: the household owner read household_invitations';
  end if;

  begin
    insert into public.household_invitations (household_id, email, role, token_hash, invited_by, expires_at)
    values ('__HOUSEHOLD_ID__'::uuid, 'hh4-direct@example.test', 'member', repeat('0', 64), auth.uid(), now() + interval '7 days');
  exception
    when insufficient_privilege then
      return;
    when others then
      raise exception 'expected 42501 on insert, got % (%)', sqlstate, sqlerrm;
  end;
  raise exception 'LEAK: the household owner inserted an invitation directly';
end $$;

-- check: HH-4 the invitation functions are not executable by anon, and the preview cannot write
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.create_household_invitation(uuid, text, text)',
    'public.revoke_household_invitation(uuid)',
    'public.list_household_invitations(uuid)',
    'public.get_household_invitation_preview(text)',
    'public.accept_household_invitation(text)',
    'public.decline_household_invitation(text)'
  ] loop
    if has_function_privilege('anon', fn, 'execute') then
      raise exception 'LEAK: anon can execute %', fn;
    end if;
    if not has_function_privilege('authenticated', fn, 'execute') then
      raise exception '% is not executable by authenticated', fn;
    end if;
  end loop;

  -- S11 at the database: opening the link reads, it never writes.
  if (select p.provolatile from pg_proc p
      where p.oid = 'public.get_household_invitation_preview(text)'::regprocedure) <> 's' then
    raise exception 'get_household_invitation_preview must be STABLE (no writes on GET)';
  end if;

  foreach fn in array array[
    'public.hh_invitation_token_hash(text)',
    'public.hh_new_invitation_token()',
    'public.hh_household_sharing_enabled()',
    'public.hh_revoke_invitations_of_former_admin()'
  ] loop
    if has_function_privilege('authenticated', fn, 'execute') or has_function_privilege('anon', fn, 'execute') then
      raise exception 'LEAK: internal % is executable by a client', fn;
    end if;
  end loop;
end $$;

-- ── 2. The token (S9) ─────────────────────────────────────────────────────

-- check: HH-4 the token is 43 base64url characters, stored only as its SHA-256, valid 7 days
begin;
reset role;
-- On for the probe (the live project ships it off); rolled back with it.
update public.app_feature_flags set enabled = true where name = 'household_sharing';
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  v_token text;
  v_row public.household_invitations%rowtype;
begin
  update public.household_invitations set revoked_at = coalesce(revoked_at, now())
  where household_id = hh and accepted_at is null;
  update public.household_invitations set created_at = created_at - interval '2 days' where household_id = hh;

  v_token := public.create_household_invitation(hh, 'HH4-Token@Example.test ', 'member');
  if v_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'token is not 43 base64url characters: %', length(v_token);
  end if;

  select i.* into v_row from public.household_invitations i
  where i.household_id = hh and i.email = 'hh4-token@example.test' and i.revoked_at is null;

  if v_row.id is null then
    raise exception 'the invitation was not stored under its lowercased, trimmed email';
  end if;
  if v_row.token_hash <> encode(extensions.digest(v_token, 'sha256'), 'hex') then
    raise exception 'token_hash is not the SHA-256 of the token';
  end if;
  if position(v_token in row_to_json(v_row)::text) > 0 then
    raise exception 'LEAK: the raw token is stored in the invitation row';
  end if;
  if v_row.expires_at <> v_row.created_at + interval '7 days' then
    raise exception 'expected a 7-day lifetime, got %', v_row.expires_at - v_row.created_at;
  end if;
  if v_row.invited_by <> auth.uid() or v_row.role <> 'member' then
    raise exception 'invited_by / role not recorded';
  end if;
end $$;
rollback;

-- ── 3. Who may invite whom (INV-1, S13) ───────────────────────────────────

-- check: HH-4 a member, a viewer or a non-member cannot create an invitation or list the pending ones
begin;
reset role;
-- On for the probe (the live project ships it off); rolled back with it.
update public.app_feature_flags set enabled = true where name = 'household_sharing';
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  v_user uuid;
  v_role text;
begin
  foreach v_role in array array['member', 'viewer', 'none'] loop
    v_user := gen_random_uuid();
    insert into auth.users (id, email, email_confirmed_at)
    values (v_user, 'hh4-' || v_role || '-' || v_user || '@example.test', now());
    if v_role <> 'none' then
      insert into public.household_members (household_id, user_id, role, status, joined_at)
      values (hh, v_user, v_role, 'active', now());
    end if;

    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

    -- INV-4: nor read the pending list (emails of people not yet in it).
    begin
      perform 1 from public.list_household_invitations(hh);
      raise exception 'LEAK: a % listed the pending invitations', v_role;
    exception
      when others then
        if sqlerrm <> 'Not authorized to read this household''s invitations' then
          raise exception 'a % listing: got % (%)', v_role, sqlstate, sqlerrm;
        end if;
    end;

    begin
      perform public.create_household_invitation(hh, 'hh4-target-' || v_role || '@example.test', 'viewer');
    exception
      when others then
        if sqlerrm = 'Not authorized to invite to this household' then
          continue;
        end if;
        raise exception 'a % : expected "Not authorized to invite to this household", got % (%)', v_role, sqlstate, sqlerrm;
    end;
    raise exception 'LEAK: a % created an invitation', v_role;
  end loop;
end $$;
rollback;

-- check: HH-4 only the owner invites an admin, nobody invites an owner, nobody invites themselves
begin;
reset role;
-- On for the probe (the live project ships it off); rolled back with it.
update public.app_feature_flags set enabled = true where name = 'household_sharing';
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  v_owner uuid := auth.uid();
  v_admin uuid := gen_random_uuid();
  v_owner_email text;
begin
  update public.household_invitations set revoked_at = coalesce(revoked_at, now())
  where household_id = hh and accepted_at is null;
  update public.household_invitations set created_at = created_at - interval '2 days' where household_id = hh;

  insert into auth.users (id, email, email_confirmed_at)
  values (v_admin, 'hh4-admin-' || v_admin || '@example.test', now());
  insert into public.household_members (household_id, user_id, role, status, joined_at)
  values (hh, v_admin, 'admin', 'active', now());

  -- An admin: member and viewer yes, admin no.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.create_household_invitation(hh, 'hh4-by-admin-member@example.test', 'member');
  perform public.create_household_invitation(hh, 'hh4-by-admin-viewer@example.test', 'viewer');
  begin
    perform public.create_household_invitation(hh, 'hh4-by-admin-admin@example.test', 'admin');
    raise exception 'LEAK: an admin invited an admin';
  exception
    when others then
      if sqlerrm <> 'Only the owner can invite an admin' then
        raise exception 'admin -> admin: got % (%)', sqlstate, sqlerrm;
      end if;
  end;

  -- The owner: admin yes, owner no, their own address no.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform public.create_household_invitation(hh, 'hh4-by-owner-admin@example.test', 'admin');
  begin
    perform public.create_household_invitation(hh, 'hh4-by-owner-owner@example.test', 'owner');
    raise exception 'LEAK: someone was invited as owner';
  exception
    when others then
      if sqlerrm <> 'Choose a valid role for the invitation' then
        raise exception 'owner role: got % (%)', sqlstate, sqlerrm;
      end if;
  end;

  select upper(u.email) into v_owner_email from auth.users u where u.id = v_owner;
  begin
    perform public.create_household_invitation(hh, v_owner_email, 'member');
    raise exception 'LEAK: the owner invited their own address';
  exception
    when others then
      if sqlerrm <> 'You cannot invite your own email address' then
        raise exception 'own email: got % (%)', sqlstate, sqlerrm;
      end if;
  end;
end $$;
rollback;

-- ── 4. Accepting (S3, S10, INV-7, INV-8, INV-9, S25) ──────────────────────

-- check: HH-4 a different account cannot preview details, accept or decline (wrong email)
begin;
reset role;
-- On for the probe (the live project ships it off); rolled back with it.
update public.app_feature_flags set enabled = true where name = 'household_sharing';
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  v_owner uuid := auth.uid();
  v_other uuid := gen_random_uuid();
  v_token text;
  v_preview jsonb;
begin
  update public.household_invitations set revoked_at = coalesce(revoked_at, now())
  where household_id = hh and accepted_at is null;

  insert into auth.users (id, email, email_confirmed_at)
  values (v_other, 'hh4-other-' || v_other || '@example.test', now());
  v_token := public.create_household_invitation(hh, 'hh4-invited@example.test', 'member');

  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);

  -- S12 / INV-7: the status and nothing else — no household, inviter or role.
  v_preview := public.get_household_invitation_preview(v_token);
  if v_preview <> '{"status": "wrong_email"}'::jsonb then
    raise exception 'LEAK: the wrong account''s preview carries more than its status: %', v_preview;
  end if;

  begin
    perform public.accept_household_invitation(v_token);
    raise exception 'LEAK: a different email accepted the invitation';
  exception
    when others then
      if sqlerrm <> 'This invitation was sent to a different email address' then
        raise exception 'accept: got % (%)', sqlstate, sqlerrm;
      end if;
  end;

  begin
    perform public.decline_household_invitation(v_token);
    raise exception 'LEAK: a different email declined the invitation';
  exception
    when others then
      if sqlerrm <> 'This invitation was sent to a different email address' then
        raise exception 'decline: got % (%)', sqlstate, sqlerrm;
      end if;
  end;

  if exists (select 1 from public.household_members m where m.household_id = hh and m.user_id = v_other) then
    raise exception 'LEAK: the wrong account got a membership row';
  end if;
  if not exists (
    select 1 from public.household_invitations i
    where i.household_id = hh and i.email = 'hh4-invited@example.test'
      and i.accepted_at is null and i.revoked_at is null
  ) then
    raise exception 'the invitation should still be pending for its real recipient';
  end if;
end $$;
rollback;

-- check: HH-4 an unverified address can neither see the invitation nor accept it
begin;
reset role;
-- On for the probe (the live project ships it off); rolled back with it.
update public.app_feature_flags set enabled = true where name = 'household_sharing';
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  v_unverified uuid := gen_random_uuid();
  v_token text;
  v_preview jsonb;
begin
  update public.household_invitations set revoked_at = coalesce(revoked_at, now())
  where household_id = hh and accepted_at is null;

  insert into auth.users (id, email, email_confirmed_at)
  values (v_unverified, 'hh4-unverified-' || v_unverified || '@example.test', null);
  v_token := public.create_household_invitation(hh, 'hh4-unverified-' || v_unverified || '@example.test', 'member');

  perform set_config('request.jwt.claims', json_build_object('sub', v_unverified, 'role', 'authenticated')::text, true);

  v_preview := public.get_household_invitation_preview(v_token);
  if v_preview <> '{"status": "unverified"}'::jsonb then
    raise exception 'LEAK: an unverified address previewed %', v_preview;
  end if;

  begin
    perform public.accept_household_invitation(v_token);
    raise exception 'LEAK: an unverified address accepted the invitation';
  exception
    when others then
      if sqlerrm <> 'Confirm your email address first' then
        raise exception 'accept: got % (%)', sqlstate, sqlerrm;
      end if;
  end;

  if exists (select 1 from public.household_members m where m.household_id = hh and m.user_id = v_unverified) then
    raise exception 'LEAK: an unverified address got a membership row';
  end if;
end $$;
rollback;

-- check: HH-4 an expired, a revoked or a replaced invitation is dead (one neutral answer)
begin;
reset role;
-- On for the probe (the live project ships it off); rolled back with it.
update public.app_feature_flags set enabled = true where name = 'household_sharing';
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  v_owner uuid := auth.uid();
  v_invitee uuid := gen_random_uuid();
  v_email text;
  v_expired text;
  v_revoked text;
  v_replaced text;
  v_current text;
  v_token text;
begin
  update public.household_invitations set revoked_at = coalesce(revoked_at, now())
  where household_id = hh and accepted_at is null;
  update public.household_invitations set created_at = created_at - interval '2 days' where household_id = hh;

  v_email := 'hh4-dead-' || v_invitee || '@example.test';
  insert into auth.users (id, email, email_confirmed_at) values (v_invitee, v_email, now());

  -- Each dead link is checked validity-first: a live link opened by another
  -- address would answer "different email", so "no longer valid" proves dead.

  -- Expired: the link outlived its 7 days (its own address, so nothing else
  -- revokes it).
  v_expired := public.create_household_invitation(hh, 'hh4-expired-' || v_invitee || '@example.test', 'member');
  update public.household_invitations set expires_at = now() - interval '1 second'
  where token_hash = encode(extensions.digest(v_expired, 'sha256'), 'hex');

  -- Revoked by the owner.
  v_revoked := public.create_household_invitation(hh, 'hh4-revoked-' || v_invitee || '@example.test', 'member');
  perform public.revoke_household_invitation(
    (select i.id from public.household_invitations i
     where i.token_hash = encode(extensions.digest(v_revoked, 'sha256'), 'hex')));

  -- Replaced: INV-2, a new link for the same email revokes the previous one.
  v_replaced := public.create_household_invitation(hh, v_email, 'member');
  v_current := public.create_household_invitation(hh, v_email, 'viewer');

  perform set_config('request.jwt.claims', json_build_object('sub', v_invitee, 'role', 'authenticated')::text, true);

  foreach v_token in array array[v_expired, v_revoked, v_replaced, 'not-a-real-token', repeat('A', 43)] loop
    if public.get_household_invitation_preview(v_token) <> '{"status": "unavailable"}'::jsonb then
      raise exception 'a dead link previewed as %', public.get_household_invitation_preview(v_token);
    end if;
    begin
      perform public.accept_household_invitation(v_token);
      raise exception 'LEAK: a dead link was accepted';
    exception
      when others then
        if sqlerrm <> 'This invitation is no longer valid' then
          raise exception 'dead link accept: got % (%)', sqlstate, sqlerrm;
        end if;
    end;
  end loop;

  -- The current link still works, with its own role.
  if (public.get_household_invitation_preview(v_current) ->> 'status') <> 'ok' then
    raise exception 'the current link should preview as ok';
  end if;
  perform public.accept_household_invitation(v_current);
  if (select m.role from public.household_members m where m.household_id = hh and m.user_id = v_invitee and m.status = 'active') <> 'viewer' then
    raise exception 'accepting the current link should make a viewer';
  end if;
end $$;
rollback;

-- check: HH-4 an invitation is single use, and accepting it joins with its role and lands in the household
begin;
reset role;
-- On for the probe (the live project ships it off); rolled back with it.
update public.app_feature_flags set enabled = true where name = 'household_sharing';
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  v_invitee uuid := gen_random_uuid();
  v_email text;
  v_token text;
  v_result jsonb;
  v_preview jsonb;
begin
  update public.household_invitations set revoked_at = coalesce(revoked_at, now())
  where household_id = hh and accepted_at is null;

  v_email := 'hh4-joiner-' || v_invitee || '@example.test';
  insert into auth.users (id, email, email_confirmed_at) values (v_invitee, v_email, now());
  v_token := public.create_household_invitation(hh, upper(v_email), 'member');

  perform set_config('request.jwt.claims', json_build_object('sub', v_invitee, 'role', 'authenticated')::text, true);

  -- INV-6: the matching, verified address sees the household and the inviter.
  v_preview := public.get_household_invitation_preview(v_token);
  if v_preview ->> 'status' <> 'ok' or v_preview ->> 'household_name' is null
    or v_preview ->> 'inviter_email' is null or v_preview ->> 'role' <> 'member'
    or (v_preview ->> 'shared_accounts')::int < 0 then
    raise exception 'unexpected preview for the invited address: %', v_preview;
  end if;

  v_result := public.accept_household_invitation(v_token);
  if v_result ->> 'status' <> 'joined' or (v_result ->> 'household_id')::uuid <> hh
    or (v_result ->> 'switched')::boolean is not true then
    raise exception 'unexpected accept result: %', v_result;
  end if;

  if (select m.role from public.household_members m
      where m.household_id = hh and m.user_id = v_invitee and m.status = 'active') is distinct from 'member' then
    raise exception 'the invitee is not an active member';
  end if;
  -- INV-9: no household before, so this one is now theirs.
  if (select p.default_household_id from public.profiles p where p.id = v_invitee) is distinct from hh then
    raise exception 'the invitee should land in the household they joined';
  end if;
  if not exists (
    select 1 from public.household_audit_log l
    where l.household_id = hh and l.action = 'invitation_accepted' and l.actor_id = v_invitee
  ) then
    raise exception 'no invitation_accepted audit event';
  end if;

  -- Single use: the same link is dead now, for its recipient too.
  if public.get_household_invitation_preview(v_token) <> '{"status": "unavailable"}'::jsonb then
    raise exception 'a used link still previews';
  end if;
  begin
    perform public.accept_household_invitation(v_token);
    raise exception 'LEAK: a used invitation was accepted twice';
  exception
    when others then
      if sqlerrm <> 'This invitation is no longer valid' then
        raise exception 'reuse: got % (%)', sqlstate, sqlerrm;
      end if;
  end;
end $$;
rollback;

-- check: HH-4 someone who already has a household keeps it as their active one (INV-9)
begin;
reset role;
-- On for the probe (the live project ships it off); rolled back with it.
update public.app_feature_flags set enabled = true where name = 'household_sharing';
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  v_invitee uuid := gen_random_uuid();
  v_email text;
  v_own uuid;
  v_token text;
  v_result jsonb;
begin
  update public.household_invitations set revoked_at = coalesce(revoked_at, now())
  where household_id = hh and accepted_at is null;

  v_email := 'hh4-has-home-' || v_invitee || '@example.test';
  insert into auth.users (id, email, email_confirmed_at) values (v_invitee, v_email, now());
  v_token := public.create_household_invitation(hh, v_email, 'member');

  perform set_config('request.jwt.claims', json_build_object('sub', v_invitee, 'role', 'authenticated')::text, true);
  v_own := public.create_household_with_owner('HH-4 own home',
    (select h.base_currency from public.households h where h.id = hh));
  update public.profiles set default_household_id = v_own where id = v_invitee;

  v_result := public.accept_household_invitation(v_token);
  if (v_result ->> 'switched')::boolean is not false then
    raise exception 'a user with a household should keep it: %', v_result;
  end if;
  if (select p.default_household_id from public.profiles p where p.id = v_invitee) is distinct from v_own then
    raise exception 'the active household changed';
  end if;
end $$;
rollback;

-- check: HH-4 accepting again reactivates the same membership row (S25)
begin;
reset role;
-- On for the probe (the live project ships it off); rolled back with it.
update public.app_feature_flags set enabled = true where name = 'household_sharing';
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  v_owner uuid := auth.uid();
  v_former uuid := gen_random_uuid();
  v_email text;
  v_row_id uuid;
  v_token text;
begin
  update public.household_invitations set revoked_at = coalesce(revoked_at, now())
  where household_id = hh and accepted_at is null;

  v_email := 'hh4-former-' || v_former || '@example.test';
  insert into auth.users (id, email, email_confirmed_at) values (v_former, v_email, now());
  insert into public.household_members (household_id, user_id, role, status, joined_at, removed_at, removed_by)
  values (hh, v_former, 'viewer', 'removed', now() - interval '60 days', now() - interval '10 days', v_owner)
  returning id into v_row_id;

  v_token := public.create_household_invitation(hh, v_email, 'member');
  perform set_config('request.jwt.claims', json_build_object('sub', v_former, 'role', 'authenticated')::text, true);
  perform public.accept_household_invitation(v_token);

  if (select count(*) from public.household_members m where m.household_id = hh and m.user_id = v_former) <> 1 then
    raise exception 'expected the one membership row, reactivated';
  end if;
  if not exists (
    select 1 from public.household_members m
    where m.id = v_row_id and m.status = 'active' and m.role = 'member'
      and m.removed_at is null and m.removed_by is null
  ) then
    raise exception 'the former member''s row was not reactivated with the new role';
  end if;
end $$;
rollback;

-- check: HH-4 accepting is a no-op for someone already active (S13)
begin;
reset role;
-- On for the probe (the live project ships it off); rolled back with it.
update public.app_feature_flags set enabled = true where name = 'household_sharing';
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  v_member uuid := gen_random_uuid();
  v_email text;
  v_token text;
  v_result jsonb;
begin
  update public.household_invitations set revoked_at = coalesce(revoked_at, now())
  where household_id = hh and accepted_at is null;

  v_email := 'hh4-already-' || v_member || '@example.test';
  insert into auth.users (id, email, email_confirmed_at) values (v_member, v_email, now());
  insert into public.household_members (household_id, user_id, role, status, joined_at)
  values (hh, v_member, 'viewer', 'active', now());

  -- S12: inviting an address that is already a member answers like any other.
  v_token := public.create_household_invitation(hh, v_email, 'admin');

  perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  if (public.get_household_invitation_preview(v_token) ->> 'status') <> 'already_member' then
    raise exception 'an active member should preview as already_member';
  end if;
  v_result := public.accept_household_invitation(v_token);
  if v_result ->> 'status' <> 'already_member' then
    raise exception 'expected already_member, got %', v_result;
  end if;
  if (select m.role from public.household_members m where m.household_id = hh and m.user_id = v_member) <> 'viewer' then
    raise exception 'LEAK: accepting changed an active member''s role';
  end if;
end $$;
rollback;

-- check: HH-4 declining ends the invitation and only the invited address can do it
begin;
reset role;
-- On for the probe (the live project ships it off); rolled back with it.
update public.app_feature_flags set enabled = true where name = 'household_sharing';
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  v_invitee uuid := gen_random_uuid();
  v_email text;
  v_token text;
begin
  update public.household_invitations set revoked_at = coalesce(revoked_at, now())
  where household_id = hh and accepted_at is null;

  v_email := 'hh4-decliner-' || v_invitee || '@example.test';
  insert into auth.users (id, email, email_confirmed_at) values (v_invitee, v_email, now());
  v_token := public.create_household_invitation(hh, v_email, 'member');

  perform set_config('request.jwt.claims', json_build_object('sub', v_invitee, 'role', 'authenticated')::text, true);
  perform public.decline_household_invitation(v_token);

  if not exists (
    select 1 from public.household_invitations i
    where i.token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
      and i.revoked_by = v_invitee and i.revoked_at is not null and i.accepted_at is null
  ) then
    raise exception 'declining did not end the invitation';
  end if;
  begin
    perform public.accept_household_invitation(v_token);
    raise exception 'LEAK: a declined invitation was accepted';
  exception
    when others then
      if sqlerrm <> 'This invitation is no longer valid' then
        raise exception 'accept after decline: got % (%)', sqlstate, sqlerrm;
      end if;
  end;
  if exists (select 1 from public.household_members m where m.household_id = hh and m.user_id = v_invitee) then
    raise exception 'LEAK: declining created a membership row';
  end if;
end $$;
rollback;

-- ── 5. Caps (INV-10, S16) ─────────────────────────────────────────────────

-- check: HH-4 caps — 10 pending invitations, 20 created per day
begin;
reset role;
-- On for the probe (the live project ships it off); rolled back with it.
update public.app_feature_flags set enabled = true where name = 'household_sharing';
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  i int;
begin
  update public.household_invitations set revoked_at = coalesce(revoked_at, now())
  where household_id = hh and accepted_at is null;
  update public.household_invitations set created_at = created_at - interval '2 days' where household_id = hh;

  for i in 1..10 loop
    perform public.create_household_invitation(hh, 'hh4-pending-' || i || '@example.test', 'viewer');
  end loop;
  begin
    perform public.create_household_invitation(hh, 'hh4-pending-11@example.test', 'viewer');
    raise exception 'LEAK: an 11th pending invitation was created';
  exception
    when others then
      if sqlerrm <> 'This household already has 10 pending invitations. Revoke one first' then
        raise exception 'pending cap: got % (%)', sqlstate, sqlerrm;
      end if;
  end;
  -- A new link for an address already pending replaces it, so it is not an 11th.
  perform public.create_household_invitation(hh, 'hh4-pending-1@example.test', 'member');

  -- Revoke them all (pending back to 0) and keep creating: 11 so far today.
  update public.household_invitations set revoked_at = now()
  where household_id = hh and accepted_at is null and revoked_at is null;
  for i in 12..20 loop
    perform public.create_household_invitation(hh, 'hh4-daily-' || i || '@example.test', 'viewer');
  end loop;
  begin
    perform public.create_household_invitation(hh, 'hh4-daily-21@example.test', 'viewer');
    raise exception 'LEAK: a 21st invitation was created within a day';
  exception
    when others then
      if sqlerrm <> 'This household has created 20 invitations in the last day. Try again tomorrow' then
        raise exception 'daily cap: got % (%)', sqlstate, sqlerrm;
      end if;
  end;
end $$;
rollback;

-- check: HH-4 caps — 6 active members (invite and accept both refuse the 7th)
begin;
reset role;
-- On for the probe (the live project ships it off); rolled back with it.
update public.app_feature_flags set enabled = true where name = 'household_sharing';
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  v_owner uuid := auth.uid();
  v_user uuid;
  v_invitee uuid := gen_random_uuid();
  v_email text;
  v_token text;
begin
  update public.household_invitations set revoked_at = coalesce(revoked_at, now())
  where household_id = hh and accepted_at is null;
  update public.household_invitations set created_at = created_at - interval '2 days' where household_id = hh;

  -- Fill the household to 5 active members, invite a 6th…
  while (select count(*) from public.household_members m where m.household_id = hh and m.status = 'active') < 5 loop
    v_user := gen_random_uuid();
    insert into auth.users (id, email, email_confirmed_at) values (v_user, 'hh4-fill-' || v_user || '@example.test', now());
    insert into public.household_members (household_id, user_id, role, status, joined_at)
    values (hh, v_user, 'viewer', 'active', now());
  end loop;
  v_email := 'hh4-sixth-' || v_invitee || '@example.test';
  insert into auth.users (id, email, email_confirmed_at) values (v_invitee, v_email, now());
  v_token := public.create_household_invitation(hh, v_email, 'viewer');

  -- …then someone else takes the 6th place first.
  v_user := gen_random_uuid();
  insert into auth.users (id, email, email_confirmed_at) values (v_user, 'hh4-fill-' || v_user || '@example.test', now());
  insert into public.household_members (household_id, user_id, role, status, joined_at)
  values (hh, v_user, 'viewer', 'active', now());

  begin
    perform public.create_household_invitation(hh, 'hh4-seventh@example.test', 'viewer');
    raise exception 'LEAK: a full household created an invitation';
  exception
    when others then
      if sqlerrm <> 'This household already has the maximum of 6 members' then
        raise exception 'member cap on create: got % (%)', sqlstate, sqlerrm;
      end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_invitee, 'role', 'authenticated')::text, true);
  begin
    perform public.accept_household_invitation(v_token);
    raise exception 'LEAK: a 7th member joined';
  exception
    when others then
      if sqlerrm <> 'This household already has the maximum of 6 members' then
        raise exception 'member cap on accept: got % (%)', sqlstate, sqlerrm;
      end if;
  end;
end $$;
rollback;

-- ── 6. S13: an inviter who stops being owner/admin loses their links ──────

-- check: HH-4 demoting or removing an admin revokes the invitations they created
begin;
reset role;
-- On for the probe (the live project ships it off); rolled back with it.
update public.app_feature_flags set enabled = true where name = 'household_sharing';
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  v_owner uuid := auth.uid();
  v_demoted uuid := gen_random_uuid();
  v_removed uuid := gen_random_uuid();
  v_kept uuid := gen_random_uuid();
begin
  update public.household_invitations set revoked_at = coalesce(revoked_at, now())
  where household_id = hh and accepted_at is null;
  update public.household_invitations set created_at = created_at - interval '2 days' where household_id = hh;

  insert into auth.users (id, email, email_confirmed_at) values
    (v_demoted, 'hh4-demoted-' || v_demoted || '@example.test', now()),
    (v_removed, 'hh4-removed-' || v_removed || '@example.test', now()),
    (v_kept, 'hh4-kept-' || v_kept || '@example.test', now());
  insert into public.household_members (household_id, user_id, role, status, joined_at) values
    (hh, v_demoted, 'admin', 'active', now()),
    (hh, v_removed, 'admin', 'active', now()),
    (hh, v_kept, 'admin', 'active', now());

  perform set_config('request.jwt.claims', json_build_object('sub', v_demoted, 'role', 'authenticated')::text, true);
  perform public.create_household_invitation(hh, 'hh4-from-demoted@example.test', 'member');
  perform set_config('request.jwt.claims', json_build_object('sub', v_removed, 'role', 'authenticated')::text, true);
  perform public.create_household_invitation(hh, 'hh4-from-removed@example.test', 'member');
  perform set_config('request.jwt.claims', json_build_object('sub', v_kept, 'role', 'authenticated')::text, true);
  perform public.create_household_invitation(hh, 'hh4-from-kept@example.test', 'member');

  -- (What HH-5's member RPCs will do; written here as the table owner.)
  update public.household_members set role = 'member' where household_id = hh and user_id = v_demoted;
  update public.household_members set status = 'removed', removed_at = now(), removed_by = v_owner
  where household_id = hh and user_id = v_removed;

  if exists (
    select 1 from public.household_invitations i
    where i.household_id = hh and i.invited_by in (v_demoted, v_removed)
      and i.accepted_at is null and i.revoked_at is null
  ) then
    raise exception 'LEAK: a demoted or removed admin''s invitation is still pending';
  end if;
  if not exists (
    select 1 from public.household_invitations i
    where i.household_id = hh and i.invited_by = v_kept and i.accepted_at is null and i.revoked_at is null
  ) then
    raise exception 'an admin who kept their role lost their invitation';
  end if;
end $$;
rollback;

-- ── 7. D6: no shared -> private while someone holds a link ────────────────

-- check: HH-4 an account cannot be made private while an invitation is pending (D6)
begin;
reset role;
-- On for the probe (the live project ships it off); rolled back with it.
update public.app_feature_flags set enabled = true where name = 'household_sharing';
do $$
declare
  v_owner uuid := auth.uid();
  v_household uuid;
  v_account uuid;
  v_token text;
begin
  -- A fresh single-member household of the caller's, with one shared account.
  v_household := public.create_household_with_owner('HH-4 D6 probe',
    (select h.base_currency from public.households h where h.id = '__HOUSEHOLD_ID__'::uuid));
  insert into public.accounts
    (household_id, name, account_type, account_class, currency_code, opening_balance_date, created_by)
  values (v_household, 'HH-4 probe account', 'checking', 'asset',
    (select h.base_currency from public.households h where h.id = v_household), current_date, v_owner)
  returning id into v_account;

  -- Nothing pending: the dry run passes.
  perform public.set_account_private(v_account, true);

  v_token := public.create_household_invitation(v_household, 'hh4-d6@example.test', 'member');
  begin
    perform public.set_account_private(v_account, true);
    raise exception 'LEAK: an account could be made private with an invitation pending';
  exception
    when others then
      if sqlerrm <> 'An account cannot be made private while an invitation to this household is pending. Revoke it first' then
        raise exception 'pending invitation: got % (%)', sqlstate, sqlerrm;
      end if;
  end;

  perform public.revoke_household_invitation(
    (select i.id from public.household_invitations i
     where i.token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')));
  perform public.set_account_private(v_account, true);
end $$;
rollback;

-- ── 8. The database-side switch ───────────────────────────────────────────

-- check: HH-4 with the database switch off, no invitation is created, previewed, accepted or declined
begin;
reset role;
update public.app_feature_flags set enabled = true where name = 'household_sharing';
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  v_owner uuid := auth.uid();
  v_invitee uuid := gen_random_uuid();
  v_email text;
  v_token text;
begin
  update public.household_invitations set revoked_at = coalesce(revoked_at, now())
  where household_id = hh and accepted_at is null;
  update public.household_invitations set created_at = created_at - interval '2 days' where household_id = hh;

  v_email := 'hh4-switch-' || v_invitee || '@example.test';
  insert into auth.users (id, email, email_confirmed_at) values (v_invitee, v_email, now());
  v_token := public.create_household_invitation(hh, v_email, 'member');

  update public.app_feature_flags set enabled = false where name = 'household_sharing';

  begin
    perform public.create_household_invitation(hh, 'hh4-switch-off@example.test', 'member');
    raise exception 'LEAK: an invitation was created with the switch off';
  exception
    when others then
      if sqlerrm <> 'Household sharing is not enabled' then
        raise exception 'create: got % (%)', sqlstate, sqlerrm;
      end if;
  end;

  -- Cleanup still works: the owner lists and can revoke what is pending.
  if not exists (select 1 from public.list_household_invitations(hh) i where i.email = v_email) then
    raise exception 'list should still work with the switch off';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_invitee, 'role', 'authenticated')::text, true);
  if public.get_household_invitation_preview(v_token) <> '{"status": "unavailable"}'::jsonb then
    raise exception 'LEAK: a link previewed with the switch off';
  end if;
  begin
    perform public.accept_household_invitation(v_token);
    raise exception 'LEAK: an invitation was accepted with the switch off';
  exception
    when others then
      if sqlerrm <> 'This invitation is no longer valid' then
        raise exception 'accept: got % (%)', sqlstate, sqlerrm;
      end if;
  end;
  begin
    perform public.decline_household_invitation(v_token);
    raise exception 'LEAK: an invitation was declined with the switch off';
  exception
    when others then
      if sqlerrm <> 'This invitation is no longer valid' then
        raise exception 'decline: got % (%)', sqlstate, sqlerrm;
      end if;
  end;
  if exists (select 1 from public.household_members m where m.household_id = hh and m.user_id = v_invitee) then
    raise exception 'LEAK: a membership row appeared with the switch off';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform public.revoke_household_invitation(
    (select i.id from public.household_invitations i
     where i.token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')));
end $$;
rollback;

-- check: HH-4 no client can read or change the feature switches
do $$
begin
  begin
    update public.app_feature_flags set enabled = true where name = 'household_sharing';
  exception
    when insufficient_privilege then
      return;
    when others then
      raise exception 'expected 42501, got % (%)', sqlstate, sqlerrm;
  end;
  raise exception 'LEAK: a client changed app_feature_flags';
end $$;
