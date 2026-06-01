-- ============================================================
-- App Finanzas — 001_initial_schema.sql
-- Target: Supabase / PostgreSQL
-- Version: v1
-- Purpose: Initial SaaS-ready financial data model with simplified ledger + RLS
-- ============================================================

-- ------------------------------------------------------------
-- 0. Extensions
-- ------------------------------------------------------------

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. Utility functions
-- ------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2. Identity and household tables
-- ------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text not null,
  default_household_id uuid,
  locale text default 'en-CA',
  timezone text default 'America/Montreal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_currency varchar(3) not null default 'CAD',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint households_base_currency_format_chk
    check (base_currency = upper(base_currency) and length(base_currency) = 3)
);

create trigger trg_households_updated_at
before update on public.households
for each row execute function public.set_updated_at();

alter table public.profiles
add constraint profiles_default_household_fk
foreign key (default_household_id) references public.households(id) on delete set null;

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  status text not null default 'active',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint household_members_role_chk
    check (role in ('owner', 'admin', 'member', 'viewer')),

  constraint household_members_status_chk
    check (status in ('active', 'invited', 'removed')),

  constraint household_members_unique_user_household
    unique (household_id, user_id)
);

create trigger trg_household_members_updated_at
before update on public.household_members
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 3. RLS helper functions
-- ------------------------------------------------------------
-- These functions centralize household authorization.
-- They are SECURITY DEFINER to avoid recursive RLS issues when policies
-- need to check household_members.

create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = auth.uid()
      and hm.status = 'active'
  );
$$;

create or replace function public.has_household_role(p_household_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = auth.uid()
      and hm.status = 'active'
      and hm.role = any(p_roles)
  );
$$;

create or replace function public.is_household_admin(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_household_role(p_household_id, array['owner', 'admin']);
$$;

create or replace function public.is_household_editor(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_household_role(p_household_id, array['owner', 'admin', 'member']);
$$;

-- ------------------------------------------------------------
-- 4. Currencies and exchange rates
-- ------------------------------------------------------------

create table if not exists public.currencies (
  code varchar(3) primary key,
  name text not null,
  symbol text,
  decimal_places integer not null default 2,
  is_active boolean not null default true,

  constraint currencies_code_format_chk
    check (code = upper(code) and length(code) = 3),

  constraint currencies_decimal_places_chk
    check (decimal_places between 0 and 8)
);

insert into public.currencies (code, name, symbol, decimal_places, is_active)
values
  ('CAD', 'Canadian Dollar', '$', 2, true),
  ('USD', 'US Dollar', 'US$', 2, true),
  ('COP', 'Colombian Peso', 'COP$', 2, true)
on conflict (code) do nothing;

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  from_currency varchar(3) not null references public.currencies(code),
  to_currency varchar(3) not null references public.currencies(code),
  rate numeric(18,8) not null,
  rate_date date not null,
  source text not null default 'manual',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),

  constraint exchange_rates_rate_chk check (rate > 0),
  constraint exchange_rates_source_chk check (source in ('manual', 'system', 'bank', 'api')),
  constraint exchange_rates_unique_daily unique (household_id, from_currency, to_currency, rate_date, source)
);

-- ------------------------------------------------------------
-- 5. Financial structure: accounts and categories
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

  constraint accounts_type_chk
    check (account_type in ('cash', 'checking', 'savings', 'credit_card', 'debt', 'investment', 'other')),

  constraint accounts_class_chk
    check (account_class in ('asset', 'liability')),

  constraint accounts_last_four_chk
    check (last_four is null or last_four ~ '^[0-9]{1,4}$'),

  constraint accounts_unique_name_per_household
    unique (household_id, name)
);

create trigger trg_accounts_updated_at
before update on public.accounts
for each row execute function public.set_updated_at();

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

  constraint categories_category_type_chk
    check (category_type in ('income', 'expense', 'financial', 'adjustment')),

  constraint categories_reporting_type_chk
    check (reporting_type in ('income', 'expense', 'transfer', 'debt_principal', 'debt_interest', 'investment', 'savings', 'adjustment')),

  constraint categories_unique_name_per_parent
    unique (household_id, name, parent_category_id)
);

create trigger trg_categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 6. Ledger tables
-- ------------------------------------------------------------

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  transaction_type text not null,
  transaction_date date not null,
  description text,
  merchant_name text,
  notes text,
  status text not null default 'posted',
  source text not null default 'manual',
  import_batch_id uuid,
  import_row_id uuid,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),

  constraint transactions_type_chk
    check (transaction_type in ('income', 'expense', 'transfer', 'debt_payment', 'adjustment', 'opening_balance', 'investment')),

  constraint transactions_status_chk
    check (status in ('pending', 'posted', 'voided', 'deleted_soft')),

  constraint transactions_source_chk
    check (source in ('manual', 'csv_import', 'system', 'future_bank_sync')),

  constraint transactions_void_fields_chk
    check (
      (status = 'voided' and voided_at is not null)
      or (status <> 'voided')
    )
);

create trigger trg_transactions_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

create table if not exists public.transaction_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  entry_date date not null,
  amount_account_currency numeric(18,4) not null,
  currency_code varchar(3) not null references public.currencies(code),
  exchange_rate_to_base numeric(18,8) not null default 1,
  amount_base_currency numeric(18,4) not null,
  entry_type text not null default 'movement',
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint transaction_entries_nonzero_amount_chk
    check (amount_account_currency <> 0),

  constraint transaction_entries_exchange_rate_chk
    check (exchange_rate_to_base > 0),

  constraint transaction_entries_type_chk
    check (entry_type in ('debit', 'credit', 'movement', 'adjustment'))
);

create trigger trg_transaction_entries_updated_at
before update on public.transaction_entries
for each row execute function public.set_updated_at();

create table if not exists public.transaction_allocations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  category_id uuid not null references public.categories(id),
  allocation_type text not null,
  amount_original_currency numeric(18,4) not null,
  currency_code varchar(3) not null references public.currencies(code),
  exchange_rate_to_base numeric(18,8) not null default 1,
  amount_base_currency numeric(18,4) not null,
  memo text,
  created_at timestamptz not null default now(),

  constraint transaction_allocations_positive_amount_chk
    check (amount_original_currency > 0 and amount_base_currency > 0),

  constraint transaction_allocations_exchange_rate_chk
    check (exchange_rate_to_base > 0),

  constraint transaction_allocations_type_chk
    check (allocation_type in ('income', 'expense', 'financial', 'adjustment'))
);

-- ------------------------------------------------------------
-- 7. Budgets
-- ------------------------------------------------------------

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  budget_month date not null,
  name text,
  status text not null default 'active',
  currency_code varchar(3) not null references public.currencies(code),
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),

  constraint budgets_status_chk check (status in ('draft', 'active', 'closed')),

  constraint budgets_month_first_day_chk
    check (budget_month = date_trunc('month', budget_month)::date),

  constraint budgets_unique_household_month unique (household_id, budget_month)
);

create trigger trg_budgets_updated_at
before update on public.budgets
for each row execute function public.set_updated_at();

create table if not exists public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid not null references public.categories(id),
  planned_amount numeric(18,4) not null,
  currency_code varchar(3) not null references public.currencies(code),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint budget_lines_planned_amount_chk check (planned_amount >= 0),
  constraint budget_lines_unique_budget_category unique (budget_id, category_id)
);

create trigger trg_budget_lines_updated_at
before update on public.budget_lines
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 8. Debts
-- ------------------------------------------------------------

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid not null unique references public.accounts(id) on delete cascade,
  debt_type text not null,
  original_principal numeric(18,4),
  interest_rate numeric(9,6),
  interest_rate_period text,
  minimum_payment numeric(18,4),
  payment_due_day integer,
  start_date date,
  target_payoff_date date,
  lender_name text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),

  constraint debts_type_chk
    check (debt_type in ('loan', 'credit_card', 'family_loan', 'line_of_credit', 'other')),

  constraint debts_interest_period_chk
    check (interest_rate_period is null or interest_rate_period in ('monthly', 'annual')),

  constraint debts_interest_rate_chk
    check (interest_rate is null or interest_rate >= 0),

  constraint debts_minimum_payment_chk
    check (minimum_payment is null or minimum_payment >= 0),

  constraint debts_due_day_chk
    check (payment_due_day is null or payment_due_day between 1 and 31)
);

create trigger trg_debts_updated_at
before update on public.debts
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 9. Generic CSV imports
-- ------------------------------------------------------------

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  file_name text not null,
  file_hash text,
  source_type text not null default 'csv_generic',
  target_account_id uuid references public.accounts(id),
  status text not null default 'uploaded',
  total_rows integer,
  valid_rows integer,
  invalid_rows integer,
  imported_transactions_count integer,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint import_batches_source_type_chk
    check (source_type in ('csv_generic', 'bank_csv', 'manual_template')),

  constraint import_batches_status_chk
    check (status in ('uploaded', 'mapped', 'validated', 'imported', 'reverted', 'failed')),

  constraint import_batches_row_counts_chk
    check (
      (total_rows is null or total_rows >= 0)
      and (valid_rows is null or valid_rows >= 0)
      and (invalid_rows is null or invalid_rows >= 0)
      and (imported_transactions_count is null or imported_transactions_count >= 0)
    )
);

create trigger trg_import_batches_updated_at
before update on public.import_batches
for each row execute function public.set_updated_at();

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number integer not null,
  raw_data jsonb not null,
  mapped_data jsonb,
  validation_status text not null default 'valid',
  validation_errors jsonb,
  created_transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint import_rows_row_number_chk check (row_number > 0),

  constraint import_rows_validation_status_chk
    check (validation_status in ('valid', 'invalid', 'duplicate', 'ignored')),

  constraint import_rows_unique_row_per_batch unique (import_batch_id, row_number)
);

create table if not exists public.import_column_mappings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  source_column_name text not null,
  target_field_name text not null,
  transform_rule jsonb,
  created_at timestamptz not null default now(),

  constraint import_column_mappings_target_field_chk
    check (target_field_name in (
      'transaction_date',
      'amount',
      'description',
      'merchant_name',
      'category',
      'account',
      'currency',
      'notes',
      'transaction_type'
    )),

  constraint import_column_mappings_unique_source_per_batch
    unique (import_batch_id, source_column_name)
);

-- Add FK references from transactions to import tables after both exist.
alter table public.transactions
add constraint transactions_import_batch_fk
foreign key (import_batch_id) references public.import_batches(id) on delete set null;

alter table public.transactions
add constraint transactions_import_row_fk
foreign key (import_row_id) references public.import_rows(id) on delete set null;

-- ------------------------------------------------------------
-- 10. Monthly snapshots
-- ------------------------------------------------------------

create table if not exists public.monthly_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  snapshot_month date not null,
  currency_code varchar(3) not null references public.currencies(code),
  total_assets numeric(18,4) not null default 0,
  total_liabilities numeric(18,4) not null default 0,
  net_worth numeric(18,4) not null default 0,
  monthly_income numeric(18,4) not null default 0,
  monthly_expenses numeric(18,4) not null default 0,
  monthly_savings numeric(18,4) not null default 0,
  savings_rate numeric(9,6),
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint monthly_snapshots_month_first_day_chk
    check (snapshot_month = date_trunc('month', snapshot_month)::date),

  constraint monthly_snapshots_status_chk
    check (status in ('draft', 'closed', 'recalculated')),

  constraint monthly_snapshots_unique_household_month
    unique (household_id, snapshot_month)
);

create trigger trg_monthly_snapshots_updated_at
before update on public.monthly_snapshots
for each row execute function public.set_updated_at();

create table if not exists public.monthly_snapshot_accounts (
  id uuid primary key default gen_random_uuid(),
  monthly_snapshot_id uuid not null references public.monthly_snapshots(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  balance_account_currency numeric(18,4) not null default 0,
  currency_code varchar(3) not null references public.currencies(code),
  exchange_rate_to_base numeric(18,8) not null default 1,
  balance_base_currency numeric(18,4) not null default 0,

  constraint monthly_snapshot_accounts_rate_chk check (exchange_rate_to_base > 0),
  constraint monthly_snapshot_accounts_unique_account unique (monthly_snapshot_id, account_id)
);

create table if not exists public.monthly_snapshot_categories (
  id uuid primary key default gen_random_uuid(),
  monthly_snapshot_id uuid not null references public.monthly_snapshots(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid not null references public.categories(id),
  allocation_type text not null,
  actual_amount_base_currency numeric(18,4) not null default 0,
  budgeted_amount_base_currency numeric(18,4) not null default 0,
  variance_amount numeric(18,4) not null default 0,
  variance_percent numeric(9,6),

  constraint monthly_snapshot_categories_allocation_type_chk
    check (allocation_type in ('income', 'expense', 'financial', 'adjustment')),

  constraint monthly_snapshot_categories_unique_category
    unique (monthly_snapshot_id, category_id, allocation_type)
);

-- ------------------------------------------------------------
-- 11. Audit logs
-- ------------------------------------------------------------

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb,
  created_at timestamptz not null default now(),

  constraint audit_logs_action_chk
    check (action in ('create', 'update', 'void', 'archive', 'import', 'export', 'revert', 'delete_soft'))
);

-- ------------------------------------------------------------
-- 12. Future-ready tables
-- ------------------------------------------------------------

create table if not exists public.categorization_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  match_field text not null,
  match_operator text not null,
  match_value text not null,
  category_id uuid references public.categories(id),
  target_account_id uuid references public.accounts(id),
  priority integer not null default 100,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint categorization_rules_match_field_chk
    check (match_field in ('description', 'merchant_name', 'amount', 'account_name')),

  constraint categorization_rules_match_operator_chk
    check (match_operator in ('contains', 'equals', 'starts_with', 'ends_with', 'regex', 'greater_than', 'less_than'))
);

create trigger trg_categorization_rules_updated_at
before update on public.categorization_rules
for each row execute function public.set_updated_at();

create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  transaction_type text not null,
  account_id uuid references public.accounts(id),
  category_id uuid references public.categories(id),
  amount numeric(18,4) not null,
  currency_code varchar(3) not null references public.currencies(code),
  frequency text not null,
  start_date date not null,
  end_date date,
  next_run_date date,
  auto_post boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint recurring_transactions_type_chk
    check (transaction_type in ('income', 'expense', 'transfer', 'debt_payment', 'adjustment', 'investment')),

  constraint recurring_transactions_frequency_chk
    check (frequency in ('daily', 'weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'yearly'))
);

create trigger trg_recurring_transactions_updated_at
before update on public.recurring_transactions
for each row execute function public.set_updated_at();

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  goal_type text not null,
  target_amount numeric(18,4) not null,
  current_amount numeric(18,4) not null default 0,
  currency_code varchar(3) not null references public.currencies(code),
  target_date date,
  linked_account_id uuid references public.accounts(id),
  status text not null default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint goals_type_chk
    check (goal_type in ('emergency_fund', 'debt_payoff', 'down_payment', 'travel', 'retirement', 'custom')),

  constraint goals_status_chk
    check (status in ('active', 'paused', 'completed', 'archived')),

  constraint goals_amounts_chk
    check (target_amount >= 0 and current_amount >= 0)
);

create trigger trg_goals_updated_at
before update on public.goals
for each row execute function public.set_updated_at();

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  mime_type text,
  file_size integer,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),

  constraint attachments_file_size_chk check (file_size is null or file_size >= 0)
);

-- ------------------------------------------------------------
-- 13. Indexes
-- ------------------------------------------------------------

create index if not exists idx_profiles_default_household on public.profiles(default_household_id);

create index if not exists idx_households_created_by on public.households(created_by);
create index if not exists idx_households_deleted_at on public.households(deleted_at);

create index if not exists idx_household_members_user_id on public.household_members(user_id);
create index if not exists idx_household_members_household_id on public.household_members(household_id);
create index if not exists idx_household_members_user_household on public.household_members(user_id, household_id);

create index if not exists idx_exchange_rates_household_date on public.exchange_rates(household_id, rate_date);
create index if not exists idx_exchange_rates_pair_date on public.exchange_rates(from_currency, to_currency, rate_date);

create index if not exists idx_accounts_household on public.accounts(household_id);
create index if not exists idx_accounts_household_type on public.accounts(household_id, account_type);
create index if not exists idx_accounts_household_archived on public.accounts(household_id, is_archived);
create index if not exists idx_accounts_household_class on public.accounts(household_id, account_class);

create index if not exists idx_categories_household on public.categories(household_id);
create index if not exists idx_categories_household_type on public.categories(household_id, category_type);
create index if not exists idx_categories_household_archived on public.categories(household_id, is_archived);
create index if not exists idx_categories_parent on public.categories(parent_category_id);

create index if not exists idx_transactions_household on public.transactions(household_id);
create index if not exists idx_transactions_household_date on public.transactions(household_id, transaction_date);
create index if not exists idx_transactions_household_status on public.transactions(household_id, status);
create index if not exists idx_transactions_household_type on public.transactions(household_id, transaction_type);
create index if not exists idx_transactions_import_batch on public.transactions(import_batch_id);
create index if not exists idx_transactions_import_row on public.transactions(import_row_id);

create index if not exists idx_transaction_entries_household on public.transaction_entries(household_id);
create index if not exists idx_transaction_entries_transaction on public.transaction_entries(transaction_id);
create index if not exists idx_transaction_entries_account on public.transaction_entries(account_id);
create index if not exists idx_transaction_entries_account_date on public.transaction_entries(account_id, entry_date);

create index if not exists idx_transaction_allocations_household on public.transaction_allocations(household_id);
create index if not exists idx_transaction_allocations_transaction on public.transaction_allocations(transaction_id);
create index if not exists idx_transaction_allocations_category on public.transaction_allocations(category_id);
create index if not exists idx_transaction_allocations_category_type on public.transaction_allocations(category_id, allocation_type);

create index if not exists idx_budgets_household_month on public.budgets(household_id, budget_month);
create index if not exists idx_budget_lines_budget on public.budget_lines(budget_id);
create index if not exists idx_budget_lines_category on public.budget_lines(category_id);

create index if not exists idx_debts_household on public.debts(household_id);
create index if not exists idx_debts_account on public.debts(account_id);

create index if not exists idx_import_batches_household_status on public.import_batches(household_id, status);
create index if not exists idx_import_rows_batch on public.import_rows(import_batch_id);
create index if not exists idx_import_rows_transaction on public.import_rows(created_transaction_id);
create index if not exists idx_import_column_mappings_batch on public.import_column_mappings(import_batch_id);

create index if not exists idx_monthly_snapshots_household_month on public.monthly_snapshots(household_id, snapshot_month);
create index if not exists idx_monthly_snapshot_accounts_snapshot on public.monthly_snapshot_accounts(monthly_snapshot_id);
create index if not exists idx_monthly_snapshot_categories_snapshot on public.monthly_snapshot_categories(monthly_snapshot_id);

create index if not exists idx_audit_logs_household on public.audit_logs(household_id);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at);

create index if not exists idx_categorization_rules_household_active on public.categorization_rules(household_id, is_active);
create index if not exists idx_recurring_transactions_household_active on public.recurring_transactions(household_id, is_active);
create index if not exists idx_goals_household_status on public.goals(household_id, status);
create index if not exists idx_attachments_household on public.attachments(household_id);
create index if not exists idx_attachments_transaction on public.attachments(transaction_id);

-- ------------------------------------------------------------
-- 14. RLS enablement
-- ------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.currencies enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_entries enable row level security;
alter table public.transaction_allocations enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_lines enable row level security;
alter table public.debts enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.import_column_mappings enable row level security;
alter table public.monthly_snapshots enable row level security;
alter table public.monthly_snapshot_accounts enable row level security;
alter table public.monthly_snapshot_categories enable row level security;
alter table public.audit_logs enable row level security;
alter table public.categorization_rules enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.goals enable row level security;
alter table public.attachments enable row level security;

-- ------------------------------------------------------------
-- 15. RLS policies: profiles, households, members, currencies
-- ------------------------------------------------------------

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "households_select_member"
on public.households
for select
to authenticated
using (public.is_household_member(id));

create policy "households_insert_creator"
on public.households
for insert
to authenticated
with check (created_by = auth.uid());

create policy "households_update_admin"
on public.households
for update
to authenticated
using (public.is_household_admin(id))
with check (public.is_household_admin(id));

create policy "household_members_select_member"
on public.household_members
for select
to authenticated
using (public.is_household_member(household_id));

create policy "household_members_insert_owner_or_admin"
on public.household_members
for insert
to authenticated
with check (
  (
    user_id = auth.uid()
    and role = 'owner'
    and status = 'active'
    and exists (
      select 1
      from public.households h
      where h.id = household_id
        and h.created_by = auth.uid()
    )
  )
  or public.is_household_admin(household_id)
);

create policy "household_members_update_admin"
on public.household_members
for update
to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

create policy "currencies_select_all_authenticated"
on public.currencies
for select
to authenticated
using (true);

-- ------------------------------------------------------------
-- 16. RLS policies: household-scoped tables
-- ------------------------------------------------------------
-- Pattern:
-- select: any active household member
-- insert/update/delete: depends on table and role

-- Exchange rates: editable by admin.
create policy "exchange_rates_select_member"
on public.exchange_rates for select to authenticated
using (public.is_household_member(household_id));

create policy "exchange_rates_insert_admin"
on public.exchange_rates for insert to authenticated
with check (public.is_household_admin(household_id));

create policy "exchange_rates_update_admin"
on public.exchange_rates for update to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

create policy "exchange_rates_delete_admin"
on public.exchange_rates for delete to authenticated
using (public.is_household_admin(household_id));

-- Accounts: editable by admin only.
create policy "accounts_select_member"
on public.accounts for select to authenticated
using (public.is_household_member(household_id));

create policy "accounts_insert_admin"
on public.accounts for insert to authenticated
with check (public.is_household_admin(household_id));

create policy "accounts_update_admin"
on public.accounts for update to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

-- No physical delete policy for accounts.

-- Categories: editable by admin only.
create policy "categories_select_member"
on public.categories for select to authenticated
using (public.is_household_member(household_id));

create policy "categories_insert_admin"
on public.categories for insert to authenticated
with check (public.is_household_admin(household_id));

create policy "categories_update_admin"
on public.categories for update to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

-- No physical delete policy for categories.

-- Transactions: editable by owner/admin/member.
create policy "transactions_select_member"
on public.transactions for select to authenticated
using (public.is_household_member(household_id));

create policy "transactions_insert_editor"
on public.transactions for insert to authenticated
with check (public.is_household_editor(household_id));

create policy "transactions_update_editor"
on public.transactions for update to authenticated
using (public.is_household_editor(household_id))
with check (public.is_household_editor(household_id));

-- No physical delete policy for transactions.

-- Transaction entries: editable by owner/admin/member.
create policy "transaction_entries_select_member"
on public.transaction_entries for select to authenticated
using (public.is_household_member(household_id));

create policy "transaction_entries_insert_editor"
on public.transaction_entries for insert to authenticated
with check (public.is_household_editor(household_id));

create policy "transaction_entries_update_editor"
on public.transaction_entries for update to authenticated
using (public.is_household_editor(household_id))
with check (public.is_household_editor(household_id));

create policy "transaction_entries_delete_editor"
on public.transaction_entries for delete to authenticated
using (public.is_household_editor(household_id));

-- Transaction allocations: editable by owner/admin/member.
create policy "transaction_allocations_select_member"
on public.transaction_allocations for select to authenticated
using (public.is_household_member(household_id));

create policy "transaction_allocations_insert_editor"
on public.transaction_allocations for insert to authenticated
with check (public.is_household_editor(household_id));

create policy "transaction_allocations_update_editor"
on public.transaction_allocations for update to authenticated
using (public.is_household_editor(household_id))
with check (public.is_household_editor(household_id));

create policy "transaction_allocations_delete_editor"
on public.transaction_allocations for delete to authenticated
using (public.is_household_editor(household_id));

-- Budgets: editable by admin.
create policy "budgets_select_member"
on public.budgets for select to authenticated
using (public.is_household_member(household_id));

create policy "budgets_insert_admin"
on public.budgets for insert to authenticated
with check (public.is_household_admin(household_id));

create policy "budgets_update_admin"
on public.budgets for update to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

-- No physical delete policy for budgets.

create policy "budget_lines_select_member"
on public.budget_lines for select to authenticated
using (public.is_household_member(household_id));

create policy "budget_lines_insert_admin"
on public.budget_lines for insert to authenticated
with check (public.is_household_admin(household_id));

create policy "budget_lines_update_admin"
on public.budget_lines for update to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

create policy "budget_lines_delete_admin"
on public.budget_lines for delete to authenticated
using (public.is_household_admin(household_id));

-- Debts: editable by admin.
create policy "debts_select_member"
on public.debts for select to authenticated
using (public.is_household_member(household_id));

create policy "debts_insert_admin"
on public.debts for insert to authenticated
with check (public.is_household_admin(household_id));

create policy "debts_update_admin"
on public.debts for update to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

-- No physical delete policy for debts.

-- Imports: executable by editors.
create policy "import_batches_select_member"
on public.import_batches for select to authenticated
using (public.is_household_member(household_id));

create policy "import_batches_insert_editor"
on public.import_batches for insert to authenticated
with check (public.is_household_editor(household_id));

create policy "import_batches_update_editor"
on public.import_batches for update to authenticated
using (public.is_household_editor(household_id))
with check (public.is_household_editor(household_id));

create policy "import_rows_select_member"
on public.import_rows for select to authenticated
using (public.is_household_member(household_id));

create policy "import_rows_insert_editor"
on public.import_rows for insert to authenticated
with check (public.is_household_editor(household_id));

create policy "import_rows_update_editor"
on public.import_rows for update to authenticated
using (public.is_household_editor(household_id))
with check (public.is_household_editor(household_id));

create policy "import_column_mappings_select_member"
on public.import_column_mappings for select to authenticated
using (public.is_household_member(household_id));

create policy "import_column_mappings_insert_editor"
on public.import_column_mappings for insert to authenticated
with check (public.is_household_editor(household_id));

create policy "import_column_mappings_update_editor"
on public.import_column_mappings for update to authenticated
using (public.is_household_editor(household_id))
with check (public.is_household_editor(household_id));

-- Snapshots: readable by members, managed by admin/service.
create policy "monthly_snapshots_select_member"
on public.monthly_snapshots for select to authenticated
using (public.is_household_member(household_id));

create policy "monthly_snapshots_insert_admin"
on public.monthly_snapshots for insert to authenticated
with check (public.is_household_admin(household_id));

create policy "monthly_snapshots_update_admin"
on public.monthly_snapshots for update to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

create policy "monthly_snapshot_accounts_select_member"
on public.monthly_snapshot_accounts for select to authenticated
using (public.is_household_member(household_id));

create policy "monthly_snapshot_accounts_insert_admin"
on public.monthly_snapshot_accounts for insert to authenticated
with check (public.is_household_admin(household_id));

create policy "monthly_snapshot_accounts_update_admin"
on public.monthly_snapshot_accounts for update to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

create policy "monthly_snapshot_categories_select_member"
on public.monthly_snapshot_categories for select to authenticated
using (public.is_household_member(household_id));

create policy "monthly_snapshot_categories_insert_admin"
on public.monthly_snapshot_categories for insert to authenticated
with check (public.is_household_admin(household_id));

create policy "monthly_snapshot_categories_update_admin"
on public.monthly_snapshot_categories for update to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

-- Audit logs: readable by admin; insert allowed for members for MVP.
-- In production, prefer writing audit logs from trusted server-side code/service role.
create policy "audit_logs_select_admin"
on public.audit_logs for select to authenticated
using (household_id is null or public.is_household_admin(household_id));

create policy "audit_logs_insert_member"
on public.audit_logs for insert to authenticated
with check (household_id is null or public.is_household_member(household_id));

-- Future-ready tables.
create policy "categorization_rules_select_member"
on public.categorization_rules for select to authenticated
using (public.is_household_member(household_id));

create policy "categorization_rules_insert_admin"
on public.categorization_rules for insert to authenticated
with check (public.is_household_admin(household_id));

create policy "categorization_rules_update_admin"
on public.categorization_rules for update to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

create policy "categorization_rules_delete_admin"
on public.categorization_rules for delete to authenticated
using (public.is_household_admin(household_id));

create policy "recurring_transactions_select_member"
on public.recurring_transactions for select to authenticated
using (public.is_household_member(household_id));

create policy "recurring_transactions_insert_admin"
on public.recurring_transactions for insert to authenticated
with check (public.is_household_admin(household_id));

create policy "recurring_transactions_update_admin"
on public.recurring_transactions for update to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

create policy "goals_select_member"
on public.goals for select to authenticated
using (public.is_household_member(household_id));

create policy "goals_insert_admin"
on public.goals for insert to authenticated
with check (public.is_household_admin(household_id));

create policy "goals_update_admin"
on public.goals for update to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

create policy "attachments_select_member"
on public.attachments for select to authenticated
using (public.is_household_member(household_id));

create policy "attachments_insert_editor"
on public.attachments for insert to authenticated
with check (public.is_household_editor(household_id));

create policy "attachments_update_editor"
on public.attachments for update to authenticated
using (public.is_household_editor(household_id))
with check (public.is_household_editor(household_id));

create policy "attachments_delete_editor"
on public.attachments for delete to authenticated
using (public.is_household_editor(household_id));

-- ------------------------------------------------------------
-- 17. Initial helper views
-- ------------------------------------------------------------

create or replace view public.v_account_balances as
select
  a.household_id,
  a.id as account_id,
  a.name as account_name,
  a.account_type,
  a.account_class,
  a.currency_code,
  coalesce(sum(te.amount_account_currency) filter (where t.status = 'posted'), 0)::numeric(18,4) as posted_balance_account_currency,
  coalesce(sum(te.amount_base_currency) filter (where t.status = 'posted'), 0)::numeric(18,4) as posted_balance_base_currency,
  coalesce(sum(te.amount_account_currency) filter (where t.status in ('posted', 'pending')), 0)::numeric(18,4) as projected_balance_account_currency,
  coalesce(sum(te.amount_base_currency) filter (where t.status in ('posted', 'pending')), 0)::numeric(18,4) as projected_balance_base_currency
from public.accounts a
left join public.transaction_entries te
  on te.account_id = a.id
left join public.transactions t
  on t.id = te.transaction_id
where a.deleted_at is null
group by
  a.household_id,
  a.id,
  a.name,
  a.account_type,
  a.account_class,
  a.currency_code;

create or replace view public.v_monthly_category_actuals as
select
  ta.household_id,
  date_trunc('month', t.transaction_date)::date as month,
  ta.category_id,
  c.name as category_name,
  ta.allocation_type,
  sum(ta.amount_base_currency)::numeric(18,4) as actual_amount_base_currency
from public.transaction_allocations ta
join public.transactions t
  on t.id = ta.transaction_id
join public.categories c
  on c.id = ta.category_id
where t.status = 'posted'
  and t.deleted_at is null
group by
  ta.household_id,
  date_trunc('month', t.transaction_date)::date,
  ta.category_id,
  c.name,
  ta.allocation_type;

-- Views inherit access from underlying tables in Supabase/Postgres depending on security context.
-- Prefer querying views after validating RLS behavior in the project.

-- ------------------------------------------------------------
-- End of migration
-- ------------------------------------------------------------
