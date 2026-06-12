-- ============================================================
-- Create recurring_transactions table + RLS
-- ------------------------------------------------------------
-- The table was defined in the initial schema design doc but never made it
-- into an applied migration for this project, so it does not exist in the
-- database. This creates it (idempotently), along with its index, updated_at
-- trigger, and the full set of RLS policies including DELETE (admin) which the
-- recurring-transactions feature needs for UC-7 (hard delete a template).
--
-- Depends on existing objects: public.households, public.accounts,
-- public.categories, public.currencies, public.set_updated_at(),
-- public.is_household_member(uuid), public.is_household_admin(uuid).
-- ============================================================

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

create index if not exists idx_recurring_transactions_household_active
  on public.recurring_transactions(household_id, is_active);

drop trigger if exists trg_recurring_transactions_updated_at
  on public.recurring_transactions;
create trigger trg_recurring_transactions_updated_at
before update on public.recurring_transactions
for each row execute function public.set_updated_at();

alter table public.recurring_transactions enable row level security;

drop policy if exists "recurring_transactions_select_member"
  on public.recurring_transactions;
create policy "recurring_transactions_select_member"
on public.recurring_transactions for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists "recurring_transactions_insert_admin"
  on public.recurring_transactions;
create policy "recurring_transactions_insert_admin"
on public.recurring_transactions for insert to authenticated
with check (public.is_household_admin(household_id));

drop policy if exists "recurring_transactions_update_admin"
  on public.recurring_transactions;
create policy "recurring_transactions_update_admin"
on public.recurring_transactions for update to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

drop policy if exists "recurring_transactions_delete_admin"
  on public.recurring_transactions;
create policy "recurring_transactions_delete_admin"
on public.recurring_transactions for delete to authenticated
using (public.is_household_admin(household_id));
