-- ============================================================
-- App Finanzas — BR-001 CSV import FX correctness
-- Target: Supabase / PostgreSQL
-- ============================================================

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  from_currency_code varchar(3) not null references public.currencies(code),
  to_currency_code varchar(3) not null references public.currencies(code),
  rate numeric(18,8) not null,
  rate_date date not null,
  source text not null default 'manual',
  notes text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint exchange_rates_currency_pair_distinct_chk
    check (from_currency_code <> to_currency_code),
  constraint exchange_rates_from_currency_format_chk
    check (
      from_currency_code = upper(from_currency_code)
      and length(from_currency_code) = 3
    ),
  constraint exchange_rates_to_currency_format_chk
    check (
      to_currency_code = upper(to_currency_code)
      and length(to_currency_code) = 3
    ),
  constraint exchange_rates_rate_positive_chk
    check (rate > 0),
  constraint exchange_rates_source_not_blank_chk
    check (length(trim(source)) > 0)
);

drop trigger if exists trg_exchange_rates_updated_at on public.exchange_rates;

create trigger trg_exchange_rates_updated_at
before update on public.exchange_rates
for each row execute function public.set_updated_at();

create unique index if not exists exchange_rates_unique_household_pair_date
  on public.exchange_rates(
    household_id,
    from_currency_code,
    to_currency_code,
    rate_date
  );

create index if not exists idx_exchange_rates_household_pair_date
  on public.exchange_rates(
    household_id,
    from_currency_code,
    to_currency_code,
    rate_date desc
  );

alter table public.exchange_rates enable row level security;

drop policy if exists "exchange_rates_select_member" on public.exchange_rates;
drop policy if exists "exchange_rates_insert_editor" on public.exchange_rates;
drop policy if exists "exchange_rates_update_editor" on public.exchange_rates;
drop policy if exists "exchange_rates_delete_editor" on public.exchange_rates;

create policy "exchange_rates_select_member"
on public.exchange_rates
for select
to authenticated
using (public.is_household_member(household_id));

create policy "exchange_rates_insert_editor"
on public.exchange_rates
for insert
to authenticated
with check (
  public.is_household_editor(household_id)
  and (created_by is null or created_by = auth.uid())
);

create policy "exchange_rates_update_editor"
on public.exchange_rates
for update
to authenticated
using (public.is_household_editor(household_id))
with check (
  public.is_household_editor(household_id)
  and (updated_by is null or updated_by = auth.uid())
);

create policy "exchange_rates_delete_editor"
on public.exchange_rates
for delete
to authenticated
using (public.is_household_editor(household_id));

create or replace function public.get_exchange_rate(
  p_household_id uuid,
  p_from_currency varchar(3),
  p_to_currency varchar(3),
  p_rate_date date
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_from_currency varchar(3);
  v_to_currency varchar(3);
  v_rate numeric(18,8);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if p_rate_date is null then
    raise exception 'rate_date is required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized to read exchange rates for this household';
  end if;

  v_from_currency := upper(nullif(trim(coalesce(p_from_currency, '')), ''));
  v_to_currency := upper(nullif(trim(coalesce(p_to_currency, '')), ''));

  if v_from_currency is null or length(v_from_currency) <> 3 then
    raise exception 'from_currency is required';
  end if;

  if v_to_currency is null or length(v_to_currency) <> 3 then
    raise exception 'to_currency is required';
  end if;

  if v_from_currency = v_to_currency then
    return 1;
  end if;

  select er.rate
  into v_rate
  from public.exchange_rates er
  where er.household_id = p_household_id
    and er.from_currency_code = v_from_currency
    and er.to_currency_code = v_to_currency
    and er.rate_date <= p_rate_date
  order by er.rate_date desc, er.created_at desc
  limit 1;

  if v_rate is not null then
    return v_rate;
  end if;

  select er.rate
  into v_rate
  from public.exchange_rates er
  where er.household_id = p_household_id
    and er.from_currency_code = v_to_currency
    and er.to_currency_code = v_from_currency
    and er.rate_date <= p_rate_date
  order by er.rate_date desc, er.created_at desc
  limit 1;

  if v_rate is not null then
    return round(1 / v_rate, 8);
  end if;

  return null;
end;
$$;

grant execute on function public.get_exchange_rate(
  uuid,
  varchar,
  varchar,
  date
) to authenticated;

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
  v_base_currency varchar(3);
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

  select upper(h.base_currency)
  into v_base_currency
  from public.households h
  where h.id = p_household_id
    and h.deleted_at is null;

  if v_base_currency is null then
    raise exception 'household was not found';
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
      'parser', jsonb_build_object('name', 'app-finanzas-client-csv-parser'),
      'fx', jsonb_build_object(
        'baseCurrency', v_base_currency,
        'lookup', 'exchange_rates latest rate on or before transaction_date',
        'missingRateBehavior', 'row_invalid'
      )
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
    v_exchange_rate := null;
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
      select upper(a.currency_code), a.is_archived, a.deleted_at
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

    if v_transaction_date is not null and v_account_currency is not null then
      v_exchange_rate := public.get_exchange_rate(
        p_household_id,
        v_account_currency,
        v_base_currency,
        v_transaction_date
      );

      v_mapped_data := v_mapped_data || jsonb_build_object(
        'account_currency', v_account_currency,
        'base_currency', v_base_currency
      );

      if v_exchange_rate is null then
        v_errors := v_errors || jsonb_build_array(
          format(
            'No exchange rate from %s to %s on or before %s.',
            v_account_currency,
            v_base_currency,
            v_transaction_date
          )
        );
      else
        v_mapped_data := v_mapped_data || jsonb_build_object(
          'exchange_rate_to_base',
          v_exchange_rate
        );
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
