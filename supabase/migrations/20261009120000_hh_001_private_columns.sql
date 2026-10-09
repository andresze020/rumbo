-- ============================================================
-- Rumbo — HH-1 (1/5): private accounts — columns and indexes
-- Spec: docs/features/household-sharing.md §4 (data model), S6, S17.
-- ------------------------------------------------------------
-- One nullable column carries privacy on every table that can hold private
-- data: `private_owner_id` null = shared with the household, a user id =
-- private to that member. `accounts.private_owner_id` is the source of truth;
-- every other copy is derived from it by the triggers of the next migration
-- (20261009130000), so no client can set or fake it.
--
-- `transactions` also gets `visibility`:
--   shared  = no entry touches a private account   (private_owner_id null)
--   mixed   = a private entry and a shared entry    (owner = the private side)
--   private = every entry is in a private account  (owner set)
-- A mixed transfer's header stays readable by the household (PRV-4); its
-- private leg does not.
--
-- Backfill: none needed. Every existing row is shared — the columns are null
-- and `visibility` defaults to 'shared' (a constant default, no rewrite).
--
-- Name uniqueness (S6, decided 2026-10-09): a unique index must never span
-- shared and private rows, or creating a name would reveal that a hidden one
-- exists. The three household-wide name indexes are split per owner:
--   * payees (§4), and — not in §4, found in the HH-1 inventory —
--   * accounts (accounts_unique_active_name_per_household) and
--   * csv_import_presets (idx_csv_import_presets_household_name_unique).
-- Shared names stay unique among shared rows exactly as today; a private name
-- is unique per owner. Tags stay household-shared (D7) and keep their index.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Source of truth: accounts
-- ------------------------------------------------------------
alter table public.accounts
  add column if not exists private_owner_id uuid references auth.users(id);

comment on column public.accounts.private_owner_id is
  'HH-1: null = shared with the household; a user id = private to that member. '
  'Set at INSERT (policy-constrained), then changed only by set_account_private '
  '/ share_private_account.';

-- ------------------------------------------------------------
-- 2. Ledger
-- ------------------------------------------------------------
alter table public.transactions
  add column if not exists private_owner_id uuid references auth.users(id),
  add column if not exists visibility text not null default 'shared';

alter table public.transactions
  drop constraint if exists transactions_visibility_chk,
  add constraint transactions_visibility_chk
    check (visibility in ('shared', 'mixed', 'private')),
  drop constraint if exists transactions_visibility_owner_chk,
  add constraint transactions_visibility_owner_chk
    check ((visibility = 'shared') = (private_owner_id is null));

alter table public.transaction_entries
  add column if not exists private_owner_id uuid references auth.users(id);

alter table public.transaction_allocations
  add column if not exists private_owner_id uuid references auth.users(id);

alter table public.transaction_tags
  add column if not exists private_owner_id uuid references auth.users(id);

-- ------------------------------------------------------------
-- 3. Everything that hangs from an account (PRV-3)
-- ------------------------------------------------------------
alter table public.payees
  add column if not exists private_owner_id uuid references auth.users(id);

alter table public.debts
  add column if not exists private_owner_id uuid references auth.users(id);

alter table public.installment_plans
  add column if not exists private_owner_id uuid references auth.users(id);

alter table public.goals
  add column if not exists private_owner_id uuid references auth.users(id);

alter table public.recurring_transactions
  add column if not exists private_owner_id uuid references auth.users(id);

alter table public.recurring_autopost_log
  add column if not exists private_owner_id uuid references auth.users(id);

alter table public.import_batches
  add column if not exists private_owner_id uuid references auth.users(id);

alter table public.import_rows
  add column if not exists private_owner_id uuid references auth.users(id);

alter table public.csv_import_presets
  add column if not exists private_owner_id uuid references auth.users(id);

-- ------------------------------------------------------------
-- 4. Name uniqueness, split per owner (S6)
-- ------------------------------------------------------------
-- payees (§4)
drop index if exists public.idx_payees_household_name_unique;
create unique index if not exists idx_payees_household_shared_name_unique
  on public.payees (household_id, lower(name))
  where private_owner_id is null;
create unique index if not exists idx_payees_household_private_name_unique
  on public.payees (household_id, private_owner_id, lower(name))
  where private_owner_id is not null;

-- get_or_create_payee's ON CONFLICT named the old index; point it at the
-- shared one so this migration leaves the app working on its own. Migration
-- 4 (20261009150000) replaces this two-argument version with the one that
-- takes the privacy context (PRV-7). Until then every payee is shared.
create or replace function public.get_or_create_payee(
  p_household_id uuid,
  p_name text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_name text;
  v_payee_id uuid;
begin
  v_name := nullif(trim(coalesce(p_name, '')), '');

  if p_household_id is null or v_name is null then
    return null;
  end if;

  select id
  into v_payee_id
  from public.payees
  where household_id = p_household_id
    and private_owner_id is null
    and lower(name) = lower(v_name)
  limit 1;

  if v_payee_id is not null then
    return v_payee_id;
  end if;

  insert into public.payees (household_id, name)
  values (p_household_id, v_name)
  on conflict (household_id, lower(name)) where private_owner_id is null do nothing
  returning id into v_payee_id;

  if v_payee_id is null then
    select id
    into v_payee_id
    from public.payees
    where household_id = p_household_id
      and private_owner_id is null
      and lower(name) = lower(v_name)
    limit 1;
  end if;

  return v_payee_id;
end;
$$;

-- accounts (not in §4; S6 assumed names were already non-unique)
drop index if exists public.accounts_unique_active_name_per_household;
create unique index if not exists accounts_unique_active_shared_name
  on public.accounts (household_id, lower(name))
  where deleted_at is null and private_owner_id is null;
create unique index if not exists accounts_unique_active_private_name
  on public.accounts (household_id, private_owner_id, lower(name))
  where deleted_at is null and private_owner_id is not null;

-- csv_import_presets (not in §4)
drop index if exists public.idx_csv_import_presets_household_name_unique;
create unique index if not exists idx_csv_import_presets_shared_name_unique
  on public.csv_import_presets (household_id, lower(name))
  where private_owner_id is null;
create unique index if not exists idx_csv_import_presets_private_name_unique
  on public.csv_import_presets (household_id, private_owner_id, lower(name))
  where private_owner_id is not null;

-- ------------------------------------------------------------
-- 5. Lookup by owner (sharing an account, LIF exports in HH-5)
-- ------------------------------------------------------------
create index if not exists idx_accounts_private_owner
  on public.accounts (household_id, private_owner_id)
  where private_owner_id is not null;
