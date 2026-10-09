-- ============================================================
-- Rumbo — HH-1 (2/5): private accounts — derivation triggers
-- Spec: docs/features/household-sharing.md §4, PRV-3, PRV-4, PRV-8.
-- ------------------------------------------------------------
-- `accounts.private_owner_id` is the only privacy value anyone chooses. Every
-- other copy is DERIVED here, on every write, so a client value is never kept:
--
--   transaction_entries      ← its account
--   transactions             ← its entries: owner = the private side (if any),
--                              visibility shared / mixed / private
--   transaction_allocations  ← its transaction, only when visibility = private
--   transaction_tags         ← same
--   debts, installment_plans ← their account
--   goals                    ← linked_account_id (no link = shared)
--   recurring_transactions   ← account_id or to_account_id
--   recurring_autopost_log   ← its recurring rule
--   import_batches           ← target_account_id, or any of its transactions
--                              (a CSV row can name its own account); no
--                              target = the uploader, decided at INSERT
--                              (existing rows stay shared)
--   import_rows              ← its batch
--   csv_import_presets       ← target_account_id (no target = shared)
--
-- Derivation triggers are SECURITY DEFINER with a fixed search_path: they must
-- read the true owner of an account the writer may not be able to see. The
-- two guard triggers (accounts, payees) are SECURITY INVOKER on purpose: they
-- decide by `current_user`, which inside a definer function is always the
-- owner. Clients and every invoker RPC run as `authenticated`; only the
-- definer RPCs of 20261009160000 (set_account_private / share_private_account)
-- run as the table owner and may change an account's visibility.
--
-- A transaction that would touch private accounts of two different members is
-- rejected. None of these functions is callable by a client.
--
-- Backfill: none. Every existing row is shared and every derived value of a
-- shared row is null / 'shared', which is what migration 1 left.
-- ============================================================

-- ------------------------------------------------------------
-- 1. accounts: visibility is immutable for clients; PRV-8 card billing
-- ------------------------------------------------------------
create or replace function public.hh_accounts_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_billing_owner uuid;
  v_found boolean := false;
begin
  -- Chosen at INSERT (the insert policy constrains the value), then changed
  -- only by set_account_private / share_private_account, which run as the
  -- table owner. A client or an invoker RPC runs as authenticated.
  if tg_op = 'UPDATE'
     and new.private_owner_id is distinct from old.private_owner_id
     and current_user in ('authenticated', 'anon') then
    raise exception 'An account''s visibility can only change through set_account_private or share_private_account';
  end if;

  -- PRV-8: a card is billed to a shared account or to one of its own owner's
  -- private accounts — never from a shared card to a private account, never
  -- to another member's private account. Read under the caller's RLS, so
  -- another member's private account is "not found", exactly like a missing
  -- one (S4/S5).
  if new.billing_account_id is not null
     and (tg_op = 'INSERT'
          or new.billing_account_id is distinct from old.billing_account_id
          or new.private_owner_id is distinct from old.private_owner_id) then
    select a.private_owner_id, true
    into v_billing_owner, v_found
    from public.accounts a
    where a.id = new.billing_account_id
      and a.household_id = new.household_id;

    if not coalesce(v_found, false) then
      raise exception 'billing account not found for household';
    end if;

    if v_billing_owner is not null and v_billing_owner is distinct from new.private_owner_id then
      raise exception 'A shared card cannot be paid from a private account';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_hh_accounts_guard on public.accounts;
create trigger trg_hh_accounts_guard
before insert or update on public.accounts
for each row execute function public.hh_accounts_guard();

-- ------------------------------------------------------------
-- 2. payees: visibility is chosen at INSERT and immutable for clients
-- ------------------------------------------------------------
-- get_or_create_payee decides it (PRV-7). Turning a shared payee private would
-- hide it from the shared transactions that use it; turning a private one
-- shared is share_private_account's job (it also merges duplicates).
create or replace function public.hh_payees_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.private_owner_id is distinct from old.private_owner_id
     and current_user in ('authenticated', 'anon') then
    raise exception 'A payee''s visibility cannot be changed directly';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hh_payees_guard on public.payees;
create trigger trg_hh_payees_guard
before update on public.payees
for each row execute function public.hh_payees_guard();

-- ------------------------------------------------------------
-- 3. Ledger
-- ------------------------------------------------------------

-- 3a. A transaction's privacy, from its entries. Raises when two members'
-- private accounts would meet in one transaction.
create or replace function public.hh_transaction_privacy(
  p_transaction_id uuid,
  out o_owner uuid,
  out o_visibility text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owners uuid[];
  v_has_shared boolean;
  v_has_private boolean;
begin
  select
    array_agg(distinct e.private_owner_id) filter (where e.private_owner_id is not null),
    coalesce(bool_or(e.private_owner_id is null), false),
    coalesce(bool_or(e.private_owner_id is not null), false)
  into v_owners, v_has_shared, v_has_private
  from public.transaction_entries e
  where e.transaction_id = p_transaction_id;

  if coalesce(cardinality(v_owners), 0) > 1 then
    raise exception 'A transaction cannot touch private accounts of two different members';
  end if;

  o_owner := v_owners[1];
  o_visibility := case
    when not v_has_private then 'shared'
    when v_has_shared then 'mixed'
    else 'private'
  end;
end;
$$;

-- 3b. Push a transaction's privacy onto its header, allocations and tag links.
create or replace function public.hh_recompute_transaction_privacy(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_visibility text;
  v_link_owner uuid;
begin
  select p.o_owner, p.o_visibility
  into v_owner, v_visibility
  from public.hh_transaction_privacy(p_transaction_id) p;

  update public.transactions t
  set private_owner_id = v_owner,
      visibility = v_visibility
  where t.id = p_transaction_id
    and (t.private_owner_id is distinct from v_owner or t.visibility is distinct from v_visibility);

  -- Allocations and tag links are private only when the whole transaction is:
  -- a mixed transfer's allocation (BR-039 transfer-as-expense) stays shared.
  v_link_owner := case when v_visibility = 'private' then v_owner end;

  update public.transaction_allocations ta
  set private_owner_id = v_link_owner
  where ta.transaction_id = p_transaction_id
    and ta.private_owner_id is distinct from v_link_owner;

  update public.transaction_tags tt
  set private_owner_id = v_link_owner
  where tt.transaction_id = p_transaction_id
    and tt.private_owner_id is distinct from v_link_owner;

  -- An imported transaction that lands in a private account makes its batch
  -- (and, through it, the batch's rows) private, even when the batch targets
  -- a shared account: a CSV's Account column can send rows elsewhere. Touching
  -- the batch re-runs its derivation trigger.
  if v_owner is not null then
    update public.import_batches b
    set private_owner_id = b.private_owner_id
    where b.id = (select t.import_batch_id from public.transactions t where t.id = p_transaction_id)
      and b.private_owner_id is distinct from v_owner;
  end if;
end;
$$;

-- 3c. transaction_entries: the owner of its account.
create or replace function public.hh_entries_derive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.private_owner_id := (
    select a.private_owner_id from public.accounts a where a.id = new.account_id
  );
  return new;
end;
$$;

drop trigger if exists trg_hh_entries_derive on public.transaction_entries;
create trigger trg_hh_entries_derive
before insert or update on public.transaction_entries
for each row execute function public.hh_entries_derive();

-- 3d. After an entry changes, re-derive its transaction. The fast paths skip
-- the work every shared write would otherwise pay: a shared entry added to or
-- removed from a shared transaction cannot change it.
create or replace function public.hh_entries_recompute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.private_owner_id is null
       and exists (
         select 1 from public.transactions t
         where t.id = new.transaction_id and t.visibility = 'shared'
       ) then
      return null;
    end if;
    perform public.hh_recompute_transaction_privacy(new.transaction_id);

  elsif tg_op = 'UPDATE' then
    if new.transaction_id is not distinct from old.transaction_id
       and new.private_owner_id is not distinct from old.private_owner_id then
      return null;
    end if;
    perform public.hh_recompute_transaction_privacy(new.transaction_id);
    if old.transaction_id is distinct from new.transaction_id then
      perform public.hh_recompute_transaction_privacy(old.transaction_id);
    end if;

  else -- DELETE
    if old.private_owner_id is null
       and exists (
         select 1 from public.transactions t
         where t.id = old.transaction_id and t.visibility = 'shared'
       ) then
      return null;
    end if;
    perform public.hh_recompute_transaction_privacy(old.transaction_id);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_hh_entries_recompute on public.transaction_entries;
create trigger trg_hh_entries_recompute
after insert or update or delete on public.transaction_entries
for each row execute function public.hh_entries_recompute();

-- 3e. transactions: the pair is never what a client says. A new header has no
-- entries yet, so it starts shared; on UPDATE a changed pair is re-derived
-- from the entries (an unchanged one is left alone — the common path).
create or replace function public.hh_transactions_derive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.private_owner_id := null;
    new.visibility := 'shared';
    return new;
  end if;

  if new.private_owner_id is not distinct from old.private_owner_id
     and new.visibility is not distinct from old.visibility then
    return new;
  end if;

  select p.o_owner, p.o_visibility
  into new.private_owner_id, new.visibility
  from public.hh_transaction_privacy(new.id) p;

  return new;
end;
$$;

drop trigger if exists trg_hh_transactions_derive on public.transactions;
create trigger trg_hh_transactions_derive
before insert or update on public.transactions
for each row execute function public.hh_transactions_derive();

-- 3f. Allocations and tag links follow their transaction.
create or replace function public.hh_transaction_links_derive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.private_owner_id := (
    select case when t.visibility = 'private' then t.private_owner_id end
    from public.transactions t
    where t.id = new.transaction_id
  );
  return new;
end;
$$;

drop trigger if exists trg_hh_allocations_derive on public.transaction_allocations;
create trigger trg_hh_allocations_derive
before insert or update on public.transaction_allocations
for each row execute function public.hh_transaction_links_derive();

drop trigger if exists trg_hh_transaction_tags_derive on public.transaction_tags;
create trigger trg_hh_transaction_tags_derive
before insert or update on public.transaction_tags
for each row execute function public.hh_transaction_links_derive();

-- ------------------------------------------------------------
-- 4. Everything that hangs from an account
-- ------------------------------------------------------------

-- debts, installment_plans: their account.
create or replace function public.hh_account_child_derive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.private_owner_id := (
    select a.private_owner_id from public.accounts a where a.id = new.account_id
  );
  return new;
end;
$$;

drop trigger if exists trg_hh_debts_derive on public.debts;
create trigger trg_hh_debts_derive
before insert or update on public.debts
for each row execute function public.hh_account_child_derive();

drop trigger if exists trg_hh_installment_plans_derive on public.installment_plans;
create trigger trg_hh_installment_plans_derive
before insert or update on public.installment_plans
for each row execute function public.hh_account_child_derive();

-- goals: the linked account; no link = shared.
create or replace function public.hh_goals_derive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.private_owner_id := (
    select a.private_owner_id from public.accounts a where a.id = new.linked_account_id
  );
  return new;
end;
$$;

drop trigger if exists trg_hh_goals_derive on public.goals;
create trigger trg_hh_goals_derive
before insert or update on public.goals
for each row execute function public.hh_goals_derive();

-- recurring_transactions: either account of the rule.
create or replace function public.hh_recurring_derive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owners uuid[];
begin
  select array_agg(distinct a.private_owner_id) filter (where a.private_owner_id is not null)
  into v_owners
  from public.accounts a
  where a.id in (new.account_id, new.to_account_id);

  if coalesce(cardinality(v_owners), 0) > 1 then
    raise exception 'A recurring transfer cannot move money between private accounts of two different members';
  end if;

  new.private_owner_id := v_owners[1];
  return new;
end;
$$;

drop trigger if exists trg_hh_recurring_derive on public.recurring_transactions;
create trigger trg_hh_recurring_derive
before insert or update on public.recurring_transactions
for each row execute function public.hh_recurring_derive();

-- recurring_autopost_log: its rule (so last_error stays with the rule, S19).
-- The propagate triggers below fire on any UPDATE and filter on the final
-- value: `UPDATE OF private_owner_id` would miss a value a BEFORE trigger
-- derived, since only columns named in the statement count.
create or replace function public.hh_autopost_log_derive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.private_owner_id := (
    select r.private_owner_id from public.recurring_transactions r where r.id = new.recurring_id
  );
  return new;
end;
$$;

drop trigger if exists trg_hh_autopost_log_derive on public.recurring_autopost_log;
create trigger trg_hh_autopost_log_derive
before insert or update on public.recurring_autopost_log
for each row execute function public.hh_autopost_log_derive();

create or replace function public.hh_recurring_propagate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.recurring_autopost_log l
  set private_owner_id = new.private_owner_id
  where l.recurring_id = new.id
    and l.private_owner_id is distinct from new.private_owner_id;
  return null;
end;
$$;

drop trigger if exists trg_hh_recurring_propagate on public.recurring_transactions;
create trigger trg_hh_recurring_propagate
after update on public.recurring_transactions
for each row
when (old.private_owner_id is distinct from new.private_owner_id)
execute function public.hh_recurring_propagate();

-- import_batches (§4, accepted limit §6): private to the target account's
-- owner; also private to whoever owns any of its transactions — a CSV's Account
-- column can send rows to a private account even when the target is shared,
-- and the batch's rows carry those transactions' raw data (found in the HH-1
-- review). With no target (accounts chosen per row) the batch is private to
-- its uploader, decided at INSERT and kept on update; batches that predate
-- HH-1 and have no target stay shared unless one of their transactions turns
-- private (hh_recompute_transaction_privacy touches the batch when that
-- happens).
create or replace function public.hh_import_batches_derive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if new.target_account_id is not null then
    v_owner := (select a.private_owner_id from public.accounts a where a.id = new.target_account_id);
  end if;

  if v_owner is null and tg_op = 'UPDATE' then
    v_owner := (
      select t.private_owner_id from public.transactions t
      where t.import_batch_id = new.id and t.private_owner_id is not null
      limit 1
    );
  end if;

  if v_owner is null and new.target_account_id is null then
    v_owner := case when tg_op = 'INSERT' then new.uploaded_by else old.private_owner_id end;
  end if;

  new.private_owner_id := v_owner;
  return new;
end;
$$;

drop trigger if exists trg_hh_import_batches_derive on public.import_batches;
create trigger trg_hh_import_batches_derive
before insert or update on public.import_batches
for each row execute function public.hh_import_batches_derive();

-- import_rows: their batch.
create or replace function public.hh_import_rows_derive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.private_owner_id := (
    select b.private_owner_id from public.import_batches b where b.id = new.import_batch_id
  );
  return new;
end;
$$;

drop trigger if exists trg_hh_import_rows_derive on public.import_rows;
create trigger trg_hh_import_rows_derive
before insert or update on public.import_rows
for each row execute function public.hh_import_rows_derive();

create or replace function public.hh_import_batches_propagate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.import_rows r
  set private_owner_id = new.private_owner_id
  where r.import_batch_id = new.id
    and r.private_owner_id is distinct from new.private_owner_id;
  return null;
end;
$$;

drop trigger if exists trg_hh_import_batches_propagate on public.import_batches;
create trigger trg_hh_import_batches_propagate
after update on public.import_batches
for each row
when (old.private_owner_id is distinct from new.private_owner_id)
execute function public.hh_import_batches_propagate();

-- csv_import_presets: the remembered target account; none = shared.
create or replace function public.hh_csv_presets_derive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.private_owner_id := (
    select a.private_owner_id from public.accounts a where a.id = new.target_account_id
  );
  return new;
end;
$$;

drop trigger if exists trg_hh_csv_presets_derive on public.csv_import_presets;
create trigger trg_hh_csv_presets_derive
before insert or update on public.csv_import_presets
for each row execute function public.hh_csv_presets_derive();

-- ------------------------------------------------------------
-- 5. None of the above is callable by a client (S8)
-- ------------------------------------------------------------
revoke all on function public.hh_accounts_guard() from public, anon, authenticated;
revoke all on function public.hh_payees_guard() from public, anon, authenticated;
revoke all on function public.hh_transaction_privacy(uuid) from public, anon, authenticated;
revoke all on function public.hh_recompute_transaction_privacy(uuid) from public, anon, authenticated;
revoke all on function public.hh_entries_derive() from public, anon, authenticated;
revoke all on function public.hh_entries_recompute() from public, anon, authenticated;
revoke all on function public.hh_transactions_derive() from public, anon, authenticated;
revoke all on function public.hh_transaction_links_derive() from public, anon, authenticated;
revoke all on function public.hh_account_child_derive() from public, anon, authenticated;
revoke all on function public.hh_goals_derive() from public, anon, authenticated;
revoke all on function public.hh_recurring_derive() from public, anon, authenticated;
revoke all on function public.hh_autopost_log_derive() from public, anon, authenticated;
revoke all on function public.hh_recurring_propagate() from public, anon, authenticated;
revoke all on function public.hh_import_batches_derive() from public, anon, authenticated;
revoke all on function public.hh_import_rows_derive() from public, anon, authenticated;
revoke all on function public.hh_import_batches_propagate() from public, anon, authenticated;
revoke all on function public.hh_csv_presets_derive() from public, anon, authenticated;
