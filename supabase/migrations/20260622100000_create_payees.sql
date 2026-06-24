-- ============================================================
-- Create payees table + backfill from transactions.merchant_name (BR-009)
-- ------------------------------------------------------------
-- Data-only piece of BR-009. Introduces a household-scoped `payees` table
-- and a nullable `transactions.payee_id` FK, then backfills both from the
-- existing free-text `merchant_name` column (distinct per household,
-- case/whitespace-insensitive). `merchant_name` is kept as-is — nothing
-- reads/writes payee_id yet, so this is purely additive and safe to run on
-- existing data. Wiring payee_id into the transaction create/edit RPCs and
-- building autocomplete UI is a separate follow-up (left out of this sprint
-- to keep scope to the data model).
--
-- Depends on existing objects: public.households, public.transactions,
-- public.set_updated_at(), public.is_household_member(uuid),
-- public.is_household_editor(uuid).
-- ============================================================

create table if not exists public.payees (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payees_name_not_blank_chk check (length(trim(name)) > 0)
);

create unique index if not exists idx_payees_household_name_unique
  on public.payees(household_id, lower(name));

drop trigger if exists trg_payees_updated_at on public.payees;
create trigger trg_payees_updated_at
before update on public.payees
for each row execute function public.set_updated_at();

alter table public.payees enable row level security;

drop policy if exists "payees_select_member" on public.payees;
create policy "payees_select_member"
on public.payees for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists "payees_insert_editor" on public.payees;
create policy "payees_insert_editor"
on public.payees for insert to authenticated
with check (public.is_household_editor(household_id));

drop policy if exists "payees_update_editor" on public.payees;
create policy "payees_update_editor"
on public.payees for update to authenticated
using (public.is_household_editor(household_id))
with check (public.is_household_editor(household_id));

-- No delete policy: payees are referenced by historical transactions and
-- should not be physically removed (matches the project's archive-over-
-- delete policy for financial records).

alter table public.transactions
  add column if not exists payee_id uuid references public.payees(id) on delete set null;

create index if not exists idx_transactions_payee_id
  on public.transactions(payee_id)
  where payee_id is not null;

-- Backfill: one payee per distinct trimmed merchant_name per household.
insert into public.payees (household_id, name)
select distinct household_id, trim(merchant_name)
from public.transactions
where merchant_name is not null
  and length(trim(merchant_name)) > 0
on conflict (household_id, lower(name)) do nothing;

-- Link existing transactions to their backfilled payee.
update public.transactions t
set payee_id = p.id
from public.payees p
where t.payee_id is null
  and t.merchant_name is not null
  and length(trim(t.merchant_name)) > 0
  and p.household_id = t.household_id
  and lower(p.name) = lower(trim(t.merchant_name));
