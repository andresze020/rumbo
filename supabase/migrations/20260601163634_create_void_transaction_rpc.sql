-- ============================================================
-- App Finanzas — create_void_transaction_rpc.sql
-- Sprint 2.3: Safe transaction voiding
-- Target: Supabase / PostgreSQL
-- ============================================================

create or replace function public.void_transaction(
  p_transaction_id uuid,
  p_void_reason text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_household_id uuid;
  v_status text;
  v_deleted_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_transaction_id is null then
    raise exception 'transaction_id is required';
  end if;

  select
    t.household_id,
    t.status,
    t.deleted_at
  into
    v_household_id,
    v_status,
    v_deleted_at
  from public.transactions t
  where t.id = p_transaction_id;

  if v_household_id is null then
    raise exception 'transaction not found';
  end if;

  if not public.is_household_editor(v_household_id) then
    raise exception 'Not authorized to void transactions for this household';
  end if;

  if v_deleted_at is not null then
    raise exception 'Cannot void a deleted transaction';
  end if;

  if v_status = 'voided' then
    raise exception 'Transaction is already voided';
  end if;

  if v_status = 'deleted_soft' then
    raise exception 'Cannot void a soft-deleted transaction';
  end if;

  if v_status not in ('posted', 'pending') then
    raise exception 'Only posted or pending transactions can be voided';
  end if;

  -- Ledger rows remain unchanged for traceability. Financial calculations
  -- exclude this transaction through transactions.status = 'voided'.
  update public.transactions
  set
    status = 'voided',
    voided_at = now(),
    voided_by = auth.uid(),
    void_reason = nullif(trim(coalesce(p_void_reason, '')), ''),
    updated_by = auth.uid()
  where id = p_transaction_id
    and household_id = v_household_id;

  return p_transaction_id;
end;
$$;

grant execute on function public.void_transaction(uuid, text)
to authenticated;
