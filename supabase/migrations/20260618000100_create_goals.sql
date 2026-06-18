-- ============================================================
-- Create goals table + RLS
-- ------------------------------------------------------------
-- The table was defined in the initial schema design doc but never made it
-- into an applied migration for this project, so it does not exist in the
-- database. This creates it (idempotently), along with its index, updated_at
-- trigger, and RLS policies (select/insert/update). Goals use a soft
-- 'archived' status rather than hard delete, per project policy of
-- preferring archive over physical deletion of financial records.
--
-- Depends on existing objects: public.households, public.accounts,
-- public.currencies, public.set_updated_at(),
-- public.is_household_member(uuid), public.is_household_admin(uuid).
-- ============================================================

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

create index if not exists idx_goals_household_status
  on public.goals(household_id, status);

drop trigger if exists trg_goals_updated_at on public.goals;
create trigger trg_goals_updated_at
before update on public.goals
for each row execute function public.set_updated_at();

alter table public.goals enable row level security;

drop policy if exists "goals_select_member" on public.goals;
create policy "goals_select_member"
on public.goals for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists "goals_insert_admin" on public.goals;
create policy "goals_insert_admin"
on public.goals for insert to authenticated
with check (public.is_household_admin(household_id));

drop policy if exists "goals_update_admin" on public.goals;
create policy "goals_update_admin"
on public.goals for update to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));
