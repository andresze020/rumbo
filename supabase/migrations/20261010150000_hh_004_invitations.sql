-- ============================================================
-- Rumbo — HH-4: household invitations
-- Spec: docs/features/household-sharing.md INV-1…INV-10, S9…S16, D4, D6.
-- ------------------------------------------------------------
-- The only way a second person joins a household (S2, S3). An owner/admin
-- creates a single-use link bound to one email; the invited person opens it,
-- signs in with that email (verified), and accepts.
--
-- The raw token exists only in create_household_invitation's return value,
-- the link the inviter is shown once, and the invite URL. The table keeps its
-- SHA-256 (S9); nothing here logs, stores or returns it again.
--
-- household_invitations has no client grant and no usable policy: every read
-- and write goes through the SECURITY DEFINER functions below, which check the
-- caller first (fixed search_path, revoked from public and anon). token_hash
-- is therefore unreadable to every client, owner included.
--
-- Caps (INV-10, S16): 10 pending invitations and 6 active members per
-- household, 20 invitations created per household per rolling day. Creation
-- locks the household row so two concurrent creates cannot both pass a cap.
--
-- No enumeration (S12): creating an invitation never looks at auth.users for
-- the invited email, so it answers the same whether or not the address has an
-- account; a preview for the wrong account says only "wrong_email".
--
-- S13: removing an admin, or demoting them below admin, revokes the pending
-- invitations they created (a trigger, so HH-5's member RPCs get it for
-- free). Accepting is refused for the inviter and is a no-op for someone who
-- is already an active member.
--
-- D6, second half: set_account_private now also refuses while an invitation
-- to the household is pending (HH-1 left that clause for this phase).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Table
-- ------------------------------------------------------------
create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null,
  role text not null,
  token_hash text not null,
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  constraint household_invitations_role_chk check (role in ('admin', 'member', 'viewer')),
  constraint household_invitations_email_chk check (
    email = lower(btrim(email)) and length(email) between 3 and 320 and position('@' in email) > 1
  ),
  constraint household_invitations_token_hash_chk check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint household_invitations_token_hash_key unique (token_hash),
  -- An invitation ends once: accepted, or revoked (revoke, decline, replaced).
  constraint household_invitations_closed_once_chk check (accepted_at is null or revoked_at is null)
);

comment on table public.household_invitations is
  'HH-4: single-use links to join a household, bound to one email. No client access: '
  'read and written only by the SECURITY DEFINER invitation functions. token_hash is the '
  'SHA-256 of the raw token, which is never stored.';

-- INV-2: one pending invitation per (household, email); a new link revokes the
-- previous one first. An expired, unrevoked row still counts here until then.
create unique index household_invitations_one_pending_idx
  on public.household_invitations (household_id, email)
  where accepted_at is null and revoked_at is null;

-- The daily cap and the settings list.
create index household_invitations_household_created_idx
  on public.household_invitations (household_id, created_at desc);

-- S13: the pending invitations of one inviter.
create index household_invitations_pending_inviter_idx
  on public.household_invitations (invited_by)
  where accepted_at is null and revoked_at is null;

alter table public.household_invitations enable row level security;
revoke all on table public.household_invitations from public, anon, authenticated;

-- Never evaluated (no grant reaches it); states the intent and keeps the
-- "RLS enabled, no policy" advisor quiet.
create policy "household_invitations_no_client_access"
on public.household_invitations
for all
to authenticated
using (false)
with check (false);

-- ------------------------------------------------------------
-- 2. Internal helpers
-- ------------------------------------------------------------
create or replace function public.hh_invitation_token_hash(p_token text)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

revoke all on function public.hh_invitation_token_hash(text) from public, anon, authenticated;

-- 32 random bytes, base64url without padding: 43 characters (S9).
create or replace function public.hh_new_invitation_token()
returns text
language sql
volatile
set search_path = public
as $$
  select rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=')
$$;

revoke all on function public.hh_new_invitation_token() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. create_household_invitation (INV-1, INV-2, INV-10, S9, S12, S16)
-- ------------------------------------------------------------
create or replace function public.create_household_invitation(
  p_household_id uuid,
  p_email text,
  p_role text
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_caller_role text;
  v_caller_email text;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text;
  v_invitation_id uuid;
begin
  if v_user is null then
    raise exception 'Not authorized';
  end if;

  select m.role into v_caller_role
  from public.household_members m
  where m.household_id = p_household_id and m.user_id = v_user and m.status = 'active';

  if v_caller_role is null or v_caller_role not in ('owner', 'admin') then
    raise exception 'Not authorized to invite to this household';
  end if;

  -- INV-1: nobody invites an owner; only the owner invites an admin.
  if coalesce(p_role, '') not in ('admin', 'member', 'viewer') then
    raise exception 'Choose a valid role for the invitation';
  end if;

  if p_role = 'admin' and v_caller_role <> 'owner' then
    raise exception 'Only the owner can invite an admin';
  end if;

  if length(v_email) > 320 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address';
  end if;

  select lower(u.email) into v_caller_email from auth.users u where u.id = v_user;
  if v_email = v_caller_email then
    raise exception 'You cannot invite your own email address';
  end if;

  -- One creation at a time per household, so the caps count what they see.
  perform 1 from public.households h where h.id = p_household_id for update;

  if (
    select count(*) from public.household_members m
    where m.household_id = p_household_id and m.status = 'active'
  ) >= 6 then
    raise exception 'This household already has the maximum of 6 members';
  end if;

  -- The same email's pending link is about to be replaced, so it does not count.
  if (
    select count(*) from public.household_invitations i
    where i.household_id = p_household_id
      and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
      and i.email <> v_email
  ) >= 10 then
    raise exception 'This household already has 10 pending invitations. Revoke one first';
  end if;

  if (
    select count(*) from public.household_invitations i
    where i.household_id = p_household_id and i.created_at > now() - interval '1 day'
  ) >= 20 then
    raise exception 'This household has created 20 invitations in the last day. Try again tomorrow';
  end if;

  -- INV-2: a new link for the same email revokes the previous one.
  update public.household_invitations i
  set revoked_at = now(), revoked_by = v_user
  where i.household_id = p_household_id
    and i.email = v_email
    and i.accepted_at is null and i.revoked_at is null;

  v_token := public.hh_new_invitation_token();

  insert into public.household_invitations (household_id, email, role, token_hash, invited_by, expires_at)
  values (
    p_household_id, v_email, p_role, public.hh_invitation_token_hash(v_token), v_user,
    now() + interval '7 days'
  )
  returning id into v_invitation_id;

  insert into public.household_audit_log (household_id, actor_id, action, target_user_id, metadata)
  values (
    p_household_id, v_user, 'invitation_created', null,
    jsonb_build_object('invitation_id', v_invitation_id, 'email', v_email, 'role', p_role)
  );

  -- The only time the raw token leaves the database.
  return v_token;
end;
$$;

revoke all on function public.create_household_invitation(uuid, text, text) from public, anon;
grant execute on function public.create_household_invitation(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 4. revoke_household_invitation / list_household_invitations (INV-4)
-- ------------------------------------------------------------
create or replace function public.revoke_household_invitation(p_invitation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_invitation public.household_invitations%rowtype;
  v_caller_role text;
begin
  if v_user is null then
    raise exception 'Not authorized';
  end if;

  select i.* into v_invitation
  from public.household_invitations i
  where i.id = p_invitation_id
  for update;

  select m.role into v_caller_role
  from public.household_members m
  where m.household_id = v_invitation.household_id and m.user_id = v_user and m.status = 'active';

  -- The same answer for a missing invitation and one in another household.
  if v_invitation.id is null or v_caller_role is null or v_caller_role not in ('owner', 'admin') then
    raise exception 'invitation not found';
  end if;

  if v_invitation.role = 'admin' and v_caller_role <> 'owner' then
    raise exception 'Only the owner can revoke an admin invitation';
  end if;

  if v_invitation.accepted_at is not null or v_invitation.revoked_at is not null then
    raise exception 'This invitation is no longer pending';
  end if;

  update public.household_invitations i
  set revoked_at = now(), revoked_by = v_user
  where i.id = v_invitation.id;

  insert into public.household_audit_log (household_id, actor_id, action, target_user_id, metadata)
  values (
    v_invitation.household_id, v_user, 'invitation_revoked', null,
    jsonb_build_object('invitation_id', v_invitation.id, 'email', v_invitation.email, 'role', v_invitation.role)
  );
end;
$$;

revoke all on function public.revoke_household_invitation(uuid) from public, anon;
grant execute on function public.revoke_household_invitation(uuid) to authenticated;

-- Pending (not accepted, not revoked, not expired) invitations, owner/admin only.
-- Every column is alias-qualified: the OUT parameters share their names.
create or replace function public.list_household_invitations(p_household_id uuid)
returns table (
  id uuid,
  email text,
  role text,
  invited_by uuid,
  invited_by_name text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_household_admin(p_household_id) then
    raise exception 'Not authorized to read this household''s invitations';
  end if;

  return query
  select i.id, i.email, i.role, i.invited_by, p.display_name, i.created_at, i.expires_at
  from public.household_invitations i
  left join public.profiles p on p.id = i.invited_by
  where i.household_id = p_household_id
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
  order by i.created_at desc;
end;
$$;

revoke all on function public.list_household_invitations(uuid) from public, anon;
grant execute on function public.list_household_invitations(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. get_household_invitation_preview (INV-6, INV-7, INV-8, S11, S12)
-- ------------------------------------------------------------
-- What the invite page shows a signed-in user. Read-only (STABLE): opening the
-- link changes nothing. One neutral answer for an unknown, expired, revoked or
-- used token; for a valid one opened by the wrong account, only "wrong_email";
-- household details only to the invited, verified email.
create or replace function public.get_household_invitation_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_invitation public.household_invitations%rowtype;
  v_email text;
  v_confirmed_at timestamptz;
  v_household_name text;
  v_inviter_name text;
  v_inviter_email text;
begin
  if v_user is null then
    raise exception 'Not authorized';
  end if;

  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select i.* into v_invitation
  from public.household_invitations i
  where i.token_hash = public.hh_invitation_token_hash(p_token);

  if v_invitation.id is null
    or v_invitation.accepted_at is not null
    or v_invitation.revoked_at is not null
    or v_invitation.expires_at <= now() then
    return jsonb_build_object('status', 'unavailable');
  end if;

  -- S10: auth.users, never metadata or anything the client sends.
  select lower(u.email), u.email_confirmed_at into v_email, v_confirmed_at
  from auth.users u where u.id = v_user;

  if v_email is distinct from v_invitation.email then
    return jsonb_build_object('status', 'wrong_email');
  end if;

  if v_confirmed_at is null then
    return jsonb_build_object('status', 'unverified');
  end if;

  select h.name into v_household_name from public.households h where h.id = v_invitation.household_id;

  if exists (
    select 1 from public.household_members m
    where m.household_id = v_invitation.household_id and m.user_id = v_user and m.status = 'active'
  ) then
    return jsonb_build_object(
      'status', 'already_member',
      'household_id', v_invitation.household_id,
      'household_name', v_household_name
    );
  end if;

  select p.display_name into v_inviter_name from public.profiles p where p.id = v_invitation.invited_by;
  select u.email into v_inviter_email from auth.users u where u.id = v_invitation.invited_by;

  return jsonb_build_object(
    'status', 'ok',
    'household_name', v_household_name,
    'inviter_name', v_inviter_name,
    'inviter_email', v_inviter_email,
    'role', v_invitation.role,
    'expires_at', v_invitation.expires_at,
    -- "What is shared": every shared account and its full history.
    'shared_accounts', (
      select count(*) from public.accounts a
      where a.household_id = v_invitation.household_id
        and a.private_owner_id is null
        and a.deleted_at is null
    )
  );
end;
$$;

revoke all on function public.get_household_invitation_preview(text) from public, anon;
grant execute on function public.get_household_invitation_preview(text) to authenticated;

-- ------------------------------------------------------------
-- 6. accept_household_invitation (INV-9, S3, S9, S10, S13, S25)
-- ------------------------------------------------------------
create or replace function public.accept_household_invitation(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_invitation public.household_invitations%rowtype;
  v_email text;
  v_confirmed_at timestamptz;
  v_member_id uuid;
  v_reactivated boolean := false;
  v_default uuid;
  v_switched boolean := false;
begin
  if v_user is null then
    raise exception 'Not authorized';
  end if;

  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'This invitation is no longer valid';
  end if;

  -- S9: single use. The row lock makes a second, concurrent accept wait and
  -- then see accepted_at.
  select i.* into v_invitation
  from public.household_invitations i
  where i.token_hash = public.hh_invitation_token_hash(p_token)
  for update;

  if v_invitation.id is null
    or v_invitation.accepted_at is not null
    or v_invitation.revoked_at is not null
    or v_invitation.expires_at <= now() then
    raise exception 'This invitation is no longer valid';
  end if;

  -- S10: the caller's own verified address, from auth.users.
  select lower(u.email), u.email_confirmed_at into v_email, v_confirmed_at
  from auth.users u where u.id = v_user;

  if v_email is distinct from v_invitation.email then
    raise exception 'This invitation was sent to a different email address';
  end if;

  if v_confirmed_at is null then
    raise exception 'Confirm your email address first';
  end if;

  -- S13: never the inviter (creation already refuses their own email).
  if v_invitation.invited_by = v_user then
    raise exception 'You cannot accept your own invitation';
  end if;

  -- S13: a no-op for someone already active; the link stays as it was.
  if exists (
    select 1 from public.household_members m
    where m.household_id = v_invitation.household_id and m.user_id = v_user and m.status = 'active'
  ) then
    return jsonb_build_object(
      'status', 'already_member', 'household_id', v_invitation.household_id, 'switched', false
    );
  end if;

  -- INV-10: the member cap, counted under the household lock.
  perform 1 from public.households h where h.id = v_invitation.household_id for update;

  if (
    select count(*) from public.household_members m
    where m.household_id = v_invitation.household_id and m.status = 'active'
  ) >= 6 then
    raise exception 'This household already has the maximum of 6 members';
  end if;

  -- S25: accepting again reactivates the existing row.
  update public.household_members m
  set role = v_invitation.role,
      status = 'active',
      removed_at = null,
      removed_by = null,
      joined_at = now()
  where m.household_id = v_invitation.household_id and m.user_id = v_user
  returning m.id into v_member_id;

  if v_member_id is not null then
    v_reactivated := true;
  else
    insert into public.household_members (household_id, user_id, role, status, joined_at)
    values (v_invitation.household_id, v_user, v_invitation.role, 'active', now());
  end if;

  update public.household_invitations i
  set accepted_at = now(), accepted_by = v_user
  where i.id = v_invitation.id;

  -- INV-9: someone with no active household lands in this one; someone with
  -- one keeps it (the app offers the switch).
  select p.default_household_id into v_default from public.profiles p where p.id = v_user;

  if v_default is null or not exists (
    select 1 from public.household_members m
    where m.household_id = v_default and m.user_id = v_user and m.status = 'active'
  ) then
    update public.profiles p
    set default_household_id = v_invitation.household_id
    where p.id = v_user;
    v_switched := true;
  end if;

  insert into public.household_audit_log (household_id, actor_id, action, target_user_id, metadata)
  values (
    v_invitation.household_id, v_user, 'invitation_accepted', v_user,
    jsonb_build_object('invitation_id', v_invitation.id, 'role', v_invitation.role, 'reactivated', v_reactivated)
  );

  return jsonb_build_object(
    'status', 'joined', 'household_id', v_invitation.household_id, 'switched', v_switched
  );
end;
$$;

revoke all on function public.accept_household_invitation(text) from public, anon;
grant execute on function public.accept_household_invitation(text) to authenticated;

-- ------------------------------------------------------------
-- 7. decline_household_invitation
-- ------------------------------------------------------------
-- Only the invited, verified address can decline: anyone else holding the
-- link must not be able to kill it.
create or replace function public.decline_household_invitation(p_token text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_invitation public.household_invitations%rowtype;
  v_email text;
  v_confirmed_at timestamptz;
begin
  if v_user is null then
    raise exception 'Not authorized';
  end if;

  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'This invitation is no longer valid';
  end if;

  select i.* into v_invitation
  from public.household_invitations i
  where i.token_hash = public.hh_invitation_token_hash(p_token)
  for update;

  if v_invitation.id is null
    or v_invitation.accepted_at is not null
    or v_invitation.revoked_at is not null
    or v_invitation.expires_at <= now() then
    raise exception 'This invitation is no longer valid';
  end if;

  select lower(u.email), u.email_confirmed_at into v_email, v_confirmed_at
  from auth.users u where u.id = v_user;

  if v_email is distinct from v_invitation.email then
    raise exception 'This invitation was sent to a different email address';
  end if;

  if v_confirmed_at is null then
    raise exception 'Confirm your email address first';
  end if;

  update public.household_invitations i
  set revoked_at = now(), revoked_by = v_user
  where i.id = v_invitation.id;

  insert into public.household_audit_log (household_id, actor_id, action, target_user_id, metadata)
  values (
    v_invitation.household_id, v_user, 'invitation_declined', v_user,
    jsonb_build_object('invitation_id', v_invitation.id, 'role', v_invitation.role)
  );
end;
$$;

revoke all on function public.decline_household_invitation(text) from public, anon;
grant execute on function public.decline_household_invitation(text) to authenticated;

-- ------------------------------------------------------------
-- 8. S13: an inviter who stops being owner/admin loses their pending links
-- ------------------------------------------------------------
create or replace function public.hh_revoke_invitations_of_former_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'active' and old.role in ('owner', 'admin')
    and (new.status <> 'active' or new.role not in ('owner', 'admin')) then
    update public.household_invitations i
    set revoked_at = now(), revoked_by = auth.uid()
    where i.household_id = new.household_id
      and i.invited_by = new.user_id
      and i.accepted_at is null
      and i.revoked_at is null;
  end if;
  return null;
end;
$$;

revoke all on function public.hh_revoke_invitations_of_former_admin() from public, anon, authenticated;

create trigger trg_household_members_revoke_invitations
after update of role, status on public.household_members
for each row execute function public.hh_revoke_invitations_of_former_admin();

-- ------------------------------------------------------------
-- 9. set_account_private: D6 also refuses while an invitation is pending
-- ------------------------------------------------------------
-- Re-issued whole from 20261009160000_hh_001_account_privacy_rpcs.sql; the
-- only change is the pending-invitation check after the single-member one.
create or replace function public.set_account_private(
  p_account_id uuid,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_account record;
  v_impact jsonb;
  v_payee record;
  v_payee_ids uuid[];
  v_twin uuid;
begin
  if v_user is null then
    raise exception 'Not authorized';
  end if;

  select a.id, a.household_id, a.name, a.private_owner_id
  into v_account
  from public.accounts a
  where a.id = p_account_id
    and a.deleted_at is null
    and exists (
      select 1 from public.household_members m
      where m.household_id = a.household_id and m.user_id = v_user and m.status = 'active'
    )
    and (a.private_owner_id is null or a.private_owner_id = v_user);

  if v_account.id is null then
    raise exception 'account not found for household';
  end if;

  if v_account.private_owner_id is not null then
    raise exception 'This account is already private';
  end if;

  if not public.is_household_admin(v_account.household_id) then
    raise exception 'Not authorized to change this account';
  end if;

  -- D6: never while anyone else could lose sight of money they shared in.
  if (
    select count(*) from public.household_members m
    where m.household_id = v_account.household_id and m.status = 'active'
  ) <> 1 then
    raise exception 'An account can only be made private while you are the only member of the household';
  end if;

  -- D6, second half (HH-4): nor while someone holds a link to join.
  if exists (
    select 1 from public.household_invitations i
    where i.household_id = v_account.household_id
      and i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > now()
  ) then
    raise exception 'An account cannot be made private while an invitation to this household is pending. Revoke it first';
  end if;

  -- PRV-8: a shared card cannot be paid from a private account.
  if exists (
    select 1 from public.accounts c
    where c.billing_account_id = p_account_id
      and c.private_owner_id is null
      and c.deleted_at is null
  ) then
    raise exception 'A shared card is paid from this account. Change that card''s payment account first';
  end if;

  if exists (
    select 1 from public.accounts o
    where o.household_id = v_account.household_id
      and o.private_owner_id = v_user
      and o.deleted_at is null
      and lower(o.name) = lower(v_account.name)
  ) then
    raise exception 'You already have a private account with this name. Rename one first';
  end if;

  if exists (
    select 1 from public.csv_import_presets cp
    join public.csv_import_presets mine
      on mine.household_id = cp.household_id
     and mine.private_owner_id = v_user
     and lower(mine.name) = lower(cp.name)
    where cp.target_account_id = p_account_id
  ) then
    raise exception 'You already have a private import preset with the same name as one that uses this account. Rename one first';
  end if;

  -- Shared payees that only what becomes private uses: transactions that will
  -- have every entry in this account or in the caller's private accounts, and
  -- rules or plans on this account (or already private). A rule that has not
  -- posted yet counts too.
  with becomes_private as (
    select t.id
    from public.transactions t
    where t.household_id = v_account.household_id
      and exists (
        select 1 from public.transaction_entries e
        where e.transaction_id = t.id and e.account_id = p_account_id
      )
      and not exists (
        select 1 from public.transaction_entries e
        join public.accounts a on a.id = e.account_id
        where e.transaction_id = t.id
          and a.id <> p_account_id
          and a.private_owner_id is distinct from v_user
      )
  )
  select coalesce(array_agg(p.id), '{}')
  into v_payee_ids
  from public.payees p
  where p.household_id = v_account.household_id
    and p.private_owner_id is null
    and (
      exists (
        select 1 from public.transactions t
        where t.payee_id = p.id and t.id in (select bp.id from becomes_private bp)
      )
      or exists (
        select 1 from public.recurring_transactions r
        where r.payee_id = p.id and (r.account_id = p_account_id or r.to_account_id = p_account_id)
      )
      or exists (
        select 1 from public.installment_plans ip
        where ip.payee_id = p.id and ip.account_id = p_account_id
      )
    )
    and not exists (
      select 1 from public.transactions t
      where t.payee_id = p.id
        and t.visibility <> 'private'
        and t.id not in (select bp.id from becomes_private bp)
    )
    and not exists (
      select 1 from public.recurring_transactions r
      where r.payee_id = p.id
        and r.private_owner_id is null
        and r.account_id is distinct from p_account_id
        and r.to_account_id is distinct from p_account_id
    )
    and not exists (
      select 1 from public.installment_plans ip
      where ip.payee_id = p.id
        and ip.private_owner_id is null
        and ip.account_id <> p_account_id
    );

  v_impact := public.hh_account_privacy_impact(p_account_id)
    || jsonb_build_object('payees', cardinality(v_payee_ids));

  if coalesce(p_dry_run, false) then
    return v_impact || jsonb_build_object('applied', false);
  end if;

  update public.accounts set private_owner_id = v_user where id = p_account_id;
  perform public.hh_propagate_account_privacy(p_account_id);

  -- Each such payee goes private, or folds into the caller's private payee of
  -- the same name when there already is one (unarchived if the folded payee
  -- was in use: the name must stay pickable).
  for v_payee in
    select p.id, p.name, p.is_archived from public.payees p where p.id = any(v_payee_ids)
  loop
    select p.id into v_twin
    from public.payees p
    where p.household_id = v_account.household_id
      and p.private_owner_id = v_user
      and lower(p.name) = lower(v_payee.name)
    limit 1;

    if v_twin is null then
      update public.payees set private_owner_id = v_user where id = v_payee.id;
    else
      update public.transactions set payee_id = v_twin where payee_id = v_payee.id;
      update public.recurring_transactions set payee_id = v_twin where payee_id = v_payee.id;
      update public.installment_plans set payee_id = v_twin where payee_id = v_payee.id;
      update public.payees set is_archived = true where id = v_payee.id;
      if not v_payee.is_archived then
        update public.payees set is_archived = false where id = v_twin and is_archived;
      end if;
    end if;
  end loop;

  return v_impact || jsonb_build_object('applied', true);
end;
$$;

revoke all on function public.set_account_private(uuid, boolean) from public, anon;
grant execute on function public.set_account_private(uuid, boolean) to authenticated;
