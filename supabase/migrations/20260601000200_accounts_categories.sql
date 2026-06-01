-- ============================================================
-- App Finanzas — 002_accounts_categories.sql
-- Sprint 2.2: Accounts + Categories base
-- Target: Supabase / PostgreSQL
-- ============================================================

-- ------------------------------------------------------------
-- 1. Accounts
-- ------------------------------------------------------------

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,

  name text not null,
  account_type text not null,
  account_class text not null,
  currency_code varchar(3) not null references public.currencies(code),

  institution_name text,
  last_four text,
  color text,
  icon text,

  opening_balance_date date not null default current_date,

  is_archived boolean not null default false,
  include_in_net_worth boolean not null default true,
  sort_order integer,
  notes text,

  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),

  constraint accounts_name_not_blank_chk
    check (length(trim(name)) > 0),

  constraint accounts_type_chk
    check (account_type in (
      'cash',
      'checking',
      'savings',
      'credit_card',
      'debt',
      'investment',
      'other'
    )),

  constraint accounts_class_chk
    check (account_class in ('asset', 'liability')),

  constraint accounts_last_four_chk
    check (last_four is null or last_four ~ '^[0-9]{1,4}$')
);

drop trigger if exists trg_accounts_updated_at on public.accounts;

create trigger trg_accounts_updated_at
before update on public.accounts
for each row execute function public.set_updated_at();

create index if not exists idx_accounts_household
  on public.accounts(household_id);

create index if not exists idx_accounts_household_type
  on public.accounts(household_id, account_type);

create index if not exists idx_accounts_household_class
  on public.accounts(household_id, account_class);

create index if not exists idx_accounts_household_archived
  on public.accounts(household_id, is_archived);

create unique index if not exists accounts_unique_active_name_per_household
  on public.accounts(household_id, lower(name))
  where deleted_at is null;

-- ------------------------------------------------------------
-- 2. Categories
-- ------------------------------------------------------------

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,

  name text not null,
  category_type text not null,
  reporting_type text not null,

  parent_category_id uuid references public.categories(id) on delete set null,

  is_system boolean not null default false,
  is_archived boolean not null default false,
  exclude_from_budget boolean not null default false,
  exclude_from_reports boolean not null default false,

  color text,
  icon text,
  sort_order integer,

  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),

  constraint categories_name_not_blank_chk
    check (length(trim(name)) > 0),

  constraint categories_category_type_chk
    check (category_type in (
      'income',
      'expense',
      'financial',
      'adjustment'
    )),

  constraint categories_reporting_type_chk
    check (reporting_type in (
      'income',
      'expense',
      'transfer',
      'debt_principal',
      'debt_interest',
      'investment',
      'savings',
      'adjustment'
    ))
);

drop trigger if exists trg_categories_updated_at on public.categories;

create trigger trg_categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create index if not exists idx_categories_household
  on public.categories(household_id);

create index if not exists idx_categories_household_type
  on public.categories(household_id, category_type);

create index if not exists idx_categories_household_reporting_type
  on public.categories(household_id, reporting_type);

create index if not exists idx_categories_household_archived
  on public.categories(household_id, is_archived);

create index if not exists idx_categories_parent
  on public.categories(parent_category_id);

create unique index if not exists categories_unique_active_name_per_parent
  on public.categories(
    household_id,
    lower(name),
    coalesce(parent_category_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where deleted_at is null;

-- ------------------------------------------------------------
-- 3. Default categories helper
-- ------------------------------------------------------------

create or replace function public.create_default_categories_for_household(
  p_household_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if not public.is_household_admin(p_household_id) then
    raise exception 'Not authorized to create default categories for this household';
  end if;

  insert into public.categories (
    household_id,
    name,
    category_type,
    reporting_type,
    is_system,
    exclude_from_budget,
    exclude_from_reports,
    sort_order,
    created_by
  )
  values
    -- Income
    (p_household_id, 'Salary', 'income', 'income', true, false, false, 100, auth.uid()),
    (p_household_id, 'Side Income', 'income', 'income', true, false, false, 110, auth.uid()),
    (p_household_id, 'Interest Income', 'income', 'income', true, false, false, 120, auth.uid()),
    (p_household_id, 'Refunds', 'income', 'income', true, false, false, 130, auth.uid()),
    (p_household_id, 'Other Income', 'income', 'income', true, false, false, 190, auth.uid()),

    -- Expenses
    (p_household_id, 'Rent', 'expense', 'expense', true, false, false, 200, auth.uid()),
    (p_household_id, 'Groceries', 'expense', 'expense', true, false, false, 210, auth.uid()),
    (p_household_id, 'Restaurants', 'expense', 'expense', true, false, false, 220, auth.uid()),
    (p_household_id, 'Transportation', 'expense', 'expense', true, false, false, 230, auth.uid()),
    (p_household_id, 'Insurance', 'expense', 'expense', true, false, false, 240, auth.uid()),
    (p_household_id, 'Utilities', 'expense', 'expense', true, false, false, 250, auth.uid()),
    (p_household_id, 'Internet', 'expense', 'expense', true, false, false, 260, auth.uid()),
    (p_household_id, 'Mobile', 'expense', 'expense', true, false, false, 270, auth.uid()),
    (p_household_id, 'Health', 'expense', 'expense', true, false, false, 280, auth.uid()),
    (p_household_id, 'Pets', 'expense', 'expense', true, false, false, 290, auth.uid()),
    (p_household_id, 'Travel', 'expense', 'expense', true, false, false, 300, auth.uid()),
    (p_household_id, 'Shopping', 'expense', 'expense', true, false, false, 310, auth.uid()),
    (p_household_id, 'Entertainment', 'expense', 'expense', true, false, false, 320, auth.uid()),
    (p_household_id, 'Subscriptions', 'expense', 'expense', true, false, false, 330, auth.uid()),
    (p_household_id, 'Fees', 'expense', 'expense', true, false, false, 340, auth.uid()),
    (p_household_id, 'Other Expense', 'expense', 'expense', true, false, false, 390, auth.uid()),

    -- Financial
    (p_household_id, 'Debt Principal', 'financial', 'debt_principal', true, true, false, 400, auth.uid()),
    (p_household_id, 'Debt Interest', 'expense', 'debt_interest', true, false, false, 410, auth.uid()),
    (p_household_id, 'Savings', 'financial', 'savings', true, true, false, 420, auth.uid()),
    (p_household_id, 'Investments', 'financial', 'investment', true, true, false, 430, auth.uid()),
    (p_household_id, 'Transfers', 'financial', 'transfer', true, true, true, 440, auth.uid()),
    (p_household_id, 'Adjustments', 'adjustment', 'adjustment', true, true, true, 450, auth.uid())
  on conflict do nothing;
end;
$$;

-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------

alter table public.accounts enable row level security;
alter table public.categories enable row level security;

drop policy if exists "accounts_select_member" on public.accounts;
drop policy if exists "accounts_insert_admin" on public.accounts;
drop policy if exists "accounts_update_admin" on public.accounts;

create policy "accounts_select_member"
on public.accounts
for select
to authenticated
using (
  deleted_at is null
  and public.is_household_member(household_id)
);

create policy "accounts_insert_admin"
on public.accounts
for insert
to authenticated
with check (
  public.is_household_admin(household_id)
  and created_by = auth.uid()
);

create policy "accounts_update_admin"
on public.accounts
for update
to authenticated
using (
  deleted_at is null
  and public.is_household_admin(household_id)
)
with check (
  public.is_household_admin(household_id)
);

drop policy if exists "categories_select_member" on public.categories;
drop policy if exists "categories_insert_admin" on public.categories;
drop policy if exists "categories_update_admin" on public.categories;

create policy "categories_select_member"
on public.categories
for select
to authenticated
using (
  deleted_at is null
  and public.is_household_member(household_id)
);

create policy "categories_insert_admin"
on public.categories
for insert
to authenticated
with check (
  public.is_household_admin(household_id)
);

create policy "categories_update_admin"
on public.categories
for update
to authenticated
using (
  deleted_at is null
  and public.is_household_admin(household_id)
)
with check (
  public.is_household_admin(household_id)
);
