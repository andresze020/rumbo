-- ============================================================
-- App Finanzas — budget_module.sql
-- Sprint 8: Monthly budget MVP
-- Target: Supabase / PostgreSQL
-- ============================================================

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  budget_month date not null,
  status text not null default 'active',
  currency_code varchar(3) not null references public.currencies(code),
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),

  constraint budgets_month_first_day_chk
    check (budget_month = date_trunc('month', budget_month)::date),
  constraint budgets_status_chk
    check (status in ('draft', 'active', 'closed'))
);

drop trigger if exists trg_budgets_updated_at on public.budgets;

create trigger trg_budgets_updated_at
before update on public.budgets
for each row execute function public.set_updated_at();

create unique index if not exists budgets_unique_active_month
  on public.budgets(household_id, budget_month)
  where deleted_at is null;

create index if not exists idx_budgets_household
  on public.budgets(household_id);

create index if not exists idx_budgets_household_month
  on public.budgets(household_id, budget_month);

create table if not exists public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  category_id uuid not null references public.categories(id),
  planned_amount numeric(18,4) not null default 0,
  notes text,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),

  constraint budget_lines_planned_amount_nonnegative_chk
    check (planned_amount >= 0)
);

drop trigger if exists trg_budget_lines_updated_at on public.budget_lines;

create trigger trg_budget_lines_updated_at
before update on public.budget_lines
for each row execute function public.set_updated_at();

create unique index if not exists budget_lines_unique_active_category
  on public.budget_lines(budget_id, category_id)
  where deleted_at is null;

create index if not exists idx_budget_lines_household
  on public.budget_lines(household_id);

create index if not exists idx_budget_lines_budget
  on public.budget_lines(budget_id);

create index if not exists idx_budget_lines_category
  on public.budget_lines(category_id);

alter table public.budgets enable row level security;
alter table public.budget_lines enable row level security;

drop policy if exists "budgets_select_member" on public.budgets;
drop policy if exists "budgets_insert_editor" on public.budgets;
drop policy if exists "budgets_update_editor" on public.budgets;
drop policy if exists "budgets_delete_editor" on public.budgets;

create policy "budgets_select_member"
on public.budgets
for select
to authenticated
using (
  deleted_at is null
  and public.is_household_member(household_id)
);

create policy "budgets_insert_editor"
on public.budgets
for insert
to authenticated
with check (
  public.is_household_editor(household_id)
  and created_by = auth.uid()
);

create policy "budgets_update_editor"
on public.budgets
for update
to authenticated
using (
  deleted_at is null
  and public.is_household_editor(household_id)
)
with check (public.is_household_editor(household_id));

create policy "budgets_delete_editor"
on public.budgets
for delete
to authenticated
using (public.is_household_editor(household_id));

drop policy if exists "budget_lines_select_member" on public.budget_lines;
drop policy if exists "budget_lines_insert_editor" on public.budget_lines;
drop policy if exists "budget_lines_update_editor" on public.budget_lines;
drop policy if exists "budget_lines_delete_editor" on public.budget_lines;

create policy "budget_lines_select_member"
on public.budget_lines
for select
to authenticated
using (
  deleted_at is null
  and public.is_household_member(household_id)
);

create policy "budget_lines_insert_editor"
on public.budget_lines
for insert
to authenticated
with check (
  public.is_household_editor(household_id)
  and created_by = auth.uid()
  and exists (
    select 1
    from public.budgets b
    where b.id = budget_id
      and b.household_id = budget_lines.household_id
      and b.deleted_at is null
  )
  and exists (
    select 1
    from public.categories c
    where c.id = category_id
      and c.household_id = budget_lines.household_id
      and c.deleted_at is null
  )
);

create policy "budget_lines_update_editor"
on public.budget_lines
for update
to authenticated
using (
  deleted_at is null
  and public.is_household_editor(household_id)
)
with check (
  public.is_household_editor(household_id)
  and exists (
    select 1
    from public.budgets b
    where b.id = budget_id
      and b.household_id = budget_lines.household_id
      and b.deleted_at is null
  )
  and exists (
    select 1
    from public.categories c
    where c.id = category_id
      and c.household_id = budget_lines.household_id
      and c.deleted_at is null
  )
);

create policy "budget_lines_delete_editor"
on public.budget_lines
for delete
to authenticated
using (public.is_household_editor(household_id));

create or replace function public.create_monthly_budget(
  p_household_id uuid,
  p_budget_month date
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_budget_month date;
  v_base_currency varchar(3);
  v_budget_id uuid;
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if p_budget_month is null then
    raise exception 'budget_month is required';
  end if;

  if not public.is_household_editor(p_household_id) then
    raise exception 'Not authorized to create budgets for this household';
  end if;

  select h.base_currency
  into v_base_currency
  from public.households h
  where h.id = p_household_id
    and h.deleted_at is null;

  if v_base_currency is null then
    raise exception 'household not found';
  end if;

  v_budget_month := date_trunc('month', p_budget_month)::date;

  insert into public.budgets (
    household_id,
    budget_month,
    status,
    currency_code,
    created_by
  )
  values (
    p_household_id,
    v_budget_month,
    'active',
    v_base_currency,
    auth.uid()
  )
  on conflict (household_id, budget_month)
    where deleted_at is null
  do update
    set updated_by = auth.uid()
  returning id into v_budget_id;

  return v_budget_id;
end;
$$;

grant execute on function public.create_monthly_budget(uuid, date)
to authenticated;

create or replace function public.upsert_budget_line(
  p_budget_id uuid,
  p_category_id uuid,
  p_planned_amount numeric
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_budget public.budgets%rowtype;
  v_category public.categories%rowtype;
  v_line_id uuid;
begin
  if p_budget_id is null then
    raise exception 'budget_id is required';
  end if;

  if p_category_id is null then
    raise exception 'category_id is required';
  end if;

  if p_planned_amount is null or p_planned_amount < 0 then
    raise exception 'planned_amount must be greater than or equal to 0';
  end if;

  select *
  into v_budget
  from public.budgets b
  where b.id = p_budget_id
    and b.deleted_at is null;

  if not found then
    raise exception 'budget not found';
  end if;

  if not public.is_household_editor(v_budget.household_id) then
    raise exception 'Not authorized to update this budget';
  end if;

  select *
  into v_category
  from public.categories c
  where c.id = p_category_id
    and c.household_id = v_budget.household_id
    and c.deleted_at is null;

  if not found then
    raise exception 'category not found';
  end if;

  if v_category.category_type <> 'expense' then
    raise exception 'Budget lines require an expense category';
  end if;

  if v_category.is_archived then
    raise exception 'Archived categories cannot be added to new budget lines';
  end if;

  if v_category.exclude_from_budget then
    raise exception 'This category is excluded from budgets';
  end if;

  insert into public.budget_lines (
    household_id,
    budget_id,
    category_id,
    planned_amount,
    created_by,
    updated_by
  )
  values (
    v_budget.household_id,
    v_budget.id,
    v_category.id,
    p_planned_amount,
    auth.uid(),
    auth.uid()
  )
  on conflict (budget_id, category_id)
    where deleted_at is null
  do update
    set planned_amount = excluded.planned_amount,
        updated_by = auth.uid()
  returning id into v_line_id;

  return v_line_id;
end;
$$;

grant execute on function public.upsert_budget_line(uuid, uuid, numeric)
to authenticated;

create or replace function public.delete_budget_line(
  p_budget_line_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  if p_budget_line_id is null then
    raise exception 'budget_line_id is required';
  end if;

  select bl.household_id
  into v_household_id
  from public.budget_lines bl
  where bl.id = p_budget_line_id
    and bl.deleted_at is null;

  if v_household_id is null then
    raise exception 'budget line not found';
  end if;

  if not public.is_household_editor(v_household_id) then
    raise exception 'Not authorized to delete this budget line';
  end if;

  update public.budget_lines
  set deleted_at = now(),
      deleted_by = auth.uid(),
      updated_by = auth.uid()
  where id = p_budget_line_id
    and deleted_at is null;
end;
$$;

grant execute on function public.delete_budget_line(uuid)
to authenticated;

create or replace function public.copy_budget_from_previous_month(
  p_household_id uuid,
  p_budget_month date
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_budget_month date;
  v_previous_month date;
  v_current_budget_id uuid;
  v_previous_budget_id uuid;
  v_copied_count integer;
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if p_budget_month is null then
    raise exception 'budget_month is required';
  end if;

  if not public.is_household_editor(p_household_id) then
    raise exception 'Not authorized to copy budgets for this household';
  end if;

  v_budget_month := date_trunc('month', p_budget_month)::date;
  v_previous_month := (v_budget_month - interval '1 month')::date;
  v_current_budget_id := public.create_monthly_budget(
    p_household_id,
    v_budget_month
  );

  select b.id
  into v_previous_budget_id
  from public.budgets b
  where b.household_id = p_household_id
    and b.budget_month = v_previous_month
    and b.deleted_at is null;

  if v_previous_budget_id is null then
    return 0;
  end if;

  insert into public.budget_lines (
    household_id,
    budget_id,
    category_id,
    planned_amount,
    notes,
    created_by,
    updated_by
  )
  select
    p_household_id,
    v_current_budget_id,
    previous_lines.category_id,
    previous_lines.planned_amount,
    previous_lines.notes,
    auth.uid(),
    auth.uid()
  from public.budget_lines previous_lines
  join public.categories c
    on c.id = previous_lines.category_id
    and c.household_id = previous_lines.household_id
    and c.deleted_at is null
  where previous_lines.budget_id = v_previous_budget_id
    and previous_lines.household_id = p_household_id
    and previous_lines.deleted_at is null
    and c.category_type = 'expense'
    and c.exclude_from_budget = false
    and not exists (
      select 1
      from public.budget_lines current_lines
      where current_lines.budget_id = v_current_budget_id
        and current_lines.category_id = previous_lines.category_id
        and current_lines.deleted_at is null
    );

  get diagnostics v_copied_count = row_count;

  return v_copied_count;
end;
$$;

grant execute on function public.copy_budget_from_previous_month(uuid, date)
to authenticated;

create or replace function public.get_monthly_budget_details(
  p_household_id uuid,
  p_budget_month date
)
returns table (
  budget_id uuid,
  household_id uuid,
  budget_month date,
  budget_status text,
  currency_code varchar(3),
  line_id uuid,
  category_id uuid,
  category_name text,
  parent_category_id uuid,
  category_is_archived boolean,
  category_exclude_from_budget boolean,
  category_exclude_from_reports boolean,
  planned_amount numeric(18,4),
  actual_amount numeric(18,4),
  transaction_count bigint
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_budget_month date;
  v_next_month date;
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if p_budget_month is null then
    raise exception 'budget_month is required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized to read budgets for this household';
  end if;

  v_budget_month := date_trunc('month', p_budget_month)::date;
  v_next_month := (v_budget_month + interval '1 month')::date;

  return query
  select
    b.id as budget_id,
    b.household_id,
    b.budget_month,
    b.status as budget_status,
    b.currency_code,
    bl.id as line_id,
    c.id as category_id,
    c.name as category_name,
    c.parent_category_id,
    c.is_archived as category_is_archived,
    c.exclude_from_budget as category_exclude_from_budget,
    c.exclude_from_reports as category_exclude_from_reports,
    bl.planned_amount::numeric(18,4) as planned_amount,
    coalesce(actuals.actual_amount, 0)::numeric(18,4) as actual_amount,
    coalesce(actuals.transaction_count, 0)::bigint as transaction_count
  from public.budgets b
  left join public.budget_lines bl
    on bl.budget_id = b.id
    and bl.household_id = b.household_id
    and bl.deleted_at is null
  left join public.categories c
    on c.id = bl.category_id
    and c.household_id = bl.household_id
    and c.deleted_at is null
  left join lateral (
    select
      sum(ta.amount_base_currency)::numeric(18,4) as actual_amount,
      count(distinct t.id)::bigint as transaction_count
    from public.transaction_allocations ta
    join public.transactions t
      on t.id = ta.transaction_id
      and t.household_id = ta.household_id
    join public.categories allocation_category
      on allocation_category.id = ta.category_id
      and allocation_category.household_id = ta.household_id
      and allocation_category.deleted_at is null
    left join public.categories parent_category
      on parent_category.id = allocation_category.parent_category_id
      and parent_category.household_id = allocation_category.household_id
      and parent_category.deleted_at is null
    where bl.id is not null
      and ta.household_id = p_household_id
      and ta.category_id = bl.category_id
      and ta.allocation_type = 'expense'
      and t.status = 'posted'
      and t.deleted_at is null
      and t.transaction_date >= v_budget_month
      and t.transaction_date < v_next_month
      and allocation_category.exclude_from_reports = false
      and coalesce(parent_category.exclude_from_reports, false) = false
  ) actuals on true
  where b.household_id = p_household_id
    and b.budget_month = v_budget_month
    and b.deleted_at is null
  order by
    c.sort_order nulls last,
    c.name asc,
    bl.created_at asc;
end;
$$;

grant execute on function public.get_monthly_budget_details(uuid, date)
to authenticated;
