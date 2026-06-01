-- ============================================================
-- App Finanzas — 003_transactions_ledger.sql
-- Sprint 2.3: Transactions base
-- Target: Supabase / PostgreSQL
-- ============================================================

-- ------------------------------------------------------------
-- 1. Transactions
-- ------------------------------------------------------------

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,

  transaction_date date not null,
  transaction_type text not null,
  status text not null default 'posted',
  source text not null default 'manual',

  description text,
  notes text,

  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),

  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text,

  constraint transactions_type_chk
    check (transaction_type in (
      'income',
      'expense',
      'transfer',
      'debt_payment',
      'adjustment',
      'opening_balance',
      'investment'
    )),

  constraint transactions_status_chk
    check (status in (
      'pending',
      'posted',
      'voided',
      'deleted_soft'
    )),

  constraint transactions_source_chk
    check (source in (
      'manual',
      'csv_import',
      'system',
      'future_bank_sync'
    ))
);

drop trigger if exists trg_transactions_updated_at on public.transactions;

create trigger trg_transactions_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

create index if not exists idx_transactions_household
  on public.transactions(household_id);

create index if not exists idx_transactions_household_date
  on public.transactions(household_id, transaction_date);

create index if not exists idx_transactions_household_type
  on public.transactions(household_id, transaction_type);

create index if not exists idx_transactions_household_status
  on public.transactions(household_id, status);

create index if not exists idx_transactions_household_source
  on public.transactions(household_id, source);

create index if not exists idx_transactions_created_by
  on public.transactions(created_by);

-- ------------------------------------------------------------
-- 2. Transaction entries
-- ------------------------------------------------------------

create table if not exists public.transaction_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  currency_code varchar(3) not null references public.currencies(code),

  entry_type text not null default 'movement',
  amount_account_currency numeric(18,4) not null,
  exchange_rate_to_base numeric(18,8) not null default 1,
  amount_base_currency numeric(18,4) not null,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint transaction_entries_type_chk
    check (entry_type in (
      'debit',
      'credit',
      'movement',
      'adjustment'
    )),

  constraint transaction_entries_amount_account_currency_nonzero_chk
    check (amount_account_currency <> 0),

  constraint transaction_entries_exchange_rate_positive_chk
    check (exchange_rate_to_base > 0)
);

drop trigger if exists trg_transaction_entries_updated_at on public.transaction_entries;

create trigger trg_transaction_entries_updated_at
before update on public.transaction_entries
for each row execute function public.set_updated_at();

create index if not exists idx_transaction_entries_household
  on public.transaction_entries(household_id);

create index if not exists idx_transaction_entries_transaction
  on public.transaction_entries(transaction_id);

create index if not exists idx_transaction_entries_account
  on public.transaction_entries(account_id);

create index if not exists idx_transaction_entries_household_account
  on public.transaction_entries(household_id, account_id);

create index if not exists idx_transaction_entries_household_transaction
  on public.transaction_entries(household_id, transaction_id);

-- ------------------------------------------------------------
-- 3. Transaction allocations
-- ------------------------------------------------------------

create table if not exists public.transaction_allocations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  category_id uuid not null references public.categories(id),
  currency_code varchar(3) not null references public.currencies(code),

  allocation_type text not null,
  amount_original_currency numeric(18,4) not null,
  exchange_rate_to_base numeric(18,8) not null default 1,
  amount_base_currency numeric(18,4) not null,

  notes text,

  created_at timestamptz not null default now(),

  constraint transaction_allocations_type_chk
    check (allocation_type in (
      'income',
      'expense',
      'financial',
      'adjustment'
    )),

  constraint transaction_allocations_amount_original_positive_chk
    check (amount_original_currency > 0),

  constraint transaction_allocations_amount_base_positive_chk
    check (amount_base_currency > 0),

  constraint transaction_allocations_exchange_rate_positive_chk
    check (exchange_rate_to_base > 0)
);

create index if not exists idx_transaction_allocations_household
  on public.transaction_allocations(household_id);

create index if not exists idx_transaction_allocations_transaction
  on public.transaction_allocations(transaction_id);

create index if not exists idx_transaction_allocations_category
  on public.transaction_allocations(category_id);

create index if not exists idx_transaction_allocations_household_category
  on public.transaction_allocations(household_id, category_id);

create index if not exists idx_transaction_allocations_household_transaction
  on public.transaction_allocations(household_id, transaction_id);

-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------

alter table public.transactions enable row level security;
alter table public.transaction_entries enable row level security;
alter table public.transaction_allocations enable row level security;

drop policy if exists "transactions_select_member" on public.transactions;
drop policy if exists "transactions_insert_editor" on public.transactions;
drop policy if exists "transactions_update_editor" on public.transactions;

create policy "transactions_select_member"
on public.transactions
for select
to authenticated
using (public.is_household_member(household_id));

create policy "transactions_insert_editor"
on public.transactions
for insert
to authenticated
with check (
  public.is_household_editor(household_id)
  and created_by = auth.uid()
);

create policy "transactions_update_editor"
on public.transactions
for update
to authenticated
using (public.is_household_editor(household_id))
with check (public.is_household_editor(household_id));

drop policy if exists "transaction_entries_select_member" on public.transaction_entries;
drop policy if exists "transaction_entries_insert_editor" on public.transaction_entries;
drop policy if exists "transaction_entries_update_editor" on public.transaction_entries;
drop policy if exists "transaction_entries_delete_editor" on public.transaction_entries;

create policy "transaction_entries_select_member"
on public.transaction_entries
for select
to authenticated
using (public.is_household_member(household_id));

create policy "transaction_entries_insert_editor"
on public.transaction_entries
for insert
to authenticated
with check (
  public.is_household_editor(household_id)
  and exists (
    select 1
    from public.transactions t
    where t.id = transaction_id
      and t.household_id = transaction_entries.household_id
  )
  and exists (
    select 1
    from public.accounts a
    where a.id = account_id
      and a.household_id = transaction_entries.household_id
  )
);

create policy "transaction_entries_update_editor"
on public.transaction_entries
for update
to authenticated
using (public.is_household_editor(household_id))
with check (
  public.is_household_editor(household_id)
  and exists (
    select 1
    from public.transactions t
    where t.id = transaction_id
      and t.household_id = transaction_entries.household_id
  )
  and exists (
    select 1
    from public.accounts a
    where a.id = account_id
      and a.household_id = transaction_entries.household_id
  )
);

create policy "transaction_entries_delete_editor"
on public.transaction_entries
for delete
to authenticated
using (public.is_household_editor(household_id));

drop policy if exists "transaction_allocations_select_member" on public.transaction_allocations;
drop policy if exists "transaction_allocations_insert_editor" on public.transaction_allocations;
drop policy if exists "transaction_allocations_update_editor" on public.transaction_allocations;
drop policy if exists "transaction_allocations_delete_editor" on public.transaction_allocations;

create policy "transaction_allocations_select_member"
on public.transaction_allocations
for select
to authenticated
using (public.is_household_member(household_id));

create policy "transaction_allocations_insert_editor"
on public.transaction_allocations
for insert
to authenticated
with check (
  public.is_household_editor(household_id)
  and exists (
    select 1
    from public.transactions t
    where t.id = transaction_id
      and t.household_id = transaction_allocations.household_id
  )
  and exists (
    select 1
    from public.categories c
    where c.id = category_id
      and c.household_id = transaction_allocations.household_id
  )
);

create policy "transaction_allocations_update_editor"
on public.transaction_allocations
for update
to authenticated
using (public.is_household_editor(household_id))
with check (
  public.is_household_editor(household_id)
  and exists (
    select 1
    from public.transactions t
    where t.id = transaction_id
      and t.household_id = transaction_allocations.household_id
  )
  and exists (
    select 1
    from public.categories c
    where c.id = category_id
      and c.household_id = transaction_allocations.household_id
  )
);

create policy "transaction_allocations_delete_editor"
on public.transaction_allocations
for delete
to authenticated
using (public.is_household_editor(household_id));
