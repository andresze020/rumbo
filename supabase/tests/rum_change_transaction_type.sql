-- ============================================================
-- Rumbo — change_transaction_type invariants
-- ------------------------------------------------------------
-- Replace `__HOUSEHOLD_ID__` and run via `npm run db:test` (as a household
-- editor, i.e. with --user). Every probe is a `begin; … rollback;` block: the
-- transactions it creates and voids never survive.
--
-- The RPC voids the original and creates a replacement in one call. These
-- probes pin: who may call it; that the original is voided (never deleted) and
-- the replacement has the right ledger shape; that a failing replacement leaves
-- the original untouched (atomicity); and that it refuses exactly what the
-- regular edit refuses.
-- ============================================================

-- check: change_transaction_type is for signed-in users only, invoker, search_path pinned
do $$
declare
  fn constant regprocedure := 'public.change_transaction_type(uuid, text, date, numeric, text, text, text, uuid, uuid, text, text, numeric, uuid, uuid, numeric, numeric, uuid, time, uuid[])'::regprocedure;
begin
  if has_function_privilege('anon', fn, 'execute') then
    raise exception 'LEAK: anon can execute change_transaction_type';
  end if;
  if not has_function_privilege('authenticated', fn, 'execute') then
    raise exception 'change_transaction_type is not executable by authenticated';
  end if;
  if exists (select 1 from pg_proc p where p.oid = fn and p.prosecdef) then
    raise exception 'change_transaction_type must be SECURITY INVOKER';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = fn and coalesce(p.proconfig, '{}') @> array['search_path=public']
  ) then
    raise exception 'change_transaction_type must pin search_path = public';
  end if;
end $$;

-- check: change_transaction_type expense -> transfer -> income voids each original and builds the right shape
begin;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  ccy text := (select h.base_currency from public.households h where h.id = hh);
  v_cat_exp uuid;
  v_cat_inc uuid;
  v_a uuid;
  v_b uuid;
  v_orig uuid;
  v_xfer uuid;
  v_inc uuid;
  r record;
begin
  select c.id into v_cat_exp from public.categories c
  where c.household_id = hh and c.reporting_type = 'expense' and c.deleted_at is null and not c.is_archived
  order by c.sort_order limit 1;
  select c.id into v_cat_inc from public.categories c
  where c.household_id = hh and c.reporting_type = 'income' and c.deleted_at is null and not c.is_archived
  order by c.sort_order limit 1;
  select a.id into v_a from public.accounts a
  where a.household_id = hh and a.private_owner_id is null and a.deleted_at is null and not a.is_archived
    and a.currency_code = ccy
  order by a.created_at limit 1;
  select a.id into v_b from public.accounts a
  where a.household_id = hh and a.private_owner_id is null and a.deleted_at is null and not a.is_archived
    and a.currency_code = ccy and a.id <> v_a
  order by a.created_at limit 1;
  if v_cat_exp is null or v_cat_inc is null or v_a is null or v_b is null then
    raise exception 'setup: need two shared base-currency accounts plus an income and an expense category';
  end if;

  v_orig := public.create_manual_transaction(hh, 'expense', current_date, v_a, v_cat_exp, 12,
    'retype probe', null, null, 'posted', 1, null);

  -- expense -> transfer
  v_xfer := public.change_transaction_type(
    p_transaction_id => v_orig, p_new_type => 'transfer', p_transaction_date => current_date,
    p_amount => 12, p_status => 'posted', p_from_account_id => v_a, p_to_account_id => v_b);

  select t.status, t.void_reason into r from public.transactions t where t.id = v_orig;
  if r.status <> 'voided' or r.void_reason <> 'Type changed to transfer' then
    raise exception 'original was not voided with the reason (status %, reason %)', r.status, r.void_reason;
  end if;
  if not exists (select 1 from public.transaction_entries e where e.transaction_id = v_orig) then
    raise exception 'original ledger rows were removed instead of kept';
  end if;
  if (select count(*) from public.transaction_entries e where e.transaction_id = v_xfer) <> 2 then
    raise exception 'replacement transfer must have exactly two entries';
  end if;
  if not exists (select 1 from public.transactions t
                 where t.id = v_xfer and t.transaction_type = 'transfer' and t.status = 'posted') then
    raise exception 'replacement transfer is missing or not posted';
  end if;
  if (select count(*) from public.transaction_allocations a where a.transaction_id = v_xfer) <> 0 then
    raise exception 'a same-currency transfer must carry no allocation';
  end if;

  -- transfer -> income (with a time-of-day)
  v_inc := public.change_transaction_type(
    p_transaction_id => v_xfer, p_new_type => 'income', p_transaction_date => current_date,
    p_amount => 12, p_status => 'posted', p_account_id => v_b, p_category_id => v_cat_inc,
    p_transaction_time => '08:30');

  if (select t.status from public.transactions t where t.id = v_xfer) <> 'voided' then
    raise exception 'transfer original was not voided';
  end if;
  if (select count(*) from public.transaction_entries e where e.transaction_id = v_inc) <> 1
     or (select count(*) from public.transaction_allocations a where a.transaction_id = v_inc) <> 1 then
    raise exception 'replacement income must have one entry and one allocation';
  end if;
  if not exists (select 1 from public.transactions t
                 where t.id = v_inc and t.transaction_type = 'income' and t.transaction_time = '08:30') then
    raise exception 'replacement income lost its type or time';
  end if;

  -- The voided originals no longer count: one live row remains.
  if (select count(*) from public.transactions t where t.id in (v_orig, v_xfer, v_inc) and t.status <> 'voided') <> 1 then
    raise exception 'exactly one of the three rows must stay live';
  end if;
end $$;
rollback;

-- check: change_transaction_type refuses what the regular edit refuses, and rolls back on failure
begin;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  ccy text := (select h.base_currency from public.households h where h.id = hh);
  v_cat_exp uuid;
  v_a uuid;
  v_b uuid;
  v_orig uuid;
  v_n integer;
begin
  select c.id into v_cat_exp from public.categories c
  where c.household_id = hh and c.reporting_type = 'expense' and c.deleted_at is null and not c.is_archived
  order by c.sort_order limit 1;
  select a.id into v_a from public.accounts a
  where a.household_id = hh and a.private_owner_id is null and a.deleted_at is null and not a.is_archived
    and a.currency_code = ccy
  order by a.created_at limit 1;
  select a.id into v_b from public.accounts a
  where a.household_id = hh and a.private_owner_id is null and a.deleted_at is null and not a.is_archived
    and a.currency_code = ccy and a.id <> v_a
  order by a.created_at limit 1;
  if v_cat_exp is null or v_a is null or v_b is null then
    raise exception 'setup: need two shared base-currency accounts and an expense category';
  end if;

  v_orig := public.create_manual_transaction(hh, 'expense', current_date, v_a, v_cat_exp, 5,
    'retype refusal probe', null, null, 'posted', 1, null);

  -- Same type.
  begin
    perform public.change_transaction_type(v_orig, 'expense', current_date, 5, 'posted',
      p_account_id => v_a, p_category_id => v_cat_exp);
    raise exception 'LEAK: same-type change was accepted';
  exception when others then
    if sqlerrm <> 'Use the regular edit when the type does not change' then raise; end if;
  end;

  -- Unknown type.
  begin
    perform public.change_transaction_type(v_orig, 'refund', current_date, 5, 'posted');
    raise exception 'LEAK: unknown type was accepted';
  exception when others then
    if sqlerrm <> 'new_type must be income, expense or transfer' then raise; end if;
  end;

  -- A replacement that cannot be created (same from/to) must leave the
  -- original live and add no other transaction.
  select count(*) into v_n from public.transactions t where t.household_id = hh;
  begin
    perform public.change_transaction_type(v_orig, 'transfer', current_date, 5, 'posted',
      p_from_account_id => v_a, p_to_account_id => v_a);
    raise exception 'LEAK: a transfer onto the same account was accepted';
  exception when others then
    if sqlerrm <> 'from_account_id and to_account_id must be different' then raise; end if;
  end;
  if (select t.status from public.transactions t where t.id = v_orig) <> 'posted' then
    raise exception 'a failed change voided the original';
  end if;
  if (select count(*) from public.transactions t where t.household_id = hh) <> v_n then
    raise exception 'a failed change left a stray transaction behind';
  end if;

  -- A voided original cannot be retyped (and so cannot be retyped twice).
  perform public.change_transaction_type(v_orig, 'transfer', current_date, 5, 'posted',
    p_from_account_id => v_a, p_to_account_id => v_b);
  begin
    perform public.change_transaction_type(v_orig, 'income', current_date, 5, 'posted');
    raise exception 'LEAK: a voided transaction was retyped';
  exception when others then
    if sqlerrm <> 'Voided or deleted transactions cannot be edited' then raise; end if;
  end;
end $$;
rollback;
