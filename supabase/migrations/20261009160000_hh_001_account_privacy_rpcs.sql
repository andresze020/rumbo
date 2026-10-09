-- ============================================================
-- Rumbo — HH-1 (5/5): set_account_private / share_private_account
-- Spec: docs/features/household-sharing.md D6, PRV-5, PRV-6, PRV-8, §4
-- "Functions", MEM-6.
-- ------------------------------------------------------------
-- The only two ways an account's visibility changes after INSERT (the guard
-- trigger refuses it to every client and invoker RPC). Both are SECURITY
-- DEFINER, so they check everything themselves, in this order:
--   1. auth.uid() is set;
--   2. the account exists, is not deleted, and its household has the caller
--      as an active member — otherwise "account not found", the same answer
--      as for an id that does not exist (S5);
--   3. the rule for the direction (below);
--   4. p_dry_run: return the counts and change nothing (HH-3's confirmation
--      dialog states them, PRV-5);
--   5. otherwise flip the account, re-derive every dependent row in this one
--      transaction (hh_propagate_account_privacy) and return the same counts.
--
-- set_account_private (shared -> private), D6/PRV-6: only an owner/admin, and
-- only while the household has exactly one active member. (HH-4 adds "and no
-- pending invitation" when the invitations table exists.) Payees used only by
-- what becomes private go private with it — this runs right before someone is
-- invited, and a payee name is as revealing as the account's. It writes NO
-- audit row: the log is readable by every later owner/admin, and even an id
-- and a count would tell them a hidden account exists (D2; found in the HH-1
-- review).
--
-- share_private_account (private -> shared), D6/PRV-5: only the account's
-- owner, with editor rights. With more than one member it cannot be undone.
-- Every private payee used by the account's transactions, recurring rules or
-- installment plans becomes visible with them: merged into the shared payee
-- of the same name when there is one, otherwise flipped to shared.
--
-- PRV-8 is checked before any write in both directions (the accounts guard
-- trigger would also refuse, with a less helpful message), and so are the
-- per-owner name indexes of accounts and import presets (S6). The one audit
-- row (account_shared) is written when the account becomes visible anyway; it
-- carries the account id and counts, never its name.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Re-derive everything that hangs from one account
-- ------------------------------------------------------------
-- Touching each row re-runs its BEFORE trigger, which re-reads the account.
-- Entries cascade to their transactions, allocations and tag links (AFTER
-- trigger); rules cascade to their autopost log, batches to their rows.
create or replace function public.hh_propagate_account_privacy(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.transaction_entries set private_owner_id = private_owner_id where account_id = p_account_id;
  update public.debts set private_owner_id = private_owner_id where account_id = p_account_id;
  update public.installment_plans set private_owner_id = private_owner_id where account_id = p_account_id;
  update public.goals set private_owner_id = private_owner_id where linked_account_id = p_account_id;
  update public.recurring_transactions set private_owner_id = private_owner_id
  where account_id = p_account_id or to_account_id = p_account_id;
  -- Batches that target the account, and batches whose transactions or rows
  -- touch it (a CSV's Account column can send rows to any account; an invalid
  -- row keeps its mapped account and posts nothing).
  update public.import_batches set private_owner_id = private_owner_id
  where target_account_id = p_account_id
     or id in (
       select t.import_batch_id
       from public.transactions t
       join public.transaction_entries e on e.transaction_id = t.id
       where e.account_id = p_account_id and t.import_batch_id is not null
     )
     or id in (
       select r.import_batch_id
       from public.import_rows r
       where r.household_id = (select a.household_id from public.accounts a where a.id = p_account_id)
         and lower(trim(r.mapped_data ->> 'account_id')) = p_account_id::text
     );
  update public.csv_import_presets set private_owner_id = private_owner_id where target_account_id = p_account_id;
end;
$$;

revoke all on function public.hh_propagate_account_privacy(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. What a change touches (for the dialog and the audit row)
-- ------------------------------------------------------------
create or replace function public.hh_account_privacy_impact(p_account_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'transactions', (
      select count(distinct e.transaction_id)
      from public.transaction_entries e
      join public.transactions t on t.id = e.transaction_id
      where e.account_id = p_account_id
        and t.deleted_at is null
    ),
    'linked_items', (
      (select count(*) from public.debts d where d.account_id = p_account_id and d.deleted_at is null)
      + (select count(*) from public.installment_plans ip where ip.account_id = p_account_id)
      + (select count(*) from public.goals g where g.linked_account_id = p_account_id)
      + (select count(*) from public.recurring_transactions r
         where r.account_id = p_account_id or r.to_account_id = p_account_id)
      + (select count(*) from public.import_batches b
         where b.target_account_id = p_account_id and b.deleted_at is null)
      + (select count(*) from public.csv_import_presets cp where cp.target_account_id = p_account_id)
    )
  )
$$;

revoke all on function public.hh_account_privacy_impact(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. set_account_private (shared -> private)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 4. share_private_account (private -> shared)
-- ------------------------------------------------------------
create or replace function public.share_private_account(
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
  v_shared_payee_id uuid;
  v_payee_ids uuid[];
begin
  if v_user is null then
    raise exception 'Not authorized';
  end if;

  -- Another member's private account answers like a missing one (S5).
  select a.id, a.household_id, a.name, a.private_owner_id, a.billing_account_id
  into v_account
  from public.accounts a
  where a.id = p_account_id
    and a.deleted_at is null
    and a.private_owner_id = v_user
    and exists (
      select 1 from public.household_members m
      where m.household_id = a.household_id and m.user_id = v_user and m.status = 'active'
    );

  if v_account.id is null then
    raise exception 'account not found for household';
  end if;

  if not public.is_household_editor(v_account.household_id) then
    raise exception 'Not authorized to change this account';
  end if;

  -- PRV-8: once shared, this card could not be paid from a private account.
  if v_account.billing_account_id is not null and exists (
    select 1 from public.accounts b
    where b.id = v_account.billing_account_id and b.private_owner_id is not null
  ) then
    raise exception 'This card is paid from a private account. Share that account first, or change the card''s payment account';
  end if;

  if exists (
    select 1 from public.accounts o
    where o.household_id = v_account.household_id
      and o.private_owner_id is null
      and o.deleted_at is null
      and lower(o.name) = lower(v_account.name)
  ) then
    raise exception 'The household already has a shared account with this name. Rename this one first';
  end if;

  if exists (
    select 1 from public.csv_import_presets cp
    join public.csv_import_presets shared
      on shared.household_id = cp.household_id
     and shared.private_owner_id is null
     and lower(shared.name) = lower(cp.name)
    where cp.target_account_id = p_account_id
  ) then
    raise exception 'The household already has a shared import preset with the same name as one that uses this account. Rename one first';
  end if;

  -- The caller's private payees that become visible with this account: those
  -- used by its transactions, recurring rules and installment plans.
  select coalesce(array_agg(p.id), '{}')
  into v_payee_ids
  from public.payees p
  where p.household_id = v_account.household_id
    and p.private_owner_id = v_user
    and (
      exists (
        select 1 from public.transactions t
        join public.transaction_entries e on e.transaction_id = t.id
        where t.payee_id = p.id and e.account_id = p_account_id
      )
      or exists (
        select 1 from public.recurring_transactions r
        where r.payee_id = p.id and (r.account_id = p_account_id or r.to_account_id = p_account_id)
      )
      or exists (
        select 1 from public.installment_plans ip
        where ip.payee_id = p.id and ip.account_id = p_account_id
      )
    );

  v_impact := public.hh_account_privacy_impact(p_account_id)
    || jsonb_build_object('payees', cardinality(v_payee_ids));

  if coalesce(p_dry_run, false) then
    return v_impact || jsonb_build_object('applied', false);
  end if;

  update public.accounts set private_owner_id = null where id = p_account_id;
  perform public.hh_propagate_account_privacy(p_account_id);

  -- Payees: merge into the shared payee of the same name (unarchived if the
  -- merged payee was in use), else flip to shared.
  for v_payee in
    select p.id, p.name, p.is_archived from public.payees p where p.id = any(v_payee_ids)
  loop
    select p.id into v_shared_payee_id
    from public.payees p
    where p.household_id = v_account.household_id
      and p.private_owner_id is null
      and lower(p.name) = lower(v_payee.name)
    limit 1;

    if v_shared_payee_id is null then
      update public.payees set private_owner_id = null where id = v_payee.id;
    else
      update public.transactions set payee_id = v_shared_payee_id where payee_id = v_payee.id;
      update public.recurring_transactions set payee_id = v_shared_payee_id where payee_id = v_payee.id;
      update public.installment_plans set payee_id = v_shared_payee_id where payee_id = v_payee.id;
      update public.payees set is_archived = true where id = v_payee.id;
      if not v_payee.is_archived then
        update public.payees set is_archived = false where id = v_shared_payee_id and is_archived;
      end if;
    end if;
  end loop;

  insert into public.household_audit_log (household_id, actor_id, action, target_user_id, metadata)
  values (v_account.household_id, v_user, 'account_shared', v_user,
          jsonb_build_object('account_id', p_account_id) || v_impact);

  return v_impact || jsonb_build_object('applied', true);
end;
$$;

revoke all on function public.share_private_account(uuid, boolean) from public, anon;
grant execute on function public.share_private_account(uuid, boolean) to authenticated;
