-- ============================================================
-- App Finanzas — sprint_9_csv_import.sql
-- Sprint 9: Generic CSV transaction import
-- Target: Supabase / PostgreSQL
-- ============================================================

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  file_name text not null,
  file_hash text,
  source_type text not null default 'csv_generic',
  target_account_id uuid references public.accounts(id),
  status text not null default 'uploaded',
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  imported_transactions_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),

  constraint import_batches_source_type_chk
    check (source_type in ('csv_generic')),
  constraint import_batches_status_chk
    check (status in ('uploaded', 'mapped', 'validated', 'imported', 'partial', 'failed')),
  constraint import_batches_row_counts_nonnegative_chk
    check (
      total_rows >= 0
      and valid_rows >= 0
      and invalid_rows >= 0
      and duplicate_rows >= 0
      and imported_transactions_count >= 0
    )
);

drop trigger if exists trg_import_batches_updated_at on public.import_batches;

create trigger trg_import_batches_updated_at
before update on public.import_batches
for each row execute function public.set_updated_at();

create index if not exists idx_import_batches_household
  on public.import_batches(household_id);

create index if not exists idx_import_batches_uploaded_by
  on public.import_batches(uploaded_by);

create index if not exists idx_import_batches_status
  on public.import_batches(household_id, status);

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number integer not null,
  raw_data jsonb not null default '{}'::jsonb,
  mapped_data jsonb not null default '{}'::jsonb,
  validation_status text not null default 'invalid',
  validation_errors jsonb not null default '[]'::jsonb,
  created_transaction_id uuid references public.transactions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint import_rows_row_number_positive_chk
    check (row_number > 0),
  constraint import_rows_validation_status_chk
    check (validation_status in ('valid', 'invalid', 'duplicate', 'imported', 'skipped', 'failed'))
);

drop trigger if exists trg_import_rows_updated_at on public.import_rows;

create trigger trg_import_rows_updated_at
before update on public.import_rows
for each row execute function public.set_updated_at();

create unique index if not exists import_rows_unique_batch_row_number
  on public.import_rows(import_batch_id, row_number);

create index if not exists idx_import_rows_household
  on public.import_rows(household_id);

create index if not exists idx_import_rows_batch
  on public.import_rows(import_batch_id);

create index if not exists idx_import_rows_transaction
  on public.import_rows(created_transaction_id);

alter table public.transactions
  add column if not exists import_batch_id uuid references public.import_batches(id),
  add column if not exists import_row_id uuid references public.import_rows(id);

create index if not exists idx_transactions_import_batch
  on public.transactions(import_batch_id);

create index if not exists idx_transactions_import_row
  on public.transactions(import_row_id);

alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;

drop policy if exists "import_batches_select_member" on public.import_batches;
drop policy if exists "import_batches_insert_editor" on public.import_batches;
drop policy if exists "import_batches_update_editor" on public.import_batches;
drop policy if exists "import_batches_delete_editor" on public.import_batches;

create policy "import_batches_select_member"
on public.import_batches
for select
to authenticated
using (
  deleted_at is null
  and public.is_household_member(household_id)
);

create policy "import_batches_insert_editor"
on public.import_batches
for insert
to authenticated
with check (
  public.is_household_editor(household_id)
  and uploaded_by = auth.uid()
);

create policy "import_batches_update_editor"
on public.import_batches
for update
to authenticated
using (
  deleted_at is null
  and public.is_household_editor(household_id)
)
with check (public.is_household_editor(household_id));

create policy "import_batches_delete_editor"
on public.import_batches
for delete
to authenticated
using (public.is_household_editor(household_id));

drop policy if exists "import_rows_select_member" on public.import_rows;
drop policy if exists "import_rows_insert_editor" on public.import_rows;
drop policy if exists "import_rows_update_editor" on public.import_rows;
drop policy if exists "import_rows_delete_editor" on public.import_rows;

create policy "import_rows_select_member"
on public.import_rows
for select
to authenticated
using (public.is_household_member(household_id));

create policy "import_rows_insert_editor"
on public.import_rows
for insert
to authenticated
with check (
  public.is_household_editor(household_id)
  and exists (
    select 1
    from public.import_batches ib
    where ib.id = import_batch_id
      and ib.household_id = import_rows.household_id
      and ib.deleted_at is null
  )
);

create policy "import_rows_update_editor"
on public.import_rows
for update
to authenticated
using (public.is_household_editor(household_id))
with check (public.is_household_editor(household_id));

create policy "import_rows_delete_editor"
on public.import_rows
for delete
to authenticated
using (public.is_household_editor(household_id));

create or replace function public.create_csv_import(
  p_household_id uuid,
  p_file_name text,
  p_file_hash text,
  p_target_account_id uuid,
  p_mapping jsonb,
  p_rows jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_row jsonb;
  v_row_number integer;
  v_raw_data jsonb;
  v_mapped_data jsonb;
  v_errors jsonb;
  v_transaction_date date;
  v_date_text text;
  v_amount numeric(18,4);
  v_amount_text text;
  v_abs_amount numeric(18,4);
  v_transaction_type text;
  v_description text;
  v_notes text;
  v_account_id uuid;
  v_category_id uuid;
  v_account_currency varchar(3);
  v_account_archived boolean;
  v_account_deleted_at timestamptz;
  v_category_reporting_type text;
  v_category_archived boolean;
  v_category_deleted_at timestamptz;
  v_exchange_rate numeric(18,8);
  v_signed_entry_amount numeric(18,4);
  v_row_id uuid;
  v_transaction_id uuid;
  v_total_count integer := 0;
  v_invalid_count integer := 0;
  v_duplicate_count integer := 0;
  v_imported_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if not public.is_household_editor(p_household_id) then
    raise exception 'Not authorized to import transactions for this household';
  end if;

  if p_file_name is null or length(trim(p_file_name)) = 0 then
    raise exception 'file_name is required';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array';
  end if;

  if p_target_account_id is not null and not exists (
    select 1
    from public.accounts a
    where a.id = p_target_account_id
      and a.household_id = p_household_id
      and a.is_archived = false
      and a.deleted_at is null
  ) then
    raise exception 'target account is not active for this household';
  end if;

  insert into public.import_batches (
    household_id,
    uploaded_by,
    file_name,
    file_hash,
    source_type,
    target_account_id,
    status,
    metadata
  )
  values (
    p_household_id,
    auth.uid(),
    trim(p_file_name),
    nullif(trim(coalesce(p_file_hash, '')), ''),
    'csv_generic',
    p_target_account_id,
    'validated',
    jsonb_build_object(
      'mapping', coalesce(p_mapping, '{}'::jsonb),
      'parser', jsonb_build_object('name', 'app-finanzas-client-csv-parser')
    )
  )
  returning id into v_batch_id;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_total_count := v_total_count + 1;
    v_row_number := coalesce((v_row ->> 'rowNumber')::integer, v_total_count);
    v_raw_data := coalesce(v_row -> 'rawData', '{}'::jsonb);
    v_mapped_data := coalesce(v_row -> 'mappedData', '{}'::jsonb);
    v_errors := '[]'::jsonb;
    v_transaction_date := null;
    v_amount := null;
    v_abs_amount := null;
    v_account_id := null;
    v_category_id := null;
    v_account_currency := null;
    v_account_archived := null;
    v_account_deleted_at := null;
    v_category_reporting_type := null;
    v_category_archived := null;
    v_category_deleted_at := null;
    v_exchange_rate := 1;
    v_transaction_id := null;

    v_date_text := nullif(trim(coalesce(v_mapped_data ->> 'transaction_date', '')), '');
    if v_date_text is null then
      v_errors := v_errors || jsonb_build_array('Date is required.');
    else
      begin
        v_transaction_date := v_date_text::date;
      exception when others then
        v_errors := v_errors || jsonb_build_array('Date is not valid.');
      end;
    end if;

    v_amount_text := nullif(trim(coalesce(v_mapped_data ->> 'amount', '')), '');
    if v_amount_text is null then
      v_errors := v_errors || jsonb_build_array('Amount is required.');
    else
      begin
        v_amount := replace(v_amount_text, ',', '')::numeric;
      exception when others then
        v_errors := v_errors || jsonb_build_array('Amount is not numeric.');
      end;
    end if;

    v_transaction_type := lower(nullif(trim(coalesce(v_mapped_data ->> 'transaction_type', '')), ''));

    if v_transaction_type is null and v_amount is not null then
      if v_amount > 0 then
        v_transaction_type := 'income';
      elsif v_amount < 0 then
        v_transaction_type := 'expense';
      end if;
    end if;

    if v_transaction_type not in ('income', 'expense') then
      v_errors := v_errors || jsonb_build_array('Only income and expense CSV rows are supported.');
    end if;

    if v_amount is not null then
      v_abs_amount := abs(v_amount);
      if v_abs_amount = 0 then
        v_errors := v_errors || jsonb_build_array('Amount cannot be 0.');
      end if;
    end if;

    v_description := nullif(trim(coalesce(v_mapped_data ->> 'description', '')), '');
    if v_description is null then
      v_errors := v_errors || jsonb_build_array('Description is required.');
    end if;

    v_notes := nullif(trim(coalesce(v_mapped_data ->> 'notes', '')), '');

    begin
      v_account_id := coalesce(
        nullif(trim(coalesce(v_mapped_data ->> 'account_id', '')), '')::uuid,
        p_target_account_id
      );
    exception when others then
      v_errors := v_errors || jsonb_build_array('Account mapping is not valid.');
      v_account_id := p_target_account_id;
    end;

    if v_account_id is null then
      v_errors := v_errors || jsonb_build_array('Account is required.');
    else
      select a.currency_code, a.is_archived, a.deleted_at
      into v_account_currency, v_account_archived, v_account_deleted_at
      from public.accounts a
      where a.id = v_account_id
        and a.household_id = p_household_id;

      if v_account_currency is null then
        v_errors := v_errors || jsonb_build_array('Account was not found.');
      elsif v_account_archived or v_account_deleted_at is not null then
        v_errors := v_errors || jsonb_build_array('Account is archived or deleted.');
      end if;
    end if;

    begin
      v_category_id := nullif(trim(coalesce(v_mapped_data ->> 'category_id', '')), '')::uuid;
    exception when others then
      v_errors := v_errors || jsonb_build_array('Category mapping is not valid.');
      v_category_id := null;
    end;

    if v_category_id is null then
      v_errors := v_errors || jsonb_build_array('Category is required.');
    else
      select c.reporting_type, c.is_archived, c.deleted_at
      into v_category_reporting_type, v_category_archived, v_category_deleted_at
      from public.categories c
      where c.id = v_category_id
        and c.household_id = p_household_id;

      if v_category_reporting_type is null then
        v_errors := v_errors || jsonb_build_array('Category was not found.');
      elsif v_category_archived or v_category_deleted_at is not null then
        v_errors := v_errors || jsonb_build_array('Category is archived or deleted.');
      elsif v_transaction_type = 'income' and v_category_reporting_type <> 'income' then
        v_errors := v_errors || jsonb_build_array('Income rows require an income category.');
      elsif v_transaction_type = 'expense' and v_category_reporting_type not in ('expense', 'debt_interest') then
        v_errors := v_errors || jsonb_build_array('Expense rows require an expense category.');
      end if;
    end if;

    if jsonb_array_length(v_errors) > 0 then
      insert into public.import_rows (
        household_id,
        import_batch_id,
        row_number,
        raw_data,
        mapped_data,
        validation_status,
        validation_errors
      )
      values (
        p_household_id,
        v_batch_id,
        v_row_number,
        v_raw_data,
        v_mapped_data,
        'invalid',
        v_errors
      );

      v_invalid_count := v_invalid_count + 1;
      continue;
    end if;

    if exists (
      select 1
      from public.transactions t
      join public.transaction_entries te
        on te.transaction_id = t.id
        and te.household_id = t.household_id
      where t.household_id = p_household_id
        and t.deleted_at is null
        and t.status = 'posted'
        and t.transaction_date = v_transaction_date
        and coalesce(t.description, '') = coalesce(v_description, '')
        and te.account_id = v_account_id
        and abs(te.amount_account_currency) = v_abs_amount
    ) then
      insert into public.import_rows (
        household_id,
        import_batch_id,
        row_number,
        raw_data,
        mapped_data,
        validation_status,
        validation_errors
      )
      values (
        p_household_id,
        v_batch_id,
        v_row_number,
        v_raw_data,
        v_mapped_data,
        'duplicate',
        jsonb_build_array('Possible duplicate: same date, account, description, and amount already exists.')
      );

      v_duplicate_count := v_duplicate_count + 1;
      continue;
    end if;

    insert into public.import_rows (
      household_id,
      import_batch_id,
      row_number,
      raw_data,
      mapped_data,
      validation_status,
      validation_errors
    )
    values (
      p_household_id,
      v_batch_id,
      v_row_number,
      v_raw_data,
      v_mapped_data,
      'valid',
      '[]'::jsonb
    )
    returning id into v_row_id;

    if v_transaction_type = 'income' then
      v_signed_entry_amount := v_abs_amount;
    else
      v_signed_entry_amount := -v_abs_amount;
    end if;

    insert into public.transactions (
      household_id,
      transaction_type,
      transaction_date,
      description,
      notes,
      status,
      source,
      import_batch_id,
      import_row_id,
      created_by
    )
    values (
      p_household_id,
      v_transaction_type,
      v_transaction_date,
      v_description,
      v_notes,
      'posted',
      'csv_import',
      v_batch_id,
      v_row_id,
      auth.uid()
    )
    returning id into v_transaction_id;

    insert into public.transaction_entries (
      household_id,
      transaction_id,
      account_id,
      amount_account_currency,
      currency_code,
      exchange_rate_to_base,
      amount_base_currency,
      entry_type
    )
    values (
      p_household_id,
      v_transaction_id,
      v_account_id,
      v_signed_entry_amount,
      v_account_currency,
      v_exchange_rate,
      v_signed_entry_amount * v_exchange_rate,
      'movement'
    );

    insert into public.transaction_allocations (
      household_id,
      transaction_id,
      category_id,
      allocation_type,
      amount_original_currency,
      currency_code,
      exchange_rate_to_base,
      amount_base_currency
    )
    values (
      p_household_id,
      v_transaction_id,
      v_category_id,
      v_transaction_type,
      v_abs_amount,
      v_account_currency,
      v_exchange_rate,
      v_abs_amount * v_exchange_rate
    );

    update public.import_rows
    set validation_status = 'imported',
        created_transaction_id = v_transaction_id
    where id = v_row_id;

    v_imported_count := v_imported_count + 1;
  end loop;

  update public.import_batches
  set status = case
      when v_imported_count > 0 and (v_invalid_count > 0 or v_duplicate_count > 0) then 'partial'
      when v_imported_count > 0 then 'imported'
      else 'failed'
    end,
    total_rows = v_total_count,
    valid_rows = v_imported_count,
    invalid_rows = v_invalid_count,
    duplicate_rows = v_duplicate_count,
    imported_transactions_count = v_imported_count,
    metadata = metadata || jsonb_build_object(
      'validationSummary',
      jsonb_build_object(
        'totalRows', v_total_count,
        'importedRows', v_imported_count,
        'invalidRows', v_invalid_count,
        'duplicateRows', v_duplicate_count
      )
    )
  where id = v_batch_id;

  return v_batch_id;
end;
$$;

grant execute on function public.create_csv_import(
  uuid,
  text,
  text,
  uuid,
  jsonb,
  jsonb
) to authenticated;
