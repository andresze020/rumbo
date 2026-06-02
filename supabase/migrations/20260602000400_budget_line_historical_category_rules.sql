-- ============================================================
-- App Finanzas — budget_line_historical_category_rules.sql
-- Sprint 8: Keep historical budget lines editable, avoid copying archived lines
-- Target: Supabase / PostgreSQL
-- ============================================================

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
  v_existing_line_id uuid;
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

  select bl.id
  into v_existing_line_id
  from public.budget_lines bl
  where bl.budget_id = v_budget.id
    and bl.category_id = v_category.id
    and bl.deleted_at is null;

  if v_existing_line_id is null then
    if v_category.is_archived then
      raise exception 'Archived categories cannot be added to new budget lines';
    end if;

    if v_category.exclude_from_budget then
      raise exception 'This category is excluded from budgets';
    end if;
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
    and c.is_archived = false
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
