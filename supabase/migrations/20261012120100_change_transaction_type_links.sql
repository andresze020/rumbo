-- ============================================================
-- Rumbo — change_transaction_type: guard linked records, carry over what the
-- form did not manage
-- Target: Supabase / PostgreSQL
-- ------------------------------------------------------------
-- Follow-up to 20261012120000_change_transaction_type.sql (same signature,
-- `create or replace`, so it applies whether or not that one already ran).
--
-- * Refuses a retype when it would orphan linked records: an expense with live
--   refunds (BR-040) or an installment (BR-035).
-- * Carries over from the original what the edit form did not submit (a
--   hidden field): payee (p_payee_name null; '' clears it), tags (p_tag_ids
--   null; '{}' clears them) and the time (p_transaction_time null). A transfer
--   takes no payee or tags.
-- * The void reason names the replacement ("… (replaced by <id>)").
-- ============================================================

create or replace function public.change_transaction_type(
  p_transaction_id uuid,
  p_new_type text,
  p_transaction_date date,
  p_amount numeric,
  p_status text,
  p_description text default null,
  p_notes text default null,
  -- income / expense
  p_account_id uuid default null,
  p_category_id uuid default null,
  p_merchant_name text default null,
  p_payee_name text default null,
  p_exchange_rate_to_base numeric default 1,
  -- transfer
  p_from_account_id uuid default null,
  p_to_account_id uuid default null,
  p_to_amount numeric default null,
  p_cost_base numeric default null,
  p_cost_category_id uuid default null,
  -- extras
  p_transaction_time time default null,
  p_tag_ids uuid[] default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction record;
  v_entry_count integer;
  v_allocation_count integer;
  v_new_id uuid;
  v_payee_name text;
  v_tag_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_transaction_id is null then
    raise exception 'transaction_id is required';
  end if;

  if p_new_type is null or p_new_type not in ('income', 'expense', 'transfer') then
    raise exception 'new_type must be income, expense or transfer';
  end if;

  -- Lock the original so a concurrent edit/void cannot slip in between the
  -- checks below and the void at the end.
  select
    t.id,
    t.household_id,
    t.transaction_type,
    t.status,
    t.source,
    t.deleted_at,
    t.installment_plan_id,
    t.transaction_time,
    t.payee_id
  into v_transaction
  from public.transactions t
  where t.id = p_transaction_id
  for update;

  if v_transaction.id is null then
    raise exception 'transaction not found';
  end if;

  if v_transaction.deleted_at is not null
    or v_transaction.status in ('voided', 'deleted_soft') then
    raise exception 'Voided or deleted transactions cannot be edited';
  end if;

  -- Same editability rules as update_manual_transaction (income/expense) and
  -- update_transfer_transaction (transfer).
  if v_transaction.transaction_type = 'transfer' then
    if v_transaction.source <> 'manual' then
      raise exception 'Only manual transfer transactions can be edited in this version.';
    end if;
  elsif v_transaction.transaction_type in ('income', 'expense') then
    if v_transaction.source <> 'manual' then
      raise exception 'Only manual income and expense transactions can be edited in this version. Void and recreate this transaction instead.';
    end if;
  else
    raise exception 'Only manual income and expense transactions can be edited in this version. Void and recreate this transaction instead.';
  end if;

  if v_transaction.transaction_type = p_new_type then
    raise exception 'Use the regular edit when the type does not change';
  end if;

  if not public.is_household_editor(v_transaction.household_id) then
    raise exception 'Not authorized to edit transactions for this household';
  end if;

  -- S22 / PRV-4: a transaction that touches a private account is its owner's
  -- to change. A co-member sees a mixed transfer's shared side but cannot
  -- edit, void or retag it.
  if exists (
    select 1 from public.transactions t
    where t.id = p_transaction_id
      and t.private_owner_id is not null
      and t.private_owner_id <> auth.uid()
  ) then
    raise exception 'Only the member who owns the private account can change this transaction';
  end if;

  -- Linked records the replacement would orphan. An in-place edit keeps the
  -- row (and every link to it); a void + recreate does not, so these keep
  -- their type:
  -- * an expense with live refunds (BR-040): voiding it while its refunds stay
  --   posted would leave negative allocations with nothing to offset;
  -- * an installment (BR-035): the plan counts its non-voided rows, so a
  --   replacement outside the plan would silently shorten it.
  if exists (
    select 1 from public.transactions r
    where r.refunded_transaction_id = p_transaction_id
      and r.household_id = v_transaction.household_id
      and r.status <> 'voided'
      and r.deleted_at is null
  ) then
    raise exception 'A transaction with refunds keeps its type. Void its refunds first.';
  end if;

  if v_transaction.installment_plan_id is not null then
    raise exception 'An installment keeps its type.';
  end if;

  -- Ledger shape of the original must be the one the update RPCs can handle.
  select count(*)::integer
  into v_entry_count
  from public.transaction_entries te
  where te.transaction_id = p_transaction_id
    and te.household_id = v_transaction.household_id;

  select count(*)::integer
  into v_allocation_count
  from public.transaction_allocations ta
  where ta.transaction_id = p_transaction_id
    and ta.household_id = v_transaction.household_id;

  if v_transaction.transaction_type = 'transfer' then
    if v_entry_count <> 2 then
      raise exception 'transfer edit requires exactly two ledger entries';
    end if;
  else
    if v_entry_count <> 1 or v_allocation_count <> 1 then
      raise exception 'manual transaction edit requires exactly one ledger entry and one allocation';
    end if;
  end if;

  -- What the form did not manage (hidden field → null) is carried over from
  -- the original, as an in-place edit would leave it; '' / '{}' are deliberate
  -- clears. A transfer has no payee or tags.
  if p_new_type <> 'transfer' then
    if p_payee_name is null then
      if v_transaction.payee_id is not null then
        select p.name into v_payee_name
        from public.payees p
        where p.id = v_transaction.payee_id
          and p.household_id = v_transaction.household_id;
      end if;
    else
      v_payee_name := nullif(btrim(p_payee_name), '');
    end if;

    v_tag_ids := coalesce(
      p_tag_ids,
      array(
        select tt.tag_id from public.transaction_tags tt
        where tt.transaction_id = p_transaction_id
          and tt.household_id = v_transaction.household_id
      )
    );
  end if;

  -- Create the replacement. Their own validation (accounts, categories, FX,
  -- cost, role, private-account rules) runs here; any failure aborts the whole
  -- call and leaves the original untouched.
  if p_new_type = 'transfer' then
    v_new_id := public.create_transfer_transaction(
      v_transaction.household_id,
      p_from_account_id,
      p_to_account_id,
      p_amount,
      p_transaction_date,
      p_description,
      p_notes,
      p_status,
      p_exchange_rate_to_base,
      p_to_amount,
      p_cost_base,
      p_cost_category_id
    );
  else
    v_new_id := public.create_manual_transaction(
      v_transaction.household_id,
      p_new_type,
      p_transaction_date,
      p_account_id,
      p_category_id,
      p_amount,
      p_description,
      p_merchant_name,
      p_notes,
      p_status,
      p_exchange_rate_to_base,
      v_payee_name
    );
  end if;

  if v_new_id is null then
    raise exception 'could not create the replacement transaction';
  end if;

  if coalesce(cardinality(v_tag_ids), 0) > 0 then
    perform public.set_transaction_tags(v_new_id, v_tag_ids);
  end if;

  if coalesce(p_transaction_time, v_transaction.transaction_time) is not null then
    update public.transactions
    set transaction_time = coalesce(p_transaction_time, v_transaction.transaction_time)
    where id = v_new_id
      and household_id = v_transaction.household_id;
  end if;

  -- Void the original through the normal RPC (editor + private-owner checks,
  -- voided_at/voided_by/void_reason, updated_by).
  -- The reason names the replacement: the only link between the two rows.
  perform public.void_transaction(
    p_transaction_id,
    'Type changed to ' || p_new_type || ' (replaced by ' || v_new_id::text || ')'
  );

  return v_new_id;
end;
$$;

revoke all on function public.change_transaction_type(
  uuid, text, date, numeric, text, text, text,
  uuid, uuid, text, text, numeric,
  uuid, uuid, numeric, numeric, uuid,
  time, uuid[]
) from public, anon;

grant execute on function public.change_transaction_type(
  uuid, text, date, numeric, text, text, text,
  uuid, uuid, text, text, numeric,
  uuid, uuid, numeric, numeric, uuid,
  time, uuid[]
) to authenticated;

-- ------------------------------------------------------------
-- Rollback (manual): re-run the function from
-- 20261012120000_change_transaction_type.sql. To undo one type change, void
-- the replacement (its id is in the original's void_reason) BEFORE
-- unvoid_transaction on the original — never unvoid alone, or both count.
-- ------------------------------------------------------------
