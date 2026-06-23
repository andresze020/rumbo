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
  linked_account_id uuid references public.accounts(id) on delete set null,
  status text not null default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint goals_type_chk
    check (goal_type in ('emergency_fund', 'debt_payoff', 'down_payment', 'travel', 'retirement', 'custom')),

  constraint goals_status_chk
    check (status in ('active', 'paused', 'completed', 'archived')),

  constraint goals_amounts_chk
    check (target_amount > 0 and current_amount >= 0)
);

create index if not exists idx_goals_household_status
  on public.goals(household_id, status);

create index if not exists idx_goals_linked_account
  on public.goals(linked_account_id)
  where linked_account_id is not null;

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
drop policy if exists "goals_insert_editor" on public.goals;
create policy "goals_insert_editor"
on public.goals for insert to authenticated
with check (public.is_household_editor(household_id));

drop policy if exists "goals_update_admin" on public.goals;
drop policy if exists "goals_update_editor" on public.goals;
create policy "goals_update_editor"
on public.goals for update to authenticated
using (public.is_household_editor(household_id))
with check (public.is_household_editor(household_id));

-- ============================================================
-- Atomic contribute/withdraw RPC.
-- ------------------------------------------------------------
-- contributeGoalAction/withdrawGoalAction used to select current_amount,
-- compute the new value in JS, then UPDATE — two concurrent requests for the
-- same goal could both read the same starting value and one write would
-- silently clobber the other. This locks the row (`for update`) so
-- concurrent adjustments serialize instead of racing.
-- ============================================================

create or replace function public.apply_goal_adjustment(
  p_goal_id uuid,
  p_household_id uuid,
  p_delta numeric
)
returns table (current_amount numeric, status text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current numeric(18,4);
  v_target numeric(18,4);
  v_status text;
  v_new_amount numeric(18,4);
  v_new_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_household_id is null or not public.is_household_editor(p_household_id) then
    raise exception 'Not authorized to adjust goals for this household';
  end if;

  if p_delta is null or p_delta = 0 then
    raise exception 'Amount must be greater than 0';
  end if;

  select g.current_amount, g.target_amount, g.status
  into v_current, v_target, v_status
  from public.goals g
  where g.id = p_goal_id
    and g.household_id = p_household_id
  for update;

  if not found then
    raise exception 'Goal was not found for this household';
  end if;

  if v_status = 'archived' then
    raise exception 'This goal is archived. Restore it first.';
  end if;

  v_new_amount := v_current + p_delta;

  if v_new_amount < 0 then
    raise exception 'Cannot withdraw more than the current saved amount.';
  end if;

  v_new_status := case
    when v_new_amount >= v_target then 'completed'
    when v_status = 'completed' then 'active'
    else v_status
  end;

  update public.goals
  set current_amount = v_new_amount, status = v_new_status
  where id = p_goal_id and household_id = p_household_id;

  return query select v_new_amount, v_new_status;
end;
$$;

grant execute on function public.apply_goal_adjustment(uuid, uuid, numeric) to authenticated;
